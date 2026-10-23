import { isMaskedValue } from '../../orders/utils/vn-administrative-area.util';

/**
 * 23/10/2026 — So khớp TÊN NGƯỜI NHẬN trong 1 nhóm đơn gộp.
 *
 * Khoá gộp mặc định (phone + address_line1 + city) KHÔNG gồm tên → 2 người khác tên
 * ở cùng địa chỉ + SĐT (VD vợ/chồng, đồng nghiệp đặt chung văn phòng) được gộp chung
 * 1 nhóm. Mỗi đơn vẫn có kiện + vận đơn riêng mang đúng tên người nhận của đơn đó,
 * nhưng kho phải BIẾT để không bỏ nhầm hàng/dán nhầm nhãn → dùng util này để cảnh báo.
 *
 * - So sánh không phân biệt hoa/thường, dấu tiếng Việt, khoảng trắng thừa
 *   ("Nguyễn  Văn A" ≡ "nguyen van a").
 * - Tên bị sàn che (có dấu *) KHÔNG đem so — không biết thật hay khác → báo riêng `hasMasked`.
 */
export function normalizeRecipientName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface RecipientNameSummary {
  /** Tên khác nhau (giữ cách viết của đơn đầu tiên mang tên đó), không gồm tên bị che. */
  names: string[];
  /** true = có ≥ 2 tên thật khác nhau → nhóm gộp nhiều người nhận. */
  differ: boolean;
  /** true = có đơn bị che tên → không kiểm chứng được, kho nên đối chiếu nhãn từng kiện. */
  hasMasked: boolean;
}

export function summarizeRecipientNames(raw: readonly (string | null | undefined)[]): RecipientNameSummary {
  const byKey = new Map<string, string>();
  let hasMasked = false;
  for (const value of raw) {
    const name = value?.trim();
    if (!name) continue;
    if (isMaskedValue(name)) {
      hasMasked = true;
      continue;
    }
    const key = normalizeRecipientName(name);
    if (!byKey.has(key)) byKey.set(key, name);
  }
  const names = [...byKey.values()];
  return { names, differ: names.length > 1, hasMasked };
}
