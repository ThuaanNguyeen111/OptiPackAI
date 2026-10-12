import {
  computeConsolidationKey,
  computeRecipientKey,
} from '../orders/utils/consolidation-key.util';
import {
  toOpenApiOrder,
  type StorefrontOrderLike,
} from './aurelle-open-api.mapper';

//!=============================================
// 13/10/2026 — BẢNG TRƯỜNG HỢP GOM ĐƠN cho đơn AURELLE (dữ liệu thật, không bị che).
// Đi đúng đường dữ liệu thật: đơn storefront → toOpenApiOrder (khuôn Lazada) →
// OptiPack tính consolidation_key (gom chung nhóm, CÓ sàn, KHÔNG có tên) và
// recipient_key (liên kết khác nhóm/khác sàn, CÓ tên, KHÔNG có sàn) từ
// address1 + city như mapLazadaOrder.
//!=============================================
type Address = StorefrontOrderLike['shipping_address_snapshot'];
const base: Address = {
  recipient_name: 'Nguyễn Thị Lan',
  phone: '0901234567',
  province: 'Thành phố Hồ Chí Minh',
  ward: 'Phường Bình Lợi Trung',
  address_line: '47/88 Nguyễn Văn Đậu',
};

function keys(
  address: Partial<Address>,
  platform = 'aurelle',
): { consolidation: string; recipient: string } {
  const raw = toOpenApiOrder(
    {
      public_order_id: 710000001,
      order_number: 'AUR-1',
      status: 'confirmed',
      payment_status: 'unpaid',
      fulfillment_status: 'awaiting_packaging',
      total_amount: 100000,
      shipping_address_snapshot: { ...base, ...address },
    },
    1,
  );
  const a = raw.address_shipping;
  return {
    consolidation: computeConsolidationKey(
      platform,
      a.phone,
      a.address1,
      a.city,
    ),
    recipient: computeRecipientKey(a.first_name, a.phone, a.address1, a.city),
  };
}

describe('Gom đơn AURELLE — bảng trường hợp (13/10/2026)', () => {
  const ref = keys({});

  it('#1 cùng tên + SĐT + địa chỉ → cùng mã gom và cùng mã người nhận', () => {
    expect(keys({})).toEqual(ref);
  });

  it('#3 cùng SĐT + địa chỉ, KHÁC tên (người nhà đặt hộ) → vẫn gom chung nhóm, nhưng KHÔNG liên kết', () => {
    const k = keys({ recipient_name: 'Trần Văn Minh' });
    expect(k.consolidation).toBe(ref.consolidation);
    expect(k.recipient).not.toBe(ref.recipient);
  });

  it('#5 cùng tên + SĐT, KHÁC địa chỉ → không gom, không liên kết', () => {
    const k = keys({ address_line: '12 Phan Đăng Lưu' });
    expect(k.consolidation).not.toBe(ref.consolidation);
    expect(k.recipient).not.toBe(ref.recipient);
  });

  it('#5b cùng số nhà nhưng KHÁC phường → không gom', () => {
    expect(keys({ ward: 'Phường Gia Định' }).consolidation).not.toBe(
      ref.consolidation,
    );
  });

  it('#6 cùng tên + địa chỉ, KHÁC SĐT → không gom, không liên kết', () => {
    const k = keys({ phone: '0912345678' });
    expect(k.consolidation).not.toBe(ref.consolidation);
    expect(k.recipient).not.toBe(ref.recipient);
  });

  it('#8 KHÁC sàn, cùng mọi thông tin → không gom chung nhóm nhưng CÓ liên kết (giao chung chuyến)', () => {
    const k = keys({}, 'lazada');
    expect(k.consolidation).not.toBe(ref.consolidation);
    expect(k.recipient).toBe(ref.recipient);
  });

  it('#9 viết khác ("Đường" bị bỏ, "/" thành "-") → KHÔNG gom (cố ý: thà bỏ sót còn hơn gộp nhầm)', () => {
    expect(
      keys({ address_line: '47-88 Nguyễn Văn Đậu' }).consolidation,
    ).not.toBe(ref.consolidation);
  });

  it('#10 khác dấu / hoa-thường / khoảng trắng → coi như giống nhau', () => {
    const k = keys({
      recipient_name: 'nguyen thi  LAN',
      address_line: '47/88  nguyen van dau',
    });
    expect(k.consolidation).toBe(ref.consolidation);
    expect(k.recipient).toBe(ref.recipient);
  });

  it('#10b SĐT +84 / 84 / có dấu cách → coi như cùng số', () => {
    expect(keys({ phone: '+84 901 234 567' })).toEqual(ref);
    expect(keys({ phone: '84901234567' })).toEqual(ref);
  });

  it('#15 cùng khách nhưng 1 đơn chọn địa chỉ TRƯỚC sáp nhập (tên tỉnh/phường cũ) → không gom (giới hạn đã biết)', () => {
    const k = keys({
      province: 'Thành phố Hồ Chí Minh',
      district: 'Quận Bình Thạnh',
      ward: 'Phường 6',
    });
    expect(k.consolidation).not.toBe(ref.consolidation);
  });
});
