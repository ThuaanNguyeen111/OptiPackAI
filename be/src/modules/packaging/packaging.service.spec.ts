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
import { PackagingMaterialService } from './packaging-material.service';
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
  const tinyBox: BoxSpec = {
    ...boxM,
    code: 'TINY',
    inner: { length_mm: 50, width_mm: 50, height_mm: 50 },
  };

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
    findOneAndUpdate: jest.Mock;
  };
  let guideAi: { writeGuide: jest.Mock };
  let orderGroupModel: {
    findById: jest.Mock;
    findOneAndUpdate: jest.Mock;
    updateOne: jest.Mock;
  };
  let orderGroupsService: {
    findOrderGroupById: jest.Mock;
    allocatePickedItemsToOrders: jest.Mock;
  };
  let boxService: {
    listActiveSpecs: jest.Mock;
    findActiveSpecByCode: jest.Mock;
    listAvailability: jest.Mock;
    consumeForPack: jest.Mock;
  };

  /** Tồn thùng giả: mặc định mọi thùng còn nhiều. */
  function stock(entries: [string, number][]): Map<
    string,
    {
      onHand: number;
      reserved: number;
      available: number;
      reorderLevel: number;
    }
  > {
    return new Map(
      entries.map(([code, available]) => [
        code,
        { onHand: available, reserved: 0, available, reorderLevel: 2 },
      ]),
    );
  }
  let materialService: { planningData: jest.Mock; consumeForPack: jest.Mock };
  let notificationsService: {
    buildAbnormalPackageMessage: jest.Mock;
    buildPendingPackagingPlanMessage: jest.Mock;
    buildPackagingRejectedMessage: jest.Mock;
    notify: jest.Mock;
  };

  function mockGroup(status: GroupFulfillmentStatus, version = 4): void {
    const group = {
      _id: new Types.ObjectId(groupId),
      fulfillment_status: status,
      __v: version,
    };
    orderGroupsService.findOrderGroupById.mockResolvedValue(group);
    orderGroupModel.findById.mockReturnValue({
      session: jest.fn().mockResolvedValue(group),
    });
    orderGroupModel.findOneAndUpdate.mockResolvedValue({
      ...group,
      __v: version + 1,
    });
  }

  function mockActive(recs: Record<string, unknown>[]): void {
    recommendationModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue(recs),
    });
  }

  function rec(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      _id: new Types.ObjectId(),
      order_id: new Types.ObjectId(orderA),
      platform_order_id: 'LZ-1',
      solution_status: 'ok',
      approval_status: PackagingApprovalStatus.PENDING,
      estimated_package_weight_g: 450,
      box_code: 'M',
      box_name: 'M',
      box_inner_mm: { length_mm: 350, width_mm: 250, height_mm: 200 },
      box_outer_mm: { length_mm: 360, width_mm: 260, height_mm: 210 },
      placements: [],
      item_profiles: [],
      cartons: [], // bản ghi kiểu cũ: service suy ra đúng 1 kiện từ field cấp trên
      carton_count: 1,
      fill_ratio: 0.3,
      items_weight_g: 250,
      volumetric_weight_g: 1000,
      materials: [],
      materials_weight_g: 0,
      materials_cost_vnd: 0,
      actual_measured_weight_kg: null,
      is_abnormal: false,
      packing_guide: null,
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
      findOneAndUpdate: jest.fn(),
    };
    guideAi = { writeGuide: jest.fn() };
    orderGroupModel = {
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    orderGroupsService = {
      findOrderGroupById: jest.fn(),
      allocatePickedItemsToOrders: jest.fn(),
    };
    boxService = {
      listActiveSpecs: jest.fn().mockResolvedValue([boxM]),
      findActiveSpecByCode: jest.fn(),
      listAvailability: jest.fn().mockResolvedValue(
        stock([
          ['M', 50],
          ['L', 50],
          ['TINY', 50],
        ]),
      ),
      consumeForPack: jest.fn().mockResolvedValue([]),
    };
    // Mặc định: chưa có danh mục vật tư nào (materials rỗng), pack không trừ/thiếu gì.
    materialService = {
      planningData: jest.fn().mockResolvedValue({ catalog: [], rules: [] }),
      consumeForPack: jest
        .fn()
        .mockResolvedValue({ consumed: [], shortfalls: [] }),
    };
    notificationsService = {
      buildAbnormalPackageMessage: jest
        .fn()
        .mockReturnValue({ title: 't', message: 'm' }),
      buildPendingPackagingPlanMessage: jest
        .fn()
        .mockReturnValue({ title: 't', message: 'm' }),
      buildPackagingRejectedMessage: jest
        .fn()
        .mockReturnValue({ title: 't', message: 'm' }),
      notify: jest.fn().mockResolvedValue({}),
    };
    const session = {
      withTransaction: jest.fn(async (fn: () => Promise<unknown>) => fn()),
      endSession: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PackagingService,
        {
          provide: getModelToken(PackagingRecommendationDoc.name),
          useValue: recommendationModel,
        },
        { provide: getModelToken(OrderGroup.name), useValue: orderGroupModel },
        {
          provide: getConnectionToken(),
          useValue: { startSession: jest.fn().mockResolvedValue(session) },
        },
        { provide: OrderGroupsService, useValue: orderGroupsService },
        { provide: PackagingBoxService, useValue: boxService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: PackingGuideAiService, useValue: guideAi },
        {
          provide: PackagingBagService,
          useValue: { namesByCode: jest.fn().mockResolvedValue(new Map()) },
        },
        { provide: PackagingMaterialService, useValue: materialService },
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

      const [docs] = recommendationModel.insertMany.mock.calls[0] as [
        Record<string, unknown>[],
      ];
      expect(docs).toHaveLength(2);
      expect(docs[0]?.solution_status).toBe('ok');
      expect(docs[0]?.box_code).toBe('M');
      expect(docs[0]?.placements as unknown[]).toHaveLength(2);
      expect(docs[0]?.estimated_shipping_cost_vnd).toBeNull();
      // Cân ước tính = hàng + bì thùng (2 áo 250 g + bì 200 g)
      expect(docs[0]?.estimated_package_weight_g).toBe(700);
      // Hồ sơ SKU (loại + túi zip) được chụp vào phương án cho hình 3D/hướng dẫn
      expect(docs[0]?.item_profiles).toEqual([
        {
          sku: 'AO-M',
          product_category: null,
          zip_bag_code: null,
          zip_bag_folded: false,
        },
      ]);
      const [, update] = orderGroupModel.findOneAndUpdate.mock.calls[0] as [
        unknown,
        { $set: { fulfillment_status: string } },
      ];
      expect(update.$set.fulfillment_status).toBe(
        GroupFulfillmentStatus.PENDING_APPROVAL,
      );
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
      boxService.listAvailability.mockResolvedValue(
        stock([
          ['M', 1],
          ['L', 5],
        ]),
      );
      orderGroupsService.allocatePickedItemsToOrders.mockResolvedValue([
        { order_id: orderA, platform_order_id: 'LZ-1', items: [shirt(1)] },
        { order_id: orderB, platform_order_id: 'LZ-2', items: [shirt(1)] },
      ]);
      mockActive([]);

      await service.generateRecommendations(groupId);

      const [docs] = recommendationModel.insertMany.mock.calls[0] as [
        Record<string, unknown>[],
      ];
      expect(docs.map((d) => d.box_code)).toEqual(['M', 'L']);
      expect(docs.map((d) => d.preferred_box_out_of_stock)).toEqual([
        null,
        'M',
      ]);
      // Không tính chỗ giữ của chính group đang tính lại.
      const [excludeArg] = boxService.listAvailability.mock.calls[0] as [
        unknown,
      ];
      expect(excludeArg).toEqual({ groupId });
    });

    it('có danh mục + luật vật tư → phương án mang vật tư, cân ước tính cộng thêm khối lượng vật tư (28/09/2026)', async () => {
      mockGroup(GroupFulfillmentStatus.PICKED);
      materialService.planningData.mockResolvedValue({
        catalog: [
          {
            code: 'FOAM',
            name: 'Góc xốp',
            type: 'foam_corner',
            unit: 'cái',
            weight_g_per_unit: 5,
            price_vnd_per_unit: 300,
          },
        ],
        rules: [
          {
            material_type: 'foam_corner',
            applies_to: 'shoes',
            basis: 'per_unit',
            quantity: 4,
          },
        ],
      });
      orderGroupsService.allocatePickedItemsToOrders.mockResolvedValue([
        {
          order_id: orderA,
          platform_order_id: 'LZ-1',
          items: [{ ...shirt(1), product_category: 'shoes' }],
        },
      ]);
      mockActive([]);

      await service.generateRecommendations(groupId);

      const [docs] = recommendationModel.insertMany.mock.calls[0] as [
        Record<string, unknown>[],
      ];
      expect(docs[0]?.materials).toEqual([
        {
          type: 'foam_corner',
          quantity: 4,
          code: 'FOAM',
          name: 'Góc xốp',
          unit: 'cái',
          weight_g: 20,
          cost_vnd: 1200,
        },
      ]);
      expect(docs[0]?.materials_weight_g).toBe(20);
      expect(docs[0]?.materials_cost_vnd).toBe(1200);
      // hàng 250 + bì 200 + vật tư 20
      expect(docs[0]?.estimated_package_weight_g).toBe(470);
    });

    it('không thùng nào vừa → solution_status no_fit, KHÔNG gán thùng lớn nhất', async () => {
      mockGroup(GroupFulfillmentStatus.PICKED);
      boxService.listActiveSpecs.mockResolvedValue([tinyBox]);
      orderGroupsService.allocatePickedItemsToOrders.mockResolvedValue([
        { order_id: orderA, platform_order_id: 'LZ-1', items: [shirt(1)] },
      ]);
      mockActive([]);

      await service.generateRecommendations(groupId);

      const [docs] = recommendationModel.insertMany.mock.calls[0] as [
        Record<string, unknown>[],
      ];
      expect(docs[0]?.solution_status).toBe('no_fit');
      expect(docs[0]?.box_code).toBeNull();
      expect(docs[0]?.no_fit_reasons as unknown[]).not.toHaveLength(0);
    });

    it('group chưa picked → ORD_GROUP_INVALID_TRANSITION, không tính gì', async () => {
      mockGroup(GroupFulfillmentStatus.PICKING);
      await expect(
        service.generateRecommendations(groupId),
      ).rejects.toMatchObject({
        errorCode: ORD_GROUP_ERROR_CODES.INVALID_TRANSITION,
      });
      expect(
        orderGroupsService.allocatePickedItemsToOrders,
      ).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('còn đơn no_fit → PKG_HAS_NO_FIT', async () => {
      mockGroup(GroupFulfillmentStatus.PENDING_APPROVAL);
      mockActive([
        rec(),
        rec({
          order_id: new Types.ObjectId(orderB),
          solution_status: 'no_fit',
        }),
      ]);
      await expect(service.approve(groupId, userId, 4)).rejects.toMatchObject({
        errorCode: PACKAGING_ERROR_CODES.HAS_NO_FIT,
      });
    });

    it('hợp lệ → duyệt mọi đơn + group approved_for_packing, KHÔNG cần cân', async () => {
      mockGroup(GroupFulfillmentStatus.PENDING_APPROVAL);
      mockActive([rec()]);
      await service.approve(groupId, userId, 4);
      expect(recommendationModel.updateMany).toHaveBeenCalledTimes(2);
      const [filter, update] = orderGroupModel.findOneAndUpdate.mock
        .calls[0] as [
        { __v: number },
        { $set: { fulfillment_status: string } },
      ];
      expect(filter.__v).toBe(4);
      expect(update.$set.fulfillment_status).toBe(
        GroupFulfillmentStatus.APPROVED_FOR_PACKING,
      );
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
      await expect(
        service.adjust(groupId, userId, baseDto),
      ).rejects.toMatchObject({
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

      await expect(
        service.adjust(groupId, userId, { ...baseDto, box_code: 'M' }),
      ).rejects.toMatchObject({
        errorCode: PACKAGING_ERROR_CODES.BOX_OUT_OF_STOCK,
      });
      expect(recommendationModel.updateOne).not.toHaveBeenCalled();
      // Không tính chỗ mà chính phương án này đang giữ.
      const [excludeArg] = boxService.listAvailability.mock.calls[0] as [
        unknown,
      ];
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

      const [, update] = recommendationModel.updateOne.mock.calls[0] as [
        unknown,
        { $set: Record<string, unknown>; $inc: { __v: number } },
      ];
      expect(update.$set.box_code).toBe('M');
      expect(update.$set.adjustment_reason).toBe(
        'RECOMMENDED_BOX_NOT_IN_STOCK',
      );
      expect(update.$set.adjusted_from_box_code).toBe('S');
      // Không đổi TRẠNG THÁI group, nhưng TĂNG version để mọi người đang giữ
      // version cũ (đang mở màn duyệt) bị 409 khi approve.
      expect(orderGroupModel.findOneAndUpdate).not.toHaveBeenCalled();
      const [groupFilter, groupUpdate] = orderGroupModel.updateOne.mock
        .calls[0] as [
        { __v: number; fulfillment_status: string },
        { $inc: { __v: number } },
      ];
      expect(groupFilter.__v).toBe(baseDto.expected_group_version);
      expect(groupFilter.fulfillment_status).toBe(
        GroupFulfillmentStatus.PENDING_APPROVAL,
      );
      expect(groupUpdate.$inc.__v).toBe(1);
      expect(update.$inc).toEqual({ __v: 1 });
    });

    it('phương án vừa bị người khác đổi (khóa lạc quan __v lệch) → 409 STATE_CONFLICT, không tăng version group', async () => {
      mockGroup(GroupFulfillmentStatus.PENDING_APPROVAL);
      recommendationModel.findOne.mockResolvedValue(rec({ box_code: 'S' }));
      boxService.findActiveSpecByCode.mockResolvedValue(boxM);
      orderGroupsService.allocatePickedItemsToOrders.mockResolvedValue([
        { order_id: orderA, platform_order_id: 'LZ-1', items: [shirt(1)] },
      ]);
      recommendationModel.updateOne.mockResolvedValue({ matchedCount: 0 });

      await expect(
        service.adjust(groupId, userId, { ...baseDto, box_code: 'M' }),
      ).rejects.toMatchObject({
        errorCode: ORD_GROUP_ERROR_CODES.STATE_CONFLICT,
      });
      expect(orderGroupModel.updateOne).not.toHaveBeenCalled();
    });

    it('version group đã bị người khác tăng giữa chừng → 409 STATE_CONFLICT', async () => {
      mockGroup(GroupFulfillmentStatus.PENDING_APPROVAL);
      recommendationModel.findOne.mockResolvedValue(rec({ box_code: 'S' }));
      boxService.findActiveSpecByCode.mockResolvedValue(boxM);
      orderGroupsService.allocatePickedItemsToOrders.mockResolvedValue([
        { order_id: orderA, platform_order_id: 'LZ-1', items: [shirt(1)] },
      ]);
      orderGroupModel.updateOne.mockResolvedValue({ matchedCount: 0 });

      await expect(
        service.adjust(groupId, userId, { ...baseDto, box_code: 'M' }),
      ).rejects.toMatchObject({
        errorCode: ORD_GROUP_ERROR_CODES.STATE_CONFLICT,
      });
    });

    it('lý do OTHER mà không ghi chú → PKG_ADJUSTMENT_NOTE_REQUIRED', async () => {
      await expect(
        service.adjust(groupId, userId, {
          ...baseDto,
          adjustment_reason: 'OTHER',
        }),
      ).rejects.toMatchObject({
        errorCode: PACKAGING_ERROR_CODES.ADJUSTMENT_NOTE_REQUIRED,
      });
    });
  });

  describe('reject', () => {
    it('vô hiệu hóa mọi phương án, group quay lại picked', async () => {
      mockGroup(GroupFulfillmentStatus.PENDING_APPROVAL);
      mockActive([rec()]);
      await service.reject(groupId, 4, 'Thùng quá rộng so với hàng');
      const [, update] = orderGroupModel.findOneAndUpdate.mock.calls[0] as [
        unknown,
        { $set: { fulfillment_status: string } },
      ];
      expect(update.$set.fulfillment_status).toBe(
        GroupFulfillmentStatus.PICKED,
      );
    });

    it('lưu lý do từ chối và báo Admin', async () => {
      mockGroup(GroupFulfillmentStatus.PENDING_APPROVAL);
      mockActive([rec()]);
      await service.reject(groupId, 4, 'Thùng quá rộng so với hàng');
      const [, update] = recommendationModel.updateMany.mock.calls[0] as [
        unknown,
        { $set: { rejection_reason: string } },
      ];
      expect(update.$set.rejection_reason).toBe('Thùng quá rộng so với hàng');
      expect(notificationsService.notify).toHaveBeenCalled();
    });
  });

  describe('pack', () => {
    it('áo 250 g + thùng 200 g, cân 0,45 kg → KHÔNG bất thường (so với hàng + bì)', async () => {
      mockGroup(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
      mockActive([rec({ approval_status: PackagingApprovalStatus.APPROVED })]);

      await service.pack(groupId, userId, {
        packages: [{ order_id: orderA, actual_weight_kg: 0.45 }],
        expected_version: 4,
      });

      const [, update] = recommendationModel.updateOne.mock.calls[0] as [
        unknown,
        { $set: { is_abnormal: boolean } },
      ];
      expect(update.$set.is_abnormal).toBe(false);
      expect(notificationsService.notify).not.toHaveBeenCalled();
    });

    it('cân lệch > 20% → is_abnormal + thông báo Store Owner', async () => {
      mockGroup(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
      mockActive([rec({ approval_status: PackagingApprovalStatus.APPROVED })]);

      await service.pack(groupId, userId, {
        packages: [{ order_id: orderA, actual_weight_kg: 0.9 }],
        expected_version: 4,
      });

      const [, update] = recommendationModel.updateOne.mock.calls[0] as [
        unknown,
        { $set: { is_abnormal: boolean } },
      ];
      expect(update.$set.is_abnormal).toBe(true);
      expect(notificationsService.notify).toHaveBeenCalledTimes(1);
    });

    it('trừ tồn thùng của mọi kiện trong transaction (1 thùng / kiện)', async () => {
      mockGroup(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
      mockActive([rec({ approval_status: PackagingApprovalStatus.APPROVED })]);

      await service.pack(groupId, userId, {
        packages: [{ order_id: orderA, actual_weight_kg: 0.45 }],
        expected_version: 4,
      });

      const [, packages] = boxService.consumeForPack.mock.calls[0] as [
        unknown,
        { boxCode: string }[],
      ];
      expect(packages.map((p) => p.boxCode)).toEqual(['M']);
    });

    it('kho hết thùng lúc pack → lỗi, group KHÔNG sang packed', async () => {
      mockGroup(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
      mockActive([rec({ approval_status: PackagingApprovalStatus.APPROVED })]);
      boxService.consumeForPack.mockRejectedValue(
        Object.assign(new Error('hết thùng'), {
          errorCode: PACKAGING_ERROR_CODES.BOX_OUT_OF_STOCK,
        }),
      );

      await expect(
        service.pack(groupId, userId, {
          packages: [{ order_id: orderA, actual_weight_kg: 0.45 }],
          expected_version: 4,
        }),
      ).rejects.toMatchObject({
        errorCode: PACKAGING_ERROR_CODES.BOX_OUT_OF_STOCK,
      });
      expect(orderGroupModel.findOneAndUpdate.mock.calls).toHaveLength(0);
    });

    it('tồn vừa rơi xuống ≤ mức cảnh báo → báo Admin + Store Owner đúng 1 lần mỗi role', async () => {
      mockGroup(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
      mockActive([rec({ approval_status: PackagingApprovalStatus.APPROVED })]);
      boxService.consumeForPack.mockResolvedValue([
        { code: 'M', before: 3, after: 2, reorderLevel: 2 },
      ]);

      await service.pack(groupId, userId, {
        packages: [{ order_id: orderA, actual_weight_kg: 0.45 }],
        expected_version: 4,
      });

      const types = (
        notificationsService.notify.mock.calls as [{ type: string }][]
      ).map(([input]) => input.type);
      expect(types).toEqual(['low_box_stock', 'low_box_stock']);
    });

    it('tồn đã dưới ngưỡng từ trước → KHÔNG báo lặp lại', async () => {
      mockGroup(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
      mockActive([rec({ approval_status: PackagingApprovalStatus.APPROVED })]);
      boxService.consumeForPack.mockResolvedValue([
        { code: 'M', before: 2, after: 1, reorderLevel: 2 },
      ]);

      await service.pack(groupId, userId, {
        packages: [{ order_id: orderA, actual_weight_kg: 0.45 }],
        expected_version: 4,
      });

      expect(notificationsService.notify.mock.calls).toHaveLength(0);
    });

    it('trừ vật tư theo từng kiện; kho thiếu → KHÔNG rollback, ghi phần thiếu vào kiện + báo (28/09/2026)', async () => {
      mockGroup(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
      const recId = new Types.ObjectId();
      mockActive([
        rec({
          _id: recId,
          approval_status: PackagingApprovalStatus.APPROVED,
          materials: [
            {
              type: 'foam_corner',
              quantity: 4,
              code: 'FOAM',
              name: 'Góc xốp',
              unit: 'cái',
              weight_g: 20,
              cost_vnd: 1200,
            },
          ],
        }),
      ]);
      materialService.consumeForPack.mockResolvedValue({
        consumed: [],
        shortfalls: [{ recommendationId: recId, code: 'FOAM', missing: 3 }],
      });

      await service.pack(groupId, userId, {
        packages: [{ order_id: orderA, actual_weight_kg: 0.45 }],
        expected_version: 4,
      });

      const [, needs] = materialService.consumeForPack.mock.calls[0] as [
        unknown,
        { code: string; quantity: number }[],
      ];
      expect(needs).toEqual([
        expect.objectContaining({ code: 'FOAM', quantity: 4 }),
      ]);
      const [, update] = recommendationModel.updateOne.mock.calls[0] as [
        unknown,
        { $set: Record<string, unknown>; $inc: { __v: number } },
      ];
      expect(update.$set.materials_shortfall).toEqual([
        { code: 'FOAM', missing: 3 },
      ]);
      // Thiếu vật tư KHÔNG chặn: group vẫn được chuyển sang packed.
      const [, groupUpdate] = orderGroupModel.findOneAndUpdate.mock
        .calls[0] as [unknown, { $set: { fulfillment_status: string } }];
      expect(groupUpdate.$set.fulfillment_status).toBe(
        GroupFulfillmentStatus.PACKED,
      );
      const types = (
        notificationsService.notify.mock.calls as [{ type: string }][]
      ).map(([input]) => input.type);
      expect(types).toEqual(['low_material_stock', 'low_material_stock']);
    });

    it('vật tư vừa xuống ≤ mức cảnh báo → báo đúng 1 lần mỗi role', async () => {
      mockGroup(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
      mockActive([rec({ approval_status: PackagingApprovalStatus.APPROVED })]);
      materialService.consumeForPack.mockResolvedValue({
        consumed: [
          {
            code: 'FOAM',
            name: 'Góc xốp',
            before: 25,
            after: 18,
            reorderLevel: 20,
          },
        ],
        shortfalls: [],
      });

      await service.pack(groupId, userId, {
        packages: [{ order_id: orderA, actual_weight_kg: 0.45 }],
        expected_version: 4,
      });

      const types = (
        notificationsService.notify.mock.calls as [{ type: string }][]
      ).map(([input]) => input.type);
      expect(types).toEqual(['low_material_stock', 'low_material_stock']);
    });

    it('thiếu cân của 1 kiện → PKG_PACK_PACKAGES_MISMATCH', async () => {
      mockGroup(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
      mockActive([
        rec({ approval_status: PackagingApprovalStatus.APPROVED }),
        rec({
          order_id: new Types.ObjectId(orderB),
          approval_status: PackagingApprovalStatus.APPROVED,
        }),
      ]);
      await expect(
        service.pack(groupId, userId, {
          packages: [{ order_id: orderA, actual_weight_kg: 0.45 }],
          expected_version: 4,
        }),
      ).rejects.toMatchObject({
        errorCode: PACKAGING_ERROR_CODES.PACK_PACKAGES_MISMATCH,
      });
    });
  });

  //!=============================================
  // 30/09/2026 (Milestone 4) — ĐA KIỆN: 1 đơn chia N kiện; mỗi kiện có
  // thùng, tọa độ, cân thật riêng; field cấp trên phản chiếu kiện 0.
  //!=============================================
  describe('đa kiện', () => {
    const block = (quantity: number): PackableItem => ({
      sku: 'BLOCK',
      quantity,
      length_cm: 20,
      width_cm: 20,
      height_cm: 20,
      weight_kg: 6,
      is_fragile: false,
      orientation_rule: 'any',
      max_stack_load_kg: 20,
    });

    function cartonDoc(
      index: number,
      boxCode: string,
      itemKeys: string[],
      estimatedG = 6200,
    ): Record<string, unknown> {
      return {
        index,
        box_code: boxCode,
        box_name: boxCode,
        box_inner_mm: { length_mm: 350, width_mm: 250, height_mm: 200 },
        box_outer_mm: { length_mm: 360, width_mm: 260, height_mm: 210 },
        placements: itemKeys.map((key, i) => ({
          item_key: key,
          sku: 'BLOCK',
          step: i + 1,
          x: i * 200,
          y: 0,
          z: 0,
          dx: 200,
          dy: 200,
          dz: 200,
          orientation: 'LWH',
          folded: false,
        })),
        fill_ratio: 0.3,
        items_weight_g: 6000,
        estimated_package_weight_g: estimatedG,
        volumetric_weight_g: 1000,
        materials: [],
        materials_weight_g: 0,
        materials_cost_vnd: 0,
        actual_measured_weight_kg: null,
        is_abnormal: false,
        packing_guide: null,
      };
    }

    function multiRec(
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> {
      return rec({
        estimated_package_weight_g: 6200,
        approval_status: PackagingApprovalStatus.PENDING,
        cartons: [
          cartonDoc(0, 'M', ['BLOCK#1']),
          cartonDoc(1, 'M', ['BLOCK#2']),
        ],
        carton_count: 2,
        placements: cartonDoc(0, 'M', ['BLOCK#1']).placements as unknown[],
        ...overrides,
      });
    }

    it('generate: đơn 18 kg (> tải thùng M) → 3 kiện, field cấp trên phản chiếu kiện 0', async () => {
      mockGroup(GroupFulfillmentStatus.PICKED);
      orderGroupsService.allocatePickedItemsToOrders.mockResolvedValue([
        { order_id: orderA, platform_order_id: 'LZ-1', items: [block(3)] },
      ]);
      mockActive([]);

      await service.generateRecommendations(groupId);

      const [docs] = recommendationModel.insertMany.mock.calls[0] as [
        Record<string, unknown>[],
      ];
      const doc = docs[0];
      expect(doc?.solution_status).toBe('ok');
      expect(doc?.carton_count).toBe(3);
      const cartons = doc?.cartons as {
        index: number;
        box_code: string;
        placements: unknown[];
      }[];
      expect(cartons.map((c) => c.index)).toEqual([0, 1, 2]);
      expect(
        cartons.every((c) => c.box_code === 'M' && c.placements.length === 1),
      ).toBe(true);
      expect(doc?.box_code).toBe(cartons[0]?.box_code);
      expect(doc?.placements as unknown[]).toHaveLength(1);
    });

    it('generate: tồn thùng chia sẻ giữa các đơn theo TỪNG kiện → đơn sau hết thùng thì no_fit OUT_OF_STOCK', async () => {
      mockGroup(GroupFulfillmentStatus.PICKED);
      boxService.listAvailability.mockResolvedValue(stock([['M', 4]]));
      orderGroupsService.allocatePickedItemsToOrders.mockResolvedValue([
        { order_id: orderA, platform_order_id: 'LZ-1', items: [block(3)] },
        { order_id: orderB, platform_order_id: 'LZ-2', items: [block(3)] },
      ]);
      mockActive([]);

      await service.generateRecommendations(groupId);

      const [docs] = recommendationModel.insertMany.mock.calls[0] as [
        Record<string, unknown>[],
      ];
      expect(docs[0]?.solution_status).toBe('ok');
      expect(docs[0]?.carton_count).toBe(3);
      expect(docs[1]?.solution_status).toBe('no_fit');
      expect(docs[1]?.carton_count).toBe(0);
      expect(
        (docs[1]?.no_fit_reasons as { code: string }[]).some(
          (r) => r.code === 'OUT_OF_STOCK',
        ),
      ).toBe(true);
    });

    it('generate: món quá cỡ → no_fit với lý do có mã ITEM_TOO_LARGE, không lưu kiện dở dang', async () => {
      mockGroup(GroupFulfillmentStatus.PICKED);
      orderGroupsService.allocatePickedItemsToOrders.mockResolvedValue([
        {
          order_id: orderA,
          platform_order_id: 'LZ-1',
          items: [
            shirt(1),
            {
              ...block(1),
              sku: 'HUGE',
              length_cm: 90,
              width_cm: 70,
              height_cm: 60,
            },
          ],
        },
      ]);
      mockActive([]);

      await service.generateRecommendations(groupId);

      const [docs] = recommendationModel.insertMany.mock.calls[0] as [
        Record<string, unknown>[],
      ];
      expect(docs[0]?.solution_status).toBe('no_fit');
      expect(docs[0]?.cartons as unknown[]).toEqual([]);
      const reasons = docs[0]?.no_fit_reasons as {
        code: string;
        item_key: string;
      }[];
      expect(reasons.map((r) => r.code)).toEqual(['ITEM_TOO_LARGE']);
      expect(reasons[0]?.item_key).toBe('HUGE#1');
    });

    it('adjust kiện 1: chỉ thay kiện 1, KHÔNG ghi đè field cấp trên (kiện 0)', async () => {
      mockGroup(GroupFulfillmentStatus.PENDING_APPROVAL);
      const boxL: BoxSpec = {
        ...boxM,
        code: 'L',
        name: 'Thùng L',
        inner: { length_mm: 500, width_mm: 400, height_mm: 350 },
        outer: { length_mm: 506, width_mm: 406, height_mm: 356 },
      };
      recommendationModel.findOne.mockResolvedValue(multiRec());
      boxService.findActiveSpecByCode.mockResolvedValue(boxL);
      boxService.listAvailability.mockResolvedValue(stock([['L', 5]]));
      orderGroupsService.allocatePickedItemsToOrders.mockResolvedValue([
        { order_id: orderA, platform_order_id: 'LZ-1', items: [block(2)] },
      ]);
      mockActive([]);

      await service.adjust(groupId, userId, {
        order_id: orderA,
        carton_index: 1,
        box_code: 'L',
        adjustment_reason: 'RECOMMENDED_BOX_NOT_IN_STOCK',
        expected_group_version: 4,
      } as never);

      const [, update] = recommendationModel.updateOne.mock.calls[0] as [
        unknown,
        { $set: Record<string, unknown> },
      ];
      expect('box_code' in update.$set).toBe(false); // kiện 0 không đổi
      const cartons = update.$set.cartons as {
        index: number;
        box_code: string;
        placements: { item_key: string }[];
      }[];
      expect(cartons.map((c) => c.box_code)).toEqual(['M', 'L']);
      // Kiện 1 chỉ đóng lại ĐÚNG món của kiện 1, không kéo thêm món của kiện 0.
      expect(cartons[1]?.placements.map((p) => p.item_key)).toEqual([
        'BLOCK#2',
      ]);
      expect(update.$set.carton_count).toBe(2);
    });

    it('adjust: carton_index vượt số kiện → PKG_CARTON_NOT_FOUND', async () => {
      mockGroup(GroupFulfillmentStatus.PENDING_APPROVAL);
      recommendationModel.findOne.mockResolvedValue(multiRec());

      await expect(
        service.adjust(groupId, userId, {
          order_id: orderA,
          carton_index: 5,
          box_code: 'M',
          adjustment_reason: 'RECOMMENDED_BOX_NOT_IN_STOCK',
          expected_group_version: 4,
        } as never),
      ).rejects.toMatchObject({
        errorCode: PACKAGING_ERROR_CODES.CARTON_NOT_FOUND,
      });
    });

    it('adjust: đổi kiện sang thùng mà kiện KHÁC của cùng phương án đang dùng, chỉ còn 1 thùng trống → hết thùng', async () => {
      mockGroup(GroupFulfillmentStatus.PENDING_APPROVAL);
      recommendationModel.findOne.mockResolvedValue(multiRec());
      boxService.findActiveSpecByCode.mockResolvedValue(boxM);
      // Chỗ giữ của cả phương án đã được trả lại (available = 1), nhưng kiện 0 vẫn cần 1 thùng M.
      boxService.listAvailability.mockResolvedValue(stock([['M', 1]]));

      await expect(
        service.adjust(groupId, userId, {
          order_id: orderA,
          carton_index: 1,
          box_code: 'M',
          adjustment_reason: 'RECOMMENDED_BOX_NOT_IN_STOCK',
          expected_group_version: 4,
        } as never),
      ).rejects.toMatchObject({
        errorCode: PACKAGING_ERROR_CODES.BOX_OUT_OF_STOCK,
      });
    });

    it('pack: đơn 2 kiện mà thiếu carton_index → PKG_PACK_PACKAGES_MISMATCH', async () => {
      mockGroup(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
      mockActive([
        multiRec({ approval_status: PackagingApprovalStatus.APPROVED }),
      ]);

      await expect(
        service.pack(groupId, userId, {
          packages: [{ order_id: orderA, actual_weight_kg: 6.2 }],
          expected_version: 4,
        }),
      ).rejects.toMatchObject({
        errorCode: PACKAGING_ERROR_CODES.PACK_PACKAGES_MISMATCH,
      });
    });

    it('pack: đơn 2 kiện mới có cân 1 kiện → MISMATCH (cần đủ mọi kiện)', async () => {
      mockGroup(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
      mockActive([
        multiRec({ approval_status: PackagingApprovalStatus.APPROVED }),
      ]);

      await expect(
        service.pack(groupId, userId, {
          packages: [
            { order_id: orderA, carton_index: 0, actual_weight_kg: 6.2 },
          ],
          expected_version: 4,
        }),
      ).rejects.toMatchObject({
        errorCode: PACKAGING_ERROR_CODES.PACK_PACKAGES_MISMATCH,
      });
    });

    it('pack: cân từng kiện, trừ 1 thùng/kiện, kiện lệch >20% bị đánh dấu riêng', async () => {
      mockGroup(GroupFulfillmentStatus.APPROVED_FOR_PACKING);
      const record = multiRec({
        approval_status: PackagingApprovalStatus.APPROVED,
      });
      mockActive([record]);

      await service.pack(groupId, userId, {
        packages: [
          { order_id: orderA, carton_index: 0, actual_weight_kg: 6.2 }, // đúng
          { order_id: orderA, carton_index: 1, actual_weight_kg: 9 }, // lệch ~45%
        ],
        expected_version: 4,
      });

      const [, boxPackages] = boxService.consumeForPack.mock.calls[0] as [
        unknown,
        { boxCode: string }[],
      ];
      expect(boxPackages.map((b) => b.boxCode)).toEqual(['M', 'M']);

      const [, update] = recommendationModel.updateOne.mock.calls[0] as [
        unknown,
        {
          $set: {
            cartons: {
              index: number;
              actual_measured_weight_kg: number;
              is_abnormal: boolean;
            }[];
            is_abnormal: boolean;
            actual_measured_weight_kg: number;
          };
        },
      ];
      expect(
        update.$set.cartons.map((c) => c.actual_measured_weight_kg),
      ).toEqual([6.2, 9]);
      expect(update.$set.cartons.map((c) => c.is_abnormal)).toEqual([
        false,
        true,
      ]);
      expect(update.$set.is_abnormal).toBe(true); // cấp phương án: có kiện bất thường
      expect(update.$set.actual_measured_weight_kg).toBe(6.2); // phản chiếu kiện 0
      // Chỉ 1 thông báo (kiện bất thường), không phải 2.
      expect(notificationsService.notify).toHaveBeenCalledTimes(1);
    });

    describe('hướng dẫn đóng gói theo kiện', () => {
      const guideResult = {
        source: 'template' as const,
        model: null,
        fallback_reason: 'no_api_key',
        summary: 'tóm tắt',
        steps: [{ step: 1, instruction: 'Đặt BLOCK#2', tip: null }],
      };

      beforeEach(() => {
        guideAi.writeGuide.mockResolvedValue(guideResult);
        orderGroupsService.allocatePickedItemsToOrders.mockResolvedValue([
          { order_id: orderA, platform_order_id: 'LZ-1', items: [block(2)] },
        ]);
        recommendationModel.findOneAndUpdate.mockResolvedValue({ ok: true });
      });

      it('kiện 1: chỉ ghi guide vào cartons.1, KHÔNG ghi đè guide cấp trên (kiện 0)', async () => {
        recommendationModel.findOne.mockResolvedValue(multiRec());

        await service.getOrCreatePackingGuide(
          groupId,
          new Types.ObjectId().toString(),
          false,
          1,
        );

        const [, update] = recommendationModel.findOneAndUpdate.mock
          .calls[0] as [unknown, { $set: Record<string, unknown> }];
        expect(Object.keys(update.$set)).toEqual(['cartons.1.packing_guide']);
        // Lời hướng dẫn được viết từ ĐÚNG dữ kiện của kiện 1 (1 món BLOCK#2).
        const [input] = guideAi.writeGuide.mock.calls[0] as [
          { facts: { item_key?: string }[] },
        ];
        expect(JSON.stringify(input.facts)).toContain('BLOCK');
      });

      it('kiện 0: ghi cả cartons.0.packing_guide và guide cấp trên (client cũ)', async () => {
        recommendationModel.findOne.mockResolvedValue(multiRec());

        await service.getOrCreatePackingGuide(
          groupId,
          new Types.ObjectId().toString(),
          false,
          0,
        );

        const [, update] = recommendationModel.findOneAndUpdate.mock
          .calls[0] as [unknown, { $set: Record<string, unknown> }];
        expect(Object.keys(update.$set).sort()).toEqual([
          'cartons.0.packing_guide',
          'packing_guide',
        ]);
      });

      it('bản ghi cũ chưa có mảng cartons: chỉ ghi guide cấp trên (không set đường dẫn mảng chưa tồn tại)', async () => {
        recommendationModel.findOne.mockResolvedValue(
          rec({ placements: cartonDoc(0, 'M', ['BLOCK#1']).placements }),
        );

        await service.getOrCreatePackingGuide(
          groupId,
          new Types.ObjectId().toString(),
          false,
          0,
        );

        const [, update] = recommendationModel.findOneAndUpdate.mock
          .calls[0] as [unknown, { $set: Record<string, unknown> }];
        expect(Object.keys(update.$set)).toEqual(['packing_guide']);
      });

      it('kiện đã có guide và không regenerate → trả luôn, KHÔNG gọi AI', async () => {
        const withGuide = multiRec();
        (withGuide.cartons as Record<string, unknown>[])[1] = {
          ...cartonDoc(1, 'M', ['BLOCK#2']),
          packing_guide: { ...guideResult, generated_at: new Date() },
        };
        recommendationModel.findOne.mockResolvedValue(withGuide);

        await service.getOrCreatePackingGuide(
          groupId,
          new Types.ObjectId().toString(),
          false,
          1,
        );

        expect(guideAi.writeGuide).not.toHaveBeenCalled();
      });

      it('carton_index không tồn tại → PKG_GUIDE_NOT_AVAILABLE', async () => {
        recommendationModel.findOne.mockResolvedValue(multiRec());

        await expect(
          service.getOrCreatePackingGuide(
            groupId,
            new Types.ObjectId().toString(),
            false,
            7,
          ),
        ).rejects.toMatchObject({
          errorCode: PACKAGING_ERROR_CODES.GUIDE_NOT_AVAILABLE,
        });
      });
    });
  });
});
