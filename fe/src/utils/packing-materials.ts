import type { PackingItemProfile, PackingMm, PackingPlacement } from '../types/packing-plan'
import { itemModelFor } from '../components/packing/product-models'
import { MM, placementToThree, type Vec3 } from './packing-layout'

/**
 * Hàm thuần cho phần vẽ vật tư chèn trong cảnh 3D (xốp hơi, gối hơi, tem…): nhận biết loại vật tư,
 * tìm chỗ trống trong thùng để lấp, tìm chỗ đặt vách ngăn. Không phụ thuộc three nên kiểm thử được.
 */

export type MaterialKind =
  | 'bubble_wrap'
  | 'air_pillow'
  | 'fragile_tape'
  | 'foam_corner'
  | 'corrugated_divider'
  | 'kraft_paper'
  | 'tissue_paper'

type MaterialRow = { name: string; quantity: number; code?: string | null }

const BY_CODE: Record<string, MaterialKind> = {
  BUBBLE_WRAP: 'bubble_wrap',
  AIR_PILLOW: 'air_pillow',
  FRAGILE_TAPE: 'fragile_tape',
  FOAM_CORNER: 'foam_corner',
  DIVIDER: 'corrugated_divider',
  CORRUGATED_DIVIDER: 'corrugated_divider',
  KRAFT_PAPER: 'kraft_paper',
  TISSUE_PAPER: 'tissue_paper',
}

/** Đoán loại vật tư từ mã (ưu tiên) rồi tên tiếng Việt — API chỉ trả mã và tên, không trả loại. */
export function materialKindOf(row: MaterialRow): MaterialKind | null {
  const code = (row.code ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  const byCode = BY_CODE[code]
  if (byCode) return byCode
  const name = row.name.toLowerCase()
  if (name.includes('xốp hơi')) return 'bubble_wrap'
  if (name.includes('gối hơi') || name.includes('túi khí')) return 'air_pillow'
  if (name.includes('tem')) return 'fragile_tape'
  if (name.includes('góc xốp')) return 'foam_corner'
  if (name.includes('ngăn') || name.includes('vách')) return 'corrugated_divider'
  if (name.includes('kraft')) return 'kraft_paper'
  if (name.includes('pelure') || name.includes('giấy lót') || name.includes('tissue')) return 'tissue_paper'
  return null
}

export function materialCounts(materials: MaterialRow[] | undefined): Map<MaterialKind, number> {
  const counts = new Map<MaterialKind, number>()
  for (const row of materials ?? []) {
    const kind = materialKindOf(row)
    if (kind) counts.set(kind, (counts.get(kind) ?? 0) + Math.max(1, Math.round(row.quantity)))
  }
  return counts
}

/**
 * Món bọc xốp hơi khi kiện có xốp hơi: phụ kiện và loại hàng không có mô hình riêng (dép, khác).
 * Quần áo, giày (đã có hộp) và túi xách (đã có túi chống bụi) không bọc thêm.
 */
export function needsBubbleSleeve(profile: PackingItemProfile | undefined, hasBubbleWrap: boolean): boolean {
  if (!hasBubbleWrap) return false
  const category = profile?.productCategory
  return category === 'accessory' || itemModelFor(category) === null
}

export type GapCell = { center: Vec3; size: [number, number] }

/**
 * Các ô trống trên sàn thùng (không món nào chiếm theo mặt bằng), từ lớn tới nhỏ, để lấp gối hơi / giấy vò.
 * Toạ độ như `placementToThree`: gốc = tâm đáy lòng thùng, y = mặt sàn.
 */
export function freeFloorCells(
  placements: PackingPlacement[],
  inner: PackingMm,
  cellMm: { length: number; width: number },
): GapCell[] {
  const nx = Math.max(1, Math.floor(inner.lengthMm / cellMm.length))
  const ny = Math.max(1, Math.floor(inner.widthMm / cellMm.width))
  const cw = inner.lengthMm / nx
  const cd = inner.widthMm / ny
  const cells: GapCell[] = []
  for (let ix = 0; ix < nx; ix += 1) {
    for (let iy = 0; iy < ny; iy += 1) {
      const x0 = ix * cw
      const y0 = iy * cd
      const taken = placements.some(
        (p) => p.x < x0 + cw - 1 && p.x + p.dx > x0 + 1 && p.y < y0 + cd - 1 && p.y + p.dy > y0 + 1,
      )
      if (taken) continue
      cells.push({
        center: [(x0 + cw / 2 - inner.lengthMm / 2) * MM, 0, (y0 + cd / 2 - inner.widthMm / 2) * MM],
        size: [cw * MM, cd * MM],
      })
    }
  }
  // Ô gần giữa trước: gối hơi thường lấp phần giữa các món.
  return cells.sort(
    (a, b) => Math.hypot(a.center[0], a.center[2]) - Math.hypot(b.center[0], b.center[2]),
  )
}

export type DividerSpot = {
  position: Vec3
  /** Cạnh phẳng của tấm: [rộng theo x, cao theo y, sâu theo z] (m). */
  size: Vec3
  /** Trục vuông góc với tấm: 'x' = tấm đứng giữa 2 món cạnh nhau theo x, 'y' = thẳng đứng theo z, 'h' = nằm ngang. */
  facing: 'x' | 'z' | 'h'
}

/** Vị trí vách ngăn: nằm giữa 2 món đầu tiên (theo trục mà 2 món tách nhau). Ít hơn 2 món thì không cần. */
export function dividerSpot(placements: PackingPlacement[], inner: PackingMm): DividerSpot | null {
  const [a, b] = placements;
  if (!a || !b) return null
  const gap = {
    x: Math.max(a.x, b.x) - Math.min(a.x + a.dx, b.x + b.dx),
    y: Math.max(a.y, b.y) - Math.min(a.y + a.dy, b.y + b.dy),
    z: Math.max(a.z, b.z) - Math.min(a.z + a.dz, b.z + b.dz),
  }
  const axis = (['x', 'y', 'z'] as const).reduce((best, k) => (gap[k] > gap[best] ? k : best), 'x' as 'x' | 'y' | 'z')
  if (gap[axis] < 0) return null
  const sa = placementToThree(a, inner)
  const sb = placementToThree(b, inner)
  const top = Math.max(a.z + a.dz, b.z + b.dz) * MM
  const mid = (u: number, v: number): number => (u + v) / 2
  if (axis === 'x') {
    const left = sa.center[0] < sb.center[0] ? sa : sb
    const right = left === sa ? sb : sa
    return {
      position: [mid(left.center[0] + left.size[0] / 2, right.center[0] - right.size[0] / 2), top / 2, 0],
      size: [0.004, top, inner.widthMm * MM],
      facing: 'x',
    }
  }
  if (axis === 'y') {
    const near = sa.center[2] < sb.center[2] ? sa : sb
    const far = near === sa ? sb : sa
    return {
      position: [0, top / 2, mid(near.center[2] + near.size[2] / 2, far.center[2] - far.size[2] / 2)],
      size: [inner.lengthMm * MM, top, 0.004],
      facing: 'z',
    }
  }
  const low = sa.center[1] < sb.center[1] ? sa : sb
  const high = low === sa ? sb : sa
  return {
    position: [0, mid(low.center[1] + low.size[1] / 2, high.center[1] - high.size[1] / 2), 0],
    size: [inner.lengthMm * MM, 0.004, inner.widthMm * MM],
    facing: 'h',
  }
}
