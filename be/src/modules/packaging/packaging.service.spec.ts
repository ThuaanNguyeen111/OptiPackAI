import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { PackagingService } from './packaging.service';
import { PackagingRecommendationDoc } from './schemas/packaging-recommendation.schema';
import { OrderGroup } from '../order-groups/schemas/order-group.schema';
import { OrderGroupsService } from '../order-groups/order-groups.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { PackagingApprovalStatus } from './enums/packaging-approval-status.enum';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import { AppException } from '../../common/exceptions/app-exception';
import { ORD_GROUP_ERROR_CODES } from '../order-groups/order-groups.errors';

//!=============================================
// SỬA LẠI (20/09/2026, đảo luồng theo yêu cầu Thuận) — Lấy hàng làm
// TRƯỚC, Đóng gói (tính gợi ý + duyệt) làm SAU. Thay đổi chính so với
// bản cũ:
// 1. orderGroupsService.getPackableItemsForGroup() -> ĐỔI TÊN MOCK
//    thành getActuallyPickedItemsForGroup() (packaging.service.ts giờ
//    gọi hàm này, tính theo số lượng THẬT đã quét, không phải số
//    lượng đặt).
// 2. Bỏ HẲN mock StaffAssignmentService — PackagingService không còn
//    inject dependency này nữa (auto-assign dời sang
//    order-groups.service.ts, chạy lúc TẠO group, xem
//    order-groups.service.ts test riêng cho phần đó nếu cần).
// 3. reject() giờ trả group về PICKED (không phải AWAITING_PACKAGING).
//!=============================================
describe('PackagingService', () => {
  let service: PackagingService;

  const groupId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const recommendationId = new Types.ObjectId();

  let recommendationModel: {
    findOne: jest.Mock;
    updateOne: jest.Mock;
    updateMany: jest.Mock;
    create: jest.Mock;
    findById: jest.Mock;
  };
  let orderGroupModel: { findOneAndUpdate: jest.Mock };
  let connection: { startSession: jest.Mock };
  let orderGroupsService: {
    findOrderGroupById: jest.Mock;
    getActuallyPickedItemsForGroup: jest.Mock;
    getPackableItemsForGroup: jest.Mock;
    transitionFulfillmentStatus: jest.Mock;
  };
  let notificationsService: {
    notify: jest.Mock;
    buildPendingPackagingPlanMessage: jest.Mock;
    buildPackagingRejectedMessage: jest.Mock;
  };
  let mockSession: { withTransaction: jest.Mock; endSession: jest.Mock };

  //!=============================================
  // 1kg tổng ước tính (1 item, weight_kg=1, quantity=1) — dùng chung
  // cho các test approve/adjust, để dễ tính deviation cho case abnormal.
  //!=============================================
  const pickedItems = {
    order_group_id: groupId,
    items: [
      {
        sku: 'SKU-1',
        quantity: 1,
        length_cm: 10,
        width_cm: 10,
        height_cm: 10,
        weight_kg: 1,
        is_fragile: false,
      },
    ],
  };

  function makePendingRecommendation(
    overrides: Partial<{ approval_status: PackagingApprovalStatus }> = {},
  ): {
    _id: Types.ObjectId;
    order_group_id: Types.ObjectId;
    approval_status: PackagingApprovalStatus;
  } {
    return {
      _id: recommendationId,
      order_group_id: new Types.ObjectId(groupId),
      approval_status:
        overrides.approval_status ?? PackagingApprovalStatus.PENDING,
    };
  }

  beforeEach(async () => {
    recommendationModel = {
      findOne: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      create: jest.fn(),
      findById: jest.fn(),
    };
    orderGroupModel = { findOneAndUpdate: jest.fn() };

    mockSession = {
      withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection = { startSession: jest.fn().mockResolvedValue(mockSession) };

    orderGroupsService = {
      findOrderGroupById: jest.fn(),
      getActuallyPickedItemsForGroup: jest.fn().mockResolvedValue(pickedItems),
      getPackableItemsForGroup: jest.fn().mockResolvedValue(pickedItems),
      transitionFulfillmentStatus: jest.fn(),
    };

    notificationsService = {
      notify: jest.fn().mockResolvedValue({}),
      buildPendingPackagingPlanMessage: jest
        .fn()
        .mockReturnValue({ title: 't', message: 'm' }),
      buildPackagingRejectedMessage: jest
        .fn()
        .mockReturnValue({ title: 't', message: 'm' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PackagingService,
        {
          provide: getModelToken(PackagingRecommendationDoc.name),
          useValue: recommendationModel,
        },
        { provide: getModelToken(OrderGroup.name), useValue: orderGroupModel },
        { provide: getConnectionToken(), useValue: connection },
        { provide: OrderGroupsService, useValue: orderGroupsService },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get(PackagingService);
  });

  describe('approve', () => {
    it('duyệt thành công — ghi transaction, KHÔNG đánh is_abnormal khi cân thật khớp ước tính', async () => {
      const pending = makePendingRecommendation();
      recommendationModel.findOne.mockResolvedValue(pending);
      orderGroupModel.findOneAndUpdate.mockResolvedValue({ _id: groupId }); // version khớp -> update thành công
      recommendationModel.findById.mockResolvedValue({
        ...pending,
        approval_status: PackagingApprovalStatus.APPROVED,
      });

      await service.approve(groupId, userId, 1.0, 0); // cân thật 1.0kg, ước tính cũng 1kg -> lệch 0%

      expect(mockSession.withTransaction).toHaveBeenCalledTimes(1);
      expect(
        orderGroupsService.getActuallyPickedItemsForGroup,
      ).toHaveBeenCalledWith(groupId);
      expect(recommendationModel.updateOne).toHaveBeenCalledWith(
        { _id: recommendationId },
        expect.anything(),
        { session: mockSession },
      );
      const updateCall = recommendationModel.updateOne.mock.calls[0] as [
        unknown,
        { $set: Record<string, unknown> },
        unknown,
      ];
      expect(updateCall[1].$set.approval_status).toBe(
        PackagingApprovalStatus.APPROVED,
      );
      expect(updateCall[1].$set.is_abnormal).toBe(false);
      expect(mockSession.endSession).toHaveBeenCalledTimes(1);
    });

    it('đánh is_abnormal=true khi cân thật lệch >20% so với ước tính', async () => {
      const pending = makePendingRecommendation();
      recommendationModel.findOne.mockResolvedValue(pending);
      orderGroupModel.findOneAndUpdate.mockResolvedValue({ _id: groupId });
      recommendationModel.findById.mockResolvedValue(pending);

      await service.approve(groupId, userId, 2.0, 0); // ước tính 1kg, cân thật 2kg -> lệch 100%

      const updateCall = recommendationModel.updateOne.mock.calls[0] as [
        unknown,
        { $set: Record<string, unknown> },
        unknown,
      ];
      expect(updateCall[1].$set.is_abnormal).toBe(true);
    });

    it('ném ORD_GROUP_STATE_CONFLICT khi __v không khớp (Rule #18, Optimistic Concurrency)', async () => {
      const pending = makePendingRecommendation();
      recommendationModel.findOne.mockResolvedValue(pending);
      // findOneAndUpdate trả null = filter {_id, __v} không match được document nào
      orderGroupModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.approve(groupId, userId, 1.0, 999),
      ).rejects.toMatchObject({
        errorCode: ORD_GROUP_ERROR_CODES.STATE_CONFLICT,
      });
      // endSession vẫn PHẢI được gọi dù transaction fail — không rò rỉ session
      expect(mockSession.endSession).toHaveBeenCalledTimes(1);
    });

    it('ném lỗi khi group chưa có recommendation active nào (chưa generate)', async () => {
      recommendationModel.findOne.mockResolvedValue(null);

      await expect(service.approve(groupId, userId, 1.0, 0)).rejects.toThrow(
        AppException,
      );
    });

    it('ném lỗi ALREADY_DECIDED khi recommendation đã được quyết định trước đó (không phải PENDING)', async () => {
      recommendationModel.findOne.mockResolvedValue(
        makePendingRecommendation({
          approval_status: PackagingApprovalStatus.APPROVED,
        }),
      );

      await expect(service.approve(groupId, userId, 1.0, 0)).rejects.toThrow(
        AppException,
      );
    });
  });

  describe('reject', () => {
    it('KHÔNG xóa cứng — đánh is_active:false, giữ lịch sử; group quay lại PICKED (hàng ĐÃ lấy, không cần lấy lại)', async () => {
      const pending = makePendingRecommendation();
      recommendationModel.findOne.mockResolvedValue(pending);
      orderGroupModel.findOneAndUpdate.mockResolvedValue({ _id: groupId });

      const result = await service.reject(
        groupId,
        0,
        'Kích thước thùng không phù hợp với hàng thật.',
      );

      expect(recommendationModel.updateOne).toHaveBeenCalledWith(
        { _id: recommendationId },
        {
          $set: {
            approval_status: PackagingApprovalStatus.REJECTED,
            is_active: false,
            rejection_reason: 'Kích thước thùng không phù hợp với hàng thật.',
          },
        },
        { session: mockSession },
      );
      expect(orderGroupModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: groupId, __v: 0 },
        expect.objectContaining({
          $set: { fulfillment_status: GroupFulfillmentStatus.PICKED },
        }),
        expect.anything(),
      );
      expect(result.message).toContain('tính lại gợi ý');

      // BỔ SUNG (21/09/2026, item 13/checklist FE) — xác nhận Admin
      // được notify đúng loại, đúng role, kèm lý do từ chối.
      expect(
        notificationsService.buildPackagingRejectedMessage,
      ).toHaveBeenCalledWith({
        groupId,
        reason: 'Kích thước thùng không phù hợp với hàng thật.',
      });
      expect(notificationsService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientRole: UserRole.ADMIN,
          type: NotificationType.PACKAGING_REJECTED,
          severity: 'warning',
        }),
      );
    });

    it('ném STATE_CONFLICT khi version lệch, giống approve', async () => {
      recommendationModel.findOne.mockResolvedValue(
        makePendingRecommendation(),
      );
      orderGroupModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.reject(groupId, 999, 'Lý do bất kỳ.'),
      ).rejects.toMatchObject({
        errorCode: ORD_GROUP_ERROR_CODES.STATE_CONFLICT,
      });
    });
  });

  describe('generateFallbackRecommendation', () => {
    it('vô hiệu hóa bản active cũ (nếu có) trước khi tạo bản mới, rồi chuyển group sang PENDING_APPROVAL — tính theo số lượng THẬT đã quét', async () => {
      orderGroupsService.findOrderGroupById.mockResolvedValue({
        _id: new Types.ObjectId(groupId),
        __v: 0,
      });
      recommendationModel.create.mockResolvedValue(makePendingRecommendation());

      await service.generateFallbackRecommendation(groupId);

      expect(
        orderGroupsService.getActuallyPickedItemsForGroup,
      ).toHaveBeenCalledWith(groupId);
      expect(recommendationModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: true }),
        { $set: { is_active: false } },
      );
      expect(
        orderGroupsService.transitionFulfillmentStatus,
      ).toHaveBeenCalledWith(
        groupId,
        GroupFulfillmentStatus.PENDING_APPROVAL,
        0,
      );

      // BỔ SUNG (21/09/2026, item 13/checklist FE) — xác nhận Packaging
      // Staff được notify đúng loại sau khi có gợi ý mới chờ duyệt.
      expect(
        notificationsService.buildPendingPackagingPlanMessage,
      ).toHaveBeenCalledWith(expect.objectContaining({ groupId }));
      expect(notificationsService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientRole: UserRole.PACKAGING_STAFF,
          type: NotificationType.PENDING_APPROVAL,
          severity: 'info',
        }),
      );
    });

    //!=============================================
    // FIX GẤP (21/09/2026, báo cáo thật từ FE, xác nhận đúng bug do CHÍNH
    // đợt đảo luồng 20/09 gây ra): pick() (xác nhận hàng loạt) KHÔNG bắt
    // buộc quét từng SKU qua pick-item trước — pick_events có thể RỖNG
    // hoàn toàn dù group đã ở PICKED hợp lệ. generate() PHẢI fallback về
    // getPackableItemsForGroup(), KHÔNG được throw/chặn đứng.
    //!=============================================
    it('KHÔNG có pick_events nào (Warehouse xác nhận hàng loạt, không quét từng SKU) -> fallback về số lượng ĐẶT, KHÔNG throw', async () => {
      orderGroupsService.findOrderGroupById.mockResolvedValue({
        _id: new Types.ObjectId(groupId),
        __v: 0,
      });
      recommendationModel.create.mockResolvedValue(makePendingRecommendation());
      orderGroupsService.getActuallyPickedItemsForGroup.mockRejectedValue(
        new AppException(
          ORD_GROUP_ERROR_CODES.ALL_ORDERS_CANCELED,
          'Group chưa có pick_events nào.',
          409,
        ),
      );

      await expect(
        service.generateFallbackRecommendation(groupId),
      ).resolves.toBeDefined();

      expect(orderGroupsService.getPackableItemsForGroup).toHaveBeenCalledWith(
        groupId,
      );
    });

    it('lỗi KHÁC (không phải thiếu pick_events, VD group không tồn tại) -> ném lại nguyên vẹn, KHÔNG âm thầm fallback', async () => {
      orderGroupsService.findOrderGroupById.mockResolvedValue({
        _id: new Types.ObjectId(groupId),
        __v: 0,
      });
      orderGroupsService.getActuallyPickedItemsForGroup.mockRejectedValue(
        new AppException(
          ORD_GROUP_ERROR_CODES.GROUP_NOT_FOUND,
          'Không tìm thấy group.',
          404,
        ),
      );

      await expect(
        service.generateFallbackRecommendation(groupId),
      ).rejects.toMatchObject({
        errorCode: ORD_GROUP_ERROR_CODES.GROUP_NOT_FOUND,
      });
      expect(
        orderGroupsService.getPackableItemsForGroup,
      ).not.toHaveBeenCalled();
    });
  });
});
