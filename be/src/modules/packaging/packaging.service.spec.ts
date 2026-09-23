import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { PackagingService } from './packaging.service';
import { PackagingRecommendationDoc } from './schemas/packaging-recommendation.schema';
import { OrderGroup } from '../order-groups/schemas/order-group.schema';
import { OrderGroupsService } from '../order-groups/order-groups.service';
import { PackagingBoxService } from './packaging-box.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PackingGuideAiService } from './packing-guide-ai.service';
import { PackagingBagService } from './packaging-bag.service';
import { PackagingApprovalStatus } from './enums/packaging-approval-status.enum';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import { ORD_GROUP_ERROR_CODES } from '../order-groups/order-groups.errors';
import { PACKAGING_ERROR_CODES } from './packaging.errors';
import type { BoxSpec } from './engine';
import type { PackableItem } from '../../common/interfaces/packaging.interface';

//!=============================================
// 21/09/2026 (BE-3a/BE-4a) — viết lại theo mô hình MỖI ĐƠN MỘT KIỆN:
// generate chạy engine greedy 3D + validator cho từng đơn; approve/
// adjust/reject áp cho cả group; cân thật chuyển sang pack().
//!=============================================
describe('PackagingService', () => {
  let service: PackagingService;

  const groupId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const orderA = new Types.ObjectId().toString();
  const orderB = new Types.ObjectId().toString();

  const boxM: BoxSpec = {
    code: 'M',
    name: 'Thùng M',
    inner: { length_mm: 350, width_mm: 250, height_mm: 200 },
    outer: { length_mm: 356, width_mm: 256, height_mm: 206 },
    tare_g: 200,
    max_load_g: 10000,
    price_vnd: 4500,
  };
  const tinyBox: BoxSpec = { ...boxM, code: 'TINY', inner: { length_mm: 50, width_mm: 50, height_mm: 50 } };

  function shirt(quantity = 1): PackableItem {
    return {
      sku: 'AO-M',
      quantity,
      length_cm: 28,
      width_cm: 20,
      height_cm: 4,
      weight_kg: 0.25,
      is_fragile: false,
      orientation_rule: 'any',
      max_stack_load_kg: 2,
    };
  }

  let recommendationModel: {
    find: jest.Mock;
    updateMany: jest.Mock;
    insertMany: jest.Mock;
    findOne: jest.Mock;
    updateOne: jest.Mock;
  };
  let orderGroupModel: { findById: jest.Mock; findOneAndUpdate: jest.Mock };
  let orderGroupsService: { findOrderGroupById: jest.Mock; allocatePickedItemsToOrders: jest.Mock };
  let boxService: {
    listActiveSpecs: jest.Mock;
    findActiveSpecByCode: jest.Mock;
    listAvailability: jest.Mock;
    consumeForPack: jest.Mock;
  };

  /** Tồn thùng giả: mặc định mọi thùng còn nhiều. */
  function stock(entries: [string, number][]): Map<string, { onHand: number; reserved: number; available: number; reorderLevel: number }> {
    return new Map(entries.map(([code, available]) => [code, { onHand: available, reserved: 0, available, reorderLevel: 2 }]));
  }
  let notificationsService: { buildAbnormalPackageMessage: jest.Mock; notify: jest.Mock };

  function mockGroup(status: GroupFulfillmentStatus, version = 4): void {
    const group = { _id: new Types.ObjectId(groupId), fulfillment_status: status, __v: version };
    orderGroupsService.findOrderGroupById.mockResolvedValue(group);
    orderGroupModel.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(group) });
    orderGroupModel.findOneAndUpdate.mockResolvedValue({ ...group, __v: version + 1 });
  }

  function mockActive(recs: Record<string, unknown>[]): void {
    recommendationModel.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(recs) });
  }

  function rec(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      _id: new Types.ObjectId(),
      order_id: new Types.ObjectId(orderA),
      platform_order_id: 'LZ-1',
      solution_status: 'ok',
      approval_status: PackagingApprovalStatus.PENDING,
      estimated_package_weight_g: 450,
      box_code: 'M',
      ...overrides,
    };
  }

  beforeEach(async () => {
    recommendationModel = {
      find: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({}),
      insertMany: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    orderGroupModel = { findById: jest.fn(), findOneAndUpdate: jest.fn() };
    orderGroupsService = { findOrderGroupById: jest.fn(), allocatePickedItemsToOrders: jest.fn() };
    boxService = {
      listActiveSpecs: jest.fn().mockResolvedValue([boxM]),
      findActiveSpecByCode: jest.fn(),
      listAvailability: jest.fn().mockResolvedValue(stock([['M', 50], ['L', 50], ['TINY', 50]])),
      consumeForPack: jest.fn().mockResolvedValue([]),
    };
    notificationsService = {
      buildAbnormalPackageMessage: jest.fn().mockReturnValue({ title: 't', message: 'm' }),
      notify: jest.fn().mockResolvedValue({}),
    };
    const session = {
      withTransaction: jest.fn(async (fn: () => Promise<unknown>) => fn()),
      endSession: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PackagingService,
        { provide: getModelToken(PackagingRecommendationDoc.name), useValue: recommendationModel },
        { provide: getModelToken(OrderGroup.name), useValue: orderGroupModel },
        { provide: getConnectionToken(), useValue: { startSession: jest.fn().mockResolvedValue(session) } },
        { provide: OrderGroupsService, useValue: orderGroupsService },
        { provide: PackagingBoxService, useValue: boxService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: PackingGuideAiService, useValue: { writeGuide: jest.fn() } },
        { provide: PackagingBagService, useValue: { namesByCode: jest.fn().mockResolvedValue(new Map()) } },
      ],
    }).compile();
    service = module.get(PackagingService);
  });

  describe('generateRecommendations', () => {
    it('group 2 đơn → 2 phương án (mỗi đơn 1 kiện) có tọa độ xếp, group sang pending_approval', async () => {
      mockGroup(GroupFulfillmentStatus.PICKED);
      orderGroupsService.allocatePickedItemsToOrders.mockResolvedValue([
        { order_id: orderA, platform_order_id: 'LZ-1', items: [shirt(2)] },
        { order_id: orderB, platform_order_id: 'LZ-2', items: [shirt(1)] },
      ]);
      mockActive([]);

      await service.generateRecommendations(groupId);

      const [docs] = recommendationModel.insertMany.mock.calls[0] as [Record<string, unknown>[]];
      expect(docs).toHaveLength(2);
      expect(docs[0]?.solution_status).toBe('ok');
      expect(docs[0]?.box_code).toBe('M');
      expect(docs[0]?.placements as unknown[]).toHaveLength(2);
      expect(docs[0]?.estimated_shipping_cost_vnd).toBeNull();
      // Cân ước tính = hàng + bì thùng (2 áo 250 g + bì 200 g)
      expect(docs[0]?.estimated_package_weight_g).toBe(700);
      // Hồ sơ SKU (loại + túi zip) được chụp vào phương án cho hình 3D/hướng dẫn
      expect(docs[0]?.item_profiles).toEqual([
        { sku: 'AO-M', product_category: null, zip_bag_code: null, zip_bag_folded: false },
      ]);
      const [, update] = orderGroupModel.findOneAndUpdate.mock.calls[0] as [unknown, { $set: { fulfillment_status: string } }];
      expect(update.$set.fulfillment_status).toBe(GroupFulfillmentStatus.PENDING_APPROVAL);
    });

    it('chỉ còn 1 thùng M trống cho 2 đơn → đơn đầu nhận M, đơn sau sang L và ghi lại M đã hết', async () => {
      mockGroup(GroupFulfillmentStatus.PICKED);
      const boxL: BoxSpec = {
        ...boxM,
        code: 'L',
        name: 'Thùng L',
        inner: { length_mm: 500, width_mm: 400, height_mm: 350 },
        outer: { length_mm: 506, width_mm: 406, height_mm: 356 },
      };
      boxService.listActiveSpecs.mockResolvedValue([boxM, boxL]);
      boxService.listAvailability.mockResolvedValue(stock([['M', 1], ['L', 5]]));
      orderGroupsService.allocatePickedItemsToOrders.mockResolvedValue([
        { order_id: orderA, platform_order_id: 'LZ-1', items: [shirt(1)] },
        { order_id: orderB, platform_order_id: 'LZ-2', items: [shirt(1)] },
      ]);
      mockActive([]);

      await service.generateRecommendations(groupId);

      const [docs] = recommendationModel.insertMany.mock.calls[0] as [Record<string, unknown>[]];
      expect(docs.map((d) => d.box_code)).toEqual(['M', 'L']);
      expect(docs.map((d) => d.preferred_box_out_of_stock)).toEqual([null, 'M']);
      // Không tính chỗ giữ của chính group đang tính lại.
      const [excludeArg] = boxService.listAvailability.mock.calls[0] as [unknown];
      expect(excludeArg).toEqual({ groupId });
    });

    it('không thùng nào vừa → solution_status no_fit, KHÔNG gán thùng lớn nhất', async () => {
      mockGroup(GroupFulfillmentStatus.PICKED);
      boxService.listActiveSpecs.mockResolvedValue([tinyBox]);
      orderGroupsService.allocatePickedItemsToOrders.mockResolvedValue([
        { order_id: orderA, platform_order_id: 'LZ-1', items: [shirt(1)] },
      ]);
      mockActive([]);

      await service.generateRecommendations(groupId);

      const [docs] = recommendationModel.insertMany.mock.calls[0] as [Record<string, unknown>[]];
      expect(docs[0]?.solution_status).toBe('no_fit');
      expect(docs[0]?.box_code).toBeNull();
      expect(docs[0]?.no_fit_reasons as unknown[]).not.toHaveLength(0);
    });

    it('group chưa picked → ORD_GROUP_INVALID_TRANSITION, không tính gì', async () => {
      mockGroup(GroupFulfillmentStatus.PICKING);
      await expect(service.generateRecommendations(groupId)).rejects.toMatchObject({
        errorCode: ORD_GROUP_ERROR_CODES.INVALID_TRANSITION,
      });
      expect(orderGroupsService.allocatePickedItemsToOrders).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('còn đơn no_fit → PKG_HAS_NO_FIT', async () => {
      mockGroup(GroupFulfillmentStatus.PENDING_APPROVAL);
      mockActive([rec(), rec({ order_id: new Types.ObjectId(orderB), solution_status: 'no_fit' })]);
      await expect(service.approve(groupId, userId, 4)).rejects.toMatchObject({
        errorCode: PACKAGING_ERROR_CODES.HAS_NO_FIT,
      });
    });

    it('hợp lệ → duyệt mọi đơn + group approved_for_packing, KHÔNG cần cân', async () => {
      mockGroup(GroupFulfillmentStatus.PENDING_APPROVAL);
      mockActive([rec()]);
      await service.approve(groupId, userId, 4);
      expect(recommendationModel.updateMany).toHaveBeenCalledTimes(2);
      const [filter, update] = orderGroupModel.findOneAndUpdate.mock.calls[0] as [
        { __v: number },
        { $set: { fulfillment_status: string } },
      ];
      expect(filter.__v).toBe(4);
      expect(update.$set.fulfillment_status).toBe(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
    });

    it('version lệch → ORD_GROUP_STATE_CONFLICT', async () => {
      mockGroup(GroupFulfillmentStatus.PENDING_APPROVAL);
      mockActive([rec()]);
      orderGroupModel.findOneAndUpdate.mockResolvedValue(null);
      await expect(service.approve(groupId, userId, 1)).rejects.toMatchObject({
        errorCode: ORD_GROUP_ERROR_CODES.STATE_CONFLICT,
      });
    });

    it('đã quyết định trước đó → PKG_ALREADY_DECIDED', async () => {
      mockGroup(GroupFulfillmentStatus.PENDING_APPROVAL);
      mockActive([rec({ approval_status: PackagingApprovalStatus.APPROVED })]);
      await expect(service.approve(groupId, userId, 4)).rejects.toMatchObject({
        errorCode: PACKAGING_ERROR_CODES.ALREADY_DECIDED,
      });
    });
  });

  describe('adjust', () => {
    const baseDto = {
      order_id: orderA,
      box_code: 'TINY',
      adjustment_reason: 'RECOMMENDED_BOX_NOT_IN_STOCK' as const,
      expected_group_version: 4,
    };

    it('thùng chọn không vừa → PKG_BOX_DOES_NOT_FIT (422), không ghi gì', async () => {
      mockGroup(GroupFulfillmentStatus.PENDING_APPROVAL);
      recommendationModel.findOne.mockResolvedValue(rec());
      boxService.findActiveSpecByCode.mockResolvedValue(tinyBox);
      orderGroupsService.allocatePickedItemsToOrders.mockResolvedValue([
        { order_id: orderA, platform_order_id: 'LZ-1', items: [shirt(1)] },
      ]);
      await expect(service.adjust(groupId, userId, baseDto)).rejects.toMatchObject({
        errorCode: PACKAGING_ERROR_CODES.BOX_DOES_NOT_FIT,
      });
      expect(recommendationModel.updateOne).not.toHaveBeenCalled();
    });

    it('đổi sang thùng kho đã hết (còn trống = 0) → PKG_BOX_OUT_OF_STOCK, không ghi gì', async () => {
      mockGroup(GroupFulfillmentStatus.PENDING_APPROVAL);
      const current = rec({ box_code: 'L' });
      recommendationModel.findOne.mockResolvedValue(current);
      boxService.findActiveSpecByCode.mockResolvedValue(boxM);
      boxService.listAvailability.mockResolvedValue(stock([['M', 0]]));

      await expect(service.adjust(groupId, userId, { ...baseDto, box_code: 'M' })).rejects.toMatchObject({
        errorCode: PACKAGING_ERROR_CODES.BOX_OUT_OF_STOCK,
      });
      expect(recommendationModel.updateOne).not.toHaveBeenCalled();
      // Không tính chỗ mà chính phương án này đang giữ.
      const [excludeArg] = boxService.listAvailability.mock.calls[0] as [unknown];
      expect(excludeArg).toEqual({ recommendationId: current._id });
    });

    it('thùng vừa → xếp lại + lưu lý do, group vẫn chờ approve', async () => {
      mockGroup(GroupFulfillmentStatus.PENDING_APPROVAL);
      recommendationModel.findOne.mockResolvedValue(rec({ box_code: 'S' }));
      boxService.findActiveSpecByCode.mockResolvedValue(boxM);
      orderGroupsService.allocatePickedItemsToOrders.mockResolvedValue([
        { order_id: orderA, platform_order_id: 'LZ-1', items: [shirt(1)] },
      ]);
      mockActive([]);

      await service.adjust(groupId, userId, { ...baseDto, box_code: 'M' });

      const [, update] = recommendationModel.updateOne.mock.calls[0] as [unknown, { $set: Record<string, unknown> }];
      expect(update.$set.box_code).toBe('M');
      expect(update.$set.adjustment_reason).toBe('RECOMMENDED_BOX_NOT_IN_STOCK');
      expect(update.$set.adjusted_from_box_code).toBe('S');
      expect(orderGroupModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('lý do OTHER mà không ghi chú → PKG_ADJUSTMENT_NOTE_REQUIRED', async () => {
      await expect(
        service.adjust(groupId, userId, { ...baseDto, adjustment_reason: 'OTHER' }),
      ).rejects.toMatchObject({ errorCode: PACKAGING_ERROR_CODES.ADJUSTMENT_NOTE_REQUIRED });
    });
  });

  describe('reject', () => {
    it('vô hiệu hóa mọi phương án, group quay lại picked', async () => {
      mockGroup(GroupFulfillmentStatus.PENDING_APPROVAL);
      mockActive([rec()]);
      await service.reject(groupId, 4);
      const [, update] = orderGroupModel.findOneAndUpdate.mock.calls[0] as [unknown, { $set: { fulfillment_status: string } }];
      expect(update.$set.fulfillment_status).toBe(GroupFulfillmentStatus.PICKED);
    });
  });

  describe('pack', () => {
    it('áo 250 g + thùng 200 g, cân 0,45 kg → KHÔNG bất thường (so với hàng + bì)', async () => {
      mockGroup(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
      mockActive([rec({ approval_status: PackagingApprovalStatus.APPROVED })]);

      await service.pack(groupId, userId, { packages: [{ order_id: orderA, actual_weight_kg: 0.45 }], expected_version: 4 });

      const [, update] = recommendationModel.updateOne.mock.calls[0] as [unknown, { $set: { is_abnormal: boolean } }];
      expect(update.$set.is_abnormal).toBe(false);
      expect(notificationsService.notify).not.toHaveBeenCalled();
    });

    it('cân lệch > 20% → is_abnormal + thông báo Store Owner', async () => {
      mockGroup(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
      mockActive([rec({ approval_status: PackagingApprovalStatus.APPROVED })]);

      await service.pack(groupId, userId, { packages: [{ order_id: orderA, actual_weight_kg: 0.9 }], expected_version: 4 });

      const [, update] = recommendationModel.updateOne.mock.calls[0] as [unknown, { $set: { is_abnormal: boolean } }];
      expect(update.$set.is_abnormal).toBe(true);
      expect(notificationsService.notify).toHaveBeenCalledTimes(1);
    });

    it('trừ tồn thùng của mọi kiện trong transaction (1 thùng / kiện)', async () => {
      mockGroup(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
      mockActive([rec({ approval_status: PackagingApprovalStatus.APPROVED })]);

      await service.pack(groupId, userId, { packages: [{ order_id: orderA, actual_weight_kg: 0.45 }], expected_version: 4 });

      const [, packages] = boxService.consumeForPack.mock.calls[0] as [unknown, { boxCode: string }[]];
      expect(packages.map((p) => p.boxCode)).toEqual(['M']);
    });

    it('kho hết thùng lúc pack → lỗi, group KHÔNG sang packed', async () => {
      mockGroup(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
      mockActive([rec({ approval_status: PackagingApprovalStatus.APPROVED })]);
      boxService.consumeForPack.mockRejectedValue(
        Object.assign(new Error('hết thùng'), { errorCode: PACKAGING_ERROR_CODES.BOX_OUT_OF_STOCK }),
      );

      await expect(
        service.pack(groupId, userId, { packages: [{ order_id: orderA, actual_weight_kg: 0.45 }], expected_version: 4 }),
      ).rejects.toMatchObject({ errorCode: PACKAGING_ERROR_CODES.BOX_OUT_OF_STOCK });
      expect(orderGroupModel.findOneAndUpdate.mock.calls).toHaveLength(0);
    });

    it('tồn vừa rơi xuống ≤ mức cảnh báo → báo Admin + Store Owner đúng 1 lần mỗi role', async () => {
      mockGroup(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
      mockActive([rec({ approval_status: PackagingApprovalStatus.APPROVED })]);
      boxService.consumeForPack.mockResolvedValue([{ code: 'M', before: 3, after: 2, reorderLevel: 2 }]);

      await service.pack(groupId, userId, { packages: [{ order_id: orderA, actual_weight_kg: 0.45 }], expected_version: 4 });

      const types = (notificationsService.notify.mock.calls as [{ type: string }][]).map(([input]) => input.type);
      expect(types).toEqual(['low_box_stock', 'low_box_stock']);
    });

    it('tồn đã dưới ngưỡng từ trước → KHÔNG báo lặp lại', async () => {
      mockGroup(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
      mockActive([rec({ approval_status: PackagingApprovalStatus.APPROVED })]);
      boxService.consumeForPack.mockResolvedValue([{ code: 'M', before: 2, after: 1, reorderLevel: 2 }]);

      await service.pack(groupId, userId, { packages: [{ order_id: orderA, actual_weight_kg: 0.45 }], expected_version: 4 });

      expect(notificationsService.notify.mock.calls).toHaveLength(0);
    });

    it('thiếu cân của 1 kiện → PKG_PACK_PACKAGES_MISMATCH', async () => {
      mockGroup(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
      mockActive([
        rec({ approval_status: PackagingApprovalStatus.APPROVED }),
        rec({ order_id: new Types.ObjectId(orderB), approval_status: PackagingApprovalStatus.APPROVED }),
      ]);
      await expect(
        service.pack(groupId, userId, { packages: [{ order_id: orderA, actual_weight_kg: 0.45 }], expected_version: 4 }),
      ).rejects.toMatchObject({ errorCode: PACKAGING_ERROR_CODES.PACK_PACKAGES_MISMATCH });
    });
  });
});
