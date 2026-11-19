import { Types } from 'mongoose';
import { ShipmentsService } from './shipments.service';
import { ShipmentStatus } from './enums/shipment-status.enum';
import { SHIPMENT_ERROR_CODES } from './shipments.errors';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';

//!=============================================
// AOFP-315 — shop tự giao: quét QR nhãn kiện trước khi "Giao thành công".
//!=============================================
describe('ShipmentsService — quét nhãn kiện khi giao', () => {
  const groupId = new Types.ObjectId();
  const shipmentId = new Types.ObjectId();
  const actor = { userId: 'coord-1', role: 3 };
  const photo = 'https://res.cloudinary.com/demo/image/upload/v1/optipack/proof/a.jpg';

  let shipmentModel: { findById: jest.Mock; findOne: jest.Mock; findOneAndUpdate: jest.Mock };
  let activityLogModel: { create: jest.Mock };
  let service: ShipmentsService;

  const shipment = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    _id: shipmentId, order_group_id: groupId, shipment_code: 'SHP-100', tracking_code: 'SHP-100', trip_code: 'TRIP-1',
    status: ShipmentStatus.OUT_FOR_DELIVERY, attempt_count: 1, max_attempts: 2, carrier_code: null, __v: 0, ...over,
  });

  beforeEach(() => {
    shipmentModel = { findById: jest.fn().mockResolvedValue(shipment()), findOne: jest.fn().mockResolvedValue(shipment()), findOneAndUpdate: jest.fn().mockResolvedValue(shipment({ status: ShipmentStatus.DELIVERED })) };
    activityLogModel = { create: jest.fn().mockResolvedValue([{}]) };
    const orderGroupsService = {
      findOrderGroupById: jest.fn().mockResolvedValue({ _id: groupId, fulfillment_status: GroupFulfillmentStatus.SHIPPED, __v: 5 }),
      transitionFulfillmentStatus: jest.fn().mockResolvedValue({}),
    };
    const session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    service = new ShipmentsService(
      shipmentModel as never, { create: jest.fn().mockResolvedValue([{}]) } as never, orderGroupsService as never,
      { startSession: jest.fn().mockResolvedValue(session) } as never,
      { createFromFailedDelivery: jest.fn() } as never,
      { notify: jest.fn().mockResolvedValue({}) } as never,
      { countParcelsToUnpack: jest.fn().mockResolvedValue(0) } as never,
      undefined, undefined, undefined, undefined, undefined,
      activityLogModel as never,
    );
  });

  it('AC1: quét QR nhãn của vận đơn khác (SHP-200) → 422 SHP_LABEL_SCAN_MISMATCH, không ghi giao', async () => {
    await expect(service.markDelivered(String(shipmentId), 0, actor, undefined, undefined, { photoUrls: [photo], scannedCode: 'SHP-200|TRIP-1' }))
      .rejects.toMatchObject({ errorCode: SHIPMENT_ERROR_CODES.LABEL_SCAN_MISMATCH, status: 422 });
    expect(shipmentModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('chỉ trùng mã chuyến (chung chuyến, khác vận đơn) vẫn là quét nhầm', async () => {
    await expect(service.markDelivered(String(shipmentId), 0, actor, undefined, undefined, { photoUrls: [photo], scannedCode: 'TRIP-1' }))
      .rejects.toMatchObject({ errorCode: SHIPMENT_ERROR_CODES.LABEL_SCAN_MISMATCH });
  });

  it.each([['QR nhãn', 'SHP-100|TRIP-1'], ['mã vạch', 'shp-100'], ['QR có mã hãng', 'GHN-9|SHP-100|TRIP-1']])('quét đúng (%s) → giao thành công', async (_label, code) => {
    await expect(service.markDelivered(String(shipmentId), 0, actor, undefined, undefined, { photoUrls: [photo], scannedCode: code })).resolves.toBeDefined();
    expect(activityLogModel.create).not.toHaveBeenCalled();
  });

  it('không quét, không lý do → 400 SHP_LABEL_SCAN_REQUIRED', async () => {
    await expect(service.markDelivered(String(shipmentId), 0, actor, undefined, undefined, { photoUrls: [photo] }))
      .rejects.toMatchObject({ errorCode: SHIPMENT_ERROR_CODES.LABEL_SCAN_REQUIRED, status: 400 });
  });

  it('AC2: nhãn hỏng + lý do + ảnh → giao thành công, lý do ghi activity_logs cùng transaction', async () => {
    await service.markDelivered(String(shipmentId), 0, actor, undefined, undefined, { photoUrls: [photo], scanSkippedReason: 'Tem rách không quét được' });
    const [[[doc], opts]] = activityLogModel.create.mock.calls as [[[Record<string, unknown>], { session: unknown }]];
    expect(doc).toMatchObject({ category: 'shipping', action: 'shipment.label_scan_skipped', note: 'Tem rách không quét được', actor_id: 'coord-1', entity_code: 'SHP-100' });
    expect(opts.session).toBeDefined();
  });

  it('AC2: nhãn hỏng vẫn bắt ảnh', async () => {
    await expect(service.markDelivered(String(shipmentId), 0, actor, undefined, undefined, { photoUrls: [], scanSkippedReason: 'Tem rách không quét được' }))
      .rejects.toMatchObject({ errorCode: SHIPMENT_ERROR_CODES.PROOF_PHOTO_REQUIRED });
  });

  it('AC3: route cũ fulfillment/deliver (không ảnh, không quét) bị chặn với vận đơn shop tự giao', async () => {
    await expect(service.legacyDeliver(String(groupId), 5, actor)).rejects.toMatchObject({ errorCode: SHIPMENT_ERROR_CODES.PROOF_PHOTO_REQUIRED });
    expect(shipmentModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('vận đơn hãng mẫu (có carrier_code) không bắt quét', async () => {
    shipmentModel.findById.mockResolvedValue(shipment({ carrier_code: 'SAMPLE-EXPRESS' }));
    await expect(service.markDelivered(String(shipmentId), 0, actor, undefined, undefined, { photoUrls: [] })).resolves.toBeDefined();
  });
});
