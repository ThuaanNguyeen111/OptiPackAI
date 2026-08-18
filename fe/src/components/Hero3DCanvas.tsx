import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Edges, OrbitControls, useGLTF } from '@react-three/drei'
import gsap from 'gsap'
import type { Group, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { useTheme } from '../hooks/useTheme'

const BOX = { w: 2.4, h: 1.8, d: 1.6 }
const KRAFT = '#C49A6C'
const KRAFT_FLAP = '#D4AE80'
const WIRE = '#818CF8'
const FLAP_THICK = 0.05
const SHORT_FLAP_H = BOX.w / 2
const LONG_FLAP_H = BOX.d / 2
const TOP_Y = BOX.h / 2 - 0.05
const HALF_PI = Math.PI / 2

type Vec3 = [number, number, number]

/** Packed layout — left stack (quần → áo → mũ) + right upright (balo) + accent (kính). */
const PACKED = {
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

/** Open = upright; closed = flat inward over the opening (toward box center). */
const FLAP_OPEN_ROT = { front: 0, back: 0, left: 0, right: 0 } as const
const FLAP_CLOSED_ROT = {
  front: -HALF_PI,
  back: HALF_PI,
  left: -HALF_PI,
  right: HALF_PI,
} as const

type FashionItemDef = {
  id: string
  modelPath: string
  scale: Vec3
  enhanceMetallic: boolean
  float: { position: Vec3; rotation: Vec3 }
  packed: { position: Vec3; rotation: Vec3 }
}

const FASHION_ITEMS: FashionItemDef[] = [
  {
    id: 'pants',
    modelPath: '/models/trousers.glb',
    scale: PACKED.pants.scale,
    enhanceMetallic: false,
    float: { position: [2.0, 1.55, -0.7], rotation: [-0.2, -0.6, 0.15] },
    packed: { position: PACKED.pants.position, rotation: PACKED.pants.rotation },
  },
  {
    id: 'shirt',
    modelPath: '/models/shirt.glb',
    scale: PACKED.shirt.scale,
    enhanceMetallic: false,
    float: { position: [-2.1, 1.35, 1.0], rotation: [0.3, 0.8, 0.2] },
    packed: { position: PACKED.shirt.position, rotation: PACKED.shirt.rotation },
  },
  {
    id: 'backpack',
    modelPath: '/models/backpack.glb',
    scale: PACKED.backpack.scale,
    enhanceMetallic: false,
    float: { position: [2.15, 1.15, 1.05], rotation: [-0.15, -0.5, 0.1] },
    packed: {
      position: PACKED.backpack.position,
      rotation: PACKED.backpack.rotation,
    },
  },
  {
    id: 'hat',
    modelPath: '/models/hat.glb',
    scale: PACKED.hat.scale,
    enhanceMetallic: false,
    float: { position: [0.6, 2.05, 1.45], rotation: [0.4, 0.3, 0] },
    packed: { position: PACKED.hat.position, rotation: PACKED.hat.rotation },
  },
  {
    id: 'glasses',
    modelPath: '/models/glasses.glb',
    scale: PACKED.glasses.scale,
    enhanceMetallic: true,
    float: { position: [-1.6, 1.85, -1.25], rotation: [0.5, 0.9, -0.3] },
    packed: {
      position: PACKED.glasses.position,
      rotation: PACKED.glasses.rotation,
    },
  },
]

function prepareModel(scene: Object3D, enhanceMetallic: boolean) {
  const clone = scene.clone(true)
  clone.traverse((child) => {
    if ((child as Mesh).isMesh) {
      const mesh = child as Mesh
      mesh.castShadow = true
      mesh.receiveShadow = true

      if (enhanceMetallic && mesh.material) {
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]
        materials.forEach((mat) => {
          const std = mat as MeshStandardMaterial
          if (std.isMeshStandardMaterial) {
            std.metalness = Math.max(std.metalness, 0.9)
            std.roughness = Math.min(std.roughness, 0.2)
            std.envMapIntensity = 1.4
          }
        })
      }
    }
  })
  return clone
}

function FashionGlbItem({
  modelPath,
  scale,
  enhanceMetallic,
}: {
  modelPath: string
  scale: Vec3
  enhanceMetallic: boolean
}) {
  const { scene } = useGLTF(modelPath)
  const model = useMemo(
    () => prepareModel(scene, enhanceMetallic),
    [scene, enhanceMetallic],
  )

  return <primitive object={model} scale={scale} />
}

function AnimatedPackingScene({
  timelineRef,
  isPaused,
  onPackedChange,
  onCompletedChange,
}: {
  timelineRef: React.MutableRefObject<gsap.core.Timeline | null>
  isPaused: boolean
  onPackedChange: (v: boolean) => void
  onCompletedChange: (v: boolean) => void
}) {
  const pantsRef = useRef<Group>(null)
  const shirtRef = useRef<Group>(null)
  const backpackRef = useRef<Group>(null)
  const hatRef = useRef<Group>(null)
  const glassesRef = useRef<Group>(null)
  const flapFrontRef = useRef<Group>(null)
  const flapBackRef = useRef<Group>(null)
  const flapLeftRef = useRef<Group>(null)
  const flapRightRef = useRef<Group>(null)

  const itemRefs = [pantsRef, shirtRef, backpackRef, hatRef, glassesRef]
  const initialized = useRef(false)

  useFrame(() => {
    if (initialized.current) return

    const refsReady =
      itemRefs.every((r) => r.current) &&
      flapFrontRef.current &&
      flapBackRef.current &&
      flapLeftRef.current &&
      flapRightRef.current

    if (!refsReady) return
    initialized.current = true

    const setItemTransform = (ref: Group, pos: Vec3, rot: Vec3) => {
      ref.position.set(...pos)
      ref.rotation.set(...rot)
    }

    FASHION_ITEMS.forEach((item, i) => {
      const ref = itemRefs[i].current!
      setItemTransform(ref, item.float.position, item.float.rotation)
    })

    flapFrontRef.current!.rotation.x = FLAP_OPEN_ROT.front
    flapBackRef.current!.rotation.x = FLAP_OPEN_ROT.back
    flapLeftRef.current!.rotation.z = FLAP_OPEN_ROT.left
    flapRightRef.current!.rotation.z = FLAP_OPEN_ROT.right

    onPackedChange(false)
    onCompletedChange(false)

    const tl = gsap.timeline({ repeat: -1, repeatDelay: 2, paused: isPaused })

    // Phase 1: items float outside the open transparent box
    FASHION_ITEMS.forEach((_item, i) => {
      const ref = itemRefs[i].current!
      tl.to(
        ref.position,
        {
          y: `+=${0.12 + i * 0.02}`,
          duration: 0.9,
          yoyo: true,
          repeat: 1,
          ease: 'sine.inOut',
        },
        i === 0 ? 0 : '<0.15',
      )
    })
    tl.to({}, { duration: 0.4 })

    // Phase 2: bottom → stack → upright → top layers (soft landing)
    FASHION_ITEMS.forEach((item, i) => {
      const ref = itemRefs[i].current!
      const { position, rotation } = item.packed
      tl.to(
        ref.position,
        {
          x: position[0],
          y: position[1],
          z: position[2],
          duration: 0.85,
          ease: 'power2.out',
        },
        i === 0 ? undefined : '+=0.1',
      )
      tl.to(
        ref.rotation,
        {
          x: rotation[0],
          y: rotation[1],
          z: rotation[2],
          duration: 0.85,
          ease: 'power2.out',
        },
        '<',
      )
    })
    tl.add(() => {
      onPackedChange(true)
    }, '+=0.05')
    tl.to({}, { duration: 0.35 })

    // Phase 3A: inner short side flaps fold 90° inward
    tl.to(flapLeftRef.current!.rotation, {
      z: FLAP_CLOSED_ROT.left,
      duration: 0.5,
      ease: 'power2.inOut',
    })
    tl.to(
      flapRightRef.current!.rotation,
      { z: FLAP_CLOSED_ROT.right, duration: 0.5, ease: 'power2.inOut' },
      '<',
    )

    // Phase 3B: outer long front/back flaps seal on top
    tl.to(
      flapFrontRef.current!.rotation,
      { x: FLAP_CLOSED_ROT.front, duration: 0.6, ease: 'power2.inOut' },
      '+=0.2',
    )
    tl.to(
      flapBackRef.current!.rotation,
      { x: FLAP_CLOSED_ROT.back, duration: 0.6, ease: 'power2.inOut' },
      '<',
    )

    tl.to({}, { duration: 0.9 })
    tl.add(() => {
      onCompletedChange(true)
    })

    // Reset: open flaps and return items to float positions
    tl.add(() => {
      onPackedChange(false)
      onCompletedChange(false)
    })

    tl.to(flapFrontRef.current!.rotation, {
      x: FLAP_OPEN_ROT.front,
      duration: 0.45,
      ease: 'power2.out',
    })
    tl.to(
      flapBackRef.current!.rotation,
      { x: FLAP_OPEN_ROT.back, duration: 0.45, ease: 'power2.out' },
      '<',
    )
    tl.to(
      flapLeftRef.current!.rotation,
      { z: FLAP_OPEN_ROT.left, duration: 0.45, ease: 'power2.out' },
      '<',
    )
    tl.to(
      flapRightRef.current!.rotation,
      { z: FLAP_OPEN_ROT.right, duration: 0.45, ease: 'power2.out' },
      '<',
    )

    FASHION_ITEMS.forEach((item, i) => {
      const ref = itemRefs[i].current!
      const { position, rotation } = item.float
      tl.to(
        ref.position,
        {
          x: position[0],
          y: position[1],
          z: position[2],
          duration: 0.55,
          ease: 'power2.out',
        },
        i === 0 ? '<0.1' : '<0.06',
      )
      tl.to(
        ref.rotation,
        {
          x: rotation[0],
          y: rotation[1],
          z: rotation[2],
          duration: 0.55,
          ease: 'power2.out',
        },
        '<',
      )
    })

    timelineRef.current = tl
  })

  useEffect(() => {
    return () => {
      timelineRef.current?.kill()
      timelineRef.current = null
      initialized.current = false
    }
  }, [timelineRef])

  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.paused(isPaused)
    }
  }, [isPaused, timelineRef])

  return (
    <group>
      {/* Carton body */}
      <mesh castShadow receiveShadow position={[0, -0.05, 0]}>
        <boxGeometry args={[BOX.w, BOX.h, BOX.d]} />
        <meshStandardMaterial
          color={KRAFT}
          metalness={0.04}
          roughness={0.88}
          transparent
          opacity={0.35}
          depthWrite={false}
        />
        <Edges threshold={12} color={WIRE} />
      </mesh>

      {/* RSC top flaps — short inner (L/R) + long outer (F/B) */}
      <group ref={flapFrontRef} position={[0, TOP_Y, BOX.d / 2]}>
        <mesh position={[0, LONG_FLAP_H / 2, 0]}>
          <boxGeometry args={[BOX.w, LONG_FLAP_H, FLAP_THICK]} />
          <meshStandardMaterial
            color={KRAFT_FLAP}
            roughness={0.9}
            transparent
            opacity={0.35}
            depthWrite={false}
          />
          <Edges threshold={12} color={WIRE} />
        </mesh>
      </group>
      <group ref={flapBackRef} position={[0, TOP_Y, -BOX.d / 2]}>
        <mesh position={[0, LONG_FLAP_H / 2, 0]}>
          <boxGeometry args={[BOX.w, LONG_FLAP_H, FLAP_THICK]} />
          <meshStandardMaterial
            color={KRAFT_FLAP}
            roughness={0.9}
            transparent
            opacity={0.35}
            depthWrite={false}
          />
          <Edges threshold={12} color={WIRE} />
        </mesh>
      </group>
      <group ref={flapLeftRef} position={[-BOX.w / 2, TOP_Y, 0]}>
        <mesh position={[0, SHORT_FLAP_H / 2, 0]}>
          <boxGeometry args={[FLAP_THICK, SHORT_FLAP_H, BOX.d]} />
          <meshStandardMaterial
            color={KRAFT_FLAP}
            roughness={0.9}
            transparent
            opacity={0.35}
            depthWrite={false}
          />
          <Edges threshold={12} color={WIRE} />
        </mesh>
      </group>
      <group ref={flapRightRef} position={[BOX.w / 2, TOP_Y, 0]}>
        <mesh position={[0, SHORT_FLAP_H / 2, 0]}>
          <boxGeometry args={[FLAP_THICK, SHORT_FLAP_H, BOX.d]} />
          <meshStandardMaterial
            color={KRAFT_FLAP}
            roughness={0.9}
            transparent
            opacity={0.35}
            depthWrite={false}
          />
          <Edges threshold={12} color={WIRE} />
        </mesh>
      </group>

      {/* GLB fashion items */}
      {FASHION_ITEMS.map((item, i) => (
        <group key={item.id} ref={itemRefs[i]}>
          <FashionGlbItem
            modelPath={item.modelPath}
            scale={item.scale}
            enhanceMetallic={item.enhanceMetallic}
          />
        </group>
      ))}

      <pointLight
        position={[0, 0.05, 0.15]}
        color="#818CF8"
        intensity={1.0}
        distance={3.2}
        decay={2}
      />
    </group>
  )
}

function Scene({
  timelineRef,
  isPaused,
  isDark,
  onPackedChange,
  onCompletedChange,
}: {
  timelineRef: React.MutableRefObject<gsap.core.Timeline | null>
  isPaused: boolean
  isDark: boolean
  onPackedChange: (v: boolean) => void
  onCompletedChange: (v: boolean) => void
}) {
  return (
    <>
      <color attach="background" args={[isDark ? '#1a2030' : '#eef1f6']} />
      <ambientLight intensity={isDark ? 0.8 : 1.05} />
      <directionalLight
        position={[5, 8, 5]}
        color="#FFFFFF"
        intensity={isDark ? 1.5 : 1.15}
        castShadow
      />
      <directionalLight
        position={[-4, 4, -3]}
        color="#FFF7ED"
        intensity={isDark ? 0.45 : 0.55}
      />
      <hemisphereLight
        color="#E0E7FF"
        groundColor="#78716C"
        intensity={isDark ? 0.35 : 0.5}
      />
      <AnimatedPackingScene
        timelineRef={timelineRef}
        isPaused={isPaused}
        onPackedChange={onPackedChange}
        onCompletedChange={onCompletedChange}
      />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 1.85}
      />
    </>
  )
}

type Hero3DCanvasProps = {
  className?: string
  showLabel?: boolean
}

export function Hero3DCanvas({
  className = 'h-[350px] sm:h-[450px]',
  showLabel = true,
}: Hero3DCanvasProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const timelineRef = useRef<gsap.core.Timeline | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [packed, setPacked] = useState(false)
  const [completed, setCompleted] = useState(false)

  function handleReplayPause() {
    if (!timelineRef.current) return
    if (isPaused) {
      timelineRef.current.restart(true)
      setIsPaused(false)
    } else {
      timelineRef.current.pause()
      setIsPaused(true)
    }
  }

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-hairline backdrop-blur-sm ${
        isDark
          ? 'bg-[#1a2030]/80 shadow-[0_0_48px_rgba(129,140,248,0.18)]'
          : 'bg-[#eef1f6] shadow-[0_0_32px_rgba(99,102,241,0.12)]'
      } ${className}`}
      aria-label="Animated 3D AI packing simulation — fashion items"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background: isDark
            ? 'radial-gradient(ellipse 80% 65% at 50% 45%, rgba(129,140,248,0.2), transparent 70%)'
            : 'radial-gradient(ellipse 80% 65% at 50% 45%, rgba(99,102,241,0.12), transparent 70%)',
        }}
      />

      {showLabel ? (
        <button
          type="button"
          onClick={handleReplayPause}
          className={`absolute top-3 right-3 z-20 rounded-md border px-2.5 py-1 text-[10px] font-medium backdrop-blur-sm transition-colors ${
            isDark
              ? 'border-white/10 bg-slate-900/85 text-slate-200 hover:bg-slate-800 hover:text-white'
              : 'border-slate-300 bg-white/90 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          {isPaused ? '▶ Replay AI Packing Sequence' : '⏸ Pause'}
        </button>
      ) : null}

      {packed && showLabel ? (
        <p className="pointer-events-none absolute bottom-10 left-1/2 z-20 -translate-x-1/2 rounded-md border border-hairline bg-surface-1/70 px-3 py-1 text-[11px] font-medium text-ink">
          📦 Tối ưu không gian: 92% • Đã xếp gọn 5/5 SKU
        </p>
      ) : null}

      {completed && showLabel ? (
        <p className="pointer-events-none absolute bottom-16 left-1/2 z-20 -translate-x-1/2 rounded-md border border-hairline bg-surface-1/70 px-3 py-1 text-[11px] font-medium text-ink">
          ✅ Đã đóng gói hoàn tất (Box Sealed)
        </p>
      ) : null}

      <Canvas
        className="relative z-10 touch-none"
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [3.8, 2.5, 4.8], fov: 42 }}
        gl={{ alpha: true, antialias: true }}
      >
        <Suspense fallback={null}>
          <Scene
            timelineRef={timelineRef}
            isPaused={isPaused}
            isDark={isDark}
            onPackedChange={setPacked}
            onCompletedChange={setCompleted}
          />
        </Suspense>
      </Canvas>

      {showLabel ? (
        <p className={`pointer-events-none absolute bottom-3 left-0 right-0 z-20 text-center font-mono text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Drag to Rotate · Ngành Thời trang & Phụ kiện
        </p>
      ) : null}
    </div>
  )
}

useGLTF.preload('/models/shirt.glb')
useGLTF.preload('/models/trousers.glb')
useGLTF.preload('/models/backpack.glb')
useGLTF.preload('/models/hat.glb')
useGLTF.preload('/models/glasses.glb')
