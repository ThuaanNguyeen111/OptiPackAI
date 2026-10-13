export const STANDARD_SHIPPING_FEE = 30_000
export const FREE_SHIPPING_THRESHOLD = 1_000_000

export function getShippingFee(subtotal: number) {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE
}
