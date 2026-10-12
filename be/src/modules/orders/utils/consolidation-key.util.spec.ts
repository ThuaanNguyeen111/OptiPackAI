import {
  computeConsolidationKey,
  computeRecipientKey,
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
    // Lưu ý: "Đ"/"đ" là 1 CHỮ CÁI RIÊNG trong Unicode (không phải "D" + dấu
    // kết hợp qua NFD) — normalizeAddressFragment (bỏ dấu qua NFD) KHÔNG
    // gập "Đường" thành "duong". Test này chỉ xác nhận đúng phần chuẩn hóa
    // THẬT SỰ áp dụng: hạ chữ thường + gộp khoảng trắng — giữ nguyên "Đường"
    // giống hệt ở cả 2 vế để không phụ thuộc vào hành vi Đ/đ.
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
    const keyWithZero = computeRecipientKey('A', '0901234567', 'Địa chỉ', 'Tỉnh');
    const keyWithCountryCode = computeRecipientKey('A', '+84901234567', 'Địa chỉ', 'Tỉnh');
    expect(keyWithZero).toBe(keyWithCountryCode);
    expect(normalizePhoneNumber('+84901234567')).toBe('0901234567');
  });

  it('khác tên (dù cùng SĐT/địa chỉ/tỉnh) -> KHÁC recipient_key — an toàn, không liên kết nhầm', () => {
    const key1 = computeRecipientKey('Nguyễn Văn A', '0901234567', '12 Đường 3/2', 'TP.HCM');
    const key2 = computeRecipientKey('Nguyễn Văn B', '0901234567', '12 Đường 3/2', 'TP.HCM');
    expect(key1).not.toBe(key2);
  });
});
