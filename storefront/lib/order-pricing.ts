export const STANDARD_SHIPPING_FEE = 30_000
export const FREE_SHIPPING_THRESHOLD = 1_000_000

/** Đơn từ 1 triệu miễn phí giao. Giá cuối cùng vẫn do BE tính lúc đặt. */
export function getShippingFee(subtotal: number) {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE
}
