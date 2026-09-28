import { Types } from 'mongoose';
import { ShipmentsService } from './shipments.service';
import { ShipmentStatus } from './enums/shipment-status.enum';
import { ShipmentEventType } from './enums/shipment-event-type.enum';
import { DeliveryFailureReason } from './enums/delivery-failure-reason.enum';
import { SHIPMENT_ERROR_CODES } from './shipments.errors';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';

//!=============================================
// G1 (27/09/2026) — giao hàng bản gọn. Kiểm đúng các quy tắc nghiệp vụ:
// chỉ bắt đầu giao khi đã đóng gói; 2 lần thất bại / khách từ chối -> tự hoàn;
// "lý do khác" bắt ghi chú; xung đột version không đụng tới nhóm đơn; mọi
// bước đều ghi lịch sử.
//!=============================================
describe('ShipmentsService — G1', () => {
  const groupId = new Types.ObjectId();
  const shipmentId = new Types.ObjectId();
  const actor = { userId: 'coord-1', role: 3 };

  let shipmentModel: { findById: jest.Mock; findOneAndUpdate: jest.Mock; create: jest.Mock; exists: jest.Mock };
  let eventModel: { create: jest.Mock };
  let orderGroupsService: { findOrderGroupById: jest.Mock; transitionFulfillmentStatus: jest.Mock };
  let returnsService: { createFromFailedDelivery: jest.Mock };
  let service: ShipmentsService;

  const shipment = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    _id: shipmentId, order_group_id: groupId, shipment_code: 'SHP-X', status: ShipmentStatus.OUT_FOR_DELIVERY,
    attempt_count: 1, max_attempts: 2, __v: 0, ...over,
  });

  beforeEach(() => {
    shipmentModel = { findById: jest.fn(), findOneAndUpdate: jest.fn(), create: jest.fn(), exists: jest.fn().mockResolvedValue(null) };
    eventModel = { create: jest.fn().mockResolvedValue([{}]) };
    orderGroupsService = {
      findOrderGroupById: jest.fn().mockResolvedValue({ _id: groupId, fulfillment_status: GroupFulfillmentStatus.SHIPPED, __v: 5 }),
      transitionFulfillmentStatus: jest.fn().mockResolvedValue({}),
    };
    const session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    returnsService = { createFromFailedDelivery: jest.fn().mockResolvedValue(undefined) };
    service = new ShipmentsService(shipmentModel as never, eventModel as never, orderGroupsService as never, { startSession: jest.fn().mockResolvedValue(session) } as never, returnsService as never, { notify: jest.fn().mockResolvedValue({}) } as never);
  });

  const eventTypes = (): string[] => eventModel.create.mock.calls.map((c) => (c as [[{ event_type: string }]])[0][0].event_type);

  describe('startDelivery', () => {
    it('nhóm đơn packed -> tạo vận đơn out_for_delivery, ghi START_DELIVERY, nhóm đơn -> shipped với đúng version', async () => {
      orderGroupsService.findOrderGroupById.mockResolvedValue({ _id: groupId, fulfillment_status: GroupFulfillmentStatus.PACKED, __v: 3 });
      shipmentModel.create.mockResolvedValue([shipment()]);

      await service.startDelivery(groupId.toString(), actor);

      expect(eventTypes()).toEqual([ShipmentEventType.START_DELIVERY]);
      expect(orderGroupsService.transitionFulfillmentStatus).toHaveBeenCalledWith(groupId.toString(), GroupFulfillmentStatus.SHIPPED, 3, expect.anything());
    });

    it('nhóm đơn chưa đóng gói (picking) -> 409 SHP_GROUP_NOT_READY, không tạo gì', async () => {
      orderGroupsService.findOrderGroupById.mockResolvedValue({ _id: groupId, fulfillment_status: GroupFulfillmentStatus.PICKING, __v: 1 });

      await expect(service.startDelivery(groupId.toString(), actor)).rejects.toMatchObject({ errorCode: SHIPMENT_ERROR_CODES.GROUP_NOT_READY });
      expect(shipmentModel.create).not.toHaveBeenCalled();
    });

    it('nhóm đơn đã "shipped" từ trước G1 (chưa có vận đơn) -> tạo bù LEGACY_BACKFILL, KHÔNG đổi trạng thái nhóm đơn', async () => {
      shipmentModel.create.mockResolvedValue([shipment()]);

      await service.startDelivery(groupId.toString(), actor);

      expect(eventTypes()).toEqual([ShipmentEventType.LEGACY_BACKFILL]);
      expect(orderGroupsService.transitionFulfillmentStatus).not.toHaveBeenCalled();
    });

    it('nhóm đơn đã có vận đơn -> 409 SHP_ALREADY_EXISTS', async () => {
      shipmentModel.exists.mockResolvedValue({ _id: shipmentId });
      await expect(service.startDelivery(groupId.toString(), actor)).rejects.toMatchObject({ errorCode: SHIPMENT_ERROR_CODES.ALREADY_EXISTS });
    });
  });

  describe('markFailed — hệ thống tự quyết bước tiếp', () => {
    it('lần 1, không liên lạc được -> delivery_failed, 1 sự kiện, nhóm đơn không đổi', async () => {
      shipmentModel.findById.mockResolvedValue(shipment());
      shipmentModel.findOneAndUpdate.mockResolvedValue(shipment({ status: ShipmentStatus.DELIVERY_FAILED }));

      await service.markFailed(shipmentId.toString(), 0, DeliveryFailureReason.CUSTOMER_UNREACHABLE, actor);

      const update = shipmentModel.findOneAndUpdate.mock.calls[0] as [unknown, { $set: { status: string } }];
      expect(update[1].$set.status).toBe(ShipmentStatus.DELIVERY_FAILED);
      expect(eventTypes()).toEqual([ShipmentEventType.DELIVERY_FAILED]);
      expect(orderGroupsService.transitionFulfillmentStatus).not.toHaveBeenCalled();
    });

    it('lần 2 thất bại -> TỰ chuyển returning_to_warehouse, ghi 2 sự kiện (thất bại + hệ thống tự hoàn)', async () => {
      shipmentModel.findById.mockResolvedValue(shipment({ attempt_count: 2 }));
      shipmentModel.findOneAndUpdate.mockResolvedValue(shipment({ attempt_count: 2, status: ShipmentStatus.RETURNING_TO_WAREHOUSE }));

      await service.markFailed(shipmentId.toString(), 0, DeliveryFailureReason.WRONG_ADDRESS, actor);

      const update = shipmentModel.findOneAndUpdate.mock.calls[0] as [unknown, { $set: { status: string } }];
      expect(update[1].$set.status).toBe(ShipmentStatus.RETURNING_TO_WAREHOUSE);
      expect(eventTypes()).toEqual([ShipmentEventType.DELIVERY_FAILED, ShipmentEventType.AUTO_RETURN]);
    });

    it('khách từ chối nhận ngay lần 1 -> hoàn về luôn, không giao lại', async () => {
      shipmentModel.findById.mockResolvedValue(shipment());
      shipmentModel.findOneAndUpdate.mockResolvedValue(shipment({ status: ShipmentStatus.RETURNING_TO_WAREHOUSE }));

      await service.markFailed(shipmentId.toString(), 0, DeliveryFailureReason.CUSTOMER_REFUSED, actor);

      expect(eventTypes()).toEqual([ShipmentEventType.DELIVERY_FAILED, ShipmentEventType.AUTO_RETURN]);
    });

    it('"lý do khác" không ghi chú -> 400 SHP_NOTE_REQUIRED', async () => {
      await expect(service.markFailed(shipmentId.toString(), 0, DeliveryFailureReason.OTHER, actor, '  ')).rejects.toMatchObject({
        errorCode: SHIPMENT_ERROR_CODES.NOTE_REQUIRED,
      });
    });
  });

  it('markDelivered sai version -> 409 SHP_STATE_CONFLICT, KHÔNG đụng tới nhóm đơn, không ghi lịch sử', async () => {
    shipmentModel.findById.mockResolvedValue(shipment());
    shipmentModel.findOneAndUpdate.mockResolvedValue(null);

    await expect(service.markDelivered(shipmentId.toString(), 7, actor)).rejects.toMatchObject({ errorCode: SHIPMENT_ERROR_CODES.STATE_CONFLICT });
    expect(eventModel.create).not.toHaveBeenCalled();
    expect(orderGroupsService.transitionFulfillmentStatus).not.toHaveBeenCalled();
  });

  it('markDelivered -> nhóm đơn -> delivered trong cùng transaction', async () => {
    shipmentModel.findById.mockResolvedValue(shipment());
    shipmentModel.findOneAndUpdate.mockResolvedValue(shipment({ status: ShipmentStatus.DELIVERED }));

    await service.markDelivered(shipmentId.toString(), 0, actor);

    expect(orderGroupsService.transitionFulfillmentStatus).toHaveBeenCalledWith(groupId.toString(), GroupFulfillmentStatus.DELIVERED, 5, expect.anything());
  });

  it('receiveReturn -> nhóm đơn -> returned', async () => {
    shipmentModel.findById.mockResolvedValue(shipment({ status: ShipmentStatus.RETURNING_TO_WAREHOUSE }));
    shipmentModel.findOneAndUpdate.mockResolvedValue(shipment({ status: ShipmentStatus.RETURNED_TO_WAREHOUSE }));

    await service.receiveReturn(shipmentId.toString(), 0, actor);

    expect(orderGroupsService.transitionFulfillmentStatus).toHaveBeenCalledWith(groupId.toString(), GroupFulfillmentStatus.RETURNED, 5, expect.anything());
    // G3 — tự tạo phiếu hoàn trong CÙNG transaction
    expect(returnsService.createFromFailedDelivery).toHaveBeenCalledWith(groupId.toString(), shipmentId.toString(), 'coord-1', expect.anything());
  });

  it('bấm "Giao lại" khi đang đi giao (chưa thất bại) -> 409 SHP_INVALID_TRANSITION', async () => {
    shipmentModel.findById.mockResolvedValue(shipment());
    await expect(service.retryDelivery(shipmentId.toString(), 0, actor)).rejects.toMatchObject({ errorCode: SHIPMENT_ERROR_CODES.INVALID_TRANSITION });
    expect(shipmentModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('bấm "Nhận hàng hoàn" khi vận đơn chưa ở trạng thái hoàn về -> 409 SHP_INVALID_TRANSITION', async () => {
    shipmentModel.findById.mockResolvedValue(shipment({ status: ShipmentStatus.DELIVERY_FAILED }));
    await expect(service.receiveReturn(shipmentId.toString(), 0, actor)).rejects.toMatchObject({ errorCode: SHIPMENT_ERROR_CODES.INVALID_TRANSITION });
  });
});
