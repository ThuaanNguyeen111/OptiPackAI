import { Types } from 'mongoose';
import { DocumentsService } from './documents.service';
import * as renderers from './pdf/document-renderers';

//!=============================================
// G3 (28/10/2026) — nhãn vận chuyển của nhóm gộp: mỗi kiện in người nhận của CHÍNH đơn đó
// (nhóm gộp theo SĐT + địa chỉ, có thể khác tên), không lấy đơn đầu tiên cho cả nhóm.
//!=============================================
describe('DocumentsService.buildShippingLabels — người nhận theo từng kiện', () => {
  const groupId = new Types.ObjectId();
  const orderA = { _id: new Types.ObjectId(), platform_order_id: 'A-1', recipient: { full_name: 'Lan', phone: '0901000001', address_line1: '12 Lê Lợi', ward: null, district: null, city: 'Hồ Chí Minh' } };
  const orderB = { _id: new Types.ObjectId(), platform_order_id: 'B-1', recipient: { full_name: 'Hùng', phone: '0901000001', address_line1: '12 Lê Lợi', ward: null, district: null, city: 'Hồ Chí Minh' } };

  it('đơn A in "Lan", đơn B in "Hùng"', async () => {
    const render = jest.spyOn(renderers, 'renderShippingLabels').mockResolvedValue(Buffer.from('pdf'));
    const service = new DocumentsService(
      { find: jest.fn(() => ({ sort: jest.fn().mockResolvedValue([orderA, orderB]) })) } as never,
      {} as never,
      { findOne: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), shipment_code: 'SHP-1', carrier_parcels: [], carrier_name: 'GHN', service_name: '', trip_code: null, eta_to: null, tracking_code: null }) } as never,
      { findOne: jest.fn(() => ({ lean: jest.fn().mockResolvedValue({ sender_name: 'Kho', sender_address: 'Q1' }) })) } as never,
      {} as never, {} as never, {} as never, {} as never,
      { findOrderGroupById: jest.fn().mockResolvedValue({ _id: groupId, shop_name_snapshot: 'AURELLE' }) } as never,
      {} as never,
    );
    const parcel = (orderId: string, parcelNo: number): Record<string, unknown> => ({ orderId, parcelNo, boxCode: 'B1', actualWeightKg: null, estimatedWeightG: 500 });
    jest.spyOn(service as unknown as { parcelsByOrder: () => Promise<unknown> }, 'parcelsByOrder').mockResolvedValue(new Map([
      [orderA._id.toString(), [parcel(orderA._id.toString(), 1)]],
      [orderB._id.toString(), [parcel(orderB._id.toString(), 2)]],
    ]));

    await service.buildShippingLabels(groupId.toString());

    const data = render.mock.calls[0]?.[0];
    expect(data?.parcels.map((p) => p.recipient?.fullName)).toEqual(['Lan', 'Hùng']);
    render.mockRestore();
  });
});
