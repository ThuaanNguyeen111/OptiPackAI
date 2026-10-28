import {
  computeConsolidationKey,
  computeConsolidationKeyFor,
  computeRecipientKey,
  isUnusablePhone,
  normalizePhoneNumber,
} from './consolidation-key.util';

describe('computeRecipientKey (29/09/2026, Mục 9.5 AURELLE_MARKETPLACE_DESIGN.md)', () => {
  it('cùng 1 bộ (tên, SĐT, địa chỉ, tỉnh) đã chuẩn hóa LUÔN cho ra cùng 1 key', () => {
    const key1 = computeRecipientKey(
      'Nguyễn Văn A',
      '0901234567',
      '12 Đường 3/2',
      'TP. Hồ Chí Minh',
    );
    const key2 = computeRecipientKey(
      'Nguyễn Văn A',
      '0901234567',
      '12 Đường 3/2',
      'TP. Hồ Chí Minh',
    );
    expect(key1).toBe(key2);
  });

  it('KHÁC hẳn consolidation_key cho CÙNG 1 đơn — vì consolidation_key kèm platform còn recipient_key thì KHÔNG', () => {
    const recipientKey = computeRecipientKey(
      'Trần Thị B',
      '0912345678',
      '45 Lê Lợi',
      'Đà Nẵng',
    );
    const consolidationKeyLazada = computeConsolidationKey(
      'lazada',
      '0912345678',
      '45 Lê Lợi',
      'Đà Nẵng',
    );
    expect(recipientKey).not.toBe(consolidationKeyLazada);
  });

  it('2 đơn cùng 1 khách hàng THẬT nhưng KHÁC SÀN (lazada vs aurelle) ra CÙNG 1 recipient_key — đúng mục đích liên kết', () => {
    const keyFromLazadaOrder = computeRecipientKey(
      'Lê Văn C',
      '0987654321',
      '78 Nguyễn Huệ',
      'Cần Thơ',
    );
    const keyFromAurelleOrder = computeRecipientKey(
      'Lê Văn C',
      '0987654321',
      '78 Nguyễn Huệ',
      'Cần Thơ',
    );
    expect(keyFromLazadaOrder).toBe(keyFromAurelleOrder);
  });

  it('chuẩn hóa tên/địa chỉ giống hệt consolidation_key — chữ HOA/thường và khoảng trắng thừa không tạo ra key khác nhau', () => {
    // (13/10/2026: "Đ"/"đ" nay cũng được gập về "d" — xem test riêng bên dưới.)
    const key1 = computeRecipientKey(
      'Nguyễn Văn A',
      '0901234567',
      '12   Đường 3/2',
      'Tp. Hồ Chí Minh',
    );
    const key2 = computeRecipientKey(
      'NGUYỄN VĂN A',
      '0901234567',
      '12 Đường 3/2',
      'tp. hồ chí minh',
    );
    expect(key1).toBe(key2);
  });

  it('SĐT khác dạng đầu số (+84/84/0) nhưng cùng số thật -> cùng recipient_key (tái dùng normalizePhoneNumber)', () => {
    const keyWithZero = computeRecipientKey(
      'A',
      '0901234567',
      'Địa chỉ',
      'Tỉnh',
    );
    const keyWithCountryCode = computeRecipientKey(
      'A',
      '+84901234567',
      'Địa chỉ',
      'Tỉnh',
    );
    expect(keyWithZero).toBe(keyWithCountryCode);
    expect(normalizePhoneNumber('+84901234567')).toBe('0901234567');
  });

  it('khác tên (dù cùng SĐT/địa chỉ/tỉnh) -> KHÁC recipient_key — an toàn, không liên kết nhầm', () => {
    const key1 = computeRecipientKey(
      'Nguyễn Văn A',
      '0901234567',
      '12 Đường 3/2',
      'TP.HCM',
    );
    const key2 = computeRecipientKey(
      'Nguyễn Văn B',
      '0901234567',
      '12 Đường 3/2',
      'TP.HCM',
    );
    expect(key1).not.toBe(key2);
  });

  it('13/10/2026 — "Đ/đ" gập về "d": gõ có dấu hay không dấu đều ra cùng key', () => {
    expect(
      computeRecipientKey(
        'Đỗ Văn Đạt',
        '0901234567',
        '47/88 Nguyễn Văn Đậu',
        'Đà Nẵng',
      ),
    ).toBe(
      computeRecipientKey(
        'Do Van Dat',
        '0901234567',
        '47/88 Nguyen Van Dau',
        'Da Nang',
      ),
    );
    expect(
      computeConsolidationKey(
        'aurelle',
        '0901234567',
        '12 Đường 3/2',
        'Đà Nẵng',
      ),
    ).toBe(
      computeConsolidationKey(
        'aurelle',
        '0901234567',
        '12 duong 3/2',
        'da nang',
      ),
    );
  });
});

//!=============================================
// G4 (28/10/2026) — SĐT bị sàn che không được dùng để tự gom đơn.
//!=============================================
describe('G4 — SĐT bị che (Lazada "8**5")', () => {
  const fields = ['phone', 'address_line1', 'city'];
  const recipient = (phone: string): { phone: string; address_line1: string; city: string } => ({ phone, address_line1: '12 Lê Lợi', city: 'Hồ Chí Minh' });

  it('isUnusablePhone: có dấu * hoặc ít hơn 9 chữ số', () => {
    expect(isUnusablePhone('8**5')).toBe(true);
    expect(isUnusablePhone('84*******85')).toBe(true);
    expect(isUnusablePhone('085')).toBe(true);
    expect(isUnusablePhone('')).toBe(true);
    expect(isUnusablePhone('0901234567')).toBe(false);
    expect(isUnusablePhone('+84 901 234 567')).toBe(false);
  });

  it('2 khách khác nhau cùng bị che "8**5", cùng địa chỉ → khoá KHÁC nhau (không gom nhầm)', () => {
    const a = computeConsolidationKeyFor('lazada', recipient('8**5'), fields, 'S1:1001');
    const b = computeConsolidationKeyFor('lazada', recipient('8**5'), fields, 'S1:1002');
    expect(a).not.toBe(b);
  });

  it('SĐT đầy đủ → vẫn gom như cũ, mã đơn không ảnh hưởng khoá', () => {
    const a = computeConsolidationKeyFor('aurelle', recipient('0901234567'), fields, 'S1:1001');
    const b = computeConsolidationKeyFor('aurelle', recipient('0901234567'), fields, 'S1:1002');
    expect(a).toBe(b);
    expect(a).toBe(computeConsolidationKeyFor('aurelle', recipient('0901234567'), fields));
  });

  it('không gom theo SĐT (Admin chọn chỉ địa chỉ) → SĐT bị che không ảnh hưởng', () => {
    const a = computeConsolidationKeyFor('lazada', recipient('8**5'), ['address_line1', 'city'], 'S1:1001');
    const b = computeConsolidationKeyFor('lazada', recipient('8**5'), ['address_line1', 'city'], 'S1:1002');
    expect(a).toBe(b);
  });
});
