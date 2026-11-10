import { Types } from 'mongoose';
import { ShipmentsService } from './shipments.service';
import { ShipmentStatus } from './enums/shipment-status.enum';
import { DeliveryFailureReason } from './enums/delivery-failure-reason.enum';
import { SHIPMENT_ERROR_CODES } from './shipments.errors';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';

//!=============================================
// 10/11/2026 — ảnh bằng chứng giao hàng (BE_MOBILE_CHECKLIST mục 4):
// shop tự giao thành công bắt buộc ≥ 1 ảnh; giao thất bại không bắt buộc; ảnh ghi vào lịch sử.
//!=============================================
describe('ShipmentsService — ảnh bằng chứng', () => {
  const groupId = new Types.ObjectId();
  const shipmentId = new Types.ObjectId();
  const actor = { userId: 'coord-1', role: 3 };
  const photo = 'https://res.cloudinary.com/demo/image/upload/v1/optipack/proof/a.jpg';

  let shipmentModel: { findById: jest.Mock; findOneAndUpdate: jest.Mock };
  let eventModel: { create: jest.Mock };
  let service: ShipmentsService;

  const shipment = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    _id: shipmentId, order_group_id: groupId, shipment_code: 'SHP-X', status: ShipmentStatus.OUT_FOR_DELIVERY,
    attempt_count: 1, max_attempts: 2, carrier_code: null, __v: 0, ...over,
  });
  const firstEvent = (): Record<string, unknown> => (eventModel.create.mock.calls[0] as [[Record<string, unknown>]])[0][0];

  beforeEach(() => {
    shipmentModel = { findById: jest.fn(), findOneAndUpdate: jest.fn() };
    eventModel = { create: jest.fn().mockResolvedValue([{}]) };
    const orderGroupsService = {
      findOrderGroupById: jest.fn().mockResolvedValue({ _id: groupId, fulfillment_status: GroupFulfillmentStatus.SHIPPED, __v: 5 }),
      transitionFulfillmentStatus: jest.fn().mockResolvedValue({}),
    };
    const session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    service = new ShipmentsService(
      shipmentModel as never, eventModel as never, orderGroupsService as never,
      { startSession: jest.fn().mockResolvedValue(session) } as never,
      { createFromFailedDelivery: jest.fn().mockResolvedValue(undefined) } as never,
      { notify: jest.fn().mockResolvedValue({}) } as never,
      { countParcelsToUnpack: jest.fn().mockResolvedValue(0) } as never,
    );
  });

  it('shop tự giao (không có hãng) bấm "Giao thành công" không kèm ảnh → 400 SHP_PROOF_PHOTO_REQUIRED, không ghi gì', async () => {
    shipmentModel.findById.mockResolvedValue(shipment());
    await expect(service.markDelivered(shipmentId.toString(), 0, actor, undefined, undefined, [])).rejects.toMatchObject({
      errorCode: SHIPMENT_ERROR_CODES.PROOF_PHOTO_REQUIRED,
    });
    expect(shipmentModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(eventModel.create).not.toHaveBeenCalled();
  });

  it('shop tự giao kèm ảnh → giao thành công, ảnh ghi vào lịch sử vận đơn', async () => {
    shipmentModel.findById.mockResolvedValue(shipment());
    shipmentModel.findOneAndUpdate.mockResolvedValue(shipment({ status: ShipmentStatus.DELIVERED }));
    await service.markDelivered(shipmentId.toString(), 0, actor, undefined, undefined, [photo]);
    expect(firstEvent().photo_urls).toEqual([photo]);
  });

  it('vận đơn hãng mẫu (có carrier_code, cập nhật tay) → không bắt ảnh', async () => {
    shipmentModel.findById.mockResolvedValue(shipment({ carrier_code: 'SAMPLE-EXPRESS' }));
    shipmentModel.findOneAndUpdate.mockResolvedValue(shipment({ status: ShipmentStatus.DELIVERED }));
    await service.markDelivered(shipmentId.toString(), 0, actor, undefined, undefined, []);
    expect(firstEvent()).not.toHaveProperty('photo_urls');
  });

  it('gọi nội bộ (route cũ fulfillment/deliver, không truyền ảnh) → không kiểm ảnh', async () => {
    shipmentModel.findById.mockResolvedValue(shipment());
    shipmentModel.findOneAndUpdate.mockResolvedValue(shipment({ status: ShipmentStatus.DELIVERED }));
    await expect(service.markDelivered(shipmentId.toString(), 0, actor)).resolves.toBeDefined();
  });

  it('giao thất bại: không bắt ảnh; có ảnh thì ghi vào sự kiện giao thất bại', async () => {
    shipmentModel.findById.mockResolvedValue(shipment());
    shipmentModel.findOneAndUpdate.mockResolvedValue(shipment({ status: ShipmentStatus.DELIVERY_FAILED }));
    await service.markFailed(shipmentId.toString(), 0, DeliveryFailureReason.CUSTOMER_UNREACHABLE, actor, undefined, undefined, [photo]);
    expect(firstEvent().photo_urls).toEqual([photo]);

    eventModel.create.mockClear();
    await service.markFailed(shipmentId.toString(), 0, DeliveryFailureReason.CUSTOMER_UNREACHABLE, actor);
    expect(firstEvent()).not.toHaveProperty('photo_urls');
  });
});
