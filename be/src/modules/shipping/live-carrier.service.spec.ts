import { Types } from 'mongoose';
import { LiveCarrierService } from './live-carrier.service';
import { MockCarrierAdapter } from '../carriers/adapters/mock.adapter';
import { OrderStatus } from '../orders/enums/order-status.enum';

//!=============================================
// C4 (14/10/2026) — cầu nối shipping ↔ carriers. Kiểm: đơn bị che (Lazada) được bổ sung
// tỉnh/SĐT demo và báo rõ trong `assumptions`; đơn đủ địa chỉ (AURELLE) giữ nguyên;
// báo giá theo kiện cộng đúng phí hãng; kích thước kiện đổi mm → cm làm tròn lên.
//!=============================================
describe('LiveCarrierService', () => {
  const orderId = new Types.ObjectId();
  const config: Record<string, string | undefined> = {
    'carrier.defaultProvince': 'Hồ Chí Minh',
    'carrier.demoRecipientPhone': '0377168254',
  };
  const configService = { get: jest.fn((k: string) => config[k]) };

  const maskedOrder = {
    _id: orderId,
    platform_order_id: '532953751471670',
    recipient: {
      full_name: 'V**h', phone: '8**5', address_line1: 'S**e', city: 'Phường Long Bình',
      province_name: null, district_name: null, ward_name: null,
    },
    items: [{ sku: 'AO-1', name: 'Áo thun', quantity: 1, unit_price: 150000, status: OrderStatus.PENDING }],
  };
  const fullOrder = {
    _id: orderId,
    platform_order_id: 'AUR-1',
    recipient: {
      full_name: 'Nguyễn Văn A', phone: '0901234567', address_line1: '47/88 Nguyễn Văn Đậu', city: 'Hồ Chí Minh',
      province_name: 'Hồ Chí Minh', district_name: null, ward_name: 'Phường Gia Định',
    },
    items: [{ sku: 'AO-1', name: 'Áo thun', quantity: 2, unit_price: 150000, status: OrderStatus.PENDING }],
  };

  let orderModel: { findById: jest.Mock };
  let service: LiveCarrierService;

  beforeEach(() => {
    orderModel = { findById: jest.fn() };
    service = new LiveCarrierService(new MockCarrierAdapter(), orderModel as never, configService as never);
  });

  it('đơn Lazada bị che tỉnh + SĐT → dùng tỉnh mặc định + SĐT demo, phường lấy từ city, có ghi assumptions', () => {
    const { recipient, assumptions } = service.resolveRecipient(maskedOrder as never);
    expect(recipient.ward_name).toBe('Phường Long Bình');
    expect(recipient.province_name).toBe('Hồ Chí Minh');
    expect(recipient.phone).toBe('0377168254');
    expect(recipient.address).not.toContain('*'); // số nhà bị che bị bỏ
    expect(assumptions).toHaveLength(2);
  });

  it('đơn đủ địa chỉ (AURELLE) → giữ nguyên, không assumption', () => {
    const { recipient, assumptions } = service.resolveRecipient(fullOrder as never);
    expect(recipient.phone).toBe('0901234567');
    expect(recipient.ward_name).toBe('Phường Gia Định');
    expect(recipient.address).toContain('47/88 Nguyễn Văn Đậu');
    expect(assumptions).toEqual([]);
  });

  it('Coordinator nhập địa chỉ → ưu tiên hơn dữ liệu đơn và giá trị demo; street "" = bỏ số nhà', () => {
    const { recipient, assumptions } = service.resolveRecipient(fullOrder as never, {
      street: '', ward_name: 'Phường Bình Lợi Trung', province_name: 'Hồ Chí Minh', phone: '0911111111',
    });
    expect(recipient.ward_name).toBe('Phường Bình Lợi Trung');
    expect(recipient.address).not.toContain('47/88');
    expect(recipient.phone).toBe('0911111111');
    expect(assumptions).toEqual([]);
  });

  it('kiện → kích thước cm làm tròn lên, cân nguyên dương', () => {
    expect(service.toCarrierParcel({ orderId: null, cartonIndex: 0, actualG: 299.2, outer: { length_mm: 301, width_mm: 250, height_mm: 41 } }))
      .toEqual({ weight_g: 300, length_cm: 31, width_cm: 25, height_cm: 5 });
  });

  it('báo giá theo kiện: mỗi kiện 1 lần preview, tổng = tổng phí hãng, isLive=true', async () => {
    orderModel.findById.mockResolvedValue(fullOrder);
    const quote = await service.quoteParcels(
      { carrierCode: 'GHN', carrierName: 'GHN', volumetricDivisor: 5000, serviceCode: 'LIGHT', serviceName: 'Hàng nhẹ', serviceTypeId: 2 },
      [
        { orderId: orderId.toString(), cartonIndex: 0, parcelNo: 1, actualG: 300, outer: { length_mm: 300, width_mm: 250, height_mm: 40 } },
        { orderId: orderId.toString(), cartonIndex: 1, parcelNo: 2, actualG: 900, outer: { length_mm: 400, width_mm: 300, height_mm: 200 } },
      ],
    );
    expect(quote.isLive).toBe(true);
    expect(quote.parcels).toHaveLength(2);
    expect(quote.parcels[0]?.parcelNo).toBe(1);
    expect(quote.totalCostVnd).toBe(quote.parcels.reduce((s, p) => s + p.costVnd, 0));
    expect(quote.parcels[0]?.costVnd).toBe(20_900); // mock: ≤ 1 kg tính cước
    expect(orderModel.findById).toHaveBeenCalledTimes(1); // 2 kiện cùng đơn — đọc đơn 1 lần
  });

  it('tạo vận đơn: cùng client_order_code tạo lại → cùng mã hãng (chống trùng)', async () => {
    orderModel.findById.mockResolvedValue(fullOrder);
    const input = {
      clientOrderCode: 'SHP-261014-AAAAAA-1',
      parcel: { orderId: orderId.toString(), cartonIndex: 0, parcelNo: 1, actualG: 300, outer: { length_mm: 300, width_mm: 250, height_mm: 40 } },
      service: { carrierCode: 'GHN', carrierName: 'GHN', volumetricDivisor: 5000, serviceCode: 'LIGHT', serviceName: 'Hàng nhẹ', serviceTypeId: 2 },
    };
    const a = await service.bookParcel(input);
    const b = await service.bookParcel(input);
    expect(a.result.carrier_order_code).toBeTruthy();
    expect(b.result.carrier_order_code).toBe(a.result.carrier_order_code);
  });
});
