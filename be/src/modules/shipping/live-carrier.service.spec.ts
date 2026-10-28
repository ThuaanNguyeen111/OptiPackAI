import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { CARRIER_ERROR_CODES } from '../carriers/carriers.errors';
import { LiveCarrierService, QUOTE_CONCURRENCY } from './live-carrier.service';
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

  it('(14/10) báo giá nhiều kiện: hỏi hãng song song (≤ QUOTE_CONCURRENCY) nhưng giữ đúng thứ tự kiện', async () => {
    orderModel.findById.mockResolvedValue(fullOrder);
    let running = 0;
    let peak = 0;
    const slowAdapter = {
      code: 'GHN',
      previewShipment: jest.fn(async (input: { parcel: { weight_g: number } }) => {
        running += 1;
        peak = Math.max(peak, running);
        // kiện đầu chậm nhất — nếu gộp sai thứ tự, kết quả kiện 1 sẽ nằm sau
        await new Promise((r) => setTimeout(r, input.parcel.weight_g === 100 ? 30 : 2));
        running -= 1;
        return { fee: { total: input.parcel.weight_g * 10 }, expected_delivery_at: null };
      }),
    };
    const svc = new LiveCarrierService(slowAdapter as never, orderModel as never, configService as never);
    const parcels = [100, 200, 300, 400, 500, 600].map((g, i) => ({
      orderId: orderId.toString(), cartonIndex: i, parcelNo: i + 1, actualG: g, outer: { length_mm: 100, width_mm: 100, height_mm: 100 },
    }));
    const quote = await svc.quoteParcels(
      { carrierCode: 'GHN', carrierName: 'GHN', volumetricDivisor: 5000, serviceCode: 'LIGHT', serviceName: 'Hàng nhẹ', serviceTypeId: 2 },
      parcels,
    );
    expect(quote.parcels.map((p) => p.parcelNo)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(quote.parcels.map((p) => p.costVnd)).toEqual([1000, 2000, 3000, 4000, 5000, 6000]);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(QUOTE_CONCURRENCY);
    expect(orderModel.findById).toHaveBeenCalledTimes(1);
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

  //!=============================================
  // 28/10/2026 — địa chỉ mô phỏng cho đơn bị che (CARRIER_DEMO_RECIPIENT_ENABLED). Tính lại từ
  // dữ liệu (DemoRecipientService, KHÔNG ghi DB); GHN báo lệch phường với số nhà MÔ PHỎNG →
  // tự gửi lại chỉ phường + tỉnh; địa chỉ thật thì báo lỗi như cũ.
  //!=============================================
  describe('địa chỉ mô phỏng (demo)', () => {
    const service = { carrierCode: 'GHN', carrierName: 'GHN', volumetricDivisor: 5000, serviceCode: 'LIGHT', serviceName: 'Hàng nhẹ', serviceTypeId: 2 };
    const parcel = { orderId: orderId.toString(), cartonIndex: 0, parcelNo: 1, actualG: 300, outer: { length_mm: 300, width_mm: 250, height_mm: 40 } };
    const demo = { seq: 10, street: '47/10 Nguyễn Văn Đậu', ward_name: 'Phường Gia Định', province_name: 'Hồ Chí Minh', phone: '0377168254' };
    const conflict = (): AppException =>
      new AppException(CARRIER_ERROR_CODES.ADDRESS_CONFLICT, 'To address conflict', HttpStatus.UNPROCESSABLE_ENTITY);

    let demoRecipients: { resolve: jest.Mock };
    let svc: LiveCarrierService;

    beforeEach(() => {
      demoRecipients = { resolve: jest.fn((o: { recipient: { phone: string } }) => Promise.resolve(o.recipient.phone.includes('*') ? demo : null)) };
      svc = new LiveCarrierService(new MockCarrierAdapter(), orderModel as never, configService as never, demoRecipients as never);
    });

    it('dựng địa chỉ gửi hãng từ bản mô phỏng: giữ tên của sàn, Coordinator nhập vẫn ưu tiên', () => {
      const a = svc.resolveRecipient(maskedOrder as never, null, demo);
      expect(a.recipient).toMatchObject({ name: 'V**h', phone: '0377168254', ward_name: 'Phường Gia Định', province_name: 'Hồ Chí Minh' });
      expect(a.recipient.address).toBe('47/10 Nguyễn Văn Đậu, Phường Gia Định, Hồ Chí Minh');
      expect(a.isDemo).toBe(true);
      expect(a.demoStreetUsed).toBe(true);
      expect(a.assumptions[0]).toContain('mô phỏng #10');
      const b = svc.resolveRecipient(maskedOrder as never, { street: '', phone: '0911111111' }, demo);
      expect(b.recipient.address).toBe('Phường Gia Định, Hồ Chí Minh');
      expect(b.recipient.phone).toBe('0911111111');
      expect(b.demoStreetUsed).toBe(false);
    });

    it('đơn bị che → báo giá dùng địa chỉ mô phỏng; đơn AURELLE giữ địa chỉ thật', async () => {
      orderModel.findById.mockResolvedValue(maskedOrder);
      const q = await svc.quoteParcels(service, [parcel]);
      expect(q.assumptions?.some((x) => x.includes('mô phỏng #10'))).toBe(true);
      orderModel.findById.mockResolvedValue(fullOrder);
      const q2 = await svc.quoteParcels(service, [parcel]);
      expect(q2.assumptions).toEqual([]);
    });

    it('GHN báo lệch phường với số nhà mô phỏng → tự gửi lại chỉ phường + tỉnh, ghi assumption', async () => {
      const adapter = {
        code: 'GHN',
        previewShipment: jest.fn((input: { recipient: { address: string } }) =>
          input.recipient.address.startsWith('47/')
            ? Promise.reject(conflict())
            : Promise.resolve({ fee: { total: 20_900 }, expected_delivery_at: null }),
        ),
      };
      orderModel.findById.mockResolvedValue(maskedOrder);
      const s2 = new LiveCarrierService(adapter as never, orderModel as never, configService as never, demoRecipients as never);
      const quote = await s2.quoteParcels(service, [parcel]);
      expect(quote.totalCostVnd).toBe(20_900);
      expect(adapter.previewShipment).toHaveBeenCalledTimes(2);
      expect(quote.assumptions?.some((x) => x.includes('chỉ phường + tỉnh'))).toBe(true);
    });

    it('địa chỉ THẬT bị GHN báo lệch → không tự bỏ số nhà, báo lỗi như cũ', async () => {
      const adapter = { code: 'GHN', previewShipment: jest.fn(() => Promise.reject(conflict())) };
      orderModel.findById.mockResolvedValue(fullOrder);
      const s2 = new LiveCarrierService(adapter as never, orderModel as never, configService as never, demoRecipients as never);
      await expect(s2.quoteParcels(service, [parcel])).rejects.toMatchObject({ errorCode: CARRIER_ERROR_CODES.ADDRESS_CONFLICT });
      expect(adapter.previewShipment).toHaveBeenCalledTimes(1);
    });

    it('xem trước địa chỉ: đơn mô phỏng isDemo=true; đơn thiếu phường (không demo) trả errorCode thay vì lỗi cả nhóm', async () => {
      const [demoRow] = await svc.previewRecipients([maskedOrder as never]);
      expect(demoRow).toMatchObject({ isDemo: true, demoSeq: 10, street: '47/10 Nguyễn Văn Đậu', phone: '0377168254', errorCode: null });
      const off = new LiveCarrierService(new MockCarrierAdapter(), orderModel as never, { get: jest.fn(() => undefined) } as never);
      const [row] = await off.previewRecipients([{ ...maskedOrder, recipient: { ...maskedOrder.recipient, city: 'S**e' } } as never]);
      expect(row?.errorCode).toBe(CARRIER_ERROR_CODES.ADDRESS_INCOMPLETE);
      expect(row?.isDemo).toBe(false);
    });
  });
});
