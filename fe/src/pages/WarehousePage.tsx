import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Flag,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  User,
  X,
} from 'lucide-react'
import { BatchDetailDrawer } from '../components/orders/BatchDetailDrawer'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'
import {
  initialPickingBatches,
  type PickingBatch,
} from '../data/picking-batches-mock'
import {
  getPickingItemsForBatch,
  type WarehousePickingItem,
} from '../data/warehouse-picking-mock'

// ==========================================
// SUB-COMPONENTS MATCHING SCREENSHOT EXACTLY
// ==========================================

/** Crisp realistic SVG Barcode Graphic */
function BarcodeGraphic({ code }: { code: string }) {
  // Deterministic bar widths matching screenshot density
  const bars = [
    3, 1, 2, 1, 4, 1, 2, 3, 1, 4, 2, 1, 1, 3, 2, 4, 1, 1, 3, 1, 2, 4, 2, 1, 3,
    1, 4, 2, 1, 2, 3, 1, 1, 4, 2, 1, 3, 2, 1, 4, 1, 2, 3, 1, 4, 2, 1, 1, 3, 2,
    4, 1,
  ]

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-100 bg-[#f8fafc] px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
      <svg
        className="h-12 w-full max-w-[280px]"
        viewBox="0 0 280 50"
        fill="currentColor"
        aria-hidden="true"
      >
        {bars.map((bar, i) => {
          const x = i * 5.2 + 8
          const isBlack = i % 2 === 0
          if (!isBlack) return null
          return (
            <rect
              key={i}
              x={x}
              y={2}
              width={bar * 0.95}
              height={46}
              rx={0.5}
              className="fill-slate-900 dark:fill-slate-100"
            />
          )
        })}
      </svg>
      <p className="mt-1 font-mono text-xs font-semibold tracking-[0.25em] text-slate-700 dark:text-slate-300">
        * {code.split('').join(' ')} *
      </p>
    </div>
  )
}

/** 5-bars Barcode icon matching input icon `|||||` */
function BarcodeLinesIcon() {
  return (
    <span
      className="inline-flex items-center gap-[2px] text-slate-700 dark:text-slate-300 shrink-0"
      aria-hidden="true"
    >
      <span className="h-4.5 w-[2.5px] rounded-xs bg-current" />
      <span className="h-4.5 w-[1.5px] rounded-xs bg-current" />
      <span className="h-4.5 w-[3.5px] rounded-xs bg-current" />
      <span className="h-4.5 w-[1px] rounded-xs bg-current" />
      <span className="h-4.5 w-[2.5px] rounded-xs bg-current" />
      <span className="h-4.5 w-[1.5px] rounded-xs bg-current" />
    </span>
  )
}

/** Target crosshair scan icon inside blue circle */
function TargetScanIcon() {
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#3b82f6] text-white shrink-0 shadow-xs">
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 7V5a2 2 0 0 1 2-2h2" />
        <path d="M17 3h2a2 2 0 0 1 2 2v2" />
        <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
        <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      </svg>
    </div>
  )
}

/** Solid green check circle icon */
function PickedCheckIcon() {
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#16a34a] text-white shrink-0 shadow-xs">
      <Check className="h-3.5 w-3.5 stroke-[3]" />
    </div>
  )
}

/** Gray circle outline icon */
function UnpickedCircleIcon() {
  return (
    <div className="h-6 w-6 rounded-full border-2 border-slate-300 dark:border-slate-600 shrink-0" />
  )
}

/** Styled product image with crisp fallback */
function ProductThumb({
  src,
  alt,
}: {
  src: string
  alt: string
}) {
  const [hasError, setHasError] = useState(false)

  return (
    <div className="relative h-32 w-32 sm:h-36 sm:w-36 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-[#f8fafc] p-2 dark:border-slate-800 dark:bg-slate-900/60 flex items-center justify-center">
      {!hasError ? (
        <img
          src={src}
          alt={alt}
          onError={() => setHasError(true)}
          className="h-full w-full object-contain rounded-lg transition-transform hover:scale-105 duration-200"
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-slate-400">
          <svg
            className="h-16 w-16 text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
          </svg>
        </div>
      )}
    </div>
  )
}

// ==========================================
// WAREHOUSE FLOOR VIEW FOR A SPECIFIC BATCH
// ==========================================

function WarehouseFloorView({
  batch,
  initialAction,
}: {
  batch: PickingBatch
  initialAction?: string | null
}) {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const navigate = useNavigate()

  // 1. Items derived from the batch's customer orders
  const initialBatchItems = useMemo(
    () => getPickingItemsForBatch(batch),
    [batch],
  )

  const [items, setItems] = useState<WarehousePickingItem[]>(() =>
    structuredClone(initialBatchItems),
  )

  // 2. Default active item: first item in the batch
  const [activeItemId, setActiveItemId] = useState<string>(
    () => items[0]?.id ?? '',
  )

  // Find active item
  const activeItem = useMemo(() => {
    return items.find((i) => i.id === activeItemId) ?? items[0]!
  }, [items, activeItemId])

  // Stepper quantity for the active item
  const [currentQty, setCurrentQty] = useState<number>(() => activeItem?.qtyPicked ?? 0)

  // Barcode input & verification state:
  // Starts empty unless the item was already fully picked, ensuring "-- ĐÃ XÁC MINH" ONLY appears after verification!
  const [barcodeInput, setBarcodeInput] = useState<string>(() =>
    activeItem?.status === 'picked' ? activeItem.upc : '',
  )
  const isVerified = Boolean(activeItem && barcodeInput.trim() === activeItem.upc)

  // Button enabled state:
  // ONLY enabled when:
  // 1. currentQty > 0
  // 2. currentQty === activeItem.qty (maxQuantity met)
  // 3. barcode is verified
  const isTargetQuantityMet = Boolean(
    activeItem && currentQty > 0 && currentQty === activeItem.qty,
  )
  const canConfirmPick = Boolean(isTargetQuantityMet && isVerified)

  // Sort option state
  type SortMode = 'route' | 'bin' | 'name' | 'status'
  const [sortMode, setSortMode] = useState<SortMode>('route')

  // Exception reporting modal
  const [exceptionOpen, setExceptionOpen] = useState(false)
  const [exceptionReason, setExceptionReason] = useState(
    'Hàng bị hỏng, rách hoặc lỗi sản phẩm',
  )
  const [exceptionNote, setExceptionNote] = useState('')

  // Toast notice
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Drawer state for viewing customer order details
  const [drawerOpen, setDrawerOpen] = useState(initialAction === 'detail')

  // Completion modal state ("Hoàn tất lấy hàng")
  const [completeBatchModalOpen, setCompleteBatchModalOpen] = useState(false)

  // Progress metrics
  const pickedCount = useMemo(
    () => items.filter((it) => it.status === 'picked').length,
    [items],
  )
  const totalUnitsPicked = useMemo(
    () => items.reduce((sum, it) => sum + it.qtyPicked, 0),
    [items],
  )
  const totalUnitsTotal = useMemo(
    () => items.reduce((sum, it) => sum + it.qty, 0),
    [items],
  )
  const pickedPercent = useMemo(
    () => (items.length > 0 ? Math.round((pickedCount / items.length) * 100) : 0),
    [items.length, pickedCount],
  )
  const isAllPicked = pickedCount === items.length && items.length > 0

  // Handle open complete batch modal
  const handleOpenCompleteModal = () => {
    setCompleteBatchModalOpen(true)
  }

  // Handle confirm complete batch picking
  const handleConfirmCompleteBatch = () => {
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        status: 'picked',
        qtyPicked: it.qty,
      })),
    )
    if (activeItem) {
      setCurrentQty(activeItem.qty)
      setBarcodeInput(activeItem.upc)
    }
    setCompleteBatchModalOpen(false)
    setToastMessage(
      vi
        ? `Đã hoàn tất đợt lấy hàng ${batch.id}! Toàn bộ ${items.length} mặt hàng đã sẵn sàng chuyển sang đóng gói.`
        : `Batch ${batch.id} picking completed! All ${items.length} items ready for packaging.`,
    )
    window.setTimeout(() => setToastMessage(null), 3500)
  }

  // Handle selecting an item from the right list
  const handleSelectItem = (item: WarehousePickingItem) => {
    setActiveItemId(item.id)
    setCurrentQty(item.qtyPicked)
    // Only pre-fill barcode if already picked; otherwise keep empty for new scan verification
    setBarcodeInput(item.status === 'picked' ? item.upc : '')
  }

  // Handle quantity decrement
  const handleDecrement = () => {
    setCurrentQty((prev) => Math.max(0, prev - 1))
  }

  // Handle quantity increment
  const handleIncrement = () => {
    if (!activeItem) return
    setCurrentQty((prev) => Math.min(activeItem.qty, prev + 1))
  }

  // Handle confirm picking action
  const handleConfirmPick = () => {
    if (!activeItem || !canConfirmPick) return
    const isDone = currentQty >= activeItem.qty
    const updatedStatus = isDone ? 'picked' : currentQty > 0 ? 'picking' : 'queued'

    setItems((prev) =>
      prev.map((it) =>
        it.id === activeItem.id
          ? {
              ...it,
              qtyPicked: currentQty,
              status: updatedStatus,
            }
          : it,
      ),
    )

    const notice = `Đã lấy đủ ${currentQty}/${activeItem.qty} ${activeItem.shortName} · ${activeItem.location}`
    setToastMessage(notice)
    window.setTimeout(() => setToastMessage(null), 3000)

    // Automatically advance to the next unpicked item if this one is done
    if (isDone) {
      const nextPending = items.find(
        (it) => it.id !== activeItem.id && it.status !== 'picked',
      )
      if (nextPending) {
        setActiveItemId(nextPending.id)
        setCurrentQty(nextPending.qtyPicked)
        setBarcodeInput(nextPending.status === 'picked' ? nextPending.upc : '')
      }
    }
  }

  // Handle exception report submission
  const handleSubmitException = () => {
    if (!activeItem) return
    setItems((prev) =>
      prev.map((it) =>
        it.id === activeItem.id
          ? {
              ...it,
              status: 'short',
            }
          : it,
      ),
    )
    setExceptionOpen(false)
    setToastMessage(`Đã ghi nhận báo cáo ngoại lệ: ${exceptionReason}`)
    window.setTimeout(() => setToastMessage(null), 3500)

    // Move to next item
    const nextPending = items.find(
      (it) => it.id !== activeItem.id && it.status !== 'picked',
    )
    if (nextPending) {
      setActiveItemId(nextPending.id)
      setCurrentQty(nextPending.qtyPicked)
      setBarcodeInput(nextPending.status === 'picked' ? nextPending.upc : '')
    }
  }

  // Sorted items list
  const sortedItems = useMemo(() => {
    const list = [...items]
    switch (sortMode) {
      case 'bin':
        return list.sort((a, b) => a.location.localeCompare(b.location))
      case 'name':
        return list.sort((a, b) => a.name.localeCompare(b.name))
      case 'status':
        return list.sort((a, b) => {
          const rank = { picking: 0, queued: 1, short: 2, picked: 3 }
          return rank[a.status] - rank[b.status]
        })
      case 'route':
      default:
        return list
    }
  }, [items, sortMode])

  // Cycle sort mode
  const handleCycleSort = () => {
    const modes: SortMode[] = ['route', 'bin', 'name', 'status']
    const nextIdx = (modes.indexOf(sortMode) + 1) % modes.length
    setSortMode(modes[nextIdx]!)
  }

  const sortLabel = {
    route: vi ? 'Theo tuyến' : 'By route',
    bin: vi ? 'Theo vị trí kệ' : 'By bin',
    name: vi ? 'Theo tên SP' : 'By name',
    status: vi ? 'Theo tiến độ' : 'By status',
  }[sortMode]

  return (
    <div className="flex-1 overflow-auto bg-[#F9FAFB] p-4 sm:p-6 dark:bg-[#0B0E14]">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Subheader with Batch info & Navigation back & Batch selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/app/orders"
              className="inline-flex items-center gap-1.5 font-medium text-slate-600 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{vi ? 'Quay lại Đơn đa kênh' : 'Back to Orders'}</span>
            </Link>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {batch.id}
            </span>
            <span className="rounded bg-blue-100 px-2 py-0.5 font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {batch.zone}
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600 dark:text-slate-300">
              {vi ? 'NV phụ trách:' : 'Picker:'} <strong>{batch.picker.name}</strong>
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600 dark:text-slate-300">
              {vi ? 'Khách đặt:' : 'Customer:'}{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {batch.orders.map((o) => o.customerName).join(', ')}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Batch Switcher Dropdown */}
            <div className="relative">
              <select
                value={batch.id}
                onChange={(e) => navigate(`/app/warehouse?batchId=${e.target.value}&action=start`)}
                className="h-8.5 cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pl-2.5 pr-7 text-xs font-medium text-slate-700 shadow-xs transition-colors hover:border-slate-300 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-1 dark:text-slate-300"
              >
                {initialPickingBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id} · {b.orders[0]?.customerName ?? b.picker.name} ({b.itemsCount} SP)
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>

            {/* View Customer Details Button */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 font-medium text-blue-700 shadow-xs hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 cursor-pointer"
            >
              <User className="h-3.5 w-3.5" />
              <span>{vi ? 'Chi tiết người đặt' : 'Customer Info'}</span>
            </button>

            {/* Single primary action on Top Bar: Hoàn tất lấy hàng */}
            <button
              type="button"
              onClick={handleOpenCompleteModal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563eb] px-3 py-1.5 font-semibold text-xs text-white shadow-xs hover:bg-[#1d4ed8] active:bg-[#1e40af] transition-colors cursor-pointer"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{vi ? 'Hoàn tất lấy hàng' : 'Complete Batch Picking'}</span>
            </button>

            {/* Reset Button */}
            <button
              type="button"
              onClick={() => {
                setItems(structuredClone(initialBatchItems))
                if (initialBatchItems[0]) {
                  setActiveItemId(initialBatchItems[0].id)
                  setCurrentQty(initialBatchItems[0].qtyPicked)
                  setBarcodeInput(
                    initialBatchItems[0].status === 'picked'
                      ? initialBatchItems[0].upc
                      : '',
                  )
                }
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-600 shadow-xs hover:bg-slate-50 dark:border-slate-800 dark:bg-surface-1 dark:text-slate-300"
            >
              <RotateCcw className="h-3 w-3" />
              <span>{vi ? 'Đặt lại' : 'Reset'}</span>
            </button>
          </div>
        </div>

        {/* Toast Notification */}
        {toastMessage ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 shadow-xs flex items-center justify-between dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{toastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-400"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        {/* ==================================================== */}
        {/* MAIN TWO-COLUMN LAYOUT MATCHING SCREENSHOT EXACTLY   */}
        {/* ==================================================== */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
          {/* LEFT COLUMN: ACTIVE TARGET CARD & EXCEPTION BANNER */}
          <div className="lg:col-span-7 xl:col-span-7 space-y-4">
            {activeItem ? (
              <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-surface-1">
                {/* Top Badges */}
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <span className="inline-flex items-center rounded-lg bg-[#eff6ff] px-3 py-1.5 text-xs font-bold tracking-wider text-[#2563eb] dark:bg-blue-950/40 dark:text-blue-400">
                    MỤC TIÊU HIỆN TẠI
                  </span>

                  {/* High-contrast prominent Location Badge */}
                  <div className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-4 py-2 text-white shadow-md border border-indigo-500/30 dark:border-indigo-400/30">
                    <MapPin className="h-4.5 w-4.5 text-amber-400 shrink-0 fill-amber-400/20" />
                    <span className="font-mono text-xs sm:text-sm font-bold tracking-wider text-slate-100">
                      {activeItem.location}
                    </span>
                  </div>
                </div>

                {/* Product Presentation */}
                <div className="mt-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
                  <ProductThumb src={activeItem.imageUrl} alt={activeItem.name} />

                  <div className="flex-1 text-center sm:text-left">
                    <h2 className="text-xl font-bold text-slate-900 leading-snug dark:text-slate-100">
                      {activeItem.name}
                    </h2>
                    <div className="mt-2.5 flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                      <span>Mã SKU: {activeItem.sku}</span>
                      <span>Mã UPC: {activeItem.upc}</span>
                    </div>

                    <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                      Đơn hàng: <strong className="text-slate-700 dark:text-slate-300">#{activeItem.orderId}</strong> · Khách:{' '}
                      <strong className="text-slate-800 dark:text-slate-200">{activeItem.customerName}</strong>
                    </p>
                  </div>
                </div>

                {/* Barcode graphic box */}
                <div className="mt-6">
                  <BarcodeGraphic code={activeItem.upc} />
                </div>

                {/* Barcode verification input */}
                <div className="mt-5">
                  <label
                    htmlFor="barcode-input"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Xác minh mã vạch (Quét hoặc nhập mã)
                  </label>

                  <div className="mt-1.5 flex items-center justify-between rounded-xl border-2 border-[#3b82f6] bg-white px-3.5 py-2.5 shadow-xs dark:bg-surface-2 transition-all focus-within:ring-2 focus-within:ring-blue-400/20">
                    <div className="flex items-center gap-3 flex-1 min-w-0 mr-2">
                      <BarcodeLinesIcon />
                      <input
                        id="barcode-input"
                        type="text"
                        value={barcodeInput}
                        onChange={(e) => setBarcodeInput(e.target.value)}
                        placeholder={activeItem.upc}
                        className="w-full bg-transparent font-mono text-sm font-semibold text-slate-800 focus:outline-none dark:text-slate-100"
                      />
                    </div>

                    {isVerified ? (
                      <span className="font-semibold text-xs text-emerald-600 dark:text-emerald-400 shrink-0 select-none flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                        <span>— ĐÃ XÁC MINH</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setBarcodeInput(activeItem.upc)}
                        className="font-medium text-xs text-slate-400 hover:text-blue-600 dark:text-slate-500 shrink-0 cursor-pointer transition-colors"
                      >
                        — CHƯA XÁC MINH (Click để khớp)
                      </button>
                    )}
                  </div>
                </div>

                {/* Quantity counter & Confirm Pick button - Clean single row: [ - ] [ Count / Total ] [ + ]   [ Xác nhận lấy hàng ] */}
                <div className="mt-5 flex items-center gap-3">
                  {/* Stepper */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleDecrement}
                      disabled={currentQty <= 0}
                      className="h-12 w-12 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center font-bold text-slate-700 transition-colors cursor-pointer dark:border-slate-700 dark:bg-surface-2 dark:text-slate-200"
                      aria-label="Giảm số lượng"
                    >
                      <Minus className="h-4 w-4" />
                    </button>

                    <div className="h-12 px-5 min-w-[88px] rounded-xl border border-slate-200 bg-white flex items-center justify-center font-mono font-bold text-base text-slate-900 dark:border-slate-700 dark:bg-surface-1 dark:text-slate-100 select-none shadow-2xs">
                      {currentQty} / {activeItem.qty}
                    </div>

                    <button
                      type="button"
                      onClick={handleIncrement}
                      disabled={currentQty >= activeItem.qty}
                      className="h-12 w-12 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center font-bold text-slate-700 transition-colors cursor-pointer dark:border-slate-700 dark:bg-surface-2 dark:text-slate-200"
                      aria-label="Tăng số lượng"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Single Confirm Pick Button - Enabled ONLY when currentQty === activeItem.qty and barcode is verified */}
                  <button
                    type="button"
                    disabled={!canConfirmPick}
                    onClick={handleConfirmPick}
                    className={`flex-1 h-12 rounded-xl font-semibold text-sm shadow-sm flex items-center justify-center gap-2 transition-all select-none ${
                      canConfirmPick
                        ? 'bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af] text-white shadow-blue-500/20 cursor-pointer'
                        : 'bg-slate-100 text-slate-400 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-500 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <CheckCircle2 className="h-5 w-5" />
                    <span>{vi ? 'Xác nhận lấy hàng' : 'Confirm Pick'}</span>
                  </button>
                </div>

                {/* Subtle helper guidance when disabled */}
                {!canConfirmPick && (
                  <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                    <span>💡</span>
                    <span>
                      {!isVerified
                        ? (vi
                            ? 'Cần quét/xác minh mã vạch đúng trước khi lấy hàng'
                            : 'Scan and verify barcode first')
                        : currentQty === 0
                          ? (vi
                              ? 'Vui lòng chọn/quét số lượng hàng cần lấy (0/3 hiện bị vô hiệu)'
                              : 'Please select quantity to pick (0 count is disabled)')
                          : (vi
                              ? `Cần nhặt đủ số lượng (${currentQty}/${activeItem.qty}) để kích hoạt xác nhận lấy hàng`
                              : `Pick full target quantity (${currentQty}/${activeItem.qty}) to confirm`)}
                    </span>
                  </p>
                )}
              </div>
            ) : null}

            {/* Exception Banner below Left Card */}
            <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3.5 sm:p-4 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 text-xs dark:border-amber-900/40 dark:bg-amber-950/20 shadow-xs">
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300 font-medium">
                <span className="text-base" aria-hidden="true">
                  ⚠️
                </span>
                <span>
                  Hàng bị hỏng, mô tả không khớp, hoặc không có trong thùng?
                </span>
              </div>

              <button
                type="button"
                onClick={() => setExceptionOpen(true)}
                className="h-9 px-3.5 rounded-lg border border-amber-300 bg-white font-semibold text-xs text-amber-900 shadow-xs hover:bg-amber-50 active:bg-amber-100 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer dark:bg-surface-1 dark:border-amber-800 dark:text-amber-300"
              >
                <Flag className="h-3.5 w-3.5 text-amber-700" />
                <span>Báo ngoại lệ</span>
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN: PICKING LIST CARD ("Danh sách lấy hàng") */}
          <div className="lg:col-span-5 xl:col-span-5">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-surface-1">
              {/* List Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-baseline gap-2">
                  <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                    Danh sách lấy hàng
                  </h3>
                  <span className="text-xs text-slate-500 font-normal dark:text-slate-400">
                    {items.length} Mặt hàng
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleCycleSort}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer dark:text-blue-400"
                >
                  Sắp xếp: {sortLabel}
                </button>
              </div>

              {/* Items Stack */}
              <div className="mt-4 space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
                {sortedItems.map((item) => {
                  const isActive = item.id === activeItemId
                  const isPicked = item.status === 'picked'

                  // 1. ACTIVE ITEM (Thick blue border)
                  if (isActive) {
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelectItem(item)}
                        className="rounded-xl border-2 border-[#3b82f6] bg-[#f8faff] p-3 sm:p-3.5 flex items-center justify-between cursor-pointer shadow-xs dark:bg-blue-950/20 transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                          <TargetScanIcon />
                          <div className="min-w-0">
                            <p className="font-semibold text-xs text-slate-900 truncate dark:text-slate-100">
                              {item.shortName}
                            </p>
                            <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {item.sku}
                            </p>
                          </div>
                        </div>

                        <span className="rounded-full bg-[#3b82f6] text-white px-3 py-1 font-mono font-bold text-xs shadow-xs shrink-0">
                          {item.qtyPicked} / {item.qty}
                        </span>
                      </div>
                    )
                  }

                  // 2. COMPLETED ITEM (Soft green card)
                  if (isPicked) {
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelectItem(item)}
                        className="rounded-xl border border-emerald-200 bg-[#ecfdf5] p-3 sm:p-3.5 flex items-center justify-between cursor-pointer transition-colors hover:bg-emerald-100/70 dark:border-emerald-800/80 dark:bg-emerald-950/20"
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                          <PickedCheckIcon />
                          <div className="min-w-0">
                            <p className="font-medium text-xs text-slate-800 truncate dark:text-slate-200">
                              {item.shortName}
                            </p>
                            <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {item.sku}
                            </p>
                          </div>
                        </div>

                        <span className="rounded-full bg-[#16a34a] text-white px-3 py-1 font-mono font-bold text-xs shadow-xs shrink-0">
                          {item.qtyPicked} / {item.qty}
                        </span>
                      </div>
                    )
                  }

                  // 3. PENDING ITEM (White/slate card)
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectItem(item)}
                      className="rounded-xl border border-slate-200 bg-white p-3 sm:p-3.5 flex items-center justify-between cursor-pointer transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-surface-1"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <UnpickedCircleIcon />
                        <div className="min-w-0">
                          <p className="font-medium text-xs text-slate-700 truncate dark:text-slate-300">
                            {item.shortName}
                          </p>
                          <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {item.sku}
                          </p>
                        </div>
                      </div>

                      <span className="rounded-full border border-slate-200 bg-[#f8fafc] text-slate-600 px-3 py-1 font-mono font-medium text-xs dark:border-slate-700 dark:bg-surface-2 dark:text-slate-400 shrink-0">
                        {item.qtyPicked} / {item.qty}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Footer with Accurate Picking Progress & Single Primary Action */}
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-slate-600 dark:text-slate-300">
                    Tiến độ:{' '}
                    <strong className="text-slate-900 dark:text-slate-100">
                      {pickedCount}/{items.length}
                    </strong>{' '}
                    mặt hàng ({pickedPercent}%)
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {totalUnitsPicked}/{totalUnitsTotal} đơn vị
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                    style={{ width: `${pickedPercent}%` }}
                  />
                </div>

                {/* Single Primary Action: Hoàn tất lấy hàng */}
                <button
                  type="button"
                  onClick={handleOpenCompleteModal}
                  className="w-full h-11 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af] text-white font-semibold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer select-none"
                >
                  <CheckCircle2 className="h-4.5 w-4.5" />
                  <span>{vi ? 'Hoàn tất lấy hàng' : 'Complete Batch Picking'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* EXCEPTION REPORT MODAL                               */}
      {/* ==================================================== */}
      {exceptionOpen && activeItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-surface-1">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Báo cáo ngoại lệ sản phẩm
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setExceptionOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-xs">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-surface-2">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {activeItem.name}
                </p>
                <p className="mt-0.5 font-mono text-slate-500">
                  SKU: {activeItem.sku} · {activeItem.location}
                </p>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Lý do báo ngoại lệ:
                </label>
                <div className="space-y-2">
                  {[
                    'Hàng bị hỏng, rách hoặc lỗi sản phẩm',
                    'Mô tả sản phẩm không khớp với thực tế',
                    'Không có hàng trong thùng / trên kệ (Thiếu hàng)',
                    'Mã vạch mờ, rách không quét được',
                  ].map((reason) => (
                    <label
                      key={reason}
                      className="flex items-center gap-2.5 rounded-lg border border-slate-200 p-2.5 cursor-pointer hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-surface-2"
                    >
                      <input
                        type="radio"
                        name="exception-reason"
                        checked={exceptionReason === reason}
                        onChange={() => setExceptionReason(reason)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-slate-800 dark:text-slate-200">{reason}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Ghi chú chi tiết:
                </label>
                <textarea
                  value={exceptionNote}
                  onChange={(e) => setExceptionNote(e.target.value)}
                  placeholder="Mô tả cụ thể tình trạng hàng để tổ trưởng kho kiểm tra..."
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setExceptionOpen(false)}
                className="rounded-lg px-3.5 py-2 font-medium text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-surface-2"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSubmitException}
                className="rounded-lg bg-amber-600 px-4 py-2 font-semibold text-xs text-white shadow-xs hover:bg-amber-700 transition-colors cursor-pointer"
              >
                Gửi báo cáo ngoại lệ
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ==================================================== */}
      {/* COMPLETE BATCH PICKING MODAL                         */}
      {/* ==================================================== */}
      {completeBatchModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-surface-1">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    {vi ? 'Hoàn tất lấy hàng đợt' : 'Complete Batch Picking'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {batch.id} · {batch.zone}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCompleteBatchModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              {/* Order & Customer overview */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-surface-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-slate-400">{vi ? 'Khách đặt:' : 'Customer:'}</span>
                    <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                      {batch.orders.map((o) => o.customerName).join(', ')}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400">{vi ? 'Tiến độ lấy hàng:' : 'Pick progress:'}</span>
                    <p className="font-mono font-bold text-slate-900 dark:text-slate-100">
                      {pickedCount}/{items.length} mặt hàng ({pickedPercent}%)
                    </p>
                    <p className="font-mono text-[11px] text-slate-500">
                      {totalUnitsPicked}/{totalUnitsTotal} đơn vị
                    </p>
                  </div>
                </div>
              </div>

              {/* Notice if not all items picked */}
              {!isAllPicked ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300 flex items-start gap-2.5">
                  <AlertTriangle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-900 dark:text-amber-200">
                      {vi ? 'Chưa hoàn thành nhặt toàn bộ mặt hàng' : 'Not all items picked yet'}
                    </p>
                    <p className="mt-0.5 text-amber-800 dark:text-amber-300">
                      {vi
                        ? `Vẫn còn ${items.length - pickedCount} mặt hàng chưa lấy đủ số lượng. Khi bấm Xác nhận, hệ thống sẽ tự động hoàn tất lấy đủ toàn bộ số lượng cho đợt này.`
                        : `${items.length - pickedCount} items remaining. Confirming will mark all items as fully picked.`}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300 flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                      {vi ? 'Tất cả mặt hàng đã lấy đủ tại kệ' : 'All items successfully picked from racks'}
                    </p>
                    <p className="mt-0.5 text-emerald-800 dark:text-emerald-300">
                      {vi
                        ? 'Đợt lấy hàng đã hoàn thành, sẵn sàng chuyển xe đẩy hàng sang khu vực Đóng gói (Packing).'
                        : 'Batch picking complete, ready to transfer items to packing area.'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer action buttons */}
            <div className="mt-5 flex flex-wrap sm:flex-nowrap items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCompleteBatchModalOpen(false)}
                className="rounded-lg px-3.5 py-2 font-medium text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-surface-2"
              >
                {vi ? 'Đóng' : 'Close'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setCompleteBatchModalOpen(false)
                  navigate('/app/packing')
                }}
                className="rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 font-semibold text-xs text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>{vi ? 'Chuyển sang Đóng gói' : 'Proceed to Packing'}</span>
              </button>

              {!isAllPicked && (
                <button
                  type="button"
                  onClick={handleConfirmCompleteBatch}
                  className="rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af] px-4 py-2 font-semibold text-xs text-white shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="h-3.5 w-3.5 stroke-[3]" />
                  <span>{vi ? 'Xác nhận hoàn tất lấy hàng' : 'Mark All Picked & Complete'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Customer Order Details Drawer */}
      <BatchDetailDrawer
        batch={drawerOpen ? batch : null}
        onClose={() => setDrawerOpen(false)}
        onStartPicking={() => setDrawerOpen(false)}
        locale={locale}
      />
    </div>
  )
}

// ==========================================
// MAIN WAREHOUSE PAGE EXPORT
// ==========================================

export function WarehousePage() {
  const { locale } = usePortal()
  const vi = locale === 'vi'
  const [searchParams] = useSearchParams()

  const batchId = searchParams.get('batchId')
  const action = searchParams.get('action')

  // Find the selected batch or default to the first pending/active batch
  const currentBatch = useMemo(() => {
    if (batchId) {
      const found = initialPickingBatches.find((b) => b.id === batchId)
      if (found) return found
    }
    // Default to BTH-20240115-003 or first batch
    return (
      initialPickingBatches.find((b) => b.id === 'BTH-20240115-003') ??
      initialPickingBatches[0]!
    )
  }, [batchId])

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Lấy hàng trong kho' : 'Warehouse picking' },
        ]}
      />

      <WarehouseFloorView
        key={currentBatch.id}
        batch={currentBatch}
        initialAction={action}
      />
    </>
  )
}
