import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, RoundedBox } from '@react-three/drei'
import { Select } from '@react-three/postprocessing'
import { Color, MathUtils, Vector3, type Group } from 'three'
import type { DimsMm, PlanItemProfile, PlanPlacement } from '../../types/packing-plan'
import { FoldedPants3D } from '../packing/FoldedPants3D'
import { ModelErrorBoundary, ProductModel } from '../packing/ProductModel3D'
import { modelForCategory } from '../packing/product-models'
import { HIGHLIGHT, itemColor } from './colors'

/**
 * Một món trong kiện (04/10/2026). Toạ độ engine (mm, x dài / y rộng / z cao)
 * đổi sang three.js (m, x / z / y-hướng-lên), gốc = giữa đáy trong thùng.
 * Món mới xuất hiện có thể rơi từ trên miệng thùng xuống; mọi chuyển động
 * dùng damping và chỉ yêu cầu vẽ lại khi còn đang chuyển động.
 */
export type ItemVisualState = {
  visible: boolean
  focused: boolean
  muted: boolean
  drop: boolean
  exploded: boolean
  showModel: boolean
  outline: boolean
  /** Nhãn nổi trên món; null = không hiện. */
  label: string | null
}

type ParcelItemProps = ItemVisualState & {
  placement: PlanPlacement
  profile: PlanItemProfile | undefined
  inner: DimsMm
  onSelect?: (itemKey: string) => void
  onHover?: (itemKey: string | null) => void
}

const GREY = new Color('#9aa4b2')
const EXPLODE_SPREAD = 1.35
const EXPLODE_LIFT = 0.9

export function ParcelItem({
  placement: p,
  profile,
  inner,
  visible,
  focused,
  muted,
  drop,
  exploded,
  showModel,
  outline,
  label,
  onSelect,
  onHover,
}: ParcelItemProps) {
  const group = useRef<Group>(null)
  const appeared = useRef(false)
  const invalidate = useThree((s) => s.invalidate)

  const size = useMemo(() => new Vector3(p.dx / 1000, p.dz / 1000, p.dy / 1000), [p.dx, p.dy, p.dz])
  const target = useMemo(() => {
    const x = (p.x + p.dx / 2 - inner.lengthMm / 2) / 1000
    const y = (p.z + p.dz / 2) / 1000
    const z = (p.y + p.dy / 2 - inner.widthMm / 2) / 1000
    return exploded
      ? new Vector3(x * EXPLODE_SPREAD, y + (p.z / 1000) * EXPLODE_LIFT, z * EXPLODE_SPREAD)
      : new Vector3(x, y, z)
  }, [p, inner.lengthMm, inner.widthMm, exploded])
  const dropFrom = inner.heightMm / 1000 + size.y + 0.12

  const color = useMemo(() => {
    const base = new Color(itemColor(p.sku, profile?.productCategory))
    return muted ? base.lerp(GREY, 0.45) : base
  }, [p.sku, profile?.productCategory, muted])

  useEffect(() => {
    invalidate()
  }, [target, visible, focused, muted, invalidate])

  useFrame((state, delta) => {
    const g = group.current
    if (!g) return
    if (!visible) {
      appeared.current = false
      return
    }
    if (!appeared.current) {
      appeared.current = true
      g.position.set(target.x, drop ? dropFrom : target.y, target.z)
    }
    const dt = Math.min(delta, 1 / 30)
    let moving = false
    for (const axis of ['x', 'y', 'z'] as const) {
      const next = MathUtils.damp(g.position[axis], target[axis], 9, dt)
      if (Math.abs(next - target[axis]) < 0.0004) {
        g.position[axis] = target[axis]
      } else {
        g.position[axis] = next
        moving = true
      }
    }
    if (moving) state.invalidate()
  })

  const model = showModel ? modelForCategory(profile?.productCategory) : null
  const radius = Math.min(size.x, size.y, size.z, 0.06) * 0.14
  const stripe = Math.max(size.y * 0.05, 0.0015)
  const isShoeBox = profile?.productCategory === 'shoes'
  const emissive = focused && !outline ? HIGHLIGHT : '#000000'

  const body = (
    <RoundedBox
      args={[size.x * 0.985, size.y * 0.985, size.z * 0.985]}
      radius={radius}
      smoothness={3}
      onClick={(e) => {
        e.stopPropagation()
        onSelect?.(p.itemKey)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        onHover?.(p.itemKey)
      }}
      onPointerOut={() => onHover?.(null)}
    >
      <meshStandardMaterial
        color={color}
        roughness={isShoeBox ? 0.55 : 0.82}
        emissive={emissive}
        emissiveIntensity={focused && !outline ? 0.28 : 0}
        transparent={model !== null}
        opacity={model !== null ? 0.16 : 1}
        depthWrite={model === null}
      />
    </RoundedBox>
  )

  const modelNode =
    model === null ? null : model.kind === 'pants' ? (
      <FoldedPants3D size={size.clone().multiplyScalar(0.92)} color={model.color} />
    ) : (
      <ModelErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <ProductModel spec={model} size={size} fill={0.9} />
        </Suspense>
      </ModelErrorBoundary>
    )

  return (
    <group ref={group} visible={visible}>
      <Select enabled={focused && outline}>{body}</Select>
      {modelNode}
      {model === null && isShoeBox && (
        // Mép nắp hộp giày
        <mesh position={[0, size.y / 2 - size.y * 0.2, 0]}>
          <boxGeometry args={[size.x * 0.995, stripe, size.z * 0.995]} />
          <meshStandardMaterial color={color.clone().multiplyScalar(0.72)} roughness={0.6} />
        </mesh>
      )}
      {profile?.zipBagCode && (
        // Đường khoá kéo túi zip, dọc mép sau mặt trên
        <mesh position={[0, size.y / 2, -size.z / 2 + size.z * 0.1]}>
          <boxGeometry args={[size.x * 0.9, stripe, size.z * 0.035]} />
          <meshStandardMaterial color="#3b82f6" roughness={0.4} />
        </mesh>
      )}
      {p.folded && (
        // Nếp gập đôi, ngang giữa mặt trên
        <mesh position={[0, size.y / 2 + 0.0002, 0]}>
          <boxGeometry args={[size.x * 0.012 + 0.001, stripe * 0.5, size.z * 0.92]} />
          <meshStandardMaterial color="#1f2937" transparent opacity={0.35} />
        </mesh>
      )}
      {label !== null && visible && (
        <Html position={[0, size.y / 2 + 0.01, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <span className="whitespace-nowrap rounded-md bg-ink/90 px-2 py-0.5 font-mono text-[11px] font-medium text-canvas shadow-sm">
            {label}
          </span>
        </Html>
      )}
    </group>
  )
}
