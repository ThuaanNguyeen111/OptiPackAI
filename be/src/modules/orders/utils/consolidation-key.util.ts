import { createHash } from 'crypto';

/**
 * ===================================================================
 * CONSOLIDATION KEY — CỐT LÕI TỐI ƯU TỐC ĐỘ CỦA "Mainflow 1"
 * ===================================================================
 * BƯỚC "Matching customer's information?" trong flowchart KHÔNG được
 * phép cài bằng so khớp mờ (regex/fuzzy match tên+SĐT+địa chỉ) — cách
 * đó bắt buộc phải quét TOÀN BỘ đơn chưa fulfill mỗi lần có đơn mới,
 * độ phức tạp O(n) và CHẬM DẦN khi n lớn (n = số đơn chưa xử lý).
 *
 * Thay vào đó: chuẩn hóa SĐT + địa chỉ giao hàng ngay lúc ingest đơn,
 * băm SHA-256 thành 1 chuỗi cố định (`consolidation_key`), lưu kèm mỗi
 * Order, đánh index Mongo trên trường này. "Match" lúc đó chỉ còn là
 * `Order.findOne({ consolidation_key: X, status: { $in: UNFULFILLED } })`
 * — 1 lần tra index B-tree, độ phức tạp O(log n), KHÔNG PHỤ THUỘC vào
 * n tăng lên bao nhiêu.
 *
 * Đánh đổi CHỦ ĐÍCH: 2 đơn cùng SĐT nhưng gõ địa chỉ hơi khác nhau 1 kí
 * tự (vd "Đường 3/2" vs "Đường 3-2") sẽ KHÔNG match — đây là lựa chọn
 * ưu tiên ĐÚNG (tránh gộp nhầm 2 đơn khác nhau) hơn là ưu tiên ĐỦ (bắt
 * hết mọi trường hợp gần giống). Việc gộp sai ảnh hưởng trực tiếp tới
 * khách hàng thật (giao nhầm địa chỉ) — hậu quả nặng hơn nhiều so với
 * việc bỏ sót 1 vài trường hợp có thể gộp mà không gộp.
 * ===================================================================
 */

/**
 * Chuẩn hóa số điện thoại VN về ĐÚNG 1 dạng duy nhất trước khi băm:
 *   - Bỏ mọi ký tự không phải chữ số (khoảng trắng, dấu gạch, ngoặc...)
 *   - Quy các dạng đầu số khác nhau (+84, 84, 0) về CHUNG 1 dạng bắt
 *     đầu bằng "0" — vì Seller Center VN và các nguồn khác nhau có thể
 *     trả về SĐT ở CẢ 3 dạng cho CÙNG 1 số thật.
 */
export function normalizePhoneNumber(phoneRaw: string): string {
  const digitsOnly = phoneRaw.replace(/\D/g, '');

  if (digitsOnly.startsWith('84') && digitsOnly.length === 11) {
    return `0${digitsOnly.slice(2)}`;
  }

  if (digitsOnly.startsWith('0')) {
    return digitsOnly;
  }

  // Số 9-10 chữ số không có tiền tố — giả định thiếu số "0" đầu, thêm vào.
  return `0${digitsOnly}`;
}

/**
 * Chuẩn hóa 1 dòng địa chỉ: hạ chữ thường, bỏ khoảng trắng thừa, bỏ dấu
 * tiếng Việt (đơn giản hóa qua NFD + strip diacritics) — GIẢM (không
 * loại bỏ hoàn toàn) khả năng lệch key do khác nhau về CÁCH GÕ, không
 * phải khác nhau về NỘI DUNG địa chỉ.
 */
function normalizeAddressFragment(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // bỏ dấu
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Tính consolidation_key từ platform + SĐT + dòng địa chỉ đầu tiên + thành
 * phố. Cùng 1 bộ 4 giá trị (sau chuẩn hóa) LUÔN cho ra CÙNG 1 key — thuộc
 * tính bắt buộc để dùng làm điều kiện match qua index.
 *
 * `platform` BẮT BUỘC có mặt trong key — thiếu nó, 2 đơn CÙNG khách hàng
 * nhưng đặt trên 2 SÀN KHÁC NHAU (VD Lazada + TikTok Shop) sẽ băm ra
 * CÙNG 1 key, bị gộp nhầm chung 1 OrderGroup dù có thể 2 mã vận đơn/2 đơn
 * vị vận chuyển hoàn toàn khác nhau (AOFP-XX, phát hiện 14/09/2026 —
 * "ngủ yên" tới giờ chỉ vì hệ thống mới có Lazada, sẽ phát tác ngay khi
 * thêm TikTok/Tiki nếu không sửa trước).
 */
export function computeConsolidationKey(
  platform: string,
  phoneRaw: string,
  addressLine1Raw: string,
  cityRaw: string,
): string {
  const normalizedPhone = normalizePhoneNumber(phoneRaw);
  const normalizedAddress = normalizeAddressFragment(addressLine1Raw);
  const normalizedCity = normalizeAddressFragment(cityRaw);

  const input = `${platform}|${normalizedPhone}|${normalizedAddress}|${normalizedCity}`;

  return createHash('sha256').update(input).digest('hex');
}

/**
 * ===================================================================
 * RECIPIENT KEY — MỚI (29/09/2026, Mục 9.5 AURELLE_MARKETPLACE_DESIGN.md)
 * ===================================================================
 * KHÁC HẲN consolidation_key ở trên — key này CỐ Ý KHÔNG kèm platform,
 * để liên kết được 2 nhóm đơn CÙNG 1 khách hàng thật nhưng đặt trên
 * 2 SÀN KHÁC NHAU (VD 1 đơn Lazada + 1 đơn AURELLE, cùng người nhận) —
 * phục vụ "giao chung chuyến" (Mục 9.5), KHÔNG dùng để tự động gộp
 * chung 1 OrderGroup (đó vẫn là việc của consolidation_key, giữ nguyên
 * platform để tránh gộp nhầm 2 vận đơn khác sàn — xem comment ở trên).
 *
 * Công thức đúng Mục 4.2: tên + SĐT + địa chỉ + tỉnh, chuẩn hóa GIỐNG
 * consolidation_key (bỏ dấu, chữ thường, gộp khoảng trắng cho tên/địa
 * chỉ/tỉnh; chuẩn hóa số riêng cho SĐT) — tái dùng lại 2 hàm chuẩn hóa
 * đã có ở trên, không viết lại logic chuẩn hóa lần 2.
 * ===================================================================
 */
export function computeRecipientKey(
  fullNameRaw: string,
  phoneRaw: string,
  addressLine1Raw: string,
  cityRaw: string,
): string {
  const normalizedName = normalizeAddressFragment(fullNameRaw);
  const normalizedPhone = normalizePhoneNumber(phoneRaw);
  const normalizedAddress = normalizeAddressFragment(addressLine1Raw);
  const normalizedCity = normalizeAddressFragment(cityRaw);

  const input = `${normalizedName}|${normalizedPhone}|${normalizedAddress}|${normalizedCity}`;

  return createHash('sha256').update(input).digest('hex');
}
