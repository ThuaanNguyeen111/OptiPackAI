import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Edit3,
  Package,
  Printer,
  Scale,
  ShoppingBag,
  X,
} from 'lucide-react'
import { usePortal } from '../../context/use-portal'
import {
  ORD_2026_9021_ITEMS,
  packingJobs,
  type VerificationItem,
} from '../../data/packing-dashboard-mock'
import { CARTON_INVENTORY } from '../../data/cartons'
import { Packing3DBoxViewer } from './Packing3DBoxViewer'

// ==========================================
// SUB-COMPONENTS
// ==========================================

/** Crisp realistic Shipping Label Barcode */
function ShippingBarcodeGraphic({ code }: { code: string }) {
  const bars = [
    2, 1, 3, 1, 1, 4, 2, 1, 3, 2, 1, 4, 1, 2, 3, 1, 4, 2, 1, 1, 3, 2, 4, 1, 2,
    3, 1, 4, 2, 1, 1, 3, 2, 4, 1, 1, 3, 1, 2, 4, 2, 1, 3, 1, 4, 2, 1, 2, 3, 1,
  ]

  return (
    <div className="flex flex-col items-center justify-center py-1">
      <svg
        className="h-10 w-full max-w-[210px]"
        viewBox="0 0 210 38"
        fill="currentColor"
        aria-hidden="true"
      >
        {bars.map((bar, i) => {
          if (i % 2 !== 0) return null
          const x = i * 4.1 + 4
          return (
            <rect
              key={i}
              x={x}
              y={0}
              width={bar * 1.05}
              height={38}
              className="fill-slate-900"
            />
          )
        })}
      </svg>
      <span className="mt-0.5 font-mono text-[10px] font-semibold tracking-[0.2em] text-slate-800">
        {code}
      </span>
    </div>
  )
}

/** Product Thumbnail with reliable fallback */
function VerificationItemThumb({
  src,
  alt,
}: {
  src: string
  alt: string
}) {
  const [error, setError] = useState(false)

  if (!src || error) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-500">
        <Camera className="h-5 w-5" />
      </div>
    )
  }

  return (
    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 p-1 dark:border-slate-800 dark:bg-surface-2">
      <img
        src={src}
        alt={alt}
        onError={() => setError(true)}
        className="h-full w-full object-contain rounded-md"
      />
    </div>
  )
}

// ==========================================
// MAIN COMPONENT & STATE MACHINE
// ==========================================

export type PackingStationStatus = 'scanning' | 'verified' | 'approved' | 'printed'

export interface PackingDashboardProps {
  onNavigateToShipping?: () => void
}

export function PackingDashboard({ onNavigateToShipping }: PackingDashboardProps = {}) {
  const navigate = useNavigate()
  const { locale } = usePortal()
  const vi = locale === 'vi'

  // Selected Packing Job (default to ORD-2026-9021 matching screenshot)
  const [currentJobId, setCurrentJobId] = useState<string>('ORD-2026-9021')
  const currentJob = useMemo(() => {
    return (
      packingJobs.find((j) => j.id === currentJobId) ?? packingJobs[0]!
    )
  }, [currentJobId])

  // Verification items state (allows toggling item 4 between awaiting scan and verified)
  const [verificationItems, setVerificationItems] = useState<VerificationItem[]>(
    () => structuredClone(currentJob.verification_items ?? ORD_2026_9021_ITEMS),
  )

  // Required packaging materials
  const materials = useMemo(() => {
    return vi
      ? [
          'Hộp Carton S',
          'Giấy Lụa: 2 tờ',
          'Túi Chống Ẩm: 1 gói',
          'Nhãn Dán Thương Hiệu',
        ]
      : [
          'Carton Box S',
          'Silk Paper: 2 sheets',
          'Desiccant Pouch: 1 pack',
          'Brand Label Sticker',
        ]
  }, [vi])

  // Active carton size
  const [boxLabel, setBoxLabel] = useState<string>('Hộp S: 40 x 30 x 12 cm')
  const [packagingCost, setPackagingCost] = useState<number>(0.45)
  const [shippingFee, setShippingFee] = useState<number>(2.10)
  const [optScore, setOptScore] = useState<number>(98)

  // UI & Approval states
  const [manualOverrideOpen, setManualOverrideOpen] = useState(false)
  const [planApproved, setPlanApproved] = useState(false)
  const [isPrinted, setIsPrinted] = useState(false)
  const [orderDropdownOpen, setOrderDropdownOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const showToast = (msg: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToastMessage(msg)
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 3500)
  }

  // Verification progress calculations
  const verifiedCount = useMemo(
    () => verificationItems.filter((i) => i.verified).length,
    [verificationItems],
  )
  const totalItems = verificationItems.length
  const progressPercent = Math.round((verifiedCount / totalItems) * 100)
  const allVerified = totalItems > 0 && verifiedCount === totalItems

  // Finite State Machine for Packing Station
  // States:
  // - 'scanning': Progress incomplete (e.g. 3/4). Both Approve and Print buttons disabled.
  // - 'verified': All items verified (4/4). Approve button enabled (Green). Print button still disabled.
  // - 'approved': User clicked Approve. Print button IMMEDIATELY activated. Subtext updated.
  // - 'printed': User clicked Print. Label printed and triggers navigation to Carrier Handover.
  const stationStatus: PackingStationStatus = useMemo(() => {
    if (isPrinted) return 'printed'
    if (allVerified && planApproved) return 'approved'
    if (allVerified) return 'verified'
    return 'scanning'
  }, [isPrinted, allVerified, planApproved])

  // Toggle verification for an item (e.g. click item 4 "Dây Chuyền Bạc" to scan and verify)
  const handleToggleItemVerify = (itemId: string) => {
    setVerificationItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item
        const nextState = !item.verified
        if (nextState) {
          showToast(
            vi
              ? `Đã quét và xác minh thành công: ${item.title} (${item.sku})`
              : `Scanned and verified: ${item.title} (${item.sku})`,
          )
        } else {
          showToast(
            vi
              ? `Đã chuyển về trạng thái chờ quét: ${item.title}`
              : `Reset to awaiting scan: ${item.title}`,
          )
        }
        return {
          ...item,
          verified: nextState,
          imageUrl:
            nextState && !item.imageUrl
              ? 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=300&auto=format&fit=crop&q=80'
              : item.imageUrl,
        }
      }),
    )

    // Reset approval and printed state if verification changes
    setPlanApproved(false)
    setIsPrinted(false)
  }

  // Handle Approve AI Plan (Requirement 2)
  const handleApprovePlan = () => {
    if (!allVerified) {
      showToast(
        vi
          ? 'Chưa thể phê duyệt! Vui lòng quét và xác minh đủ 4/4 sản phẩm.'
          : 'Cannot approve! Please scan and verify all items first.',
      )
      return
    }

    setPlanApproved(true)
    showToast(
      vi
        ? `Đã phê duyệt kế hoạch đóng gói AI cho đơn #${currentJob.id}! Có thể in nhãn ngay.`
        : `AI packaging plan approved for order #${currentJob.id}! Ready to print label.`,
    )
  }

  // Handle Print Label & Packing Slip + Handover Navigation (Requirement 3)
  const handlePrintLabel = () => {
    if (stationStatus !== 'approved' && stationStatus !== 'printed') {
      if (!allVerified) {
        showToast(
          vi
            ? 'Vui lòng xác minh đủ 4/4 sản phẩm trước khi in nhãn vận chuyển!'
            : 'Please verify all items before printing shipping label!',
        )
      } else {
        showToast(
          vi
            ? 'Vui lòng nhấn "Phê duyệt kế hoạch AI" trước khi in nhãn vận chuyển!'
            : 'Please approve the AI packaging plan before printing shipping label!',
        )
      }
      return
    }

    setIsPrinted(true)
    showToast(
      vi
        ? `Đang in nhãn vận chuyển A6 cho đơn #${currentJob.id}... Đang chuyển tới Bàn giao vận chuyển!`
        : `Printing A6 shipping label for #${currentJob.id}... Transferring to Carrier Handover!`,
    )

    // Route user to Screen 4 ("Carrier Handover Manifest Management / Vận chuyển")
    window.setTimeout(() => {
      if (onNavigateToShipping) {
        onNavigateToShipping()
      } else {
        navigate('/app/shipping')
      }
    }, 1000)
  }

  // Handle Carton Override Selection
  const handleSelectCarton = (code: string) => {
    const carton = CARTON_INVENTORY.find((c) => c.code === code)
    if (carton) {
      setBoxLabel(`${carton.code}: ${carton.length} x ${carton.width} x ${carton.height} cm`)
      setPackagingCost(carton.unitCost > 5000 ? 0.65 : 0.45)
      setShippingFee(carton.length > 30 ? 2.85 : 2.10)
      setOptScore(carton.code === 'CARTON-S1' || carton.code === 'CARTON-A1' ? 98 : 92)
      setManualOverrideOpen(false)
      showToast(
        vi
          ? `Đã thay đổi quy cách đóng gói sang ${carton.code}`
          : `Overridden box size to ${carton.code}`,
      )
    }
  }

  return (
    <div className="flex-1 overflow-auto bg-[#F8FAFC] p-4 sm:p-6 dark:bg-[#0B0E14]">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Toast Notification */}
        {toastMessage ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-medium text-blue-800 shadow-xs flex items-center justify-between dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
              <span>{toastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-blue-700 hover:text-blue-900 dark:text-blue-400"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        {/* ========================================================= */}
        {/* MAIN 3-COLUMN LAYOUT MATCHING USER'S SCREENSHOT EXACTLY   */}
        {/* ========================================================= */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
          {/* ======================================================= */}
          {/* COLUMN 1 (LEFT): ORDER INFO & ITEM VERIFICATION         */}
          {/* ======================================================= */}
          <div className="lg:col-span-4 xl:col-span-4 space-y-4">
            {/* 1.1 Order Info Card */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-surface-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                      {vi ? 'Đơn hàng' : 'Order'} #{currentJob.id}
                    </h2>
                    {/* Order switcher toggle */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOrderDropdownOpen((v) => !v)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 cursor-pointer"
                        title={vi ? 'Đổi đơn hàng' : 'Change order'}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>

                      {orderDropdownOpen && (
                        <div className="absolute left-0 top-full mt-1.5 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg z-30 dark:border-slate-800 dark:bg-surface-1">
                          <p className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 uppercase">
                            {vi ? 'Chọn đơn hàng' : 'Select order'}
                          </p>
                          {packingJobs.map((j) => (
                            <button
                              key={j.id}
                              type="button"
                              onClick={() => {
                                setCurrentJobId(j.id)
                                if (j.verification_items) {
                                  setVerificationItems(structuredClone(j.verification_items))
                                }
                                if (j.box_label) setBoxLabel(j.box_label)
                                if (j.packaging_cost_usd !== undefined) setPackagingCost(j.packaging_cost_usd)
                                if (j.shipping_fee_usd !== undefined) setShippingFee(j.shipping_fee_usd)
                                if (j.opt_score !== undefined) setOptScore(j.opt_score)
                                setPlanApproved(false)
                                setOrderDropdownOpen(false)
                              }}
                              className={`w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors flex items-center justify-between ${
                                j.id === currentJobId
                                  ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                                  : 'hover:bg-slate-50 text-slate-700 dark:hover:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              <span>#{j.id}</span>
                              <span className="text-[11px] text-slate-400">{j.customer_name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {currentJob.customer_name} •{' '}
                    {currentJob.delivery_service === 'Express Delivery'
                      ? (vi ? 'Giao hàng Hỏa tốc' : 'Express Delivery')
                      : (currentJob.delivery_service ?? (vi ? 'Giao hàng Hỏa tốc' : 'Express Delivery'))}
                  </p>
                </div>

                {/* Channel Badge */}
                {currentJob.channels.includes('tiktok') ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-2.5 py-1 text-[11px] font-bold text-[#00b4cc] dark:border-cyan-500/40 dark:bg-cyan-950/20 dark:text-cyan-400 shrink-0 select-none">
                    <ShoppingBag className="h-3.5 w-3.5 fill-current" />
                    <span>TIKTOK</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-[#f97316]/30 bg-[#fff7ed] px-2.5 py-1 text-[11px] font-bold text-[#ea580c] dark:border-orange-500/40 dark:bg-orange-950/20 dark:text-orange-400 shrink-0 select-none">
                    <ShoppingBag className="h-3.5 w-3.5 fill-current" />
                    <span>SHOPEE</span>
                  </span>
                )}
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] font-semibold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                      {vi ? 'ĐIỂM ĐẾN' : 'DESTINATION'}
                    </span>
                    <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">
                      {currentJob.destination ?? 'Singapore 138683'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                      {vi ? 'HẠN SLA' : 'SLA LIMIT'}
                    </span>
                    <p className="mt-1 font-mono font-semibold text-[#dc2626] dark:text-rose-400">
                      {currentJob.sla_limit
                        ? (vi ? currentJob.sla_limit.replace('2h left', 'còn 2h') : currentJob.sla_limit)
                        : (vi ? '14:30:00 (còn 2h)' : '14:30:00 (2h left)')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 1.2 Item Verification Card */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-surface-1">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {vi ? 'Xác minh mặt hàng' : 'Item Verification'}
                </h3>
                <span className="font-bold text-sm text-[#2563eb] dark:text-blue-400">
                  {verifiedCount}/{totalItems}
                </span>
              </div>

              {/* Progress bar */}
              <div className="mt-3 mb-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full bg-[#2563eb] transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Items List */}
              <div className="space-y-3">
                {verificationItems.map((item) => {
                  const isAwaitingScan = !item.verified

                  if (isAwaitingScan) {
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleToggleItemVerify(item.id)}
                        className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-3 flex items-center justify-between gap-3 transition-colors hover:bg-blue-50/50 hover:border-blue-300 cursor-pointer dark:border-slate-700 dark:bg-surface-2/40"
                        title={vi ? 'Nhấp để quét và xác minh mặt hàng này' : 'Click to scan and verify item'}
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-1">
                          <VerificationItemThumb src={item.imageUrl} alt={item.title} />

                          <div className="min-w-0">
                            <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                              SKU: {item.sku}
                            </p>
                            <p className="font-semibold text-xs text-slate-900 truncate dark:text-slate-100">
                              {item.title}
                            </p>
                            <div className="mt-1 flex items-center gap-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              <span className="flex items-center gap-1">
                                <span className="text-slate-400">▱</span>
                                <span>{item.dimensions}</span>
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="text-slate-400">⚖</span>
                                <span>{item.weightKg} kg</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* AWAITING SCAN badge matching screenshot */}
                        <span className="rounded bg-slate-100 px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 shrink-0 uppercase select-none">
                          {vi ? 'CHỜ QUÉT' : 'AWAITING SCAN'}
                        </span>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleToggleItemVerify(item.id)}
                      className="rounded-xl border border-slate-200/90 bg-white p-3 flex items-center justify-between gap-3 shadow-2xs transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-surface-1 cursor-pointer"
                      title={vi ? 'Nhấp để hoàn tác trạng thái xác minh' : 'Click to toggle verification'}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-1">
                        <VerificationItemThumb src={item.imageUrl} alt={item.title} />

                        <div className="min-w-0">
                          <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                            SKU: {item.sku}
                          </p>
                          <p className="font-semibold text-xs text-slate-900 truncate dark:text-slate-100">
                            {item.title}
                          </p>
                          <div className="mt-1 flex items-center gap-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1">
                              <span className="text-slate-400">▱</span>
                              <span>{item.dimensions}</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="text-slate-400">⚖</span>
                              <span>{item.weightKg} kg</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Green circle checkmark matching screenshot */}
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#16a34a] text-white shadow-xs">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ======================================================= */}
          {/* COLUMN 2 (CENTER): AI RECOMMENDATION ENGINE & 3D VIEWER */}
          {/* ======================================================= */}
          <div className="lg:col-span-5 xl:col-span-5">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-surface-1 space-y-4">
              {/* Header: AI Recommendation Engine + 98% Optimization Score */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-[#2563eb] dark:bg-blue-950/40 dark:text-blue-400">
                    <Bot className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {vi ? 'Động cơ gợi ý AI' : 'AI Recommendation Engine'}
                  </h3>
                </div>

                <div className="text-right">
                  <span className="block text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                    {vi ? 'ĐIỂM TỐI ƯU' : 'OPTIMIZATION SCORE'}
                  </span>
                  <span className="font-bold text-2xl text-[#16a34a] dark:text-emerald-400 leading-none">
                    {optScore}%
                  </span>
                </div>
              </div>

              {/* 3D Visualizer Box Container matching screenshot */}
              <Packing3DBoxViewer
                boxLabel={boxLabel}
                boxSub={vi ? 'Tối ưu thể tích đóng gói' : 'Volumetric packing optimized'}
              />

              {/* REQUIRED MATERIALS 2x2 Grid matching screenshot */}
              <div>
                <p className="text-[11px] font-bold tracking-wider text-slate-700 dark:text-slate-300 uppercase mb-2.5">
                  {vi ? 'VẬT TƯ YÊU CẦU' : 'REQUIRED MATERIALS'}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {materials.map((mat) => (
                    <div
                      key={mat}
                      className="rounded-xl border border-blue-100 bg-[#f0f6ff] px-3.5 py-2.5 text-xs font-semibold text-slate-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-slate-200 flex items-center gap-2.5 shadow-2xs select-none"
                    >
                      <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md bg-[#2563eb] text-white">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </div>
                      <span className="truncate">{mat}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cost & Shipping Metrics Row */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-surface-2/60">
                  <span className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                    {vi ? 'CHI PHÍ ĐÓNG GÓI' : 'PACKAGING COST'}
                  </span>
                  <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                    ${packagingCost.toFixed(2)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-surface-2/60">
                  <span className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                    {vi ? 'CƯỚC PHÍ VẬN CHUYỂN' : 'EST. SHIPPING FEE'}
                  </span>
                  <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                    <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                      ${shippingFee.toFixed(2)}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {vi ? '(T.tích: 1.0kg vs T.tế: 1.3kg)' : '(Vol: 1.0kg vs Act: 1.3kg)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Manual Override & Approve AI Plan */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setManualOverrideOpen(true)}
                  className="h-11 rounded-xl border border-slate-300 bg-white font-semibold text-xs text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors flex items-center justify-center gap-2 cursor-pointer dark:border-slate-700 dark:bg-surface-1 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Edit3 className="h-4 w-4 text-slate-500" />
                  <span>{vi ? 'Đổi quy cách thủ công' : 'Manual Override'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleApprovePlan}
                  disabled={stationStatus === 'scanning' || stationStatus === 'approved' || stationStatus === 'printed'}
                  className={`h-11 rounded-xl font-semibold text-xs shadow-xs transition-all flex items-center justify-center gap-2 select-none ${
                    stationStatus === 'scanning'
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 opacity-50 cursor-not-allowed border border-slate-300/60 dark:border-slate-700'
                      : stationStatus === 'verified'
                        ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white cursor-pointer shadow-md shadow-emerald-600/25 ring-2 ring-emerald-500/20'
                        : 'bg-emerald-700 text-white cursor-default shadow-xs'
                  }`}
                  title={
                    stationStatus === 'scanning'
                      ? vi
                        ? 'Cần xác minh đủ 4/4 sản phẩm trước khi phê duyệt'
                        : 'Verify all items before approval'
                      : stationStatus === 'verified'
                        ? vi
                          ? 'Nhấn để phê duyệt kế hoạch AI'
                          : 'Click to approve AI plan'
                        : vi
                          ? 'Kế hoạch đã được phê duyệt'
                          : 'Plan approved'
                  }
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {stationStatus === 'approved' || stationStatus === 'printed'
                      ? vi
                        ? 'Đã phê duyệt'
                        : 'Plan Approved'
                      : vi
                        ? 'Phê duyệt kế hoạch AI'
                        : 'Approve AI Plan'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* ======================================================= */}
          {/* COLUMN 3 (RIGHT): HARDWARE STATUS & LABEL PREVIEW       */}
          {/* ======================================================= */}
          <div className="lg:col-span-3 xl:col-span-3 space-y-4">
            {/* 3.1 Hardware Status Card */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-surface-1">
              <p className="text-[11px] font-bold tracking-wider text-slate-700 dark:text-slate-300 uppercase mb-3.5">
                {vi ? 'TRẠNG THÁI THIẾT BỊ' : 'HARDWARE STATUS'}
              </p>

              <div className="space-y-3 text-xs">
                {/* Printer */}
                <div className="flex items-center justify-between text-slate-800 dark:text-slate-200">
                  <div className="flex items-center gap-2.5">
                    <Printer className="h-4 w-4 text-slate-500" />
                    <span className="font-medium">{vi ? 'Máy in Zebra ZD421' : 'Zebra Printer ZD421'}</span>
                  </div>
                  <span className="h-2.5 w-2.5 rounded-full bg-[#16a34a] shadow-[0_0_8px_rgba(22,163,74,0.6)] shrink-0" />
                </div>

                {/* Scale */}
                <div className="flex items-center justify-between text-slate-800 dark:text-slate-200">
                  <div className="flex items-center gap-2.5">
                    <Scale className="h-4 w-4 text-slate-500" />
                    <span className="font-medium">{vi ? 'Cân điện tử Dibal (USB)' : 'Dibal Scale (USB)'}</span>
                  </div>
                  <span className="h-2.5 w-2.5 rounded-full bg-[#16a34a] shadow-[0_0_8px_rgba(22,163,74,0.6)] shrink-0" />
                </div>
              </div>
            </div>

            {/* 3.2 Label Preview Card */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-surface-1 space-y-4">
              <p className="text-[11px] font-bold tracking-wider text-slate-700 dark:text-slate-300 uppercase">
                {vi ? 'XEM TRƯỚC NHÃN IN' : 'LABEL PREVIEW'}
              </p>

              {/* Shipping Label Sheet Container matching screenshot */}
              <div className="relative rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xs select-none">
                {/* Angled DRAFT Watermark across center or READY Badge */}
                {stationStatus !== 'approved' && stationStatus !== 'printed' ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="rotate-[-25deg] font-mono text-4xl font-extrabold tracking-widest text-slate-200/80">
                      {vi ? 'BẢN NHÁP' : 'DRAFT'}
                    </span>
                  </div>
                ) : (
                  <div className="pointer-events-none absolute top-2 right-2">
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 uppercase">
                      {vi ? 'SẴN SÀNG' : 'READY'}
                    </span>
                  </div>
                )}

                {/* Top line: EXPRESS / SG */}
                <div className="flex items-center justify-between pb-1.5">
                  <span className="font-bold text-xs tracking-wider text-slate-900">
                    {vi ? 'HỎA TỐC' : 'EXPRESS'}
                  </span>
                  <span className="font-bold text-sm tracking-wide text-slate-900">
                    SG
                  </span>
                </div>

                <div className="border-t border-slate-900 my-1.5" />

                {/* Address block */}
                <div className="space-y-0.5 text-[11px] leading-tight text-slate-700 pt-0.5">
                  <p className="font-semibold text-slate-900">
                    {vi ? 'NGƯỜI NHẬN:' : 'TO:'} {currentJob.customer_name}
                  </p>
                  <p className="line-clamp-2">{currentJob.customer_address}</p>
                </div>

                {/* Barcode representation */}
                <div className="mt-4 mb-2">
                  <ShippingBarcodeGraphic code={currentJob.id} />
                </div>

                <div className="border-t border-slate-200 my-1.5" />

                {/* Footer specs */}
                <div className="flex items-center justify-end font-mono text-[9px] text-slate-500 gap-2">
                  <span>{vi ? `K.lượng: ${(currentJob.real_weight_g / 1000).toFixed(1)}kg` : `Weight: ${(currentJob.real_weight_g / 1000).toFixed(1)}kg`}</span>
                  <span>•</span>
                  <span>{vi ? `K.thước: ${currentJob.dim.w}×${currentJob.dim.l}×${currentJob.dim.h}` : `Dims: ${currentJob.dim.w}×${currentJob.dim.l}×${currentJob.dim.h}`}</span>
                </div>
              </div>

              {/* Print Button & Hint (Requirement 2 & 3) */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handlePrintLabel}
                  disabled={stationStatus !== 'approved' && stationStatus !== 'printed'}
                  className={`w-full h-11 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all select-none shadow-2xs ${
                    stationStatus === 'approved' || stationStatus === 'printed'
                      ? 'bg-[#4338ca] hover:bg-[#3730a3] active:bg-[#312e81] text-white shadow-indigo-500/25 shadow-md cursor-pointer'
                      : 'bg-[#e0e7ff]/70 text-[#4338ca]/50 cursor-not-allowed opacity-50 dark:bg-indigo-950/20 dark:text-indigo-400/40 border border-indigo-200/40 dark:border-indigo-900/40'
                  }`}
                >
                  <Printer className="h-4 w-4" />
                  <span>
                    {stationStatus === 'printed'
                      ? vi
                        ? 'Đang chuyển giao vận chuyển...'
                        : 'Transferring to Handover...'
                      : vi
                        ? 'In nhãn & Phiếu đóng gói'
                        : 'Print Label & Packing Slip'}
                  </span>
                </button>

                <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
                  {stationStatus === 'approved' || stationStatus === 'printed'
                    ? vi
                      ? 'Nhấn để in nhãn A6 và hoàn tất đóng gói'
                      : 'Click to print A6 label and complete packaging'
                    : stationStatus === 'verified'
                      ? vi
                        ? 'Cần phê duyệt kế hoạch AI trước khi in nhãn'
                        : 'Approve AI plan to enable printing'
                      : vi
                        ? 'Hoàn tất xác minh để kích hoạt in nhãn'
                        : 'Complete verification to enable printing'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* MANUAL OVERRIDE MODAL                                     */}
      {/* ========================================================= */}
      {manualOverrideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-surface-1">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  {vi ? 'Thay đổi quy cách đóng gói (Manual Override)' : 'Manual Override Packing Box'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setManualOverrideOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                {vi
                  ? 'Chọn kích thước thùng carton hoặc quy cách đóng gói thay thế theo tiêu chuẩn kho:'
                  : 'Select alternative carton size or packaging configuration:'}
              </p>

              <div className="space-y-2">
                {CARTON_INVENTORY.map((carton) => (
                  <button
                    key={carton.code}
                    type="button"
                    onClick={() => handleSelectCarton(carton.code)}
                    className="w-full rounded-xl border border-slate-200 p-3 text-left hover:border-blue-500 hover:bg-blue-50/50 transition-colors flex items-center justify-between dark:border-slate-800 dark:hover:bg-surface-2 cursor-pointer"
                  >
                    <div>
                      <p className="font-bold text-slate-900 dark:text-slate-100">
                        {carton.code}
                      </p>
                      <p className="font-mono text-[11px] text-slate-500">
                        {carton.length} × {carton.width} × {carton.height} cm ({vi ? `Tải tối đa: ${carton.maxWeight}` : `Max weight: ${carton.maxWeight}`})
                      </p>
                    </div>
                    <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                      {(carton.unitCost / 23000).toFixed(2)}$
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setManualOverrideOpen(false)}
                className="rounded-lg px-4 py-2 font-medium text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-surface-2"
              >
                {vi ? 'Đóng' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
