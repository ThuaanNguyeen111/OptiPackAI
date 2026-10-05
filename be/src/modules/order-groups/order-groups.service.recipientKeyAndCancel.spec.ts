import { Types } from 'mongoose';
import { OrderGroupsService } from './order-groups.service';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';
import { OrderStatus } from '../orders/enums/order-status.enum';

//!=============================================
// MỚI (29/09/2026, Mục 9.5 + N1 — AURELLE_MARKETPLACE_DESIGN.md):
// (1) getOrCreateGroupForOrder() phải set recipient_key khi tạo group mới;
// (2) cancelIfAllOrdersUnfulfillable() (N1) — tự động hủy nhóm khi mọi
//     đơn bên trong không còn fulfill được, nhả giữ chỗ đóng gói;
// (3) findLinkedGroups() — nhóm khác cùng recipient_key, chưa giao xong.
//!=============================================
describe('OrderGroupsService — recipient_key + N1 auto-cancel', () => {
  let service: OrderGroupsService;

  let orderGroupModel: {
    create: jest.Mock<Promise<unknown>, [{ recipient_key: string }]>;
    findById: jest.Mock;
    find: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  let orderModel: { countDocuments: jest.Mock; updateOne: jest.Mock; find?: jest.Mock };
  let packingPlanModel: { updateMany: jest.Mock; findOne: jest.Mock; updateOne: jest.Mock };
  let notificationsService: {
    notify: jest.Mock;
    buildGroupAutoCanceledMessage: jest.Mock;
    buildPackagingPlanInvalidatedMessage: jest.Mock;
  };

  function makeOrder(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      _id: new Types.ObjectId(),
      platform: 'lazada',
      shop_id: 'shop-1',
      consolidated_group_id: null,
      recipient: {
        full_name: 'Nguyễn Văn A',
        phone: '0901234567',
        address_line1: '12 Đường 3/2',
        city: 'TP. Hồ Chí Minh',
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    orderGroupModel = {
      create: jest.fn<Promise<unknown>, [{ recipient_key: string }]>(),
      findById: jest.fn(),
      find: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    orderModel = {
      countDocuments: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    packingPlanModel = {
      updateMany: jest.fn().mockResolvedValue({}),
      // Chưa có phiên đóng gói (kế hoạch packing/packed) → luồng hủy như trước 05/10/2026.
      findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    notificationsService = {
      notify: jest.fn().mockResolvedValue({}),
      buildGroupAutoCanceledMessage: jest
        .fn()
        .mockReturnValue({ title: 't', message: 'm' }),
      buildPackagingPlanInvalidatedMessage: jest
        .fn()
        .mockReturnValue({ title: 't', message: 'm' }),
    };

    service = new OrderGroupsService(
      orderGroupModel as never,
      orderModel as never,
      {} as never, // productMasterModel — không dùng trong đường code này
      {} as never, // skuBinAssignmentModel
      {} as never, // pickEventModel
      {} as never, // userModel
      packingPlanModel as never,
      notificationsService as never,
      {} as never, // staffAssignmentService
      {} as never, // connection
      {} as never, // inventoryMovementModel
      {} as never, // mappingModel
      { releaseGroup: jest.fn().mockResolvedValue(0), reconcile: jest.fn().mockResolvedValue([]) } as never, // stockReservationService
      {} as never, // binLocationModel
    );
  });

  describe('getOrCreateGroupForOrder() — set recipient_key khi tạo group mới', () => {
    it('đơn chưa có group -> recipient_key được tính từ recipient của đơn', async () => {
      const order = makeOrder();
      const createdGroup = { _id: new Types.ObjectId() };
      orderGroupModel.create.mockResolvedValue(createdGroup);
      // startPickingPhase() gọi transitionFulfillmentStatus/autoAssign nội bộ —
      // mock findById để nó không throw (best-effort, service tự bọc try/catch).
      orderGroupModel.findById.mockResolvedValue(null);

      await service.getOrCreateGroupForOrder(order as never);

      expect(orderGroupModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient_key: expect.any(String) as string,
        }),
      );
      const [callArg] = orderGroupModel.create.mock.calls[0] ?? [];
      expect(callArg?.recipient_key).toHaveLength(64); // sha256 hex
    });
  });

  describe('cancelIfAllOrdersUnfulfillable() (N1)', () => {
    it('nhóm đang PICKING, còn 1 đơn fulfill được -> KHÔNG hủy, KHÔNG notify', async () => {
      const groupId = new Types.ObjectId().toString();
      orderGroupModel.findById.mockResolvedValue({
        _id: groupId,
        fulfillment_status: GroupFulfillmentStatus.PICKING,
        __v: 0,
      });
      orderModel.countDocuments.mockResolvedValue(1); // còn 1 đơn fulfill được

      await service.cancelIfAllOrdersUnfulfillable(groupId);

      expect(orderGroupModel.findOneAndUpdate).not.toHaveBeenCalled(); // transition không được gọi
      expect(notificationsService.notify).not.toHaveBeenCalled();
    });

    it('nhóm đã PACKED -> KHÔNG hủy dù mọi đơn đều canceled (hàng đã đóng vật lý, cần luồng return thủ công)', async () => {
      const groupId = new Types.ObjectId().toString();
      orderGroupModel.findById.mockResolvedValue({
        _id: groupId,
        fulfillment_status: GroupFulfillmentStatus.PACKED,
        __v: 0,
      });

      await service.cancelIfAllOrdersUnfulfillable(groupId);

      expect(orderModel.countDocuments).not.toHaveBeenCalled(); // trả sớm, không cần đếm
      expect(notificationsService.notify).not.toHaveBeenCalled();
    });

    it('nhóm đang PICKING, KHÔNG còn đơn nào fulfill được -> tự động CANCELED + nhả giữ chỗ + notify 2 role', async () => {
      const groupId = new Types.ObjectId().toString();
      orderGroupModel.findById.mockResolvedValue({
        _id: groupId,
        fulfillment_status: GroupFulfillmentStatus.PICKING,
        __v: 3,
        assigned_staff_id: null,
      });
      orderModel.countDocuments.mockResolvedValue(0); // hết đơn fulfill được
      // transitionFulfillmentStatus() bên trong gọi findOrderGroupById() (findById
      // — dùng lại mockResolvedValue chung ở trên) rồi findOneAndUpdate.
      orderGroupModel.findOneAndUpdate.mockResolvedValue({
        _id: groupId,
        fulfillment_status: GroupFulfillmentStatus.CANCELED,
        __v: 4,
      });

      await service.cancelIfAllOrdersUnfulfillable(groupId);

      // (04/10/2026) Kế hoạch đóng gói đang hoạt động (chưa đóng) → superseded, nhả giữ chỗ thùng.
      expect(packingPlanModel.updateMany).toHaveBeenCalledWith(
        { order_group_id: expect.anything() as unknown, is_active: true, status: { $ne: 'packed' } },
        { $set: { is_active: false, status: 'superseded' } },
      );
      // Store Owner + Admin (broadcast theo role) — 2 lời gọi notify tối thiểu.
      expect(
        notificationsService.notify.mock.calls.length,
      ).toBeGreaterThanOrEqual(2);
    });
  });

  describe('handleOrderBecameUnfulfillable() — 1 đơn hủy, nhóm còn đơn khác', () => {
    it('nhóm APPROVED_FOR_PACKING còn đơn fulfill được -> vô hiệu phương án, quay về PICKED, báo Packaging Staff + Admin', async () => {
      const groupId = new Types.ObjectId().toString();
      orderGroupModel.findById.mockResolvedValue({
        _id: groupId,
        fulfillment_status: GroupFulfillmentStatus.APPROVED_FOR_PACKING,
        __v: 5,
      });
      orderModel.countDocuments.mockResolvedValue(1); // còn 1 đơn fulfill được -> KHÔNG hủy cả nhóm
      orderGroupModel.findOneAndUpdate.mockResolvedValue({
        _id: groupId,
        fulfillment_status: GroupFulfillmentStatus.PICKED,
        __v: 6,
      });
      await service.handleOrderBecameUnfulfillable(groupId);

      expect(orderGroupModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      const [, update] = orderGroupModel.findOneAndUpdate.mock.calls[0] as [
        unknown,
        { $set: { fulfillment_status: string } },
      ];
      expect(update.$set.fulfillment_status).toBe(
        GroupFulfillmentStatus.PICKED,
      );
      expect(packingPlanModel.updateMany).toHaveBeenCalledTimes(1);
      expect(notificationsService.notify).toHaveBeenCalledTimes(2);
    });

    it('nhóm đang PICKING (chưa có phương án) còn đơn khác -> không làm gì', async () => {
      const groupId = new Types.ObjectId().toString();
      orderGroupModel.findById.mockResolvedValue({
        _id: groupId,
        fulfillment_status: GroupFulfillmentStatus.PICKING,
        __v: 1,
      });
      orderModel.countDocuments.mockResolvedValue(1);

      await service.handleOrderBecameUnfulfillable(groupId);

      expect(orderGroupModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(packingPlanModel.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('isGroupOpenForNewOrders()', () => {
    it.each([
      [GroupFulfillmentStatus.AWAITING_PACKAGING, true],
      [GroupFulfillmentStatus.PICKING, true],
      [GroupFulfillmentStatus.PICKED, false],
      [GroupFulfillmentStatus.PENDING_APPROVAL, false],
      [GroupFulfillmentStatus.APPROVED_FOR_PACKING, false],
      [GroupFulfillmentStatus.PACKED, false],
    ])('trạng thái %s -> %s', async (status, expected) => {
      orderGroupModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ fulfillment_status: status }),
        }),
      });
      expect(await service.isGroupOpenForNewOrders('g')).toBe(expected);
    });
  });

  describe('findLinkedGroups()', () => {
    it('group.recipient_key = null -> trả mảng rỗng ngay, không query DB', async () => {
      const groupId = new Types.ObjectId().toString();
      orderGroupModel.findById.mockResolvedValue({
        _id: groupId,
        recipient_key: null,
      });

      const result = await service.findLinkedGroups(groupId);

      expect(result).toEqual([]);
      expect(orderGroupModel.find).not.toHaveBeenCalled();
    });

    it('group.recipient_key khác null -> query loại trừ chính nó + DELIVERED/RETURNED/CANCELED', async () => {
      const groupId = new Types.ObjectId().toString();
      const recipientKey = 'abc123';
      orderGroupModel.findById.mockResolvedValue({
        _id: groupId,
        recipient_key: recipientKey,
      });
      orderGroupModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: 'other-group' }]),
      });

      const result = await service.findLinkedGroups(groupId);

      expect(orderGroupModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient_key: recipientKey,
          fulfillment_status: {
            $nin: [
              GroupFulfillmentStatus.DELIVERED,
              GroupFulfillmentStatus.RETURNED,
              GroupFulfillmentStatus.CANCELED,
            ],
          },
        }),
      );
      expect(result).toEqual([{ _id: 'other-group' }]);
    });
  });

  it('OrderStatus.CANCELED được coi là không còn fulfill được (sanity check dùng chung enum)', () => {
    expect(OrderStatus.CANCELED).toBe('canceled');
  });
  describe('handleOrderBecameUnfulfillable() — đơn hủy SAU khi đã bắt đầu đóng (05/10/2026)', () => {
    const keepOrder = new Types.ObjectId();
    const deadOrder = new Types.ObjectId();

    function sessionPlan(status: 'packing' | 'packed'): Record<string, unknown> {
      const parcel = (no: number, orderId: Types.ObjectId, st: string): Record<string, unknown> => ({
        parcel_no: no,
        order_id: orderId,
        status: st,
        box_consumed: st === 'sealed',
        unpack: null,
      });
      return {
        _id: new Types.ObjectId(),
        order_group_id: new Types.ObjectId(),
        version: 7,
        status,
        assigned_packer_id: null,
        orders: [
          { order_id: keepOrder, status: 'ok', cp_sat: 'done', explanation: [] },
          { order_id: deadOrder, status: 'ok', cp_sat: 'pending', explanation: [] },
        ],
        parcels: [parcel(1, keepOrder, 'sealed'), parcel(2, deadOrder, 'sealed'), parcel(3, deadOrder, 'pending')],
      };
    }

    function mockDeadOrders(): void {
      orderModel.find = jest.fn().mockReturnValue({
        select: () => ({ lean: () => Promise.resolve([{ _id: deadOrder }]) }),
      });
    }

    it('kế hoạch đang đóng, còn đơn khác → chỉ kiện của đơn hủy thành "phải tháo", KHÔNG thay kế hoạch, nhóm giữ nguyên', async () => {
      const groupId = new Types.ObjectId().toString();
      packingPlanModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(sessionPlan('packing')) });
      mockDeadOrders();
      orderGroupModel.findById.mockResolvedValue({
        _id: groupId,
        fulfillment_status: GroupFulfillmentStatus.APPROVED_FOR_PACKING,
        __v: 5,
      });
      orderModel.countDocuments.mockResolvedValue(1);

      await service.handleOrderBecameUnfulfillable(groupId);

      const [filter, update] = packingPlanModel.updateOne.mock.calls[0] as [
        { version: number },
        { $set: { parcels: { parcel_no: number; status: string }[]; orders: { status: string; cp_sat: string }[] } },
      ];
      expect(filter.version).toBe(7);
      expect(update.$set.parcels.map((p) => p.status)).toEqual(['sealed', 'to_unpack', 'to_unpack']);
      expect(update.$set.orders.map((o) => o.status)).toEqual(['ok', 'canceled']);
      expect(update.$set.orders[1]?.cp_sat).toBe('skipped');
      expect(orderGroupModel.findOneAndUpdate).not.toHaveBeenCalled(); // không quay về picked
      expect(packingPlanModel.updateMany).not.toHaveBeenCalled(); // không thay kế hoạch
      expect(notificationsService.notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'unpack_required' }),
      );
    });

    it('nhóm đã packed và mọi đơn đều hủy → nhóm CANCELED, giữ kế hoạch để tháo kiện', async () => {
      const groupId = new Types.ObjectId().toString();
      packingPlanModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(sessionPlan('packed')) });
      mockDeadOrders();
      orderGroupModel.findById.mockResolvedValue({
        _id: groupId,
        fulfillment_status: GroupFulfillmentStatus.PACKED,
        __v: 9,
      });
      orderModel.countDocuments.mockResolvedValue(0);
      orderGroupModel.findOneAndUpdate.mockResolvedValue({
        _id: groupId,
        fulfillment_status: GroupFulfillmentStatus.CANCELED,
        __v: 10,
      });

      await service.handleOrderBecameUnfulfillable(groupId);

      const [, update] = orderGroupModel.findOneAndUpdate.mock.calls[0] as [
        unknown,
        { $set: { fulfillment_status: string } },
      ];
      expect(update.$set.fulfillment_status).toBe(GroupFulfillmentStatus.CANCELED);
      expect(packingPlanModel.updateMany).not.toHaveBeenCalled();
    });
  });
});
