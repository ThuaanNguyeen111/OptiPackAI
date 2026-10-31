/**
 * Bảng chọn file 3D cho màn hướng dẫn đóng gói.
 * BE không biết file GLB — chỉ trả `box.code` và `itemProfiles[].productCategory`.
 * Xem GUIDE_DOC/KE_HOACH_3D_HUONG_DAN_DONG_GOI.md mục 6.
 *
 * Không dùng các file của trang giới thiệu (shirt.glb, trousers.glb, backpack.glb,
 * hat.glb, glasses.glb) ở đây.
 */

/** Thùng mẫu seed (`SAMPLE-*`). Mã khác → vẽ thùng bằng code theo `innerMm`. */
export const BOX_MODELS: Record<string, string> = {
  'SAMPLE-S': '/models/sampleS.glb',
  'SAMPLE-M': '/models/sampleM.glb',
  'SAMPLE-L': '/models/sampleL.glb',
  'SAMPLE-LT': '/models/sampleLT.glb',
}

/**
 * garment: hàng mềm, có clip gấp áo + cho vào túi zip; kéo giãn từng trục cho khít khối.
 * rigid: hàng cứng (hộp giày), thu phóng đều, không méo.
 */
export type ItemModelKind = 'garment' | 'rigid'

export type ItemModel = { path: string; kind: ItemModelKind }

export const ITEM_MODELS: Record<string, ItemModel> = {
  shirt: { path: '/models/polo.glb', kind: 'garment' },
  t_shirt: { path: '/models/tshirt.glb', kind: 'garment' },
  trousers: { path: '/models/pants.glb', kind: 'garment' },
  shorts: { path: '/models/shorts.glb', kind: 'garment' },
  dress: { path: '/models/dress.glb', kind: 'garment' },
  jacket: { path: '/models/bomber.glb', kind: 'garment' },
  shoes: { path: '/models/shoepack.glb', kind: 'rigid' },
}

/**
 * Node có trong file quần áo nhưng không được hiện trong thùng:
 * bàn tay, túi nilon PE + băng keo, nhãn vận chuyển (OptiPack đóng thùng carton).
 */
export const GARMENT_HIDDEN_NODES = new Set([
  'hand_press',
  'nilon_bag',
  'nilon_flap',
  'tape_doc',
  'tape_ngang',
  'shipping_label',
  'label_barcode',
])

/** Túi zip — chỉ hiện khi hồ sơ SKU có `zipBagCode`. */
export const ZIPBAG_ROOT_NODE = 'zipbag_bottom'

/** Màu khối cho loại hàng không có file (dép, phụ kiện, khác) hoặc file lỗi. */
const CATEGORY_COLORS: Record<string, string> = {
  shirt: '#60a5fa',
  t_shirt: '#93c5fd',
  trousers: '#6366f1',
  shorts: '#a78bfa',
  dress: '#f472b6',
  jacket: '#64748b',
  shoes: '#d97706',
  sandals: '#c08457',
  accessory: '#8b5cf6',
  other: '#94a3b8',
}

export function itemModelFor(category: string | null | undefined): ItemModel | null {
  if (!category) return null
  return ITEM_MODELS[category] ?? null
}

export function boxModelFor(code: string): string | null {
  return BOX_MODELS[code] ?? null
}

export function categoryColor(category: string | null | undefined): string {
  return (category ? CATEGORY_COLORS[category] : undefined) ?? '#94a3b8'
}

const CATEGORY_LABELS: Record<string, { vi: string; en: string }> = {
  shirt: { vi: 'Áo sơ mi / polo', en: 'Shirt / polo' },
  t_shirt: { vi: 'Áo thun', en: 'T-shirt' },
  trousers: { vi: 'Quần dài', en: 'Trousers' },
  shorts: { vi: 'Quần short', en: 'Shorts' },
  dress: { vi: 'Váy / đầm', en: 'Dress' },
  jacket: { vi: 'Áo khoác', en: 'Jacket' },
  shoes: { vi: 'Giày (hộp)', en: 'Shoes (box)' },
  sandals: { vi: 'Dép / sandal', en: 'Sandals' },
  accessory: { vi: 'Phụ kiện', en: 'Accessory' },
  other: { vi: 'Khác', en: 'Other' },
}

export function categoryLabel(category: string | null | undefined, vi: boolean): string {
  const row = category ? CATEGORY_LABELS[category] : undefined
  if (!row) return vi ? 'Chưa rõ loại' : 'Unknown type'
  return vi ? row.vi : row.en
}
