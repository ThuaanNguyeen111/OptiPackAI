import type { ItemPlan, PackActionKind } from '../timeline'
import { shapeFor, type FoldOp } from './shapes'

/**
 * Mô phỏng vải + túi zip cho 1 món đang thao tác (05/10/2026).
 *
 * Hai lớp:
 *  1. Động học có dẫn hướng (`PackageModel`): mỗi thao tác gấp cuộn một phần
 *     vải quanh trục bản lề (mô hình cuộn trụ: lớp dưới thành lớp ngoài, nếp
 *     gấp tròn theo độ dày chồng vải). Cho ra vị trí "đích" của từng hạt theo
 *     tiến độ thao tác — lần nào gấp cũng ra cùng một hình, lùi bước dựng lại được.
 *  2. Vật lý Verlet (`ClothSim`): hạt có quán tính, trọng lực, ràng buộc giãn/cắt/uốn
 *     và lực kéo về vị trí đích → vải rủ mềm, trễ nhẹ theo chuyển động, nếp gấp tự bo.
 *
 * Đơn vị mét, toạ độ trên mặt thảm gấp (y = 0 là mặt thảm).
 */

export type Sheet = {
  /** Vị trí trải phẳng (x, y, z) của từng hạt. */
  rest: Float32Array
  uv: Float32Array
  index: Uint32Array
  edges: Uint32Array
  restLen: Float32Array
  count: number
}

/** Lưới hạt trên một hình (mặt nạ `inside`), chỉ giữ ô có đủ 4 góc nằm trong hình. */
export function buildSheet(
  bounds: [number, number, number, number],
  inside: (x: number, z: number) => boolean,
  cols: number,
  rows: number,
  y: number,
): Sheet {
  const [x0, x1, z0, z1] = bounds
  const vid = new Int32Array((cols + 1) * (rows + 1)).fill(-1)
  const id = (c: number, r: number) => r * (cols + 1) + c
  const px = (c: number) => x0 + ((x1 - x0) * c) / cols
  const pz = (r: number) => z0 + ((z1 - z0) * r) / rows
  const keepCell: boolean[] = []
  for (let r = 0; r < rows; r += 1)
    for (let c = 0; c < cols; c += 1) {
      const cx = (px(c) + px(c + 1)) / 2
      const cz = (pz(r) + pz(r + 1)) / 2
      keepCell.push(inside(cx, cz))
    }
  const pos: number[] = []
  const uv: number[] = []
  const vertexAt = (c: number, r: number): number => {
    const k = id(c, r)
    if (vid[k] === -1) {
      vid[k] = pos.length / 3
      pos.push(px(c), y, pz(r))
      uv.push(c / cols, r / rows)
    }
    return vid[k] ?? 0
  }
  const index: number[] = []
  const edgeSet = new Set<string>()
  const edges: number[] = []
  const addEdge = (a: number, b: number) => {
    const key = a < b ? `${String(a)}_${String(b)}` : `${String(b)}_${String(a)}`
    if (edgeSet.has(key)) return
    edgeSet.add(key)
    edges.push(a, b)
  }
  for (let r = 0; r < rows; r += 1)
    for (let c = 0; c < cols; c += 1) {
      if (!keepCell[r * cols + c]) continue
      const a = vertexAt(c, r)
      const b = vertexAt(c + 1, r)
      const d = vertexAt(c + 1, r + 1)
      const e = vertexAt(c, r + 1)
      index.push(a, d, b, a, e, d)
      addEdge(a, b)
      addEdge(b, d)
      addEdge(d, e)
      addEdge(e, a)
      addEdge(a, d)
      addEdge(b, e)
    }
  // Ràng buộc uốn: nối cách một hạt theo hàng và cột
  for (let r = 0; r <= rows; r += 1)
    for (let c = 0; c <= cols; c += 1) {
      const a = vid[id(c, r)] ?? -1
      if (a < 0) continue
      if (c + 2 <= cols) {
        const m = vid[id(c + 1, r)] ?? -1
        const b = vid[id(c + 2, r)] ?? -1
        if (m >= 0 && b >= 0) addEdge(a, b)
      }
      if (r + 2 <= rows) {
        const m = vid[id(c, r + 1)] ?? -1
        const b = vid[id(c, r + 2)] ?? -1
        if (m >= 0 && b >= 0) addEdge(a, b)
      }
    }
  smoothBoundary(pos, index, 4)
  const rest = new Float32Array(pos)
  const restLen = new Float32Array(edges.length / 2)
  for (let i = 0; i < restLen.length; i += 1) {
    const a = (edges[i * 2] ?? 0) * 3
    const b = (edges[i * 2 + 1] ?? 0) * 3
    restLen[i] = Math.hypot((rest[a] ?? 0) - (rest[b] ?? 0), (rest[a + 1] ?? 0) - (rest[b + 1] ?? 0), (rest[a + 2] ?? 0) - (rest[b + 2] ?? 0))
  }
  return {
    rest,
    uv: new Float32Array(uv),
    index: new Uint32Array(index),
    edges: new Uint32Array(edges),
    restLen,
    count: rest.length / 3,
  }
}

/**
 * Làm mượt mép hình: lưới vuông cắt theo mặt nạ cho mép răng cưa, nên kéo mỗi
 * đỉnh trên mép về trung điểm của 2 đỉnh kề trên mép (Laplacian 1 chiều).
 */
function smoothBoundary(pos: number[], index: number[], iterations: number): void {
  const count = new Map<string, number>()
  const key = (a: number, b: number) => (a < b ? `${String(a)}_${String(b)}` : `${String(b)}_${String(a)}`)
  for (let t = 0; t < index.length; t += 3) {
    const tri = [index[t] ?? 0, index[t + 1] ?? 0, index[t + 2] ?? 0]
    for (let e = 0; e < 3; e += 1) {
      const k = key(tri[e] ?? 0, tri[(e + 1) % 3] ?? 0)
      count.set(k, (count.get(k) ?? 0) + 1)
    }
  }
  const neighbours = new Map<number, number[]>()
  for (const [k, n] of count) {
    if (n !== 1) continue
    const [a, b] = k.split('_').map(Number) as [number, number]
    neighbours.set(a, [...(neighbours.get(a) ?? []), b])
    neighbours.set(b, [...(neighbours.get(b) ?? []), a])
  }
  for (let it = 0; it < iterations; it += 1) {
    const next = new Map<number, [number, number]>()
    for (const [v, nb] of neighbours) {
      if (nb.length !== 2) continue
      const [a, b] = nb as [number, number]
      const x = ((pos[a * 3] ?? 0) + (pos[b * 3] ?? 0)) / 2
      const z = ((pos[a * 3 + 2] ?? 0) + (pos[b * 3 + 2] ?? 0)) / 2
      next.set(v, [(pos[v * 3] ?? 0) * 0.5 + x * 0.5, (pos[v * 3 + 2] ?? 0) * 0.5 + z * 0.5])
    }
    for (const [v, [x, z]] of next) {
      pos[v * 3] = x
      pos[v * 3 + 2] = z
    }
  }
}

/** Kích thước gói vải sau khi gấp xong (trước khi vào túi): lùi từ ô trong thùng. */
export function garmentFootprint(item: ItemPlan, kinds: PackActionKind[]): { fx: number; fz: number } {
  let fx = item.placement.dx / 1000
  let fz = item.placement.dy / 1000
  if (kinds.includes('fold_half')) fx *= 2
  if (kinds.includes('bag_fold')) fz *= 2
  if (item.bagged) {
    fx *= 0.86
    fz *= 0.86
  }
  // Giữ kích thước trải phẳng giống đồ thật (áo dài ~70 cm): ô trong thùng lớn
  // hoặc nhiều lần gập có thể đẩy hình trải ra quá to. Thu nhỏ đều; bước đặt vào
  // thùng sẽ co gói cho khít đúng ô.
  if (item.shape) {
    const [x0, x1, z0, z1] = shapeFor(item.shape, fx, fz).bounds
    const s = Math.min(1, MAX_FLAT_W / (x1 - x0), MAX_FLAT_D / (z1 - z0))
    fx *= s
    fz *= s
  }
  return { fx, fz }
}

const MAX_FLAT_W = 0.62
const MAX_FLAT_D = 0.72

/** Khung bao khi trải phẳng (để đặt thảm gấp đủ rộng). */
export function garmentFlatSize(item: ItemPlan, kinds: PackActionKind[]): { w: number; d: number } {
  if (!item.shape) return { w: item.placement.dx / 1000, d: item.placement.dy / 1000 }
  const { fx, fz } = garmentFootprint(item, kinds)
  const [x0, x1, z0, z1] = shapeFor(item.shape, fx, fz).bounds
  return { w: x1 - x0, d: z1 - z0 }
}

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))

type Box = { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number }

function bbox(p: Float32Array, from: number, to: number): Box {
  const b: Box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, maxY: 0 }
  for (let i = from; i < to; i += 1) {
    const x = p[i * 3] ?? 0
    const y = p[i * 3 + 1] ?? 0
    const z = p[i * 3 + 2] ?? 0
    if (x < b.minX) b.minX = x
    if (x > b.maxX) b.maxX = x
    if (z < b.minZ) b.minZ = z
    if (z > b.maxZ) b.maxZ = z
    if (y > b.maxY) b.maxY = y
  }
  return b
}

/** Cuộn phần vải bên kia đường gấp quanh trục, góc `theta` (0..π). */
function foldInto(src: Float32Array, dst: Float32Array, upTo: number, op: FoldOp, theta: number, layer: number): void {
  dst.set(src)
  if (theta <= 0) return
  const ci = op.axis === 'x' ? 0 : 2
  // Phần lật nằm lên trên phần đứng yên: điểm thấp nhất của phần lật (e lớn nhất)
  // phải chạm đỉnh phần đứng yên + 1 lớp → bán kính cuộn R = (đỉnh dưới + lớp + e_max)/2.
  // Chỉ xét phần đứng yên nằm trong vùng phần lật sẽ đáp xuống (không lấy đỉnh toàn chồng).
  let flipTop = 0
  let reach = 0
  for (let i = 0; i < upTo; i += 1) {
    const c = src[i * 3 + ci] ?? 0
    const d = op.side === -1 ? op.at - c : c - op.at
    if (d > 0) {
      flipTop = Math.max(flipTop, src[i * 3 + 1] ?? 0)
      reach = Math.max(reach, d)
    }
  }
  let restTop = 0
  for (let i = 0; i < upTo; i += 1) {
    const c = src[i * 3 + ci] ?? 0
    const d = op.side === -1 ? op.at - c : c - op.at
    if (d <= 0 && -d <= reach) restTop = Math.max(restTop, src[i * 3 + 1] ?? 0)
  }
  const R = (restTop + layer + 0.001 + flipTop) / 2
  const cosT = Math.cos(theta)
  const sinT = Math.sin(theta)
  for (let i = 0; i < upTo; i += 1) {
    const c = src[i * 3 + ci] ?? 0
    const d = op.side === -1 ? op.at - c : c - op.at
    if (d <= 0) continue
    const e = src[i * 3 + 1] ?? 0
    const re = Math.max(R - e, layer * 0.5)
    let dist: number
    let y: number
    if (d <= re * theta) {
      const phi = d / re
      dist = re * Math.sin(phi)
      y = R - re * Math.cos(phi)
    } else {
      const ax = re * sinT
      const ay = R - re * cosT
      const s = d - re * theta
      dist = ax + s * cosT
      y = ay + s * sinT
    }
    dst[i * 3 + ci] = op.side === -1 ? op.at - dist : op.at + dist
    dst[i * 3 + 1] = y
  }
}

type Phase = {
  kind: PackActionKind
  ops: FoldOp[]
}

const BAG_COLS = 18
const BAG_ROWS = 12
const MOUTH_OPEN = 0.014

export type BagInfo = { minX: number; maxX: number; minZ: number; edgeZ: number; mouthDepth: number; topY: number }

/**
 * Hình học của món đang gói: vải (+ 2 lớp túi nếu có), các pha thao tác theo
 * đúng thứ tự trong dòng thời gian, và vị trí cuối mỗi pha (đã tính sẵn).
 */
export class PackageModel {
  readonly garment: Sheet
  readonly bagBottom: Sheet | null
  readonly bagTop: Sheet | null
  readonly count: number
  readonly garmentCount: number
  readonly layer: number
  readonly phases: Phase[]
  /** ends[k] = vị trí sau pha k; start = trước pha đầu. */
  private readonly start: Float32Array
  private readonly ends: Float32Array[] = []
  private readonly bagFrom: number
  bag: BagInfo | null = null
  private bagRest: Float32Array | null = null
  private bagLift = 0

  constructor(item: ItemPlan, kinds: PackActionKind[]) {
    const shapeName = item.shape ?? 'tee'
    const { fx, fz } = garmentFootprint(item, kinds)
    const p = item.placement
    const spec = shapeFor(shapeName, fx, fz)
    // Mỗi lần gấp chồng dày gấp đôi → độ dày 1 lớp ≈ độ cao ô ÷ 2^(số lần gấp).
    const folds = spec.sides.length + spec.body.length + (kinds.includes('fold_half') ? 1 : 0) + (kinds.includes('bag_fold') ? 1 : 0)
    this.layer = Math.min(Math.max(p.dz / 1000 / 2 ** folds, 0.0008), 0.005)
    const [x0, x1, z0, z1] = spec.bounds
    const aspect = (x1 - x0) / (z1 - z0)
    const cols = Math.max(14, Math.round(38 * Math.sqrt(aspect)))
    const rows = Math.max(14, Math.round(38 / Math.sqrt(aspect)))
    this.garment = buildSheet(spec.bounds, spec.inside, cols, rows, this.layer / 2)
    this.garmentCount = this.garment.count
    if (item.bagged) {
      const unit: [number, number, number, number] = [-0.5, 0.5, -0.5, 0.5]
      this.bagBottom = buildSheet(unit, () => true, BAG_COLS, BAG_ROWS, 0)
      this.bagTop = buildSheet(unit, () => true, BAG_COLS, BAG_ROWS, 0)
    } else {
      this.bagBottom = null
      this.bagTop = null
    }
    const bagCount = this.bagBottom ? this.bagBottom.count * 2 : 0
    this.count = this.garmentCount + bagCount
    this.bagFrom = this.garmentCount

    this.phases = kinds.map((kind) => ({
      kind,
      ops: kind === 'fold_sides' ? spec.sides : kind === 'fold_body' ? spec.body : [],
    }))

    // Trước khi trải: vải còn lơ lửng, hơi gợn; túi để xa, ẩn.
    this.start = new Float32Array(this.count * 3)
    for (let i = 0; i < this.garmentCount; i += 1) {
      const x = this.garment.rest[i * 3] ?? 0
      const z = this.garment.rest[i * 3 + 2] ?? 0
      this.start[i * 3] = x * 0.92
      this.start[i * 3 + 1] = 0.07 + 0.018 * Math.sin(x * 14) * Math.cos(z * 11)
      this.start[i * 3 + 2] = z * 0.92
    }
    for (let i = this.garmentCount; i < this.count; i += 1) this.start[i * 3 + 1] = -5

    let prev = this.start
    for (let k = 0; k < this.phases.length; k += 1) {
      const phase = this.phases[k]
      if (!phase) continue
      if (phase.kind === 'bag_insert') this.prepareBag(prev)
      if (phase.kind === 'bag_fold' || phase.kind === 'fold_half') {
        const upTo = this.visibleCount(k)
        const b = bbox(prev, 0, upTo)
        phase.ops =
          phase.kind === 'bag_fold'
            ? [{ axis: 'z', at: (b.minZ + b.maxZ) / 2, side: -1 }]
            : [{ axis: 'x', at: (b.minX + b.maxX) / 2, side: -1 }]
      }
      const out = new Float32Array(this.count * 3)
      this.apply(k, 1, prev, out)
      this.ends.push(out)
      prev = out
    }
  }

  /** Số hạt đang hiện ở pha k (túi chỉ hiện từ lúc cho vào túi). */
  visibleCount(k: number): number {
    const bagPhase = this.phases.findIndex((p) => p.kind === 'bag_insert')
    return bagPhase >= 0 && k >= bagPhase ? this.count : this.garmentCount
  }

  bagVisible(k: number): boolean {
    const bagPhase = this.phases.findIndex((p) => p.kind === 'bag_insert')
    return bagPhase >= 0 && k >= bagPhase
  }

  private prepareBag(prev: Float32Array): void {
    if (!this.bagBottom || !this.bagTop) return
    const g = bbox(prev, 0, this.garmentCount)
    const mx = (g.maxX - g.minX) * 0.07 + 0.008
    const mz = (g.maxZ - g.minZ) * 0.07 + 0.008
    const minX = g.minX - mx
    const maxX = g.maxX + mx
    const minZ = g.minZ - mz
    const maxZ = g.maxZ + mz
    this.bagLift = this.layer * 0.8
    const topY = g.maxY + this.bagLift + this.layer * 0.7
    const rest = new Float32Array(this.count * 3)
    const n = this.bagBottom.count
    for (let s = 0; s < 2; s += 1) {
      const sheet = s === 0 ? this.bagBottom : this.bagTop
      for (let i = 0; i < n; i += 1) {
        const u = (sheet.rest[i * 3] ?? 0) + 0.5
        const v = (sheet.rest[i * 3 + 2] ?? 0) + 0.5
        const j = (this.bagFrom + s * n + i) * 3
        rest[j] = minX + u * (maxX - minX)
        rest[j + 1] = s === 0 ? 0.0006 : topY
        rest[j + 2] = minZ + v * (maxZ - minZ)
      }
    }
    this.bagRest = rest
    // Lưới túi dựng theo ô đơn vị → tính lại chiều dài cạnh theo kích thước túi thật,
    // không thì mô phỏng kéo túi giãn ra 1 m và "nổ".
    for (let s = 0; s < 2; s += 1) {
      const sheet = s === 0 ? this.bagBottom : this.bagTop
      const base = this.bagFrom + s * n
      for (let e = 0; e < sheet.restLen.length; e += 1) {
        const a = (base + (sheet.edges[e * 2] ?? 0)) * 3
        const b = (base + (sheet.edges[e * 2 + 1] ?? 0)) * 3
        sheet.restLen[e] = Math.hypot((rest[a] ?? 0) - (rest[b] ?? 0), (rest[a + 2] ?? 0) - (rest[b + 2] ?? 0))
      }
    }
    this.bag = { minX, maxX, minZ, edgeZ: maxZ, mouthDepth: (maxZ - minZ) * 0.22, topY }
  }

  /** Vị trí ở pha k, tiến độ t (0..1). */
  targetsAt(k: number, t: number, out: Float32Array): void {
    if (k < 0) {
      out.set(this.start)
      return
    }
    const from = k === 0 ? this.start : (this.ends[k - 1] ?? this.start)
    this.apply(k, t, from, out)
  }

  /** Vị trí sau khi xong pha cuối (đem đi đặt vào thùng). */
  final(): Float32Array {
    return this.ends[this.ends.length - 1] ?? this.start
  }

  private apply(k: number, rawT: number, from: Float32Array, out: Float32Array): void {
    const phase = this.phases[k]
    if (!phase) {
      out.set(from)
      return
    }
    const t = ease(rawT)
    const upTo = this.visibleCount(k)
    switch (phase.kind) {
      case 'lay_flat': {
        out.set(from)
        for (let i = 0; i < this.garmentCount; i += 1) {
          for (let a = 0; a < 3; a += 1) {
            const s = from[i * 3 + a] ?? 0
            const r = this.garment.rest[i * 3 + a] ?? 0
            // Rơi xuống trước rồi mới duỗi ra: trục y nhanh hơn x/z.
            const ta = a === 1 ? ease(Math.min(1, rawT * 1.4)) : t
            out[i * 3 + a] = s + (r - s) * ta
          }
        }
        return
      }
      case 'fold_sides':
      case 'fold_body':
      case 'bag_fold':
      case 'fold_half': {
        const ops = phase.ops
        if (ops.length === 0) {
          out.set(from)
          return
        }
        let cur = from
        for (let o = 0; o < ops.length; o += 1) {
          const op = ops[o]
          const local = Math.min(1, Math.max(0, rawT * ops.length - o))
          if (!op || local <= 0) break
          const dst = new Float32Array(from.length)
          foldInto(cur, dst, upTo, op, Math.PI * ease(local), this.layer)
          cur = dst
          if (local < 1) break
        }
        out.set(cur)
        return
      }
      case 'bag_insert': {
        out.set(from)
        const rest = this.bagRest
        if (!rest || !this.bag) return
        for (let i = 0; i < this.garmentCount; i += 1) out[i * 3 + 1] = (from[i * 3 + 1] ?? 0) + this.bagLift * t
        const slide = (this.bag.edgeZ - this.bag.minZ + 0.06) * (1 - t)
        const topFrom = this.bagFrom + (this.bagBottom?.count ?? 0)
        for (let i = this.bagFrom; i < this.count; i += 1) {
          out[i * 3] = rest[i * 3] ?? 0
          let y = rest[i * 3 + 1] ?? 0
          const z = rest[i * 3 + 2] ?? 0
          if (i >= topFrom) y += this.mouthLift(z, 0, 1)
          out[i * 3 + 1] = y
          out[i * 3 + 2] = z + slide
        }
        return
      }
      case 'bag_seal': {
        out.set(from)
        const rest = this.bagRest
        if (!rest || !this.bag) return
        const topFrom = this.bagFrom + (this.bagBottom?.count ?? 0)
        const span = this.bag.maxX - this.bag.minX
        for (let i = topFrom; i < this.count; i += 1) {
          const x = rest[i * 3] ?? 0
          const z = rest[i * 3 + 2] ?? 0
          const xu = (x - this.bag.minX) / span
          const sealed = Math.min(1, Math.max(0, (rawT * 1.25 - xu) / 0.25))
          out[i * 3 + 1] = (rest[i * 3 + 1] ?? 0) + this.mouthLift(z, sealed, 1)
        }
        return
      }
      default:
        out.set(from)
    }
  }

  /** Miệng túi đang mở: lớp trên phía mép +z nhấc lên, `sealed` = 0 mở → 1 kín. */
  private mouthLift(z: number, sealed: number, open: number): number {
    if (!this.bag) return 0
    const depth = this.bag.mouthDepth
    const k = (z - (this.bag.edgeZ - depth)) / depth
    if (k <= 0) return 0
    return MOUTH_OPEN * open * Math.min(1, k) ** 1.5 * (1 - sealed)
  }

  /** Vị trí con trượt khoá kéo ở pha kéo khoá. */
  sliderX(t: number): number {
    if (!this.bag) return 0
    return this.bag.minX + (this.bag.maxX - this.bag.minX) * Math.min(1, t * 1.25)
  }
}

/** Hạt có quán tính bám theo vị trí đích, giữ chiều dài cạnh, không xuyên mặt thảm. */
export class ClothSim {
  readonly pos: Float32Array
  private readonly prev: Float32Array
  private readonly edges: Uint32Array
  private readonly restLen: Float32Array
  private readonly pull: number
  private readonly floor: number

  constructor(count: number, edges: Uint32Array, restLen: Float32Array, pull: number, floor: number) {
    this.pull = pull
    this.floor = floor
    this.pos = new Float32Array(count * 3)
    this.prev = new Float32Array(count * 3)
    this.edges = edges
    this.restLen = restLen
  }

  reset(targets: Float32Array, offset: number): void {
    const n = this.pos.length
    this.pos.set(targets.subarray(offset * 3, offset * 3 + n))
    this.prev.set(this.pos)
  }

  step(targets: Float32Array, offset: number, dt: number): number {
    const p = this.pos
    const q = this.prev
    const n = p.length / 3
    const g = -0.6 * dt * dt
    const k = 1 - Math.pow(1 - this.pull, dt * 60)
    let motion = 0
    for (let i = 0; i < n; i += 1) {
      for (let a = 0; a < 3; a += 1) {
        const j = i * 3 + a
        const cur = p[j] ?? 0
        const v = (cur - (q[j] ?? 0)) * 0.9
        q[j] = cur
        let next = cur + v + (a === 1 ? g : 0)
        const target = targets[(offset + i) * 3 + a] ?? 0
        next += (target - next) * k
        p[j] = next
        motion += Math.abs(v)
      }
    }
    for (let it = 0; it < 2; it += 1) {
      for (let e = 0; e < this.restLen.length; e += 1) {
        const a = (this.edges[e * 2] ?? 0) * 3
        const b = (this.edges[e * 2 + 1] ?? 0) * 3
        const dx = (p[b] ?? 0) - (p[a] ?? 0)
        const dy = (p[b + 1] ?? 0) - (p[a + 1] ?? 0)
        const dz = (p[b + 2] ?? 0) - (p[a + 2] ?? 0)
        const len = Math.hypot(dx, dy, dz) || 1e-9
        const diff = ((len - (this.restLen[e] ?? 0)) / len) * 0.25
        p[a] = (p[a] ?? 0) + dx * diff
        p[a + 1] = (p[a + 1] ?? 0) + dy * diff
        p[a + 2] = (p[a + 2] ?? 0) + dz * diff
        p[b] = (p[b] ?? 0) - dx * diff
        p[b + 1] = (p[b + 1] ?? 0) - dy * diff
        p[b + 2] = (p[b + 2] ?? 0) - dz * diff
      }
    }
    for (let i = 0; i < n; i += 1) if ((p[i * 3 + 1] ?? 0) < this.floor) p[i * 3 + 1] = this.floor
    return motion / Math.max(1, n)
  }
}
