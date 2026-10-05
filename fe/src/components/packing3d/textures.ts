import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'

/**
 * Vân bề mặt vẽ bằng canvas (05/10/2026): vải dệt, giấy carton, mặt bàn gỗ,
 * thảm gấp đồ. Không tải ảnh qua mạng; mỗi loại tạo một lần rồi dùng lại.
 */
const cache = new Map<string, Texture>()

function make(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, srgb = true): Texture {
  const hit = cache.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d')
  if (g) draw(g, size)
  const tex = new CanvasTexture(canvas)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.anisotropy = 4
  if (srgb) tex.colorSpace = SRGBColorSpace
  cache.set(key, tex)
  return tex
}

/** Số giả ngẫu nhiên có hạt giống — vân giống nhau mỗi lần tải. */
function rng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

/** Vân dệt xám (nhân với màu vải). */
export function weaveTexture(): Texture {
  return make('weave', 128, (g, s) => {
    g.fillStyle = '#ececec'
    g.fillRect(0, 0, s, s)
    const r = rng(7)
    for (let y = 0; y < s; y += 2) {
      g.fillStyle = `rgba(0,0,0,${String(0.04 + r() * 0.05)})`
      g.fillRect(0, y, s, 1)
    }
    for (let x = 0; x < s; x += 2) {
      g.fillStyle = `rgba(255,255,255,${String(0.05 + r() * 0.06)})`
      g.fillRect(x, 0, 1, s)
    }
    for (let i = 0; i < 400; i += 1) {
      g.fillStyle = `rgba(0,0,0,${String(r() * 0.05)})`
      g.fillRect(r() * s, r() * s, 1 + r() * 2, 1)
    }
  })
}

/** Giấy carton: sợi giấy + vệt sóng mờ. */
export function kraftTexture(): Texture {
  return make('kraft', 256, (g, s) => {
    g.fillStyle = '#d2a56d'
    g.fillRect(0, 0, s, s)
    const r = rng(11)
    for (let i = 0; i < 2600; i += 1) {
      const shade = r() > 0.5 ? '255,236,205' : '120,80,40'
      g.strokeStyle = `rgba(${shade},${String(r() * 0.12)})`
      g.beginPath()
      const x = r() * s
      const y = r() * s
      g.moveTo(x, y)
      g.lineTo(x + (r() - 0.5) * 10, y + (r() - 0.5) * 3)
      g.stroke()
    }
    for (let y = 0; y < s; y += 8) {
      g.fillStyle = 'rgba(110,70,30,0.05)'
      g.fillRect(0, y, s, 3)
    }
  })
}

/** Mặt bàn gỗ sáng. */
export function woodTexture(): Texture {
  return make('wood', 512, (g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s)
    grad.addColorStop(0, '#d9c3a2')
    grad.addColorStop(1, '#cdb38e')
    g.fillStyle = grad
    g.fillRect(0, 0, s, s)
    const r = rng(23)
    for (let y = 0; y < s; y += 1) {
      const wave = Math.sin(y * 0.045) * 0.5 + Math.sin(y * 0.013 + 1) * 0.5
      g.fillStyle = `rgba(120,85,50,${String(0.03 + Math.max(0, wave) * 0.05 + r() * 0.02)})`
      g.fillRect(0, y, s, 1)
    }
    // Ván ghép
    for (let y = 0; y < s; y += 128) {
      g.fillStyle = 'rgba(90,60,30,0.18)'
      g.fillRect(0, y, s, 2)
    }
  })
}

/** Thảm gấp đồ màu xanh có lưới cm. */
export function matTexture(): Texture {
  return make('mat', 512, (g, s) => {
    g.fillStyle = '#2f5d55'
    g.fillRect(0, 0, s, s)
    for (let i = 0; i <= 32; i += 1) {
      const p = (i / 32) * s
      g.fillStyle = i % 4 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)'
      g.fillRect(p, 0, 1, s)
      g.fillRect(0, p, s, 1)
    }
  })
}
