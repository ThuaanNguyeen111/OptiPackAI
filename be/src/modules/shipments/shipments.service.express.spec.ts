import { Types } from 'mongoose';
import { ShipmentsService } from './shipments.service';
import { ShipmentStatus } from './enums/shipment-status.enum';
import { SHIPMENT_ERROR_CODES } from './shipments.errors';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';

//!=============================================
// 29/10/2026 — nhóm hỏa tốc AURELLE: shop tự giao, bắt buộc chọn shipper (Shipping
// Coordinator đang làm), không đi hãng / chuyến chung; chỉ shipper đó (hoặc Admin) bấm mốc giao.
//!=============================================
describe('ShipmentsService — hỏa tốc tự giao', () => {
  const groupId = new Types.ObjectId();
  const shipperId = new Types.ObjectId();
  const actor = { userId: 'coord-2', role: UserRole.SHIPPING_COORDINATOR };
  const expressGroup = { _id: groupId, requires_self_delivery: true, fulfillment_status: GroupFulfillmentStatus.PACKED, __v: 3 };

  function build(user: Record<string, unknown> | null, group: Record<string, unknown> = expressGroup) {
    const lean = (v: unknown) => ({ select: () => ({ lean: () => Promise.resolve(v) }) });
    const userModel = {
      findById: jest.fn(() => lean(user)),
      find: jest.fn(() => ({ select: () => ({ sort: () => ({ lean: () => Promise.resolve(user ? [user] : []) }) }) })),
    };
    const shipmentModel = { findById: jest.fn() };
    const orderGroupsService = { findOrderGroupById: jest.fn().mockResolvedValue(group) };
    const service = new ShipmentsService(
      shipmentModel as never, {} as never, orderGroupsService as never, {} as never, {} as never, {} as never,
      { countParcelsToUnpack: jest.fn().mockResolvedValue(0) } as never,
      undefined, undefined, undefined, undefined, userModel as never,
    );
    return { service, shipmentModel, userModel };
  }

  const codeOf = async (p: Promise<unknown>): Promise<string | undefined> =>
    p.then(() => undefined, (e: unknown) => (e as { getResponse?: () => { error_code?: string } }).getResponse?.().error_code);

  it('chọn hãng cho nhóm hỏa tốc → EXPRESS_SELF_DELIVERY_REQUIRED', async () => {
    const { service } = build(null);
    const carrier = { carrierCode: 'GHN', serviceCode: 'LIGHT' };
    expect(await codeOf(service.startDelivery(String(groupId), actor, undefined, 3, carrier as never, String(shipperId))))
      .toBe(SHIPMENT_ERROR_CODES.EXPRESS_SELF_DELIVERY_REQUIRED);
  });

  it('thiếu shipper → SHIPPER_REQUIRED', async () => {
    const { service } = build(null);
    expect(await codeOf(service.startDelivery(String(groupId), actor, undefined, 3))).toBe(SHIPMENT_ERROR_CODES.SHIPPER_REQUIRED);
  });

  it('shipper không phải Shipping Coordinator / đang nghỉ phép → SHIPPER_INVALID', async () => {
    const packer = { _id: shipperId, name: 'An', role: UserRole.PACKAGING_STAFF, is_active: true };
    expect(await codeOf(build(packer).service.startDelivery(String(groupId), actor, undefined, 3, undefined, String(shipperId))))
      .toBe(SHIPMENT_ERROR_CODES.SHIPPER_INVALID);
    const onLeave = { _id: shipperId, name: 'Bình', role: UserRole.SHIPPING_COORDINATOR, is_active: true, on_leave: true, on_leave_until: null };
    expect(await codeOf(build(onLeave).service.startDelivery(String(groupId), actor, undefined, 3, undefined, String(shipperId))))
      .toBe(SHIPMENT_ERROR_CODES.SHIPPER_INVALID);
  });

  it('gộp nhóm hỏa tốc vào chuyến chung → EXPRESS_SELF_DELIVERY_REQUIRED', async () => {
    const { service } = build(null);
    expect(await codeOf(service.createBatch([String(groupId)], { carrierCode: 'GHN', serviceCode: 'LIGHT' }, undefined, actor)))
      .toBe(SHIPMENT_ERROR_CODES.EXPRESS_SELF_DELIVERY_REQUIRED);
  });

  it('người khác bấm "đã giao" vận đơn đã giao cho shipper → NOT_ASSIGNED_SHIPPER; Admin thì qua bước kiểm', async () => {
    const { service, shipmentModel } = build(null);
    const shipment = {
      _id: new Types.ObjectId(), shipment_code: 'SHP-H1', status: ShipmentStatus.OUT_FOR_DELIVERY,
      carrier_kind: 'manual', shipper_id: shipperId, shipper_name: 'Cường',
    };
    shipmentModel.findById.mockResolvedValue(shipment);
    expect(await codeOf(service.markDelivered(String(shipment._id), 0, actor))).toBe(SHIPMENT_ERROR_CODES.NOT_ASSIGNED_SHIPPER);
    expect(await codeOf(service.markFailed(String(shipment._id), 0, 'customer_unreachable' as never, actor))).toBe(SHIPMENT_ERROR_CODES.NOT_ASSIGNED_SHIPPER);
    const adminCode = await codeOf(service.markDelivered(String(shipment._id), 0, { userId: 'admin', role: UserRole.ADMIN }));
    expect(adminCode).not.toBe(SHIPMENT_ERROR_CODES.NOT_ASSIGNED_SHIPPER);
  });

  it('danh sách shipper: Shipping Coordinator đang làm, SĐT rỗng → null', async () => {
    const { service, userModel } = build({ _id: shipperId, name: 'Cường', phone: ' ', email: 'c@x.vn' });
    expect(await service.listShippers()).toEqual([{ id: String(shipperId), name: 'Cường', phone: null, email: 'c@x.vn' }]);
    const filter = (userModel.find.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(filter).toMatchObject({ role: UserRole.SHIPPING_COORDINATOR, is_active: true });
  });
});
