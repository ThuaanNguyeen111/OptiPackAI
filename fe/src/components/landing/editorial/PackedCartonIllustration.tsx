import type { ReactNode } from 'react'

/**
 * Minh hoạ tĩnh 1 kiện đã xếp (chiếu đẳng trắc). Số đo lấy theo đơn mẫu:
 * thùng lòng 300 × 220 × 170 mm, 4 món. Chỉ để minh hoạ trang chủ — không gọi API.
 */

type P3 = [number, number, number]

const COS = Math.cos(Math.PI / 6)
const SIN = 0.5

function iso([x, y, z]: P3): string {
  return `${((x - y) * COS).toFixed(1)},${((x + y) * SIN - z).toFixed(1)}`
}

function project([x, y, z]: P3): [number, number] {
  return [(x - y) * COS, (x + y) * SIN - z]
}

function viewBoxOf(points: P3[], pad: number): string {
  const xy = points.map(project)
  const xs = xy.map((p) => p[0])
  const ys = xy.map((p) => p[1])
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  return `${minX.toFixed(0)} ${minY.toFixed(0)} ${(Math.max(...xs) - minX + pad).toFixed(0)} ${(Math.max(...ys) - minY + pad).toFixed(0)}`
}

function poly(points: P3[]): string {
  return points.map(iso).join(' ')
}

type Item = {
  key: string
  at: P3
  size: P3
  top: string
  left: string
  right: string
  label?: string
}

const L = 300
const W = 220
const H = 170

const FLAP = 60
const VIEW_BOX = viewBoxOf(
  [[0, 0, 0], [L, 0, 0], [L, W, 0], [0, W, 0], [-FLAP, W, H + 45], [-FLAP, 0, H + 45], [L, -FLAP, H + 45], [L, W, H]],
  6,
)

const ITEMS: Item[] = [
  { key: 'shoe', at: [0, 0, 0], size: [200, 125, 95], top: '#e2b07a', left: '#b9824a', right: '#cf9659', label: 'Hộp giày' },
  { key: 'tee', at: [0, 0, 95], size: [200, 125, 34], top: '#eef3f0', left: '#c9d6cf', right: '#dbe5df', label: 'Áo thun · túi zip' },
  { key: 'polo', at: [0, 125, 0], size: [200, 95, 46], top: '#f1e3c6', left: '#cdb88f', right: '#e0cca5' },
  { key: 'jeans', at: [200, 0, 0], size: [100, 220, 58], top: '#5d7f9e', left: '#3b5873', right: '#4a6b89', label: 'Quần jean gập đôi' },
]

function Block({ item }: { item: Item }): ReactNode {
  const [x, y, z] = item.at
  const [dx, dy, dz] = item.size
  const x1 = x + dx
  const y1 = y + dy
  const z1 = z + dz
  const stroke = 'rgba(21,45,53,0.35)'
  return (
    <g strokeWidth={0.9} stroke={stroke} strokeLinejoin="round">
      <polygon points={poly([[x, y1, z], [x1, y1, z], [x1, y1, z1], [x, y1, z1]])} fill={item.left} />
      <polygon points={poly([[x1, y, z], [x1, y1, z], [x1, y1, z1], [x1, y, z1]])} fill={item.right} />
      <polygon points={poly([[x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1]])} fill={item.top} />
    </g>
  )
}

/** Chỉ phần hình thùng đã xếp — dùng ở trang chủ và trang đăng nhập. */
export function PackedCartonSvg({ className }: { className?: string }): ReactNode {
  const ordered = [...ITEMS].sort(
    (a, b) => a.at[0] + a.at[1] + a.at[2] - (b.at[0] + b.at[1] + b.at[2]),
  )
  const kraft = '#c9a477'
  const kraftDark = '#a8834f'
  const edge = 'rgba(80,55,25,0.55)'

  return (
    <svg viewBox={VIEW_BOX} className={className} role="img" aria-label="Thùng carton đã xếp 4 món: hộp giày, áo thun trong túi zip, áo polo và quần jean gập đôi">
      {/* sàn + 2 vách sau */}
      <polygon points={poly([[0, 0, 0], [L, 0, 0], [L, W, 0], [0, W, 0]])} fill="#e7d3b6" stroke={edge} strokeWidth={1} />
      <polygon points={poly([[0, 0, 0], [0, W, 0], [0, W, H], [0, 0, H]])} fill={kraftDark} stroke={edge} strokeWidth={1} />
      <polygon points={poly([[0, 0, 0], [L, 0, 0], [L, 0, H], [0, 0, H]])} fill={kraft} stroke={edge} strokeWidth={1} />
      {/* nắp sau mở ra ngoài */}
      <polygon points={poly([[0, 0, H], [0, W, H], [-FLAP, W, H + 45], [-FLAP, 0, H + 45]])} fill="#b8925f" stroke={edge} strokeWidth={1} />
      <polygon points={poly([[0, 0, H], [L, 0, H], [L, -FLAP, H + 45], [0, -FLAP, H + 45]])} fill="#d4b083" stroke={edge} strokeWidth={1} />

      {ordered.map((item) => (
        <Block key={item.key} item={item} />
      ))}

      {/* 2 vách trước: trong suốt để thấy cách xếp */}
      <polygon points={poly([[0, W, 0], [L, W, 0], [L, W, H], [0, W, H]])} fill="rgba(201,164,119,0.18)" stroke={edge} strokeWidth={1} strokeDasharray="4 3" />
      <polygon points={poly([[L, 0, 0], [L, W, 0], [L, W, H], [L, 0, H]])} fill="rgba(201,164,119,0.14)" stroke={edge} strokeWidth={1} strokeDasharray="4 3" />
      <polyline points={poly([[0, W, H], [L, W, H], [L, 0, H]])} fill="none" stroke={edge} strokeWidth={1.4} />
    </svg>
  )
}

export function PackedCartonIllustration(): ReactNode {
  return (
    <div className="relative rounded-[1.75rem] border border-[var(--ed-line)] bg-white/80 p-5 shadow-[0_24px_70px_rgba(21,45,53,0.12)] sm:p-7">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-semibold text-[var(--ed-ink)]">Kiện 1 / 2 · đơn LZ-5329…</span>
        <span className="text-[var(--ed-muted)]">thùng M · lòng 30 × 22 × 17 cm</span>
      </div>

      <PackedCartonSvg className="mx-auto mt-4 block h-auto w-full max-w-[380px]" />

      <ol className="m-0 mt-2 grid list-none gap-1.5 p-0 text-[13px] text-[var(--ed-ink-soft)] sm:grid-cols-2">
        {['Hộp giày đặt sát đáy', 'Áo thun trong túi zip đặt lên hộp giày', 'Áo polo lấp chỗ trống phía trước', 'Quần jean gập đôi dựng dọc vách phải'].map(
          (text, i) => (
            <li key={text} className="flex gap-2">
              <span className="font-semibold tabular-nums text-[var(--ed-ink)]">{i + 1}.</span>
              {text}
            </li>
          ),
        )}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-[var(--ed-line)] pt-3 text-[12px] text-[var(--ed-muted)]">
        <span>Lấp đầy <b className="text-[var(--ed-ink)]">76%</b></span>
        <span>Cân ước tính <b className="text-[var(--ed-ink)]">1,42 kg</b></span>
        <span>Thùng nhỏ nhất xếp vừa</span>
      </div>
    </div>
  )
}
