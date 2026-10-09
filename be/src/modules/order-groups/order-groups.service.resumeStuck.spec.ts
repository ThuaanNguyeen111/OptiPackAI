import { Types } from 'mongoose';
import { OrderGroupsService } from './order-groups.service';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';

// (09/10/2026) Cứu nhóm kẹt awaiting_packaging: bước chuyển sang picking lúc tạo lỗi
// thì nhóm nằm im (không API nào đưa đi tiếp) — cron backfill gọi hàm này.
describe('OrderGroupsService.resumeStuckAwaitingGroups', () => {
  function build(groups: Record<string, unknown>[], activeOrders: number): {
    service: OrderGroupsService;
    autoAssign: jest.Mock;
  } {
    const autoAssign = jest.fn().mockResolvedValue({});
    const orderGroupModel = {
      find: jest.fn(() => ({ sort: () => ({ limit: () => Promise.resolve(groups) }) })),
    };
    const orderModel = { countDocuments: jest.fn().mockResolvedValue(activeOrders) };
    const service = new OrderGroupsService(
      orderGroupModel as never,
      orderModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { autoAssign } as never,
      {} as never,
      {} as never,
      {} as never,
      { reconcile: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
    );
    return { service, autoAssign };
  }

  it('nhóm còn đơn hợp lệ → chạy lại bước chuyển sang picking, giữ người đã gán', async () => {
    const assigned = { _id: new Types.ObjectId(), __v: 0, assigned_staff_id: new Types.ObjectId() };
    const unassigned = { _id: new Types.ObjectId(), __v: 0, assigned_staff_id: null };
    const { service, autoAssign } = build([assigned, unassigned], 2);
    const reconcile = jest.spyOn(service, 'reconcileReservation').mockResolvedValue(undefined);
    const transition = jest
      .spyOn(service, 'transitionFulfillmentStatus')
      .mockResolvedValue({ fulfillment_status: GroupFulfillmentStatus.PICKING } as never);
    expect(await service.resumeStuckAwaitingGroups()).toBe(2);
    expect(autoAssign).toHaveBeenCalledTimes(1);
    expect(autoAssign).toHaveBeenCalledWith(unassigned._id.toString());
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(transition).toHaveBeenCalledWith(assigned._id.toString(), GroupFulfillmentStatus.PICKING, 0);
  });

  it('nhóm không còn đơn hợp lệ → đi đường hủy tự động, không chuyển picking', async () => {
    const group = { _id: new Types.ObjectId(), __v: 0, assigned_staff_id: null };
    const { service } = build([group], 0);
    const cancel = jest.spyOn(service, 'cancelIfAllOrdersUnfulfillable').mockResolvedValue();
    const transition = jest.spyOn(service, 'transitionFulfillmentStatus');
    expect(await service.resumeStuckAwaitingGroups()).toBe(0);
    expect(cancel).toHaveBeenCalledWith(group._id.toString());
    expect(transition).not.toHaveBeenCalled();
  });
});

// (09/10/2026) Chi tiết nhóm đơn trả kèm các đơn bên trong cho staff vận hành.
describe('OrderGroupsService.listOrdersInGroup', () => {
  it('trả đơn kèm người nhận và món đã gộp theo SKU', async () => {
    const groupId = new Types.ObjectId();
    const order = {
      _id: new Types.ObjectId(),
      platform: 'lazada',
      platform_order_id: '123',
      status: 'pending',
      recipient: { full_name: 'A', phone: '090', address_line1: '1 Đường X', city: 'HCM' },
      items: [
        { platform_order_item_id: '1', sku: 'S1', name: 'Áo', quantity: 1, unit_price: 100, status: 'pending' },
        { platform_order_item_id: '2', sku: 'S1', name: 'Áo', quantity: 1, unit_price: 100, status: 'pending' },
      ],
      created_at: new Date(),
    };
    const service = new OrderGroupsService(
      { findById: jest.fn().mockResolvedValue({ _id: groupId }) } as never,
      { find: () => ({ select: () => ({ sort: () => ({ lean: () => Promise.resolve([order]) }) }) }) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const [view] = await service.listOrdersInGroup(groupId.toString());
    expect(view?.platformOrderId).toBe('123');
    expect(view?.recipient.fullName).toBe('A');
    expect(view?.items).toHaveLength(1);
    expect(view?.items[0]?.quantity).toBe(2);
  });
});
