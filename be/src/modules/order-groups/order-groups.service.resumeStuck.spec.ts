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
