import {
  AnimationMixer,
  Box3,
  DoubleSide,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SkinnedMesh,
  Vector3,
  type AnimationClip,
  type KeyframeTrack,
  type Material,
  type Object3D,
} from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { GARMENT_HIDDEN_NODES, ZIPBAG_ROOT_NODE, type ItemModelKind } from '../product-models'
import type { Vec3 } from '../../../utils/packing-layout'

/**
 * Lớp thao tác three thuần (không React) cho cảnh hướng dẫn đóng gói.
 * Gói các đối tượng three có trạng thái vào class để component chỉ gọi method.
 */

function trackNode(name: string): string {
  const i = name.lastIndexOf('.')
  return i < 0 ? name : name.slice(0, i)
}

/** Khoảng thời gian track thật sự đổi giá trị; null = track đứng yên. */
function changeRange(track: KeyframeTrack): [number, number] | null {
  const { times, values } = track
  if (times.length < 2) return null
  const n = values.length / times.length
  let first = -1
  let last = -1
  for (let i = 1; i < times.length; i++) {
    let diff = false
    for (let k = 0; k < n; k++) {
      if (Math.abs((values[i * n + k] ?? 0) - (values[(i - 1) * n + k] ?? 0)) > 1e-6) {
        diff = true
        break
      }
    }
    if (diff) {
      if (first < 0) first = times[i - 1] ?? 0
      last = times[i] ?? 0
    }
  }
  return first < 0 ? null : [first, last]
}

export type ClipPhases = {
  /** Gấp áo xong (các xương `fold_*`). */
  foldEnd: number
  /** Đã vào túi zip, kéo khoá xong — trước khi túi nilon xuất hiện. */
  bagEnd: number
  /** Thời điểm cuối cùng có thay đổi trong clip. */
  end: number
}

/**
 * Đọc mốc từ clip có sẵn trong file:
 * quần áo 0 → foldEnd gấp áo, foldEnd → bagEnd cho vào túi zip, sau đó túi nilon (bị ẩn);
 * hộp giày 0 → end đóng hộp.
 */
export function clipPhases(clip: AnimationClip | undefined): ClipPhases {
  if (!clip) return { foldEnd: 0, bagEnd: 0, end: 0 }
  let foldEnd = 0
  let end = 0
  let nilonStart = Number.POSITIVE_INFINITY
  const ranges = clip.tracks.map((t) => ({
    node: trackNode(t.name),
    path: t.name.slice(t.name.lastIndexOf('.') + 1),
    range: changeRange(t),
  }))
  let parcelStart = Number.POSITIVE_INFINITY
  for (const { node, range } of ranges) {
    if (!range) continue
    end = Math.max(end, range[1])
    if (node === 'parcel') parcelStart = Math.min(parcelStart, range[0])
    if (GARMENT_HIDDEN_NODES.has(node) && node !== 'hand_press') {
      nilonStart = Math.min(nilonStart, range[0])
    }
  }
  // Gấp áo = mọi xương xoay trước khi gói hàng bắt đầu di chuyển vào túi (tên xương khác nhau
  // theo file: fold_*, fold1_*, S1L_N, F2…). Chỉ tính track xoay.
  for (const { node, range, path } of ranges) {
    if (!range || path !== 'quaternion') continue
    if (node === 'parcel' || node === 'root' || node.startsWith('zip')) continue
    if (GARMENT_HIDDEN_NODES.has(node)) continue
    if (range[1] <= parcelStart + 0.01) foldEnd = Math.max(foldEnd, range[1])
  }
  let bagEnd = foldEnd
  for (const { node, range } of ranges) {
    if (!range) continue
    const bagNode = node === 'parcel' || node.startsWith('zip')
    if (bagNode && range[1] <= nilonStart + 0.01) bagEnd = Math.max(bagEnd, range[1])
  }
  return { foldEnd, bagEnd, end }
}

const _inv = new Matrix4()
const _rel = new Matrix4()

/** Hộp bao các mesh đang hiện, trong hệ của `root` (bỏ mesh bị co về 0). */
export function measureVisible(root: Object3D): Box3 {
  root.updateMatrixWorld(true)
  _inv.copy(root.matrixWorld).invert()
  const box = new Box3()
  root.traverseVisible((obj) => {
    if (!(obj instanceof Mesh)) return
    _rel.multiplyMatrices(_inv, obj.matrixWorld)
    if (Math.abs(_rel.determinant()) < 1e-12) return
    let local: Box3
    if (obj instanceof SkinnedMesh) {
      obj.skeleton.update()
      obj.computeBoundingBox()
      local = (obj.boundingBox ?? new Box3()).clone()
    } else {
      if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox()
      local = (obj.geometry.boundingBox ?? new Box3()).clone()
    }
    if (local.isEmpty()) return
    box.union(local.applyMatrix4(_rel))
  })
  return box
}

export type Fit = { quaternion: Quaternion; scale: Vector3; offset: Vector3 }

/**
 * Xoay (hoán vị trục, không méo) + co để hộp bao model khít khối `size`.
 * Trục dài nhất của model ↦ trục dài nhất của khối, mỏng nhất ↦ mỏng nhất.
 * uniform = true (hàng cứng): co đều theo tỉ lệ nhỏ nhất, model nằm giữa khối.
 */
export function fitToBlock(box: Box3, size: Vec3, uniform: boolean): Fit {
  const m = box.isEmpty() ? [1, 1, 1] : box.getSize(new Vector3()).toArray()
  const center = box.isEmpty() ? new Vector3() : box.getCenter(new Vector3())
  const desc = (a: number[]): number[] => [0, 1, 2].sort((i, j) => (a[j] ?? 0) - (a[i] ?? 0))
  const mo = desc(m)
  const to = desc(size)
  const cols = [new Vector3(), new Vector3(), new Vector3()]
  for (let k = 0; k < 3; k++) {
    cols[mo[k] ?? k]?.setComponent(to[k] ?? k, 1)
  }
  const [c0, c1, c2] = cols as [Vector3, Vector3, Vector3]
  const rot = new Matrix4().makeBasis(c0, c1, c2)
  if (rot.determinant() < 0) {
    cols[mo[2] ?? 2]?.negate()
    rot.makeBasis(c0, c1, c2)
  }
  const scale = new Vector3()
  for (let k = 0; k < 3; k++) {
    const target = to[k] ?? k
    scale.setComponent(target, (size[target] ?? 0) / Math.max(m[mo[k] ?? k] ?? 0, 1e-6))
  }
  if (uniform) {
    const u = Math.min(scale.x, scale.y, scale.z)
    scale.set(u, u, u)
  }
  return {
    quaternion: new Quaternion().setFromRotationMatrix(rot),
    scale,
    offset: center.negate(),
  }
}

/** Một bản model món hàng: clone riêng, ẩn node thừa, điều khiển thời gian clip. */
export class ItemRig {
  readonly root: Object3D
  readonly phases: ClipPhases
  /** Trạng thái cuối khi nằm trong thùng (đã gấp, đã vào túi nếu có). */
  readonly finalTime: number
  readonly finalBox: Box3
  /** Hàng mềm lúc trải phẳng (đầu clip), để co cho vừa khu chuẩn bị. */
  readonly flatBox: Box3
  private readonly mixer: AnimationMixer | null
  private readonly duration: number
  private lastTime = Number.NaN
  private readonly parcelNode: Object3D | null
  private readonly parcelFinal = new Vector3()

  constructor(scene: Object3D, clip: AnimationClip | undefined, kind: ItemModelKind, withZip: boolean) {
    this.root = cloneSkinned(scene)
    if (kind === 'garment') {
      this.root.traverse((obj) => {
        if (GARMENT_HIDDEN_NODES.has(obj.name)) obj.visible = false
        if (obj.name === ZIPBAG_ROOT_NODE) obj.visible = withZip
      })
    }
    this.root.traverse((obj) => {
      if (obj instanceof SkinnedMesh) obj.frustumCulled = false
    })
    this.phases = clipPhases(clip)
    this.duration = clip?.duration ?? 0
    if (kind === 'rigid') this.finalTime = this.phases.end
    else this.finalTime = withZip ? this.phases.bagEnd : this.phases.foldEnd
    if (clip) {
      this.mixer = new AnimationMixer(this.root)
      this.mixer.clipAction(clip).play()
    } else {
      this.mixer = null
    }
    if (kind === 'garment') {
      this.setTime(0)
      this.flatBox = measureVisible(this.root)
    } else {
      this.flatBox = new Box3()
    }
    this.setTime(this.finalTime)
    this.finalBox = measureVisible(this.root)
    this.parcelNode = this.root.getObjectByName('parcel') ?? null
    if (this.parcelNode) this.parcelFinal.copy(this.parcelNode.position)
  }

  /**
   * Gói hàng di chuyển theo node `parcel` khi vào túi zip, nên lúc đang gấp nó ở chỗ khác
   * so với hộp bao cuối. Trừ độ lệch này để món luôn nằm trong khung của bước.
   */
  driftInto(target: Vector3): Vector3 {
    if (!this.parcelNode) return target.set(0, 0, 0)
    return target.copy(this.parcelNode.position).sub(this.parcelFinal)
  }

  setTime(t: number): void {
    if (!this.mixer) return
    // Clip lặp vòng: đặt đúng bằng độ dài clip sẽ quay về 0 → giữ ngay trước điểm cuối.
    const time = Math.min(Math.max(0, t), Math.max(0, this.duration - 1e-3))
    if (Math.abs(time - this.lastTime) < 1e-4) return
    this.lastTime = time
    this.mixer.setTime(time)
  }
}

/** Túi niêm phong từ file GLB. Mốc đọc từ track: phồng lên → nắp gập (mailer_flap) → tem (shipping_label). */
export class MailerRig {
  readonly root: Object3D
  readonly flapStart: number
  readonly flapEnd: number
  readonly labelStart: number
  readonly end: number
  /** Kích thước gốc của thân túi: rộng, dày khi phồng hết, dài. */
  readonly size: Vector3
  private readonly flatThickness: number
  private readonly body: Mesh | null
  private readonly mixer: AnimationMixer | null
  private readonly duration: number
  private lastTime = Number.NaN

  constructor(scene: Object3D, clip: AnimationClip | undefined) {
    this.root = cloneSkinned(scene)
    const duration = clip?.duration ?? 0
    this.duration = duration
    let flap: [number, number] | null = null
    let label: [number, number] | null = null
    let end = 0
    for (const track of clip?.tracks ?? []) {
      const range = changeRange(track)
      if (!range) continue
      end = Math.max(end, range[1])
      if (track.name === 'mailer_flap.quaternion') flap = range
      if (track.name === 'shipping_label.scale') label = range
    }
    this.flapStart = flap?.[0] ?? duration
    this.flapEnd = flap?.[1] ?? duration
    this.labelStart = label?.[0] ?? duration
    this.end = end
    this.mixer = clip ? new AnimationMixer(this.root) : null
    if (clip) this.mixer?.clipAction(clip).play()

    const peak = new Box3()
    const flat = new Box3()
    let body: Mesh | null = null
    this.root.getObjectByName('mailer_body')?.traverse((obj) => {
      if (!(obj instanceof Mesh)) return
      body ??= obj
      if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox()
      if (obj.geometry.boundingBox) peak.union(obj.geometry.boundingBox)
      flat.union(new Box3().setFromBufferAttribute(obj.geometry.attributes.position))
    })
    this.body = body
    this.size = peak.isEmpty() ? new Vector3(0.32, 0.05, 0.45) : peak.getSize(new Vector3())
    this.flatThickness = flat.isEmpty() ? this.size.y : flat.getSize(new Vector3()).y
    this.setTime(0)
  }

  setTime(t: number): void {
    if (!this.mixer) return
    const time = Math.min(Math.max(0, t), Math.max(0, this.duration - 1e-3))
    if (Math.abs(time - this.lastTime) < 1e-4) return
    this.lastTime = time
    this.mixer.setTime(time)
  }

  /** Độ dày thân túi lúc này (theo morph), đơn vị gốc của file. */
  thickness(): number {
    const weight = this.body?.morphTargetInfluences?.[0] ?? 0
    return this.flatThickness + (this.size.y - this.flatThickness) * weight
  }
}

type Flap = { node: Object3D; rest: Quaternion; closed: Quaternion; short: boolean }

const CARTON_COLOR = '#b98a55'
const _axisX = new Vector3(1, 0, 0)
const _axisZ = new Vector3(0, 0, 1)

/** Thùng carton từ file GLB: co về kích thước ngoài, tìm hướng đóng của 4 nắp. */
export class CartonRig {
  readonly root: Object3D
  readonly scale: Vector3
  readonly offset: Vector3
  private readonly flaps: Flap[] = []
  private lastClose = Number.NaN

  constructor(scene: Object3D, outer: Vec3, opacity: number) {
    this.root = scene.clone(true)
    this.root.traverse((obj) => {
      if (!(obj instanceof Mesh)) return
      const apply = (mat: Material): Material => {
        const next = mat.clone()
        // Thùng trong suốt trên nền sáng bị nhạt thành xám: tô màu bìa rõ hơn. File có texture thì giữ nguyên.
        if (next instanceof MeshStandardMaterial && !next.map) next.color.set(CARTON_COLOR)
        next.transparent = true
        next.opacity = opacity
        next.depthWrite = false
        next.side = DoubleSide
        return next
      }
      obj.material = Array.isArray(obj.material) ? obj.material.map(apply) : apply(obj.material)
    })
    this.root.updateMatrixWorld(true)

    const body = new Box3()
    this.root.traverse((obj) => {
      if (!(obj instanceof Mesh) || obj.name.startsWith('flap_')) return
      // chỉ hình của thân thùng (không tính nắp con đang mở)
      if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox()
      const g = obj.geometry.boundingBox
      if (g) body.union(g.clone().applyMatrix4(obj.matrixWorld))
    })
    const size = body.isEmpty() ? new Vector3(1, 1, 1) : body.getSize(new Vector3())
    this.scale = new Vector3(outer[0] / size.x, outer[1] / size.y, outer[2] / size.z)
    this.offset = body.isEmpty()
      ? new Vector3()
      : new Vector3(-(body.min.x + body.max.x) / 2, -body.min.y, -(body.min.z + body.max.z) / 2)

    this.root.traverse((obj) => {
      if (obj.name.startsWith('flap_')) this.flaps.push(this.findClosed(obj))
    })
  }

  /** Thử xoay quanh bản lề, lấy góc làm nắp nằm ngang và hướng vào tâm thùng. */
  private findClosed(node: Object3D): Flap {
    const short = node.name.includes('short')
    const axis = short ? _axisZ : _axisX
    const rest = node.quaternion.clone()
    const pivot = new Vector3().setFromMatrixPosition(node.matrixWorld)
    const turn = new Quaternion()
    let best = rest.clone()
    let bestScore = Number.POSITIVE_INFINITY
    for (let deg = -180; deg <= 180; deg += 3) {
      turn.setFromAxisAngle(axis, (deg * Math.PI) / 180)
      node.quaternion.copy(turn).multiply(rest)
      node.updateMatrixWorld(true)
      const b = new Box3().expandByObject(node)
      if (b.isEmpty()) continue
      const c = b.getCenter(new Vector3())
      const s = b.getSize(new Vector3())
      const outward = short ? Math.abs(c.x) > Math.abs(pivot.x) : Math.abs(c.z) > Math.abs(pivot.z)
      const below = c.y < pivot.y - s.y
      const score = s.y + (outward ? 10 : 0) + (below ? 10 : 0) + Math.abs(deg) * 1e-5
      if (score < bestScore) {
        bestScore = score
        best = node.quaternion.clone()
      }
    }
    node.quaternion.copy(rest)
    node.updateMatrixWorld(true)
    return { node, rest, closed: best, short }
  }

  /** 0 = mở như trong file, 1 = đóng hết. Nắp ngắn đóng trước, nắp dài sau. */
  setClose(progress: number): void {
    if (Math.abs(progress - this.lastClose) < 1e-4) return
    this.lastClose = progress
    for (const flap of this.flaps) {
      const p = flap.short ? progress * 2 : progress * 2 - 1
      const t = Math.min(1, Math.max(0, p))
      flap.node.quaternion.slerpQuaternions(flap.rest, flap.closed, t)
    }
  }
}

/** Đồng hồ của một bước — chạy lại từ 0 khi đổi bước. */
export class StepClock {
  private elapsed = 0

  reset(): void {
    this.elapsed = 0
  }

  tick(dt: number): number {
    this.elapsed += dt
    return this.elapsed
  }

  get value(): number {
    return this.elapsed
  }
}

export function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2
}
