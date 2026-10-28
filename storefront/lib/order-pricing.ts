export const STANDARD_SHIPPING_FEE = 30_000
/** 29/10/2026 — giao hỏa tốc 3 giờ (shop tự giao), chỉ nội thành TP.HCM + Thủ Dầu Một/Thuận An/Dĩ An. */
export const EXPRESS_SHIPPING_FEE = 45_000
export const FREE_SHIPPING_THRESHOLD = 1_000_000

export type DeliveryOption = 'standard' | 'express'

/** Đơn từ 1 triệu miễn phí cả 2 cách giao. Giá cuối cùng vẫn do BE tính lúc đặt. */
export function getShippingFee(subtotal: number, option: DeliveryOption = 'standard') {
  if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0
  return option === 'express' ? EXPRESS_SHIPPING_FEE : STANDARD_SHIPPING_FEE
}
