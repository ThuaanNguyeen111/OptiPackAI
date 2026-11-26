import { EXPRESS_SHIPPING_FEE, FREE_SHIPPING_THRESHOLD, STANDARD_SHIPPING_FEE } from './storefront-pricing';

/**
 * ===================================================================
 * 29/10/2026 — GIAO HỎA TỐC trên website AURELLE (Thuận chốt)
 * ===================================================================
 * - 2 lựa chọn: Tiêu chuẩn 30.000đ (GHN) | Hỏa tốc 45.000đ (shop tự giao). Đơn từ 1 triệu
 *   miễn phí CẢ HAI.
 * - Hỏa tốc chỉ khi phường giao thuộc danh sách (`express-delivery-wards.ts`, Admin sửa được)
 *   VÀ đặt trong 8:00–14:00, thứ 2 – thứ 7 (giờ Việt Nam).
 * - Hẹn khách: giao trước giờ đặt + 3 giờ. Phía kho: đóng gói xong trước giờ đặt + 1 giờ.
 * Hàm thuần (không DB) — dùng chung cho API báo lựa chọn, checkout và test.
 * ===================================================================
 */
export type DeliveryOption = 'standard' | 'express';
export const DELIVERY_OPTIONS: readonly DeliveryOption[] = ['standard', 'express'];

export { EXPRESS_SHIPPING_FEE };
/** Hẹn khách: giao trước giờ đặt + 3 giờ. */
export const EXPRESS_PROMISE_HOURS = 3;
/** Mốc kho: đóng gói xong trước giờ đặt + 1 giờ (còn 2 giờ cho shipper). */
export const EXPRESS_PACK_HOURS = 1;
/** Khung nhận đơn hỏa tốc (giờ VN): [8:00, 14:00), thứ 2 – thứ 7. */
export const EXPRESS_OPEN_HOUR = 8;
export const EXPRESS_CLOSE_HOUR = 14;
export const EXPRESS_PROVINCE = 'Thành phố Hồ Chí Minh';

const HOUR_MS = 60 * 60 * 1000;
const VN_OFFSET_MS = 7 * HOUR_MS;

/** So khớp tên địa danh: bỏ dấu, chữ thường, gộp khoảng trắng ("Phường  Bến thành" = "Phường Bến Thành"). */
export function normalizePlaceName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Tỉnh nhận được viết "TP.HCM", "Hồ Chí Minh", "Thành phố Hồ Chí Minh"... đều tính là TP.HCM. */
export function isExpressProvince(province: string): boolean {
  const p = normalizePlaceName(province).replace(/^(thanh pho|tp\.?)\s*/, '');
  return p === 'ho chi minh' || p === 'hcm';
}

export function isExpressWard(province: string, ward: string, wards: readonly string[]): boolean {
  if (!isExpressProvince(province)) return false;
  const target = normalizePlaceName(ward);
  return wards.some((w) => normalizePlaceName(w) === target);
}

/** Giờ + thứ theo giờ Việt Nam (0 = Chủ nhật). */
function vnClock(at: Date): { weekday: number; minutes: number } {
  const vn = new Date(at.getTime() + VN_OFFSET_MS);
  return { weekday: vn.getUTCDay(), minutes: vn.getUTCHours() * 60 + vn.getUTCMinutes() };
}

export function isExpressWindowOpen(at: Date): boolean {
  const { weekday, minutes } = vnClock(at);
  if (weekday === 0) return false;
  return minutes >= EXPRESS_OPEN_HOUR * 60 && minutes < EXPRESS_CLOSE_HOUR * 60;
}

export function promisedDeliveryAt(placedAt: Date): Date {
  return new Date(placedAt.getTime() + EXPRESS_PROMISE_HOURS * HOUR_MS);
}

export function packingDeadlineFor(placedAt: Date): Date {
  return new Date(placedAt.getTime() + EXPRESS_PACK_HOURS * HOUR_MS);
}

export function shippingFeeFor(option: DeliveryOption, subtotal: number): number {
  if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
  return option === 'express' ? EXPRESS_SHIPPING_FEE : STANDARD_SHIPPING_FEE;
}

export type ExpressUnavailableReason = 'outside_area' | 'outside_hours' | 'missing_address';

export const EXPRESS_UNAVAILABLE_TEXT: Record<ExpressUnavailableReason, string> = {
  missing_address: 'Chọn tỉnh/thành và phường/xã để xem có giao hỏa tốc không.',
  outside_area: 'Giao hỏa tốc chỉ áp dụng nội thành TP.HCM, Thủ Đức và Thủ Dầu Một, Thuận An, Dĩ An.',
  outside_hours: `Giao hỏa tốc chỉ nhận đơn từ ${String(EXPRESS_OPEN_HOUR)}:00 đến ${String(EXPRESS_CLOSE_HOUR)}:00, thứ 2 – thứ 7.`,
};

/** Lý do không giao hỏa tốc được (null = được). Địa chỉ xét trước giờ: khách ngoài vùng không cần biết giờ. */
export function expressUnavailableReason(
  province: string | undefined,
  ward: string | undefined,
  at: Date,
  wards: readonly string[],
): ExpressUnavailableReason | null {
  if (!province?.trim() || !ward?.trim()) return 'missing_address';
  if (!isExpressWard(province, ward, wards)) return 'outside_area';
  if (!isExpressWindowOpen(at)) return 'outside_hours';
  return null;
}

export interface DeliveryOptionView {
  code: DeliveryOption;
  label: string;
  feeVnd: number;
  /** Phí niêm yết (trước miễn phí) — để hiện "Miễn phí (45.000đ)". */
  listFeeVnd: number;
  available: boolean;
  unavailableReason: ExpressUnavailableReason | null;
  unavailableText: string | null;
  /** Lời hẹn hiện cho khách. */
  promise: string;
  /** Hỏa tốc: giờ hẹn giao nếu đặt ngay bây giờ. */
  promisedDeliveryAt: Date | null;
}

export function deliveryOptionsFor(input: {
  province?: string;
  ward?: string;
  subtotal: number;
  at: Date;
  wards: readonly string[];
}): { options: DeliveryOptionView[]; freeShippingThreshold: number } {
  const reason = expressUnavailableReason(input.province, input.ward, input.at, input.wards);
  return {
    freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
    options: [
      {
        code: 'standard',
        label: 'Giao tiêu chuẩn',
        feeVnd: shippingFeeFor('standard', input.subtotal),
        listFeeVnd: STANDARD_SHIPPING_FEE,
        available: true,
        unavailableReason: null,
        unavailableText: null,
        promise: 'Giao qua GHN: nội thành thường trong ngày hoặc hôm sau, tỉnh khác 1–3 ngày.',
        promisedDeliveryAt: null,
      },
      {
        code: 'express',
        label: 'Giao hỏa tốc',
        feeVnd: shippingFeeFor('express', input.subtotal),
        listFeeVnd: EXPRESS_SHIPPING_FEE,
        available: reason === null,
        unavailableReason: reason,
        unavailableText: reason ? EXPRESS_UNAVAILABLE_TEXT[reason] : null,
        promise: `Shop giao tận tay trong ${String(EXPRESS_PROMISE_HOURS)} giờ kể từ lúc đặt.`,
        promisedDeliveryAt: reason === null ? promisedDeliveryAt(input.at) : null,
      },
    ],
  };
}

/** Đơn hỏa tốc trễ hẹn: chưa giao mà đã quá giờ hẹn, hoặc giao sau giờ hẹn. Đơn hủy không tính. */
export function isExpressLate(order: {
  delivery_option?: DeliveryOption | null;
  promised_delivery_at?: Date | null;
  status: string;
  delivered_at?: Date | null;
}, now: Date): boolean {
  if (order.delivery_option !== 'express' || !order.promised_delivery_at || order.status === 'cancelled') return false;
  const doneAt = order.delivered_at ?? null;
  return doneAt ? doneAt > order.promised_delivery_at : now > order.promised_delivery_at;
}
