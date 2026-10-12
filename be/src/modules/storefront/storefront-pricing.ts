export const STANDARD_SHIPPING_FEE = 30_000;
export const FREE_SHIPPING_THRESHOLD = 1_000_000;

export function calculateShippingFee(subtotal: number): number {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;
}

export function calculateOrderTotal(subtotal: number, discountAmount = 0): {
  shippingFee: number;
  total: number;
} {
  const shippingFee = calculateShippingFee(subtotal);
  return {
    shippingFee,
    total: Math.max(0, subtotal - discountAmount) + shippingFee,
  };
}
