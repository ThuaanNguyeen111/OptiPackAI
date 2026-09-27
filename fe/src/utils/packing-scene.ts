import {
  DEFAULT_CARTON_CODE,
  getCartonByCode,
  type Carton,
} from '../data/cartons'

export type Vec3 = [number, number, number]

export type Box3D = { w: number; h: number; d: number }

export type FashionItemDef = {
  id: string
  modelPath: string
  scale: Vec3
  enhanceMetallic: boolean
  float: { position: Vec3; rotation: Vec3 }
  packed: { position: Vec3; rotation: Vec3 }
}

export type PackingSceneConfig = {
  cartonCode: string
  box: Box3D
  flapThick: number
  shortFlapH: number
  longFlapH: number
  topY: number
  hoverY: number
  fashionItems: FashionItemDef[]
  cameraScale: number
}

const REF_BOX: Box3D = { w: 2.4, h: 1.8, d: 1.6 }
const FLAP_THICK = 0.05

const BASE_PACKED = {
  pants: {
    position: [-0.5, -0.65, 0] as Vec3,
    rotation: [0, 0, 0] as Vec3,
    scale: [0.018, 0.018, 0.018] as Vec3,
  },
  shirt: {
    position: [-0.5, -0.35, 0] as Vec3,
    rotation: [0, 0, 0] as Vec3,
    scale: [1.15, 1.15, 1.15] as Vec3,
  },
  backpack: {
    position: [0.55, -0.2, 0] as Vec3,
    rotation: [0, -0.35, 0] as Vec3,
    scale: [0.78, 0.78, 0.78] as Vec3,
  },
  hat: {
    position: [-0.5, 0.1, 0] as Vec3,
    rotation: [0, 0.2, 0] as Vec3,
    scale: [0.45, 0.45, 0.45] as Vec3,
  },
  glasses: {
    position: [0.1, 0.25, 0.3] as Vec3,
    rotation: [0.1, 0.15, 0] as Vec3,
    scale: [0.035, 0.035, 0.035] as Vec3,
  },
} as const

const BASE_FLOAT: Record<
  keyof typeof BASE_PACKED,
  { position: Vec3; rotation: Vec3 }
> = {
  pants: { position: [2.6, 1.7, -1.5], rotation: [-0.2, -0.6, 0.15] },
  shirt: { position: [-2.6, 1.6, 1.5], rotation: [0.3, 0.8, 0.2] },
  backpack: { position: [2.9, 1.5, 1.7], rotation: [-0.15, -0.5, 0.1] },
  hat: { position: [0.5, 2.55, 2.15], rotation: [0.4, 0.3, 0] },
  glasses: { position: [-2.3, 2.2, -1.7], rotation: [0.5, 0.9, -0.3] },
}

function scaleVec3(v: Vec3, sx: number, sy: number, sz: number): Vec3 {
  return [v[0] * sx, v[1] * sy, v[2] * sz]
}

export function buildPackingSceneConfig(carton: Carton): PackingSceneConfig {
  const ref = getCartonByCode(DEFAULT_CARTON_CODE)
  const sx = carton.length / ref.length
  const sy = carton.height / ref.height
  const sz = carton.width / ref.width

  const box: Box3D = {
    w: REF_BOX.w * sx,
    h: REF_BOX.h * sy,
    d: REF_BOX.d * sz,
  }

  const topY = box.h / 2 - 0.05
  const hoverY = topY + 1.5 * Math.max(sx, sy, sz)

  const fashionItems: FashionItemDef[] = (
    Object.keys(BASE_PACKED) as (keyof typeof BASE_PACKED)[]
  ).map((id) => {
    const packed = BASE_PACKED[id]
    const float = BASE_FLOAT[id]
    const modelPath =
      id === 'pants'
        ? '/models/trousers.glb'
        : `/models/${id === 'backpack' ? 'backpack' : id}.glb`

    return {
      id,
      modelPath,
      scale: packed.scale,
      enhanceMetallic: id === 'glasses',
      float: {
        position: scaleVec3(float.position, sx, sy, sz),
        rotation: float.rotation,
      },
      packed: {
        position: scaleVec3(packed.position, sx, sy, sz),
        rotation: packed.rotation,
      },
    }
  })

  const cameraScale =
    (box.w + box.h + box.d) / (REF_BOX.w + REF_BOX.h + REF_BOX.d)

  return {
    cartonCode: carton.code,
    box,
    flapThick: FLAP_THICK,
    shortFlapH: box.w / 2,
    longFlapH: box.d / 2,
    topY,
    hoverY,
    fashionItems,
    cameraScale,
  }
}

export function buildPackingSceneFromCode(code?: string): PackingSceneConfig {
  return buildPackingSceneConfig(getCartonByCode(code ?? DEFAULT_CARTON_CODE))
}
