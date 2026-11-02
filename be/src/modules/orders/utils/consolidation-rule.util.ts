import { createHash } from 'crypto';
import {
  CONSOLIDATION_RULE_FIELDS,
  CONSOLIDATION_RULE_MATCHES,
  MAX_CONSOLIDATION_RULES,
  SYNC_PLATFORMS,
} from '../order-sync-policy';
import type { ConsolidationRule, ConsolidationRuleField } from '../order-sync-policy';
import { isUnusablePhone, normalizeAddressFragment, normalizePhoneNumber } from './consolidation-key.util';

/**
 * ===================================================================
 * QUY TẮC GỘP ĐƠN BỔ SUNG (31/10/2026) — GUIDE_DOC/CONSOLIDATION_RULES_DESIGN.md
 * ===================================================================
 * Mỗi quy tắc đang bật áp được cho đơn → 1 khoá `"<rule.id>:<sha256>"` trong
 * `orders.consolidation_keys`. Tiền tố rule.id để tryConsolidate biết khoá thuộc
 * quy tắc nào (giới hạn thời gian riêng, log lý do gộp).
 *
 * KHÔNG sinh khoá (quy tắc không áp cho đơn) khi:
 *   - 1 trường của quy tắc trống hoặc bị sàn che (chứa "*"), SĐT < 9 số;
 *   - đơn giao hỏa tốc, đơn đổi hàng (EXC-) — 2 loại có khoá gom riêng;
 *   - quy tắc tắt hoặc giới hạn sàn không gồm sàn của đơn.
 * → đơn Lazada bị che thông tin không thể bị gộp nhầm qua quy tắc.
 * ===================================================================
 */

/** Phần dữ liệu đơn cần để tính khoá theo quy tắc. */
export interface RuleKeyOrderInput {
  platform: string;
  platform_order_id: string;
  delivery_option?: 'standard' | 'express' | null;
  recipient: Partial<Record<ConsolidationRuleField, string | null | undefined>>;
}

/** Đơn không bao giờ dùng quy tắc bổ sung (đã có khoá gom riêng). */
export function isRuleExemptOrder(order: Pick<RuleKeyOrderInput, 'platform_order_id' | 'delivery_option'>): boolean {
  return order.delivery_option === 'express' || order.platform_order_id.startsWith('EXC-');
}

function ruleFieldValue(order: RuleKeyOrderInput, field: ConsolidationRuleField, match: 'normalized' | 'exact'): string | null {
  const raw = order.recipient[field];
  if (typeof raw !== 'string') return null;
  if (field === 'phone') return isUnusablePhone(raw) ? null : normalizePhoneNumber(raw);
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed.includes('*')) return null;
  const value = match === 'exact' ? trimmed : normalizeAddressFragment(trimmed);
  return value === '' ? null : value;
}

/** Khoá của 1 quy tắc cho 1 đơn; null = quy tắc không áp cho đơn này. */
export function computeRuleKey(order: RuleKeyOrderInput, rule: ConsolidationRule): string | null {
  if (!rule.enabled || isRuleExemptOrder(order)) return null;
  if (rule.platforms.length > 0 && !rule.platforms.includes(order.platform)) return null;
  const matchOf = new Map(rule.fields.map((f) => [f.field, f.match]));
  const parts: string[] = ['rule', order.platform, rule.id];
  for (const field of CONSOLIDATION_RULE_FIELDS) {
    const match = matchOf.get(field);
    if (!match) continue;
    const value = ruleFieldValue(order, field, match);
    if (value === null) return null;
    parts.push(`${field}=${value}`);
  }
  return `${rule.id}:${createHash('sha256').update(parts.join('|')).digest('hex')}`;
}

/** Tất cả khoá theo quy tắc của 1 đơn (thứ tự theo danh sách quy tắc). */
export function computeRuleKeys(order: RuleKeyOrderInput, rules: readonly ConsolidationRule[]): string[] {
  const keys: string[] = [];
  for (const rule of rules) {
    const key = computeRuleKey(order, rule);
    if (key !== null) keys.push(key);
  }
  return keys;
}

/** rule.id của 1 khoá trong `consolidation_keys`. */
export function ruleIdOfKey(key: string): string {
  const i = key.indexOf(':');
  return i < 0 ? '' : key.slice(0, i);
}

/**
 * Chữ ký phần ẢNH HƯỞNG TỚI KHOÁ của bộ quy tắc (bỏ qua tên, câu gốc, giới hạn thời gian).
 * Khác nhau → phải tính lại `consolidation_keys` cho đơn chưa xong.
 */
export function ruleKeySignature(rules: readonly ConsolidationRule[]): string {
  return JSON.stringify(
    rules
      .filter((r) => r.enabled)
      .map((r) => ({
        id: r.id,
        fields: [...r.fields].sort((a, b) => a.field.localeCompare(b.field)),
        platforms: [...r.platforms].sort(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
}

/**
 * Kiểm tra 1 quy tắc theo các giới hạn an toàn (dùng chung cho form, AI dịch và lúc lưu).
 * Trả danh sách lỗi bằng tiếng Việt; rỗng = hợp lệ.
 */
export function validateConsolidationRule(rule: ConsolidationRule): string[] {
  const errors: string[] = [];
  if (rule.name.trim() === '' || rule.name.length > 80) errors.push('Tên quy tắc phải có 1–80 ký tự.');
  if (rule.sourceText !== null && rule.sourceText.length > 500) errors.push('Câu mô tả tối đa 500 ký tự.');
  if (rule.fields.length === 0) errors.push('Quy tắc phải chọn ít nhất 1 trường.');
  const seen = new Set<string>();
  for (const f of rule.fields) {
    if (!(CONSOLIDATION_RULE_FIELDS as readonly string[]).includes(f.field)) errors.push(`Trường "${f.field}" không được hỗ trợ.`);
    if (!(CONSOLIDATION_RULE_MATCHES as readonly string[]).includes(f.match)) errors.push(`Cách so khớp "${f.match}" không hợp lệ.`);
    if (seen.has(f.field)) errors.push(`Trường "${f.field}" bị chọn 2 lần.`);
    seen.add(f.field);
  }
  if (!seen.has('phone') && !seen.has('address_line1')) {
    errors.push('Quy tắc phải có Số điện thoại hoặc Địa chỉ chi tiết — chỉ dùng tên/tỉnh/quận/phường sẽ gộp nhầm người khác.');
  }
  for (const p of rule.platforms) {
    if (!(SYNC_PLATFORMS as readonly string[]).includes(p)) errors.push(`Sàn "${p}" không được hỗ trợ.`);
  }
  if (new Set(rule.platforms).size !== rule.platforms.length) errors.push('Danh sách sàn bị trùng.');
  if (rule.maxWindowHours !== null && (!Number.isInteger(rule.maxWindowHours) || rule.maxWindowHours < 1 || rule.maxWindowHours > 720)) {
    errors.push('Giới hạn thời gian riêng phải là số giờ nguyên từ 1 đến 720.');
  }
  return errors;
}

/** Kiểm tra cả bộ quy tắc: từng quy tắc + số lượng + trùng id. */
export function validateConsolidationRules(rules: readonly ConsolidationRule[]): string[] {
  const errors: string[] = [];
  if (rules.length > MAX_CONSOLIDATION_RULES) errors.push(`Tối đa ${String(MAX_CONSOLIDATION_RULES)} quy tắc.`);
  const ids = new Set<string>();
  for (const rule of rules) {
    if (ids.has(rule.id)) errors.push(`Mã quy tắc "${rule.id}" bị trùng.`);
    ids.add(rule.id);
    for (const e of validateConsolidationRule(rule)) errors.push(`${rule.name || rule.id}: ${e}`);
  }
  return errors;
}
