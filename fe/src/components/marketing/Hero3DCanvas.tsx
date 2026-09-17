import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Edges, OrbitControls, useGLTF } from '@react-three/drei'
import gsap from 'gsap'
import type { Group, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { useTheme } from '../../hooks/useTheme'
import {
  buildPackingSceneFromCode,
  type PackingSceneConfig,
  type Vec3,
} from '../../utils/packing-scene'

const KRAFT = '#C49A6C'
const KRAFT_FLAP = '#D4AE80'
const WIRE = '#818CF8'
const PACK_STAGGER = 0.3
const HALF_PI = Math.PI / 2

export type PackingCameraView = 'iso' | 'top' | 'front'

const BASE_CAMERA_POS: Record<PackingCameraView, Vec3> = {
  iso: [3.8, 2.5, 4.8],
  top: [0.05, 7.6, 0.15],
  front: [0, 1.8, 6.2],
}

/** Open = flat outward; closed = flat inward over the opening (toward box center). */
const FLAP_OPEN_ROT = {
  front: HALF_PI,
  back: -HALF_PI,
  left: HALF_PI,
  right: -HALF_PI,
} as const
const FLAP_CLOSED_ROT = {
  front: -HALF_PI,
  back: HALF_PI,
  left: -HALF_PI,
  right: HALF_PI,
} as const

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

function CameraRig({
  view,
  cameraScale,
}: {
  view: PackingCameraView
  cameraScale: number
}) {
  const { camera } = useThree()

  useEffect(() => {
    const [bx, by, bz] = BASE_CAMERA_POS[view]
    const x = bx * cameraScale
    const y = by * cameraScale
    const z = bz * cameraScale
    gsap.to(camera.position, {
      x,
      y,
      z,
      duration: 0.55,
      ease: 'power2.out',
      onUpdate: () => camera.lookAt(0, 0.2 * cameraScale, 0),
    })
  }, [view, camera, cameraScale])

  return null
}

function AnimatedPackingScene({
  sceneConfig,
  timelineRef,
  isPaused,
  highlightedItemIds,
  onPackedChange,
  onCompletedChange,
}: {
  sceneConfig: PackingSceneConfig
  timelineRef: MutableRefObject<gsap.core.Timeline | null>
  isPaused: boolean
  highlightedItemIds: string[]
  onPackedChange: (v: boolean) => void
  onCompletedChange: (v: boolean) => void
}) {
  const { box, fashionItems, topY, hoverY, shortFlapH, longFlapH, flapThick } =
    sceneConfig

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

  useFrame((_, delta) => {
    if (initialized.current) {
      itemRefs.forEach((r, i) => {
        const g = r.current
        if (!g) return
        const on = highlightedItemIds.includes(fashionItems[i].id)
        const target = on ? 1.16 : 1
        g.scale.setScalar(
          g.scale.x + (target - g.scale.x) * Math.min(1, delta * 10),
        )
      })
      return
    }

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

    fashionItems.forEach((item, i) => {
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

    fashionItems.forEach((_item, i) => {
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

    tl.addLabel('pack')
    fashionItems.forEach((item, i) => {
      const ref = itemRefs[i].current!
      const [targetX, targetY, targetZ] = item.packed.position
      const { rotation } = item.packed

      tl.to(
        ref.position,
        {
          keyframes: [
            { y: hoverY, duration: 0.4, ease: 'power2.out' },
            { x: targetX, z: targetZ, y: hoverY, duration: 0.4, ease: 'none' },
            { y: targetY, duration: 0.5, ease: 'power2.out' },
          ],
          ease: 'none',
        },
        `pack+=${i * PACK_STAGGER}`,
      )
      tl.to(
        ref.rotation,
        {
          x: rotation[0],
          y: rotation[1],
          z: rotation[2],
          duration: 0.5,
          ease: 'power2.out',
        },
        `pack+=${i * PACK_STAGGER + 0.8}`,
      )
    })
    tl.add(() => {
      onPackedChange(true)
    }, '+=0.05')
    tl.to({}, { duration: 0.35 })

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

    tl.addLabel('unpack')
    fashionItems.forEach((item, i) => {
      const ref = itemRefs[i].current!
      const [floatX, floatY, floatZ] = item.float.position
      const { rotation } = item.float

      tl.to(
        ref.position,
        {
          keyframes: [
            { y: hoverY, duration: 0.35, ease: 'power2.out' },
            { x: floatX, z: floatZ, y: hoverY, duration: 0.4, ease: 'none' },
            { y: floatY, duration: 0.4, ease: 'power2.out' },
          ],
          ease: 'none',
        },
        `unpack+=${i * PACK_STAGGER}`,
      )
      tl.to(
        ref.rotation,
        {
          x: rotation[0],
          y: rotation[1],
          z: rotation[2],
          duration: 0.4,
          ease: 'power2.out',
        },
        `unpack+=${i * PACK_STAGGER + 0.35}`,
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
  }, [timelineRef, sceneConfig.cartonCode])

  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.paused(isPaused)
    }
  }, [isPaused, timelineRef])

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, -0.05, 0]}>
        <boxGeometry args={[box.w, box.h, box.d]} />
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

      <group ref={flapFrontRef} position={[0, topY, box.d / 2]}>
        <mesh position={[0, longFlapH / 2, 0]}>
          <boxGeometry args={[box.w, longFlapH, flapThick]} />
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
      <group ref={flapBackRef} position={[0, topY, -box.d / 2]}>
        <mesh position={[0, longFlapH / 2, 0]}>
          <boxGeometry args={[box.w, longFlapH, flapThick]} />
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
      <group ref={flapLeftRef} position={[-box.w / 2, topY, 0]}>
        <mesh position={[0, shortFlapH / 2, 0]}>
          <boxGeometry args={[flapThick, shortFlapH, box.d]} />
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
      <group ref={flapRightRef} position={[box.w / 2, topY, 0]}>
        <mesh position={[0, shortFlapH / 2, 0]}>
          <boxGeometry args={[flapThick, shortFlapH, box.d]} />
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

      {fashionItems.map((item, i) => (
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
        distance={3.2 * sceneConfig.cameraScale}
        decay={2}
      />
    </group>
  )
}

function Scene({
  sceneConfig,
  timelineRef,
  isPaused,
  isDark,
  cameraView,
  highlightedItemIds,
  onPackedChange,
  onCompletedChange,
}: {
  sceneConfig: PackingSceneConfig
  timelineRef: MutableRefObject<gsap.core.Timeline | null>
  isPaused: boolean
  isDark: boolean
  cameraView: PackingCameraView
  highlightedItemIds: string[]
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
      <CameraRig view={cameraView} cameraScale={sceneConfig.cameraScale} />
      <AnimatedPackingScene
        key={sceneConfig.cartonCode}
        sceneConfig={sceneConfig}
        timelineRef={timelineRef}
        isPaused={isPaused}
        highlightedItemIds={highlightedItemIds}
        onPackedChange={onPackedChange}
        onCompletedChange={onCompletedChange}
      />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        minPolarAngle={cameraView === 'top' ? 0 : Math.PI / 4}
        maxPolarAngle={cameraView === 'top' ? 0.35 : Math.PI / 1.85}
      />
    </>
  )
}

type Hero3DCanvasProps = {
  className?: string
  showLabel?: boolean
  cameraView?: PackingCameraView
  highlightedItemIds?: string[]
  replayToken?: number
  paused?: boolean
  onPausedChange?: (paused: boolean) => void
  framed?: boolean
  /** Carton inventory code — drives box dimensions and packing layout. */
  cartonCode?: string
}

export function Hero3DCanvas({
  className = 'h-[350px] sm:h-[450px]',
  showLabel = true,
  cameraView = 'iso',
  highlightedItemIds = [],
  replayToken = 0,
  paused,
  onPausedChange,
  framed = true,
  cartonCode,
}: Hero3DCanvasProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const timelineRef = useRef<gsap.core.Timeline | null>(null)
  const [internalPaused, setInternalPaused] = useState(false)
  const [packed, setPacked] = useState(false)
  const [completed, setCompleted] = useState(false)
  const isPaused = paused ?? internalPaused

  const sceneConfig = useMemo(
    () => buildPackingSceneFromCode(cartonCode),
    [cartonCode],
  )

  const [isoX, isoY, isoZ] = BASE_CAMERA_POS.iso
  const initialCamera: Vec3 = [
    isoX * sceneConfig.cameraScale,
    isoY * sceneConfig.cameraScale,
    isoZ * sceneConfig.cameraScale,
  ]

  function setPaused(next: boolean) {
    setInternalPaused(next)
    onPausedChange?.(next)
  }

  useEffect(() => {
    if (!replayToken || !timelineRef.current) return
    timelineRef.current.restart(true)
    setPaused(false)
    setPacked(false)
    setCompleted(false)
  }, [replayToken])

  function handleReplayPause() {
    if (!timelineRef.current) return
    if (isPaused) {
      timelineRef.current.restart(true)
      setPaused(false)
    } else {
      timelineRef.current.pause()
      setPaused(true)
    }
  }

  return (
    <div
      className={`relative w-full overflow-hidden ${
        framed
          ? `rounded-xl border border-hairline backdrop-blur-sm ${
              isDark
                ? 'bg-[#1a2030]/80 shadow-[0_0_48px_rgba(129,140,248,0.18)]'
                : 'bg-[#eef1f6] shadow-[0_0_32px_rgba(99,102,241,0.12)]'
            }`
          : 'min-h-[280px] bg-[#1a2030]/90'
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
        key={sceneConfig.cartonCode}
        className="absolute inset-0 z-10 h-full w-full touch-none"
        shadows
        dpr={[1, 1.5]}
        camera={{ position: initialCamera, fov: 42 }}
        gl={{ alpha: true, antialias: true }}
      >
        <Suspense fallback={null}>
          <Scene
            sceneConfig={sceneConfig}
            timelineRef={timelineRef}
            isPaused={isPaused}
            isDark={isDark}
            cameraView={cameraView}
            highlightedItemIds={highlightedItemIds}
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
