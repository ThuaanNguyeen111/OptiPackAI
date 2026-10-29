export const EXPRESS_SHIPPING_FEE = 45_000; // 29/10/2026 — giao hỏa tốc (shop tự giao trong 3 giờ)
export const STANDARD_SHIPPING_FEE = 30_000;
export const FREE_SHIPPING_THRESHOLD = 1_000_000;

export function calculateShippingFee(subtotal: number): number {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;
}

/**
 * 🔄 29/10/2026 — thêm `deliveryOption`: hỏa tốc 45.000đ (express-delivery.policy.ts); đơn từ
 * 1 triệu miễn phí cả hai cách giao. Không truyền = giao tiêu chuẩn như trước.
 */
export function calculateOrderTotal(subtotal: number, discountAmount = 0, deliveryOption: 'standard' | 'express' = 'standard'): {
  shippingFee: number;
  total: number;
} {
  const shippingFee = deliveryOption === 'express'
    ? (subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : EXPRESS_SHIPPING_FEE)
    : calculateShippingFee(subtotal);
  return {
    shippingFee,
    total: Math.max(0, subtotal - discountAmount) + shippingFee,
  };
}
