import { isMaskedValue } from '../../orders/utils/vn-administrative-area.util';

/**
 * ===================================================================
 * 28/10/2026 — ĐỊA CHỈ MÔ PHỎNG CHO ĐƠN BỊ CHE (CHỈ MÔI TRƯỜNG DEMO)
 * ===================================================================
 * Sàn che dữ liệu người nhận (Lazada: tên/SĐT/số nhà/tỉnh dạng "N**n") nên
 * không gửi được GHN. Bật CARRIER_DEMO_RECIPIENT_ENABLED=true thì mỗi đơn
 * bị che được cấp MỘT địa chỉ mô phỏng (số nhà tăng dần + SĐT di động hợp lệ),
 * KHÔNG ghi DB: số thứ tự và SĐT tính lại từ dữ liệu đơn (xem DemoRecipientService), nên
 * báo giá / tạo vận đơn / in nhãn luôn ra cùng một địa chỉ.
 *
 * Quyết định theo CHẤT LƯỢNG DỮ LIỆU, không theo tên sàn: đơn nào đủ địa chỉ
 * thật (AURELLE) giữ nguyên; đơn nào bị che/thiếu (Lazada hôm nay, sàn khác
 * sau này) mới dùng địa chỉ mô phỏng. Các hàm dưới đây THUẦN (không I/O).
 * ===================================================================
 */

/** Phần địa chỉ người nhận của đơn mà hàm này cần đọc. */
export interface RecipientForDemoCheck {
  phone?: string | null;
  address_line1?: string | null;
  city?: string | null;
  province_name?: string | null;
  ward_name?: string | null;
}

/** Cấu hình địa chỉ mô phỏng (đọc từ namespace config "carrier.demoRecipient"). */
export interface DemoRecipientSettings {
  enabled: boolean;
  /** Mẫu số nhà + đường, `{n}` được thay bằng số thứ tự. VD "47/{n} Nguyễn Văn Đậu". */
  streetTemplate: string;
  /** Số thứ tự của đơn đầu tiên (VD 10 → "47/10"). */
  startNumber: number;
  wardName: string | null;
  provinceName: string | null;
  /** SĐT của đơn đầu tiên; các đơn sau sinh ngẫu nhiên. */
  firstPhone: string | null;
}

/** Địa chỉ mô phỏng của 1 đơn (tính lại mỗi lần, không lưu DB). */
export interface DemoRecipientValue {
  seq: number;
  street: string;
  ward_name: string;
  province_name: string;
  phone: string;
}

const VN_MOBILE = /^0\d{9}$/;

/** Đầu số di động 03x / 09x đang dùng (Viettel 032–039, 096–098; MobiFone 090, 093; VinaPhone 091, 094). */
export const DEMO_MOBILE_PREFIXES = [
  '032', '033', '034', '035', '036', '037', '038', '039',
  '090', '091', '093', '094', '096', '097', '098',
] as const;

const usable = (value: string | null | undefined): boolean => !!value?.trim() && !isMaskedValue(value);

/**
 * Đơn có cần địa chỉ mô phỏng không: SĐT không phải số di động 10 số, HOẶC số
 * nhà bị che, HOẶC thiếu/bị che tỉnh, HOẶC không tìm được phường (ward_name,
 * hay `city` của Lazada khi nó chứa tên phường).
 */
export function needsDemoRecipient(recipient: RecipientForDemoCheck): boolean {
  const phone = (recipient.phone ?? '').replace(/\s+/g, '');
  if (!VN_MOBILE.test(phone)) return true;
  if (!usable(recipient.address_line1)) return true;
  if (!usable(recipient.province_name)) return true;
  const ward = usable(recipient.ward_name) ? recipient.ward_name : recipient.city;
  return !usable(ward);
}

/** "47/{n} Nguyễn Văn Đậu" + 11 → "47/11 Nguyễn Văn Đậu". Mẫu không có {n} → nối số vào đầu. */
export function formatDemoStreet(template: string, n: number): string {
  const text = template.trim();
  return text.includes('{n}') ? text.split('{n}').join(String(n)) : `${String(n)} ${text}`;
}

/** SĐT di động ngẫu nhiên 10 số, đầu 03x/09x. `random` trả [0, 1) — truyền vào để test được. */
export function randomVietnamMobile(random: () => number = Math.random): string {
  const pick = Math.min(DEMO_MOBILE_PREFIXES.length - 1, Math.floor(random() * DEMO_MOBILE_PREFIXES.length));
  let rest = '';
  for (let i = 0; i < 7; i += 1) rest += String(Math.min(9, Math.floor(random() * 10)));
  return `${DEMO_MOBILE_PREFIXES.at(pick) ?? '090'}${rest}`;
}

/**
 * Dựng địa chỉ mô phỏng cho số thứ tự `seq`. Đơn đầu tiên (seq = startNumber)
 * dùng `firstPhone` nếu hợp lệ; các đơn sau dùng SĐT ngẫu nhiên. Trả null khi
 * cấu hình thiếu phường hoặc tỉnh (không đoán).
 */
export function buildDemoRecipient(
  seq: number,
  settings: DemoRecipientSettings,
  random: () => number = Math.random,
): DemoRecipientValue | null {
  const ward = settings.wardName?.trim();
  const province = settings.provinceName?.trim();
  if (!ward || !province) return null;
  const first = settings.firstPhone?.replace(/\s+/g, '') ?? '';
  const phone = seq === settings.startNumber && VN_MOBILE.test(first) ? first : randomVietnamMobile(random);
  return {
    seq,
    street: formatDemoStreet(settings.streetTemplate, seq),
    ward_name: ward,
    province_name: province,
    phone,
  };
}

/**
 * Bộ sinh số giả ngẫu nhiên CỐ ĐỊNH theo chuỗi hạt giống (FNV-1a + mulberry32): cùng mã đơn
 * luôn ra cùng SĐT mô phỏng mà không phải lưu vào DB. Trả [0, 1).
 */
export function seededRandom(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let state = h;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
