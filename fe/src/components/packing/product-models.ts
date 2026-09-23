import { useGLTF } from '@react-three/drei'
import type { ProductCategory } from '../../types/packaging'

/**
 * Hình 3D đại diện theo loại sản phẩm (21/09/2026). Nguồn + giấy phép:
 * public/models/CREDITS.md. Loại không có hình → khối hộp.
 *
 * 🔄 ĐÃ ĐỔI (22/09/2026):
 *  - Bỏ `jeans.glb` — thực chất là xe Jeep "Mom's Wrangler", bị nhận nhầm
 *    là quần jean vì chỉ dựa vào tên. Quần dài/quần đùi giờ vẽ bằng code
 *    (`FoldedPants3D`), không phụ thuộc file.
 *  - `stretch`: hàng mềm (gói vải gấp) kéo giãn theo từng trục cho khít khối
 *    engine tính; hàng cứng (giày, sandal, kính) giữ tỷ lệ để không méo.
 */
export type ModelSpec =
  | { kind: 'glb'; url: string; tint?: string; stretch: boolean }
  | { kind: 'pants'; color: string }

const CATEGORY_MODELS: Partial<Record<ProductCategory, ModelSpec>> = {
  t_shirt: { kind: 'glb', url: '/models/tshirt-folded.glb', stretch: true },
  // Chưa có mô hình sơ mi gấp có giấy phép — dùng áo gấp, đổi màu.
  shirt: { kind: 'glb', url: '/models/tshirt-folded.glb', tint: '#bfdbfe', stretch: true },
  jacket: { kind: 'glb', url: '/models/jacket.glb', stretch: true },
  trousers: { kind: 'pants', color: '#3b5b8c' },
  shorts: { kind: 'pants', color: '#b89b6a' },
  shoes: { kind: 'glb', url: '/models/shoes.glb', stretch: false },
  sandals: { kind: 'glb', url: '/models/sandal.glb', stretch: false },
  accessory: { kind: 'glb', url: '/models/sunglasses.glb', stretch: false },
}

export function modelForCategory(category: ProductCategory | null | undefined): ModelSpec | null {
  return category ? (CATEGORY_MODELS[category] ?? null) : null
}

export function preloadCategoryModels(): void {
  const urls = Object.values(CATEGORY_MODELS).flatMap((m) => (m.kind === 'glb' ? [m.url] : []))
  for (const url of new Set(urls)) useGLTF.preload(url)
}
