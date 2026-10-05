import type { GarmentShape } from '../timeline'

/**
 * Hình trải phẳng của từng loại quần áo + các đường gấp (05/10/2026).
 * Đơn vị mét, toạ độ trên mặt thảm: x ngang, z dọc (cổ áo/cạp quần về +z).
 * Kích thước suy ngược từ gói sau khi gấp (gx × gz) để khi gấp xong vừa
 * đúng ô mà bộ giải đã tính.
 */
export type FoldOp = {
  axis: 'x' | 'z'
  /** Vị trí đường gấp trên trục. */
  at: number
  /** -1: phần có toạ độ < at lật sang; +1: phần > at lật sang. */
  side: -1 | 1
}

export type ShapeSpec = {
  /** Khung bao: [minX, maxX, minZ, maxZ]. */
  bounds: [number, number, number, number]
  inside: (x: number, z: number) => boolean
  sides: FoldOp[]
  body: FoldOp[]
  /** Số lớp vải chồng lên nhau sau khi gấp (để tính độ dày mỗi lớp). */
  layers: number
}

function teeLike(gx: number, gz: number, sleeveReach: number, sleeveDrop: number): ShapeSpec {
  const b = 0.8 * gx
  const top = 1.5 * gz
  const hem = -1.5 * gz
  const sx = sleeveReach * gx
  return {
    bounds: [-sx, sx, hem, top],
    inside: (x, z) => {
      const ax = Math.abs(x)
      if (ax <= b) {
        if (z < hem || z > top) return false
        // Cổ áo khoét tròn
        const neckW = 0.24 * gx
        const neckD = 0.16 * gz
        if (ax < neckW && z > top - neckD * Math.sqrt(Math.max(0, 1 - (ax / neckW) ** 2))) return false
        return true
      }
      if (ax > sx) return false
      // Tay áo xuôi xuống theo vai
      const k = (ax - b) / (sx - b)
      const upper = top - 0.06 * gz - k * 0.25 * gz
      const lower = top - sleeveDrop * gz - k * (sleeveDrop * 0.55) * gz
      return z <= upper && z >= lower
    },
    sides: [
      { axis: 'x', at: -0.5 * gx, side: -1 },
      { axis: 'x', at: 0.5 * gx, side: 1 },
    ],
    body: [
      { axis: 'z', at: -0.5 * gz, side: -1 },
      { axis: 'z', at: 0.5 * gz, side: 1 },
    ],
    layers: 6,
  }
}

export function shapeFor(shape: GarmentShape, gx: number, gz: number): ShapeSpec {
  switch (shape) {
    case 'tee':
      return teeLike(gx, gz, 1.3, 0.62)
    case 'jacket':
      return teeLike(gx, gz, 1.55, 0.95)
    case 'pants': {
      const top = 1.5 * gz
      const hem = -1.5 * gz
      const waist = top - 0.5 * gz
      return {
        bounds: [-1.5 * gx, 0.5 * gx, hem, top],
        inside: (x, z) => {
          if (z > top || z < hem || x < -1.5 * gx || x > 0.5 * gx) return false
          if (z >= waist) return true
          // Đũng quần: khe giữa hai ống hẹp dần lên trên
          const gap = 0.05 * gx * Math.min(1, (waist - z) / (0.6 * gz))
          return Math.abs(x + 0.5 * gx) > gap
        },
        sides: [{ axis: 'x', at: -0.5 * gx, side: -1 }],
        body: [
          { axis: 'z', at: -0.5 * gz, side: -1 },
          { axis: 'z', at: 0.5 * gz, side: 1 },
        ],
        layers: 6,
      }
    }
    case 'shorts': {
      const top = 0.5 * gz
      const hem = -1.5 * gz
      const waist = top - 0.45 * gz
      return {
        bounds: [-1.5 * gx, 0.5 * gx, hem, top],
        inside: (x, z) => {
          if (z > top || z < hem || x < -1.5 * gx || x > 0.5 * gx) return false
          if (z >= waist) return true
          const gap = 0.07 * gx * Math.min(1, (waist - z) / (0.5 * gz))
          return Math.abs(x + 0.5 * gx) > gap
        },
        sides: [{ axis: 'x', at: -0.5 * gx, side: -1 }],
        body: [{ axis: 'z', at: -0.5 * gz, side: -1 }],
        layers: 4,
      }
    }
    case 'dress': {
      const top = 1.5 * gz
      const hem = -1.5 * gz
      return {
        bounds: [-0.98 * gx, 0.98 * gx, hem, top],
        inside: (x, z) => {
          if (z > top || z < hem) return false
          const k = (top - z) / (top - hem)
          const half = (0.62 + 0.36 * k) * gx
          if (Math.abs(x) > half) return false
          // Khoét cổ và nách
          if (z > top - 0.22 * gz && Math.abs(x) > 0.42 * gx) return false
          if (z > top - 0.1 * gz && Math.abs(x) < 0.2 * gx) return false
          return true
        },
        sides: [
          { axis: 'x', at: -0.5 * gx, side: -1 },
          { axis: 'x', at: 0.5 * gx, side: 1 },
        ],
        body: [
          { axis: 'z', at: -0.5 * gz, side: -1 },
          { axis: 'z', at: 0.5 * gz, side: 1 },
        ],
        layers: 6,
      }
    }
  }
}
