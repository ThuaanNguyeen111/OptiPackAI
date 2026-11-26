import type { Product } from '@/types/storefront'

/** Giá thấp nhất / cao nhất trong các biến thể có giá > 0 (giá lưu theo đồng). */
export function priceRange(product: Product): { min: number; max: number } {
  const prices = product.variants.map((v) => v.price).filter((p) => Number.isFinite(p) && p > 0)
  if (prices.length === 0) return { min: 0, max: 0 }
  return { min: Math.min(...prices), max: Math.max(...prices) }
}

export function totalAvailable(product: Product): number {
  return product.variants.reduce((sum, v) => sum + Math.max(0, v.availableQuantity || 0), 0)
}

/** Giảm giá lớn nhất (%) khi biến thể có giá gốc cao hơn giá bán. */
export function maxDiscountPercent(product: Product): number {
  let best = 0
  for (const v of product.variants) {
    if (v.compareAtPrice && v.compareAtPrice > v.price && v.price > 0) {
      best = Math.max(best, Math.round((1 - v.price / v.compareAtPrice) * 100))
    }
  }
  return best
}

export function formatVnd(value: number): string {
  return `${value.toLocaleString('vi-VN')}₫`
}

/** Bỏ dấu + chữ thường để tìm "ao thun" vẫn ra "Áo thun". */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim()
}
