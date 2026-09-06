import { Suspense, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Edges, OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { usePortal } from '../../context/use-portal'

// Box & Fashion Items Geometry Scene (Quần áo & Phụ kiện đi kèm)
function Box3DScene({ zoomed }: { zoomed: boolean }) {
  // Dimensions for Hộp S: 40 x 30 x 12 cm (scaled: 4.0 x 1.2 x 3.0)
  const boxW = 4.0
  const boxH = 1.2
  const boxD = 3.0

  return (
    <>
      <ambientLight intensity={1.8} />
      <directionalLight position={[6, 10, 8]} intensity={2.0} />
      <directionalLight position={[-6, -4, -6]} intensity={0.6} color="#93c5fd" />

      <group position={[0, zoomed ? -0.1 : -0.2, 0]}>
        {/* 1. Translucent Blue Carton Shell */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[boxW, boxH, boxD]} />
          <meshPhysicalMaterial
            color="#bfdbfe"
            transparent
            opacity={0.22}
            roughness={0.1}
            transmission={0.65}
            thickness={0.8}
            depthWrite={false}
          />
          <Edges color="#3b82f6" threshold={15} />
        </mesh>

        {/* 2. Item 1: Áo Blazer Nam Slim Fit (Gấp phẳng ở đáy bên trái) */}
        <group position={[-0.6, -boxH / 2 + 0.16, -0.15]}>
          <mesh>
            <boxGeometry args={[2.3, 0.24, 2.2]} />
            <meshStandardMaterial color="#94a3b8" transparent opacity={0.65} />
            <Edges color="#334155" />
          </mesh>
          {/* Collar & Lapel crease lines */}
          <mesh position={[0, 0.13, -0.3]}>
            <boxGeometry args={[1.1, 0.04, 0.6]} />
            <meshStandardMaterial color="#cbd5e1" transparent opacity={0.75} />
            <Edges color="#475569" />
          </mesh>
          {/* Seam line */}
          <mesh position={[0, 0.13, 0.4]}>
            <boxGeometry args={[0.06, 0.03, 1.2]} />
            <meshStandardMaterial color="#64748b" />
          </mesh>
        </group>

        {/* 3. Item 2: Khăn Choàng Cashmere (Xếp gọn gàng bên phải) */}
        <group position={[1.05, -boxH / 2 + 0.16, -0.55]} rotation={[0, 0.05, 0]}>
          <mesh>
            <boxGeometry args={[1.35, 0.22, 1.4]} />
            <meshStandardMaterial color="#cbd5e1" transparent opacity={0.7} />
            <Edges color="#475569" />
          </mesh>
          {/* Folded textile rib layers */}
          {[-0.35, 0, 0.35].map((fz) => (
            <mesh key={fz} position={[0, 0.12, fz]}>
              <boxGeometry args={[1.25, 0.03, 0.28]} />
              <meshStandardMaterial color="#94a3b8" transparent opacity={0.6} />
              <Edges color="#64748b" />
            </mesh>
          ))}
        </group>

        {/* 4. Item 3: Ví Cầm Tay Da Nữ (Clutch góc trước bên phải) */}
        <group position={[1.05, -boxH / 2 + 0.18, 0.75]} rotation={[0, -0.05, 0]}>
          <mesh>
            <boxGeometry args={[1.35, 0.26, 0.75]} />
            <meshStandardMaterial color="#94a3b8" transparent opacity={0.75} />
            <Edges color="#334155" />
          </mesh>
          {/* Metallic Clasp / Khóa kim loại sang trọng */}
          <mesh position={[0, 0.14, 0.38]}>
            <boxGeometry args={[0.22, 0.06, 0.08]} />
            <meshStandardMaterial color="#f59e0b" metalness={0.9} roughness={0.2} />
          </mesh>
        </group>

        {/* 5. Item 4: Dây Chuyền Bạc (Hộp quà trang sức vuông vức) */}
        <group position={[-0.85, -boxH / 2 + 0.38, 0.65]}>
          <mesh>
            <boxGeometry args={[0.85, 0.2, 0.85]} />
            <meshStandardMaterial color="#cbd5e1" transparent opacity={0.8} />
            <Edges color="#0284c7" />
          </mesh>
          {/* Ribbon cross accent / Ruy-băng trang trí hộp quà */}
          <mesh position={[0, 0.11, 0]}>
            <boxGeometry args={[0.12, 0.03, 0.86]} />
            <meshStandardMaterial color="#38bdf8" />
          </mesh>
          <mesh position={[0, 0.11, 0]}>
            <boxGeometry args={[0.86, 0.03, 0.12]} />
            <meshStandardMaterial color="#38bdf8" />
          </mesh>
        </group>

        {/* 6. Subtly styled dimension guides */}
        <group position={[0, -boxH / 2 - 0.15, 0]}>
          <gridHelper args={[5, 10, '#94a3b8', '#e2e8f0']} />
        </group>
      </group>
    </>
  )
}

// Fallback technical blueprint illustration if WebGL is loading or unavailable
function BlueprintSvgFallback() {
  return (
    <div className="relative w-full h-full flex items-center justify-center p-6">
      <svg
        viewBox="0 0 500 320"
        className="w-full max-w-[420px] h-auto drop-shadow-md"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Isometric outer box */}
        <polygon
          points="250,50 430,130 250,210 70,130"
          className="fill-blue-100/40 stroke-blue-500 stroke-[1.8]"
        />
        <polygon
          points="70,130 250,210 250,280 70,200"
          className="fill-blue-200/30 stroke-blue-500 stroke-[1.8]"
        />
        <polygon
          points="250,210 430,130 430,200 250,280"
          className="fill-blue-300/30 stroke-blue-500 stroke-[1.8]"
        />

        {/* Item 1: Áo Blazer Nam xếp phẳng ở đáy */}
        <polygon
          points="180,120 310,175 220,215 90,160"
          className="fill-slate-300/40 stroke-slate-600 stroke-[1.2]"
        />
        <line x1="90" y1="160" x2="90" y2="175" className="stroke-slate-600 stroke-1" />
        <line x1="220" y1="215" x2="220" y2="230" className="stroke-slate-600 stroke-1" />
        <line x1="310" y1="175" x2="310" y2="190" className="stroke-slate-600 stroke-1" />
        <polygon
          points="90,175 220,230 310,190 180,135"
          className="fill-slate-400/20 stroke-slate-600 stroke-1"
        />
        {/* Blazer Lapel Crease Line */}
        <line x1="180" y1="140" x2="220" y2="195" className="stroke-blue-600 stroke-1 stroke-dasharray-[3,2]" />

        {/* Item 2: Khăn Choàng Cashmere xếp bên phải */}
        <polygon
          points="315,145 395,180 345,205 265,170"
          className="fill-amber-100/40 stroke-amber-700 stroke-1"
        />
        <line x1="265" y1="170" x2="265" y2="182" className="stroke-amber-700 stroke-1" />
        <line x1="345" y1="205" x2="345" y2="217" className="stroke-amber-700 stroke-1" />
        <line x1="395" y1="180" x2="395" y2="192" className="stroke-amber-700 stroke-1" />

        {/* Item 3: Ví Cầm Tay Da Nữ (Clutch góc trước) */}
        <polygon
          points="275,190 355,225 325,242 245,207"
          className="fill-slate-300/50 stroke-slate-700 stroke-[1.3]"
        />
        <line x1="245" y1="207" x2="245" y2="222" className="stroke-slate-700 stroke-1" />
        <line x1="325" y1="242" x2="325" y2="257" className="stroke-slate-700 stroke-1" />
        <line x1="355" y1="225" x2="355" y2="240" className="stroke-slate-700 stroke-1" />
        {/* Clasp */}
        <circle cx="300" cy="225" r="3.5" className="fill-amber-500 stroke-amber-700 stroke-1" />

        {/* Item 4: Hộp Đựng Dây Chuyền Bạc (Jewelry Gift Box) */}
        <polygon
          points="155,175 205,198 180,212 130,189"
          className="fill-sky-100/60 stroke-sky-600 stroke-1"
        />
        <line x1="130" y1="189" x2="130" y2="202" className="stroke-sky-600 stroke-1" />
        <line x1="180" y1="212" x2="180" y2="225" className="stroke-sky-600 stroke-1" />
        <line x1="205" y1="198" x2="205" y2="211" className="stroke-sky-600 stroke-1" />
        {/* Ribbon cross */}
        <line x1="142" y1="182" x2="192" y2="205" className="stroke-sky-500 stroke-1" />
        <line x1="180" y1="186" x2="155" y2="200" className="stroke-sky-500 stroke-1" />

        {/* Dimension labels */}
        <text x="130" y="255" className="fill-blue-600 font-mono text-[11px] font-semibold">
          40 cm
        </text>
        <text x="355" y="255" className="fill-blue-600 font-mono text-[11px] font-semibold">
          30 cm
        </text>
        <text x="445" y="170" className="fill-blue-600 font-mono text-[11px] font-semibold">
          12 cm
        </text>
      </svg>
    </div>
  )
}

export function Packing3DBoxViewer({
  boxLabel,
  boxSub,
}: {
  boxLabel?: string
  boxSub?: string
}) {
  const { locale } = usePortal()
  const vi = locale === 'vi'

  const activeBoxLabel = boxLabel ?? (vi ? 'Hộp S: 40 x 30 x 12 cm' : 'Box S: 40 x 30 x 12 cm')
  const activeBoxSub = boxSub ?? (vi ? 'Tối ưu thể tích đóng gói' : 'Volumetric packing optimized')

  const [zoomed, setZoomed] = useState(false)
  const [orbitKey, setOrbitKey] = useState(0)
  const controlsRef = useRef<OrbitControlsImpl>(null)

  const handleReset = () => {
    setZoomed(false)
    setOrbitKey((k) => k + 1)
    if (controlsRef.current) {
      controlsRef.current.reset()
    }
  }

  const handleToggleZoom = () => {
    setZoomed((z) => !z)
  }

  return (
    <div className="relative w-full h-[340px] sm:h-[380px] rounded-2xl overflow-hidden border border-slate-100 bg-[#f8faff] dark:border-slate-800 dark:bg-slate-900/40 select-none">
      {/* Floating Tag (Top-left) matching screenshot */}
      <div className="absolute top-4 left-4 z-20 pointer-events-none rounded-xl border border-slate-200/90 bg-white/95 px-3.5 py-2.5 shadow-sm dark:border-slate-800 dark:bg-surface-1/95 backdrop-blur-xs">
        <p className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 tracking-tight">
          {activeBoxLabel}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
          {activeBoxSub}
        </p>
      </div>

      {/* Interactive 3D Canvas with WebGL */}
      <div className="w-full h-full cursor-grab active:cursor-grabbing">
        <Suspense fallback={<BlueprintSvgFallback />}>
          <Canvas
            camera={{
              position: zoomed ? [3.2, 2.4, 3.8] : [4.5, 3.4, 5.0],
              fov: 42,
            }}
          >
            <Box3DScene zoomed={zoomed} />
            <OrbitControls
              key={orbitKey}
              ref={controlsRef}
              enableZoom={true}
              enablePan={false}
              minDistance={3.0}
              maxDistance={8.5}
              minPolarAngle={Math.PI / 6}
              maxPolarAngle={Math.PI / 2.1}
            />
          </Canvas>
        </Suspense>
      </div>

      {/* Floating Tool Buttons (Bottom-right) matching screenshot: [ 🔍 ] [ 🔄 ] */}
      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={handleToggleZoom}
          className="h-9 w-9 rounded-xl border border-slate-200/90 bg-white/95 text-slate-700 shadow-sm hover:bg-slate-50 hover:text-blue-600 active:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer dark:border-slate-800 dark:bg-surface-1/95 dark:text-slate-300"
          title={zoomed ? (vi ? 'Thu nhỏ' : 'Zoom out') : (vi ? 'Phóng to kiểm tra' : 'Zoom in')}
          aria-label={zoomed ? (vi ? 'Thu nhỏ' : 'Zoom out') : (vi ? 'Phóng to kiểm tra' : 'Zoom in')}
        >
          {zoomed ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={handleReset}
          className="h-9 w-9 rounded-xl border border-slate-200/90 bg-white/95 text-slate-700 shadow-sm hover:bg-slate-50 hover:text-blue-600 active:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer dark:border-slate-800 dark:bg-surface-1/95 dark:text-slate-300"
          title={vi ? 'Đặt lại góc nhìn 3D' : 'Reset 3D view'}
          aria-label={vi ? 'Đặt lại góc nhìn 3D' : 'Reset 3D view'}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
