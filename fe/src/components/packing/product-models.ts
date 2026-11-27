/**
 * Bảng chọn file 3D cho màn hướng dẫn đóng gói.
 * BE không biết file GLB — chỉ trả `box.code` và `itemProfiles[].productCategory`.
 * Xem GUIDE_DOC/KE_HOACH_3D_HUONG_DAN_DONG_GOI.md mục 6.
 *
 * Không dùng các file của trang giới thiệu (shirt.glb, trousers.glb, backpack.glb,
 * hat.glb, glasses.glb) ở đây.
 */

import type { PackingItemProfile } from '../../types/packing-plan'
import type { PrimitiveSpec } from './scene/primitives'

/** Thùng seed (`CTN-*`). Mã khác → vẽ thùng bằng code theo `innerMm`. */
export const BOX_MODELS: Record<string, string> = {
  'CTN-003': '/models/sampleS.glb', // AOFP-346: mã cũ BOX-S
  'CTN-009': '/models/sampleM.glb', // BOX-M
  'CTN-011': '/models/sampleL.glb', // BOX-L
  'CTN-010': '/models/sampleLT.glb', // BOX-LT
}

/**
 * garment: hàng mềm, có clip gấp áo + cho vào túi zip; kéo giãn từng trục cho khít khối.
 * rigid: hàng cứng (hộp giày, túi xách), thu phóng đều, không méo.
 * prepClip: clip trong file là thao tác nhân viên phải làm (túi xách: nhồi giấy, túi chống bụi).
 * Giày: bước đóng hộp bật theo yêu cầu trình diễn (04/11/2026). PACKAGING_STANDARD mục 5.1 giữ nguyên hộp gốc,
 * nên hướng dẫn này lệch quy chuẩn; muốn theo đúng quy chuẩn thì bỏ prepStep của giày.
 * Phụ kiện (kính): bước 'caseIn' — gập càng, cho kính vào hộp kính rồi đóng nắp (26/11/2026).
 */
export type ItemModelKind = 'garment' | 'rigid'

export type ItemModel = {
  path: string
  kind: ItemModelKind
  prepStep?: 'bagPrep' | 'shoeBox' | 'caseIn'
  /** AOFP-352 — dựng bằng code thay cho file GLB. */
  primitive?: PrimitiveSpec
  /** AOFP-352 — giãn từng trục theo placement.orientation (mô hình riêng / hình cơ bản). */
  stretch?: boolean
  /** Đợt 2 — file áo trải phẳng, bước gập dựng bằng shader (nhãn "Bước gập tự tạo"). */
  autoFold?: boolean
}

export const ITEM_MODELS: Record<string, ItemModel> = {
  shirt: { path: '/models/somi.glb', kind: 'garment' },
  t_shirt: { path: '/models/tshirt.glb', kind: 'garment' },
  trousers: { path: '/models/pants.glb', kind: 'garment' },
  shorts: { path: '/models/shorts.glb', kind: 'garment' },
  dress: { path: '/models/dress.glb', kind: 'garment' },
  jacket: { path: '/models/bomber.glb', kind: 'garment' },
  shoes: { path: '/models/shoepack.glb', kind: 'rigid', prepStep: 'shoeBox' },
  bag: { path: '/models/handbag.glb', kind: 'rigid', prepStep: 'bagPrep' },
  // Kính + hộp kính (clip PackGlasses): cho kính vào hộp, đóng nắp,
  // rồi bọc xốp hơi + dán băng keo trước khi đặt vào thùng.
  accessory: { path: '/models/materials/accessory_case.glb', kind: 'rigid', prepStep: 'caseIn' },
}

/**
 * Model vật tư chèn (tự dựng bằng Blender: `fe/blender/make_packing_materials.py`). Khóa là loại vật tư BE trả ở
 * `materials[].type`. Mét, trục Y hướng lên, đáy ở y = 0 — cảnh 3D tự thu phóng theo chỗ đặt.
 */
export const MATERIAL_MODELS: Record<string, string> = {
  bubble_wrap: '/models/materials/bubble_wrap.glb',
  air_pillow: '/models/materials/air_pillow.glb',
  fragile_tape: '/models/materials/fragile_label.glb',
  foam_corner: '/models/materials/foam_corner.glb',
  corrugated_divider: '/models/materials/corrugated_divider.glb',
  kraft_paper: '/models/materials/kraft_paper.glb',
  tissue_paper: '/models/materials/tissue_paper.glb',
}

/** Cuộn băng keo dán thùng (không nằm trong danh mục vật tư của BE). */
export const TAPE_ROLL_MODEL = '/models/materials/tape_roll.glb'

/** Túi niêm phong (`box.kind = 'mailer'`): trải phẳng → phồng → dán nắp → dán tem. */
export const MAILER_MODEL = '/models/mailer.glb'

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
  bag: '#b45309',
  shoes: '#d97706',
  sandals: '#c08457',
  accessory: '#8b5cf6',
  other: '#94a3b8',
}

export function itemModelFor(category: string | null | undefined): ItemModel | null {
  if (!category) return null
  return ITEM_MODELS[category] ?? null
}

/**
 * AOFP-352 — mô hình của một SKU trong kế hoạch: theo ảnh chụp `model`; kế hoạch cũ không có thì theo loại.
 * Bước chuẩn bị (clip trong file) chỉ có ở mô hình theo loại. Mô hình theo loại giữ cách khớp cũ.
 */
export function resolveItemModel(profile: Pick<PackingItemProfile, 'productCategory' | 'model'> | undefined): ItemModel | null {
  const byCategory = itemModelFor(profile?.productCategory)
  const snap = profile?.model
  if (!snap) return byCategory
  if (snap.source === 'primitive') {
    return snap.primitive ? { path: '', kind: 'rigid', primitive: snap.primitive, stretch: true } : null
  }
  if (!snap.url) return byCategory
  if (snap.source === 'category') return { kind: snap.kind, prepStep: byCategory?.prepStep, path: snap.url }
  if (snap.auto_fold) return { path: snap.url, kind: 'garment', autoFold: true }
  return { path: snap.url, kind: snap.kind, stretch: snap.kind === 'rigid' }
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
  bag: { vi: 'Túi xách', en: 'Bag' },
  shoes: { vi: 'Giày (hộp)', en: 'Shoes (box)' },
  sandals: { vi: 'Dép / sandal', en: 'Sandals' },
  accessory: { vi: 'Phụ kiện', en: 'Accessory' },
  other: { vi: 'Khác', en: 'Other' },
}

/** Mọi loại sản phẩm (khớp ProductCategory ở BE) — dùng cho bộ lọc. */
export const PRODUCT_CATEGORY_KEYS = Object.keys(CATEGORY_LABELS)

export function categoryLabel(category: string | null | undefined, vi: boolean): string {
  const row = category ? CATEGORY_LABELS[category] : undefined
  if (!row) return vi ? 'Chưa rõ loại' : 'Unknown type'
  return vi ? row.vi : row.en
}
