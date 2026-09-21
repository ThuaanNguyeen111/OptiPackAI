import { Suspense, useMemo, useRef, useState, type RefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Edges, OrbitControls } from '@react-three/drei'
import type { Mesh, MeshStandardMaterial } from 'three'
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react'
import type { DimensionsMm, Placement } from '../../types/packaging'

/**
 * Animation 3D phương án xếp hàng do engine tính (tọa độ thật, mm).
 * Mỗi món rơi từ trên miệng thùng xuống đúng vị trí theo thứ tự `step`.
 * Trục engine: x = dài, y = rộng, z = cao → three.js: x, z, y (y hướng lên).
 * Nơi dùng truyền `key` theo phương án để đổi đơn/đổi thùng thì chạy lại từ đầu.
 */

const SECONDS_PER_ITEM = 0.8
const SCENE_SIZE = 4 // cạnh lớn nhất của thùng quy về 4 đơn vị scene

function skuColor(sku: string): string {
  let hash = 0
  for (let i = 0; i < sku.length; i += 1) hash = (hash * 31 + sku.charCodeAt(i)) | 0
  const hue = Math.abs(hash) % 360
  return `hsl(${String(hue)}, 62%, 56%)`
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

type SceneProps = {
  box: DimensionsMm
  placements: Placement[]
  progressRef: RefObject<number>
}

function ItemMesh({
  placement,
  index,
  box,
  scale,
  progressRef,
}: {
  placement: Placement
  index: number
  box: DimensionsMm
  scale: number
  progressRef: RefObject<number>
}) {
  const meshRef = useRef<Mesh>(null)
  const materialRef = useRef<MeshStandardMaterial>(null)
  const color = useMemo(() => skuColor(placement.sku), [placement.sku])

  // Vị trí tâm món trong scene (thùng đặt tâm đáy tại gốc tọa độ).
  const target = useMemo(
    () => ({
      x: (placement.x + placement.dx / 2 - box.lengthMm / 2) * scale,
      y: (placement.z + placement.dz / 2) * scale,
      z: (placement.y + placement.dy / 2 - box.widthMm / 2) * scale,
    }),
    [placement, box, scale],
  )
  const dropFrom = (box.heightMm + placement.dz) * scale + 0.8

  useFrame(() => {
    const mesh = meshRef.current
    const material = materialRef.current
    if (!mesh || !material) return
    const local = progressRef.current - index
    if (local <= 0) {
      mesh.visible = false
      return
    }
    mesh.visible = true
    const t = Math.min(local, 1)
    const eased = easeOutCubic(t)
    mesh.position.set(target.x, dropFrom + (target.y - dropFrom) * eased, target.z)
    const active = local < 1
    material.opacity = active ? 0.95 : 0.8
    material.emissiveIntensity = active ? 0.35 : 0
  })

  return (
    <mesh ref={meshRef} visible={false}>
      <boxGeometry args={[placement.dx * scale * 0.985, placement.dz * scale * 0.985, placement.dy * scale * 0.985]} />
      <meshStandardMaterial ref={materialRef} color={color} emissive={color} transparent opacity={0.8} />
      <Edges color="#0f172a" />
    </mesh>
  )
}

function PackingScene({ box, placements, progressRef }: SceneProps) {
  const scale = SCENE_SIZE / Math.max(box.lengthMm, box.widthMm, box.heightMm)
  const L = box.lengthMm * scale
  const W = box.widthMm * scale
  const H = box.heightMm * scale

  return (
    <>
      <ambientLight intensity={1.4} />
      <directionalLight position={[6, 10, 8]} intensity={1.8} />
      <directionalLight position={[-6, 4, -6]} intensity={0.5} color="#93c5fd" />
      <group position={[0, -H / 2, 0]}>
        <mesh position={[0, H / 2, 0]}>
          <boxGeometry args={[L, H, W]} />
          <meshPhysicalMaterial color="#bfdbfe" transparent opacity={0.12} roughness={0.2} depthWrite={false} />
          <Edges color="#2563eb" />
        </mesh>
        {placements.map((p, i) => (
          <ItemMesh key={p.itemKey} placement={p} index={i} box={box} scale={scale} progressRef={progressRef} />
        ))}
        <gridHelper args={[Math.max(L, W) * 1.6, 16, '#94a3b8', '#e2e8f0']} />
      </group>
    </>
  )
}

/** Điều khiển tiến trình trong vòng render của three.js (không re-render React mỗi frame). */
function ProgressDriver({
  progressRef,
  playing,
  speed,
  limit,
  onStep,
  onEnd,
}: {
  progressRef: RefObject<number>
  playing: boolean
  speed: number
  /** Dừng khi tiến trình chạm mốc này (tổng số món, hoặc 1 bước khi bấm "Bước sau"). */
  limit: number
  onStep: (step: number) => void
  onEnd: () => void
}) {
  const lastStep = useRef(-1)
  useFrame((_, delta) => {
    if (playing && progressRef.current < limit) {
      progressRef.current = Math.min(limit, progressRef.current + (delta * speed) / SECONDS_PER_ITEM)
      if (progressRef.current >= limit) onEnd()
    }
    const step = Math.floor(progressRef.current)
    if (step !== lastStep.current) {
      lastStep.current = step
      onStep(step)
    }
  })
  return null
}

export type PackingAnimation3DProps = {
  box: DimensionsMm
  placements: Placement[]
  vi: boolean
}

export function PackingAnimation3D({ box, placements, vi }: PackingAnimation3DProps) {
  const ordered = useMemo(() => [...placements].sort((a, b) => a.step - b.step), [placements])
  const total = ordered.length
  const progressRef = useRef(0)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [step, setStep] = useState(0)
  const [stopAt, setStopAt] = useState<number | null>(null)

  const seek = (target: number) => {
    const clamped = Math.max(0, Math.min(total, target))
    progressRef.current = clamped
    setStep(clamped)
    setStopAt(null)
    setPlaying(false)
  }

  // "Bước sau": cho đúng 1 món rơi xuống (có animation) rồi dừng.
  const playNext = () => {
    if (step >= total) return
    progressRef.current = step
    setStopAt(step + 1)
    setPlaying(true)
  }

  const current = step > 0 ? ordered[step - 1] : undefined
  const fmt = (n: number) => n.toLocaleString(vi ? 'vi-VN' : 'en-US')

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <div className="relative h-[340px] min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white dark:border-slate-800 dark:from-slate-900 dark:to-slate-950 sm:h-[420px]">
        <Canvas camera={{ position: [5.2, 4.2, 5.2], fov: 42 }} dpr={[1, 2]}>
          <Suspense fallback={null}>
            <PackingScene box={box} placements={ordered} progressRef={progressRef} />
            <ProgressDriver
              progressRef={progressRef}
              playing={playing}
              speed={speed}
              limit={stopAt ?? total}
              onStep={setStep}
              onEnd={() => {
                setPlaying(false)
                setStopAt(null)
              }}
            />
          </Suspense>
          <OrbitControls makeDefault enablePan={false} minDistance={3} maxDistance={14} />
        </Canvas>

        <div className="absolute inset-x-2 bottom-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-white/90 p-1.5 shadow-sm backdrop-blur dark:bg-slate-900/90">
          <button
            type="button"
            onClick={() => {
              seek(0)
              setPlaying(true)
            }}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            title={vi ? 'Chạy lại' : 'Replay'}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              seek(step - 1)
            }}
            disabled={step === 0}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
            title={vi ? 'Bước trước' : 'Previous step'}
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!playing && progressRef.current >= total) progressRef.current = 0
              setStopAt(null)
              setPlaying((p) => !p)
            }}
            className="rounded-md bg-blue-600 p-1.5 text-white hover:bg-blue-700"
            title={playing ? (vi ? 'Tạm dừng' : 'Pause') : vi ? 'Phát' : 'Play'}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={playNext}
            disabled={step >= total}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
            title={vi ? 'Bước sau' : 'Next step'}
          >
            <SkipForward className="h-4 w-4" />
          </button>
          <div className="ml-1 flex items-center gap-0.5 text-xs">
            {[0.5, 1, 2].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSpeed(s)
                }}
                className={`rounded px-1.5 py-0.5 ${speed === s ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                {s}×
              </button>
            ))}
          </div>
          <span className="ml-auto pr-1 text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">
            {vi ? 'Bước' : 'Step'} {step}/{total}
          </span>
        </div>
      </div>

      <ol className="max-h-[420px] w-full shrink-0 space-y-1 overflow-y-auto text-xs lg:w-72">
        {ordered.map((p, i) => {
          const done = i < step
          const isCurrent = current?.itemKey === p.itemKey
          return (
            <li key={p.itemKey}>
              <button
                type="button"
                onClick={() => {
                  seek(i + 1)
                }}
                className={`flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
                  isCurrent
                    ? 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/40'
                    : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900'
                } ${done ? '' : 'opacity-60'}`}
              >
                <span
                  className="mt-0.5 h-3 w-3 shrink-0 rounded-sm border border-slate-700/30"
                  style={{ backgroundColor: skuColor(p.sku) }}
                />
                <span className="min-w-0">
                  <span className="block font-medium text-slate-800 dark:text-slate-100">
                    {p.step}. {p.sku} <span className="font-normal text-slate-400">({p.itemKey})</span>
                  </span>
                  <span className="block text-slate-500 dark:text-slate-400">
                    {fmt(p.dx)}×{fmt(p.dy)}×{fmt(p.dz)} mm · {vi ? 'góc' : 'at'} ({fmt(p.x)}, {fmt(p.y)}, {fmt(p.z)})
                    {p.z > 0 ? (vi ? ' · đặt chồng' : ' · stacked') : ''}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
