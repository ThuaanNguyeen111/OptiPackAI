import { Types } from 'mongoose';
import { ShipmentsService, carrierClientCode } from './shipments.service';
import { ShipmentStatus } from './enums/shipment-status.enum';
import { ShipmentEventType } from './enums/shipment-event-type.enum';
import { SHIPMENT_ERROR_CODES } from './shipments.errors';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import { AppException } from '../../common/exceptions/app-exception';

//!=============================================
// C4/C5 (14/10/2026) — vận đơn giao qua HÃNG API (GHN/mock).
// Kiểm: tạo vận đơn → "chờ lấy hàng" + tạo đơn ở hãng từng kiện; lỗi hãng ghi lên vận
// đơn (không mất vận đơn); nút G1 bị chặn; sự kiện hãng (webhook / mô phỏng / đồng bộ)
// đi chung 1 hàm: chống trùng, đổi trạng thái theo luật hãng, nhóm đơn đi theo;
// huỷ ở hãng → nhóm đơn về packed và đặt lại được.
//!=============================================
describe('ShipmentsService — C4/C5 hãng API', () => {
  const groupId = new Types.ObjectId();
  const shipmentId = new Types.ObjectId();
  const orderId = new Types.ObjectId();
  const actor = { userId: 'coord-1', role: 3 };

  let shipmentModel: Record<'findById' | 'findOne' | 'findOneAndUpdate' | 'updateOne' | 'create' | 'exists', jest.Mock>;
  let eventModel: { create: jest.Mock };
  let orderGroupsService: { findOrderGroupById: jest.Mock; transitionFulfillmentStatus: jest.Mock };
  let shippingService: Record<'countParcelsToUnpack' | 'quoteChosenService' | 'persistCosts' | 'resolveLiveService' | 'parcelsOfGroup', jest.Mock>;
  let adapter: Record<'cancelShipment' | 'createLabel' | 'getShipmentDetail', jest.Mock>;
  let liveCarrier: { adapterCode: string; adapterInstance: typeof adapter; bookParcel: jest.Mock };
  let webhookEventModel: Record<'create' | 'updateOne' | 'deleteOne', jest.Mock>;
  let config: Record<string, unknown>;
  let service: ShipmentsService;

  const liveShipment = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    _id: shipmentId,
    order_group_id: groupId,
    shipment_code: 'SHP-X',
    status: ShipmentStatus.AWAITING_PICKUP,
    carrier_kind: 'live',
    carrier_code: 'GHN',
    carrier_name: 'GHN',
    service_code: 'LIGHT',
    attempt_count: 1,
    max_attempts: 2,
    booking_round: 1,
    note: null,
    to_location: null,
    picked_up_at: null,
    __v: 0,
    carrier_parcels: [
      { parcel_no: 1, order_id: orderId, client_order_code: 'SHP-X-1', carrier_order_code: 'GHN1', carrier_status: 'ready_to_pick' },
    ],
    ...over,
  });

  const eventTypes = (): string[] => eventModel.create.mock.calls.map((c) => (c as [[{ event_type: string }]])[0][0].event_type);

  beforeEach(() => {
    shipmentModel = {
      findById: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({}),
      create: jest.fn(),
      exists: jest.fn().mockResolvedValue(null),
    };
    eventModel = { create: jest.fn().mockResolvedValue([{}]) };
    orderGroupsService = {
      findOrderGroupById: jest.fn().mockResolvedValue({ _id: groupId, fulfillment_status: GroupFulfillmentStatus.SHIPPED, __v: 5 }),
      transitionFulfillmentStatus: jest.fn().mockResolvedValue({}),
    };
    shippingService = {
      countParcelsToUnpack: jest.fn().mockResolvedValue(0),
      quoteChosenService: jest.fn(),
      persistCosts: jest.fn().mockResolvedValue(undefined),
      resolveLiveService: jest.fn().mockResolvedValue({ carrierCode: 'GHN', carrierName: 'GHN', volumetricDivisor: 5000, serviceCode: 'LIGHT', serviceName: 'Hàng nhẹ', serviceTypeId: 2 }),
      parcelsOfGroup: jest.fn().mockResolvedValue([
        { orderId: orderId.toString(), cartonIndex: 0, parcelNo: 1, actualG: 300, outer: { length_mm: 300, width_mm: 250, height_mm: 40 } },
      ]),
    };
    adapter = {
      cancelShipment: jest.fn().mockResolvedValue({ carrier_order_code: 'GHN1', cancelled: true, message: null }),
      createLabel: jest.fn().mockResolvedValue({ url: 'https://label', expires_at: new Date() }),
      getShipmentDetail: jest.fn(),
    };
    liveCarrier = { adapterCode: 'mock', adapterInstance: adapter, bookParcel: jest.fn() };
    webhookEventModel = {
      create: jest.fn().mockResolvedValue([{ _id: new Types.ObjectId() }]),
      updateOne: jest.fn().mockResolvedValue({}),
      deleteOne: jest.fn().mockResolvedValue({}),
    };
    config = { 'carrier.manualStatusEnabled': true, 'carrier.ghn.webhookSecret': 's3cret', 'carrier.ghn.shopId': '227609' };
    const session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    service = new ShipmentsService(
      shipmentModel as never,
      eventModel as never,
      orderGroupsService as never,
      { startSession: jest.fn().mockResolvedValue(session) } as never,
      { createFromFailedDelivery: jest.fn() } as never,
      { notify: jest.fn().mockResolvedValue({}) } as never,
      shippingService as never,
      liveCarrier as never,
      webhookEventModel as never,
      { get: jest.fn((k: string) => config[k]) } as never,
    );
  });

  it('client_order_code: lần 1 = SHP-...-<kiện>, đặt lại = SHP-...-R2-<kiện>', () => {
    expect(carrierClientCode('SHP-X', 1, 3)).toBe('SHP-X-3');
    expect(carrierClientCode('SHP-X', 2, 3)).toBe('SHP-X-R2-3');
  });

  describe('C4 — tạo vận đơn với hãng API', () => {
    const liveQuote = {
      carrierCode: 'GHN', carrierName: 'GHN', serviceCode: 'LIGHT', serviceName: 'Hàng nhẹ', etaMinDays: 1, etaMaxDays: 1,
      parcels: [{ orderId: orderId.toString(), cartonIndex: 0, parcelNo: 1, actualG: 300, volumetricG: 600, chargeableG: 600, costVnd: 20900 }],
      totalChargeableG: 600, totalCostVnd: 20900, isSample: false, isLive: true,
    };

    beforeEach(() => {
      orderGroupsService.findOrderGroupById.mockResolvedValue({ _id: groupId, fulfillment_status: GroupFulfillmentStatus.PACKED, __v: 3 });
      shippingService.quoteChosenService.mockResolvedValue(liveQuote);
      shipmentModel.create.mockImplementation((docs: Record<string, unknown>[]) => Promise.resolve([{ ...docs[0], __v: 0 }]));
    });

    it('vận đơn bắt đầu "chờ lấy hàng", kiện có client_order_code; nhóm đơn -> shipped; tạo đơn ở hãng rồi ghi mã + phí thật', async () => {
      shipmentModel.findById.mockResolvedValue(liveShipment({ carrier_parcels: [{ parcel_no: 1, order_id: orderId, client_order_code: 'SHP-X-1', carrier_order_code: null }] }));
      liveCarrier.bookParcel.mockResolvedValue({
        carrierParcel: { weight_g: 300, length_cm: 30, width_cm: 25, height_cm: 4 },
        result: { carrier_order_code: 'L88K7P', sort_code: 'GXT-M-11-00', fee: { total: 20900, service_fee: 20900, insurance_fee: 0, cod_fee: 0, remote_area_fee: 0, other_fee: 0 }, expected_delivery_at: new Date('2026-10-15T16:59:59Z') },
        assumptions: [],
      });
      shipmentModel.findOneAndUpdate.mockImplementation((_f: unknown, u: { $set: Record<string, unknown> }) => Promise.resolve(liveShipment(u.$set)));

      await service.startDelivery(groupId.toString(), actor, undefined, undefined, { carrierCode: 'GHN', serviceCode: 'LIGHT' });

      const created = (shipmentModel.create.mock.calls[0] as [Record<string, unknown>[]])[0][0] as { status: string; carrier_kind: string; carrier_parcels: { client_order_code: string }[] };
      expect(created.status).toBe(ShipmentStatus.AWAITING_PICKUP);
      expect(created.carrier_kind).toBe('live');
      expect(created.carrier_parcels[0]?.client_order_code).toMatch(/^SHP-\d{6}-[0-9A-F]{6}-1$/);
      expect(orderGroupsService.transitionFulfillmentStatus).toHaveBeenCalledWith(groupId.toString(), GroupFulfillmentStatus.SHIPPED, 3, expect.anything());
      const set = (shipmentModel.findOneAndUpdate.mock.calls[0] as [unknown, { $set: { carrier_parcels: { carrier_order_code: string }[]; estimated_cost_vnd: number; carrier_booking_error: string | null } }])[1].$set;
      expect(set.carrier_parcels[0]?.carrier_order_code).toBe('L88K7P');
      expect(set.estimated_cost_vnd).toBe(20900);
      expect(set.carrier_booking_error).toBeNull();
      expect(eventTypes()).toEqual([ShipmentEventType.START_DELIVERY, ShipmentEventType.CARRIER_BOOKED]);
    });

    it('hãng báo sai địa chỉ → vận đơn vẫn còn, lỗi ghi vào carrier_booking_error, chưa có sự kiện CARRIER_BOOKED', async () => {
      shipmentModel.findById.mockResolvedValue(liveShipment({ carrier_parcels: [{ parcel_no: 1, order_id: orderId, client_order_code: 'SHP-X-1', carrier_order_code: null }] }));
      liveCarrier.bookParcel.mockRejectedValue(new AppException('CARRIER_ADDRESS_CONFLICT', 'Số nhà/đường không thuộc phường', 422));
      shipmentModel.findOneAndUpdate.mockImplementation((_f: unknown, u: { $set: Record<string, unknown> }) => Promise.resolve(liveShipment(u.$set)));

      const result = await service.startDelivery(groupId.toString(), actor, undefined, undefined, { carrierCode: 'GHN', serviceCode: 'LIGHT' });

      expect(result.carrier_booking_error).toContain('CARRIER_ADDRESS_CONFLICT');
      expect(eventTypes()).toEqual([ShipmentEventType.START_DELIVERY]);
    });

    it('vận đơn hãng đã HUỶ → tạo lại dùng đúng document, lần đặt 2, client_order_code có R2', async () => {
      shipmentModel.findOne.mockResolvedValue(liveShipment({ status: ShipmentStatus.CANCELLED, booking_round: 1 }));
      shipmentModel.findOneAndUpdate.mockImplementation((_f: unknown, u: { $set: Record<string, unknown> }) => Promise.resolve(liveShipment(u.$set)));
      shipmentModel.findById.mockResolvedValue(liveShipment({ status: ShipmentStatus.AWAITING_PICKUP }));

      await service.startDelivery(groupId.toString(), actor, undefined, undefined, { carrierCode: 'GHN', serviceCode: 'LIGHT' });

      expect(shipmentModel.create).not.toHaveBeenCalled();
      const [filter, update] = shipmentModel.findOneAndUpdate.mock.calls[0] as [Record<string, unknown>, { $set: { booking_round: number; carrier_parcels: { client_order_code: string }[] } }];
      expect(filter.status).toBe(ShipmentStatus.CANCELLED);
      expect(update.$set.booking_round).toBe(2);
      expect(update.$set.carrier_parcels[0]?.client_order_code).toBe('SHP-X-R2-1');
    });
  });

  it('nút G1 (giao thành công) bị chặn với vận đơn do hãng quản lý', async () => {
    shipmentModel.findById.mockResolvedValue(liveShipment({ status: ShipmentStatus.OUT_FOR_DELIVERY }));
    await expect(service.markDelivered(shipmentId.toString(), 0, actor)).rejects.toMatchObject({ errorCode: SHIPMENT_ERROR_CODES.MANAGED_BY_CARRIER });
  });

  describe('C5 — sự kiện của hãng', () => {
    const evt = (status: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
      OrderCode: 'GHN1', Type: 'switch_status', Status: status, Time: '2026-10-14T03:00:00.000Z', ...extra,
    });

    it('picked → in_transit, ghi CARRIER_STATUS kèm nguồn; nhóm đơn giữ shipped', async () => {
      shipmentModel.findOne.mockResolvedValue(liveShipment());
      shipmentModel.findOneAndUpdate.mockImplementation((_f: unknown, u: { $set: Record<string, unknown> }) => Promise.resolve(liveShipment(u.$set)));

      const result = await service.processCarrierEvent(evt('picked'), 'carrier_webhook', actor);

      expect(result).toBe('applied:awaiting_pickup->in_transit');
      const created = (eventModel.create.mock.calls[0] as [Record<string, unknown>[]])[0][0];
      expect(created).toMatchObject({ event_type: ShipmentEventType.CARRIER_STATUS, source: 'carrier_webhook', carrier_status: 'picked' });
      expect(orderGroupsService.transitionFulfillmentStatus).not.toHaveBeenCalled();
    });

    it('delivered → vận đơn delivered + nhóm đơn delivered', async () => {
      shipmentModel.findOne.mockResolvedValue(liveShipment({ status: ShipmentStatus.OUT_FOR_DELIVERY }));
      shipmentModel.findOneAndUpdate.mockImplementation((_f: unknown, u: { $set: Record<string, unknown> }) => Promise.resolve(liveShipment(u.$set)));

      await service.processCarrierEvent(evt('delivered'), 'carrier_simulated', actor);

      expect(orderGroupsService.transitionFulfillmentStatus).toHaveBeenCalledWith(groupId.toString(), GroupFulfillmentStatus.DELIVERED, 5, expect.anything());
    });

    it('2 kiện: 1 kiện giao xong, kiện kia đang trung chuyển → vận đơn CHƯA delivered', async () => {
      shipmentModel.findOne.mockResolvedValue(liveShipment({
        status: ShipmentStatus.IN_TRANSIT,
        carrier_parcels: [
          { parcel_no: 1, order_id: orderId, client_order_code: 'SHP-X-1', carrier_order_code: 'GHN1', carrier_status: 'transporting' },
          { parcel_no: 2, order_id: orderId, client_order_code: 'SHP-X-2', carrier_order_code: 'GHN2', carrier_status: 'transporting' },
        ],
      }));

      const result = await service.processCarrierEvent(evt('delivered'), 'carrier_webhook', actor);

      expect(result).toContain('recorded:in_transit');
      expect(shipmentModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(orderGroupsService.transitionFulfillmentStatus).not.toHaveBeenCalled();
    });

    it('sự kiện trùng (GHN gửi lại) → bỏ qua, không đọc vận đơn', async () => {
      webhookEventModel.create.mockRejectedValue({ code: 11000 });
      expect(await service.processCarrierEvent(evt('picked'), 'carrier_webhook', actor)).toBe('duplicate');
      expect(shipmentModel.findOne).not.toHaveBeenCalled();
    });

    it('xử lý lỗi tạm thời → xoá bản ghi chống trùng để GHN gửi lại được', async () => {
      shipmentModel.findOne.mockRejectedValue(new Error('db down'));
      await expect(service.processCarrierEvent(evt('picked'), 'carrier_webhook', actor)).rejects.toThrow('db down');
      expect(webhookEventModel.deleteOne).toHaveBeenCalled();
    });

    it('sự cố "lost" → gắn cờ, ghi CARRIER_INCIDENT, không đổi trạng thái', async () => {
      shipmentModel.findOne.mockResolvedValue(liveShipment({ status: ShipmentStatus.IN_TRANSIT }));
      const result = await service.processCarrierEvent(evt('lost', { Reason: 'Thất lạc tại kho' }), 'carrier_webhook', actor);
      expect(result).toBe('incident:lost');
      expect(eventTypes()).toEqual([ShipmentEventType.CARRIER_INCIDENT]);
      expect(shipmentModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('delivery_fail → delivery_failed, lý do GHN-DFC1A4 → customer_unreachable', async () => {
      shipmentModel.findOne.mockResolvedValue(liveShipment({ status: ShipmentStatus.OUT_FOR_DELIVERY }));
      shipmentModel.findOneAndUpdate.mockImplementation((_f: unknown, u: { $set: Record<string, unknown> }) => Promise.resolve(liveShipment(u.$set)));
      await service.processCarrierEvent(evt('delivery_fail', { ReasonCode: 'GHN-DFC1A4' }), 'carrier_webhook', actor);
      const set = (shipmentModel.findOneAndUpdate.mock.calls[0] as [unknown, { $set: Record<string, unknown> }])[1].$set;
      expect(set.status).toBe(ShipmentStatus.DELIVERY_FAILED);
      expect(set.last_failure_reason).toBe('customer_unreachable');
    });

    it('webhook sai khoá bí mật → 401, không xử lý', async () => {
      await expect(service.handleGhnWebhook(evt('picked'), 'wrong')).rejects.toMatchObject({ errorCode: SHIPMENT_ERROR_CODES.WEBHOOK_UNAUTHORIZED });
      expect(webhookEventModel.create).not.toHaveBeenCalled();
    });

    it('nút mô phỏng tắt (CARRIER_MANUAL_STATUS_ENABLED khác true) → 403', async () => {
      config['carrier.manualStatusEnabled'] = false;
      await expect(service.simulateCarrierStatus(shipmentId.toString(), 'picked', actor)).rejects.toMatchObject({ errorCode: SHIPMENT_ERROR_CODES.CARRIER_SIMULATION_DISABLED });
    });

    it('nút mô phỏng bật → dựng payload GHN cho từng kiện, đi qua cùng hàm xử lý', async () => {
      shipmentModel.findById.mockResolvedValue(liveShipment());
      shipmentModel.findOne.mockResolvedValue(liveShipment());
      shipmentModel.findOneAndUpdate.mockImplementation((_f: unknown, u: { $set: Record<string, unknown> }) => Promise.resolve(liveShipment(u.$set)));
      await service.simulateCarrierStatus(shipmentId.toString(), 'picked', actor);
      const rec = (webhookEventModel.create.mock.calls[0] as [Record<string, unknown>[]])[0][0];
      expect(rec).toMatchObject({ source: 'carrier_simulated', order_code: 'GHN1', status: 'picked' });
    });
  });

  describe('C4 — huỷ ở hãng', () => {
    it('chờ lấy hàng → hãng huỷ được → vận đơn cancelled, nhóm đơn shipped -> packed', async () => {
      shipmentModel.findById.mockResolvedValue(liveShipment());
      shipmentModel.findOneAndUpdate.mockImplementation((_f: unknown, u: { $set: Record<string, unknown> }) => Promise.resolve(liveShipment(u.$set)));

      const result = await service.cancelCarrier(shipmentId.toString(), actor, 'GHN-CO001');

      expect(adapter.cancelShipment).toHaveBeenCalledWith('GHN1', 'GHN-CO001');
      expect(result.status).toBe(ShipmentStatus.CANCELLED);
      expect(eventTypes()).toEqual([ShipmentEventType.CARRIER_CANCELLED]);
      expect(orderGroupsService.transitionFulfillmentStatus).toHaveBeenCalledWith(groupId.toString(), GroupFulfillmentStatus.PACKED, 5, expect.anything());
    });

    it('đã lấy hàng (in_transit) → không cho huỷ', async () => {
      shipmentModel.findById.mockResolvedValue(liveShipment({ status: ShipmentStatus.IN_TRANSIT }));
      await expect(service.cancelCarrier(shipmentId.toString(), actor)).rejects.toMatchObject({ errorCode: SHIPMENT_ERROR_CODES.CARRIER_CANCEL_NOT_ALLOWED });
      expect(adapter.cancelShipment).not.toHaveBeenCalled();
    });

    it('hãng từ chối huỷ → 409, vận đơn giữ nguyên', async () => {
      shipmentModel.findById.mockResolvedValue(liveShipment());
      adapter.cancelShipment.mockResolvedValue({ carrier_order_code: 'GHN1', cancelled: false, message: 'Đơn đã lấy' });
      await expect(service.cancelCarrier(shipmentId.toString(), actor)).rejects.toMatchObject({ errorCode: SHIPMENT_ERROR_CODES.CARRIER_CANCEL_REJECTED });
      expect(shipmentModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
