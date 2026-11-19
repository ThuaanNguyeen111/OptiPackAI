import { Types } from 'mongoose';
import { OrderGroupsService } from './order-groups.service';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';

//!=============================================
// AOFP-330 AC2 (19/11/2026) — người bán hủy đơn: hủy đơn + xếp lịch báo website + nhật ký chung 1
// transaction; báo sàn lỗi → lỗi lan ra, không xử lý nhóm (transaction thật sẽ rollback đơn).
// Xử lý nhóm lỗi → cờ group_resync_pending còn, cron xử lý lại.
//!=============================================
describe('OrderGroupsService.sellerCancelOrder — AOFP-330', () => {
  const orderId = new Types.ObjectId();
  const groupId = new Types.ObjectId();
  let orderModel: { findById: jest.Mock; updateOne: jest.Mock; updateMany: jest.Mock; find: jest.Mock };
  let outboxModel: { updateOne: jest.Mock };
  let activityLogModel: { create: jest.Mock };
  let session: { withTransaction: jest.Mock; endSession: jest.Mock };
  let service: OrderGroupsService;

  beforeEach(() => {
    orderModel = {
      findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ _id: orderId, platform: MarketplacePlatform.AURELLE, origin: 'marketplace', status: OrderStatus.PENDING, consolidated_group_id: groupId }) }) })),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      updateMany: jest.fn().mockResolvedValue({}),
      find: jest.fn(),
    };
    outboxModel = { updateOne: jest.fn().mockResolvedValue({}) };
    activityLogModel = { create: jest.fn().mockResolvedValue([{}]) };
    session = { withTransaction: jest.fn(async (fn: () => Promise<unknown>) => fn()), endSession: jest.fn() };
    const groupModel = { findById: jest.fn(() => ({ lean: () => Promise.resolve({ _id: groupId, fulfillment_status: GroupFulfillmentStatus.PICKING }) })) };
    service = new OrderGroupsService(
      groupModel as never, orderModel as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, { startSession: jest.fn().mockResolvedValue(session) } as never, {} as never, {} as never,
      {} as never, {} as never, undefined, outboxModel as never, activityLogModel as never,
    );
  });

  it('AC2: báo sàn lỗi → ném lỗi, đơn ghi trong cùng session (rollback), không xử lý nhóm', async () => {
    outboxModel.updateOne.mockRejectedValue(new Error('outbox down'));
    const resync = jest.spyOn(service, 'resyncGroupAfterCancel');

    await expect(service.sellerCancelOrder(orderId.toString(), 'Hết hàng', 'u1')).rejects.toThrow('outbox down');

    const [, update, opts] = orderModel.updateOne.mock.calls[0] as [unknown, { $set: Record<string, unknown> }, { session: unknown }];
    expect(opts.session).toBe(session);
    expect(update.$set).toMatchObject({ status: OrderStatus.CANCELED, group_resync_pending: true });
    expect((outboxModel.updateOne.mock.calls[0] as [unknown, unknown, { session: unknown }])[2].session).toBe(session);
    expect(resync).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it('xử lý nhóm lỗi → vẫn trả đơn đã hủy, giữ cờ để cron xử lý lại; thành công thì xoá cờ', async () => {
    const handle = jest.spyOn(service, 'handleOrderBecameUnfulfillable').mockRejectedValueOnce(new Error('plan busy'));

    await expect(service.sellerCancelOrder(orderId.toString(), 'Hết hàng', 'u1')).resolves.toEqual({ order_id: orderId.toString(), status: OrderStatus.CANCELED });
    expect(orderModel.updateMany).not.toHaveBeenCalled();

    orderModel.find.mockReturnValue({ select: () => ({ limit: () => ({ lean: () => Promise.resolve([{ _id: orderId, consolidated_group_id: groupId }]) }) }) });
    handle.mockResolvedValueOnce(undefined);
    expect(await service.resyncPendingCanceledGroups()).toEqual({ groups: 1, failed: 0 });
    expect(orderModel.updateMany).toHaveBeenCalledWith(
      { consolidated_group_id: groupId, group_resync_pending: true },
      { $unset: { group_resync_pending: 1 } },
    );
  });
});
