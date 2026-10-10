/**
 * ===================================================================
 * ĐƠN VỊ HÀNH CHÍNH VIỆT NAM — tách Tỉnh / Quận / Phường từ các phần địa chỉ
 * ===================================================================
 * 08/10/2026 (C1 — tích hợp GHN). Đơn vị vận chuyển (GHN) cần địa chỉ có cấu
 * trúc; sàn trả địa chỉ thành nhiều chuỗi rời (Lazada: address3/4/5). Hàm
 * dưới đây THUẦN (không I/O) — chỉ phân loại chuỗi theo TIỀN TỐ hành chính,
 * không tra danh mục. Việc đổi tên → mã GHN làm ở bước sau (address resolver).
 *
 * Vì sao không gán cứng theo vị trí (address3 = tỉnh, address4 = quận...):
 * sau sáp nhập 01/07/2025 nhiều nơi chỉ còn 2 cấp (Tỉnh → Phường), sàn có thể
 * đẩy phường lên vị trí của quận. Phân loại theo tiền tố trước, vị trí chỉ là
 * phương án cuối cho chuỗi không có tiền tố.
 * ===================================================================
 */

export type AdministrativeLevel = 'province' | 'district' | 'ward';

export interface AdministrativeAreas {
  province_name: string | null;
  district_name: string | null;
  ward_name: string | null;
}

/** Bỏ dấu + chữ thường + gộp khoảng trắng — chỉ dùng để SO KHỚP, không lưu. */
export function normalizeVietnameseText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Thứ tự quan trọng: "thanh pho" vừa có thể là tỉnh (TP. Hồ Chí Minh) vừa có
// thể là đô thị thuộc tỉnh (cấp quận) → xử lý riêng trong classifyAdministrativeUnit.
const WARD_PREFIXES = ['phuong ', 'p. ', 'p.', 'xa ', 'thi tran ', 'tt. ', 'dac khu '];
const DISTRICT_PREFIXES = ['quan ', 'q. ', 'q.', 'huyen ', 'h. ', 'thi xa ', 'tx. '];
const PROVINCE_PREFIXES = ['tinh ', 'tp. ', 'tp ', 'thanh pho '];

// 6 thành phố trực thuộc trung ương (trước và sau 07/2025) — "Thành phố X"
// với X là một trong các tên này là CẤP TỈNH, không phải cấp quận.
const CENTRAL_CITIES = ['ho chi minh', 'ha noi', 'da nang', 'hai phong', 'can tho', 'hue'];

/**
 * Phân loại 1 chuỗi địa danh theo tiền tố. Trả null nếu không nhận ra.
 * Chuỗi trần không tiền tố là tên thành phố trực thuộc trung ương ("Hồ Chí Minh")
 * → coi là tỉnh.
 */
export function classifyAdministrativeUnit(raw: string): AdministrativeLevel | null {
  const text = normalizeVietnameseText(raw);
  if (text.length === 0) return null;

  if (WARD_PREFIXES.some((p) => text.startsWith(p))) return 'ward';
  if (DISTRICT_PREFIXES.some((p) => text.startsWith(p))) return 'district';
  if (text.startsWith('thanh pho ') || text.startsWith('tp. ') || text.startsWith('tp ')) {
    const name = text.replace(/^(thanh pho|tp\.|tp)\s+/, '');
    // "Thành phố Thủ Đức", "Thành phố Biên Hòa"… là cấp quận (thuộc tỉnh/TP).
    return CENTRAL_CITIES.includes(name) ? 'province' : 'district';
  }
  if (PROVINCE_PREFIXES.some((p) => text.startsWith(p))) return 'province';
  if (CENTRAL_CITIES.includes(text)) return 'province';
  return null;
}

/**
 * Sàn che dữ liệu cá nhân bằng dấu `*` (Lazada thật, 08/10/2026: address3/4/5 trả
 * dạng "T**h", "P**h"). Chuỗi đã bị che KHÔNG phải địa danh → bỏ qua, không lưu.
 */
export function isMaskedValue(value: string): boolean {
  return value.includes('*');
}

/**
 * Tách các phần địa chỉ (theo thứ tự rộng → hẹp, VD [tỉnh, quận, phường]) thành
 * 3 cấp. Bước 1: gán theo tiền tố. Bước 2: chuỗi không nhận ra lấp vào cấp
 * còn trống theo vị trí của nó trong danh sách (0 → tỉnh, 1 → quận, 2 → phường).
 * Không bao giờ ghi đè cấp đã gán ở bước 1; chuỗi trùng cấp đã có bị bỏ qua.
 * Chuỗi bị che (có `*`) bị bỏ qua hoàn toàn. Phần tử thứ 4 trở đi chỉ được dùng
 * khi nhận ra theo tiền tố (không lấp theo vị trí).
 */
export function extractAdministrativeAreas(
  parts: readonly (string | null | undefined)[],
): AdministrativeAreas {
  const result: AdministrativeAreas = {
    province_name: null,
    district_name: null,
    ward_name: null,
  };
  const keyOf: Record<AdministrativeLevel, keyof AdministrativeAreas> = {
    province: 'province_name',
    district: 'district_name',
    ward: 'ward_name',
  };
  const positional: AdministrativeLevel[] = ['province', 'district', 'ward'];
  const unclassified: { value: string; index: number }[] = [];

  parts.forEach((part, index) => {
    const value = part?.trim();
    if (!value || isMaskedValue(value)) return;
    const level = classifyAdministrativeUnit(value);
    if (level === null) {
      unclassified.push({ value, index });
      return;
    }
    result[keyOf[level]] ??= value;
  });

  for (const { value, index } of unclassified) {
    const level = positional[index];
    if (level === undefined) continue;
    result[keyOf[level]] ??= value;
  }

  return result;
}
