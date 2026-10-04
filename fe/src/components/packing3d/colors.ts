import type { ProductCategory } from '../../types/packaging'

/**
 * Màu khối 3D theo loại hàng (04/10/2026). Cùng loại cùng tông để nhân viên
 * nhận ra ngay "đây là giày, đây là áo"; mỗi SKU lệch độ sáng một chút để
 * hai SKU cùng loại nằm cạnh nhau vẫn phân biệt được.
 */
const CATEGORY_HUES: Record<ProductCategory, { h: number; s: number; l: number }> = {
  t_shirt: { h: 218, s: 70, l: 62 },
  shirt: { h: 196, s: 62, l: 64 },
  jacket: { h: 238, s: 48, l: 58 },
  shorts: { h: 38, s: 72, l: 60 },
  trousers: { h: 214, s: 34, l: 44 },
  dress: { h: 330, s: 58, l: 66 },
  shoes: { h: 22, s: 62, l: 58 },
  sandals: { h: 172, s: 46, l: 50 },
  accessory: { h: 276, s: 46, l: 64 },
  other: { h: 215, s: 12, l: 64 },
}

function hash(text: string): number {
  let value = 0
  for (let i = 0; i < text.length; i += 1) value = (value * 31 + text.charCodeAt(i)) | 0
  return Math.abs(value)
}

export function itemColor(sku: string, category: ProductCategory | null | undefined): string {
  const jitter = (hash(sku) % 9) - 4
  if (category) {
    const c = CATEGORY_HUES[category]
    return `hsl(${String(c.h)}, ${String(c.s)}%, ${String(c.l + jitter)}%)`
  }
  return `hsl(${String(hash(sku) % 360)}, 40%, ${String(62 + jitter)}%)`
}

/** Giấy carton: mặt ngoài, mặt trong (tối hơn một chút), mép cắt. */
export const KRAFT = { outer: '#c99a63', inner: '#b8864f', flap: '#d2a670', edge: '#8a6236' }
export const HIGHLIGHT = '#6366f1'
