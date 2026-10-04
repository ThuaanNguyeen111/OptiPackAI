import { Types } from 'mongoose';
import { ShipmentsService } from './shipments.service';
import { ShipmentStatus } from './enums/shipment-status.enum';
import { DeliveryFailureReason } from './enums/delivery-failure-reason.enum';
import { SHIPMENT_ERROR_CODES } from './shipments.errors';
import { NotificationType } from '../notifications/enums/notification-type.enum';

//!=============================================
// Hoàn thiện giao hàng: khoảng cách tối thiểu giữa 2 lần giao, giờ khách hẹn,
// giao sớm phải có lý do, quét quá hạn, thông báo.
//!=============================================
describe('ShipmentsService — hoàn thiện giao hàng', () => {
  const id = new Types.ObjectId();
  const actor = { userId: 'coord-1', role: 3 };
  let shipmentModel: { findById: jest.Mock; findOneAndUpdate: jest.Mock; find: jest.Mock; updateOne: jest.Mock };
  let notify: jest.Mock;
  let service: ShipmentsService;
  const ship = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    _id: id, order_group_id: new Types.ObjectId(), shipment_code: 'SHP-1', status: ShipmentStatus.OUT_FOR_DELIVERY, attempt_count: 1, max_attempts: 2, __v: 0, ...over,
  });

  beforeEach(() => {
    shipmentModel = { findById: jest.fn(), findOneAndUpdate: jest.fn(), find: jest.fn(), updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }) };
    notify = jest.fn().mockResolvedValue({});
    const session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    service = new ShipmentsService(shipmentModel as never, { create: jest.fn().mockResolvedValue([{}]) } as never, {} as never,
      { startSession: jest.fn().mockResolvedValue(session) } as never, {} as never, { notify } as never, {} as never);
  });

  const setOf = (): Record<string, unknown> => (shipmentModel.findOneAndUpdate.mock.calls[0] as [unknown, { $set: Record<string, unknown> }])[1].$set;

  it('thất bại lần 1 -> khóa "Giao lại" tới bây giờ + 120 phút, gửi thông báo DELIVERY_FAILED', async () => {
    shipmentModel.findById.mockResolvedValue(ship());
    shipmentModel.findOneAndUpdate.mockResolvedValue(ship({ status: ShipmentStatus.DELIVERY_FAILED }));
    const before = Date.now();
    await service.markFailed(id.toString(), 0, DeliveryFailureReason.CUSTOMER_UNREACHABLE, actor);
    const next = setOf().next_attempt_not_before as Date;
    expect(next.getTime()).toBeGreaterThanOrEqual(before + 120 * 60_000 - 1000);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: NotificationType.DELIVERY_FAILED }));
  });

  it('khách hẹn giờ -> "Giao lại" mở đúng giờ hẹn; giờ hẹn ở quá khứ -> 400', async () => {
    shipmentModel.findById.mockResolvedValue(ship());
    shipmentModel.findOneAndUpdate.mockResolvedValue(ship({ status: ShipmentStatus.DELIVERY_FAILED }));
    const at = new Date(Date.now() + 5 * 3600_000).toISOString();
    await service.markFailed(id.toString(), 0, DeliveryFailureReason.CUSTOMER_RESCHEDULED, actor, undefined, at);
    expect((setOf().next_attempt_not_before as Date).toISOString()).toBe(at);
    await expect(service.markFailed(id.toString(), 0, DeliveryFailureReason.CUSTOMER_RESCHEDULED, actor, undefined, '2020-01-01T00:00:00Z'))
      .rejects.toMatchObject({ errorCode: SHIPMENT_ERROR_CODES.INVALID_RESCHEDULE });
  });

  it('thất bại lần 2 -> tự hoàn về, thông báo DELIVERY_RETURNING, không đặt giờ giao lại', async () => {
    shipmentModel.findById.mockResolvedValue(ship({ attempt_count: 2 }));
    shipmentModel.findOneAndUpdate.mockResolvedValue(ship({ status: ShipmentStatus.RETURNING_TO_WAREHOUSE }));
    await service.markFailed(id.toString(), 0, DeliveryFailureReason.WRONG_ADDRESS, actor);
    expect(setOf().next_attempt_not_before).toBeNull();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: NotificationType.DELIVERY_RETURNING }));
  });

  it('bấm "Giao lại" trước giờ cho phép, không lý do -> 409 SHP_RETRY_TOO_EARLY; có lý do -> cho giao, ghi lý do vào lịch sử', async () => {
    const future = new Date(Date.now() + 3600_000);
    shipmentModel.findById.mockResolvedValue(ship({ status: ShipmentStatus.DELIVERY_FAILED, next_attempt_not_before: future }));
    await expect(service.retryDelivery(id.toString(), 1, actor)).rejects.toMatchObject({ errorCode: SHIPMENT_ERROR_CODES.RETRY_TOO_EARLY });

    shipmentModel.findOneAndUpdate.mockResolvedValue(ship({ attempt_count: 2 }));
    await service.retryDelivery(id.toString(), 1, actor, undefined, 'Khách gọi lại, đang ở nhà');
    expect(setOf().next_attempt_not_before).toBeNull();
  });

  it('vận đơn cũ (không có next_attempt_not_before) -> Giao lại bình thường', async () => {
    shipmentModel.findById.mockResolvedValue(ship({ status: ShipmentStatus.DELIVERY_FAILED }));
    shipmentModel.findOneAndUpdate.mockResolvedValue(ship({ attempt_count: 2 }));
    await expect(service.retryDelivery(id.toString(), 1, actor)).resolves.toBeDefined();
  });

  it('quét quá hạn: gắn cờ + báo Store Owner và Coordinator; vận đơn đã gắn cờ không báo lại', async () => {
    shipmentModel.find.mockResolvedValue([ship({ due_at: new Date(Date.now() - 1000) }), ship({ _id: new Types.ObjectId() })]);
    shipmentModel.updateOne.mockResolvedValueOnce({ modifiedCount: 1 }).mockResolvedValueOnce({ modifiedCount: 0 });
    await expect(service.flagOverdueShipments()).resolves.toBe(1);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: NotificationType.DELIVERY_OVERDUE }));
  });
});
