import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
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
  ArrowRight,
  Sparkles,
  ArrowLeft,
  Truck,
  RotateCcw,
  SlidersHorizontal,
  ScanBarcode,
  Zap,
} from 'lucide-react'
import { usePortal } from '../../context/use-portal'
import {
  type VerificationItem,
  type PlatformPackageOrder,
  BATCH_PACKAGING_PLANS,
  DEFAULT_PLATFORM_PACKING_ORDERS,
} from '../../data/packing-dashboard-mock'
import { CARTON_INVENTORY } from '../../data/cartons'
import { Packing3DBoxViewer } from './Packing3DBoxViewer'

// ==========================================
// MANUAL PACKAGING OPTIONS & SPECS
// ==========================================

export interface ManualCartonOption {
  code: string
  label: string
  dimensions: string
  dim: { w: number; l: number; h: number }
  costUsd: number
  shippingFeeUsd: number
  maxWeight: string
  desc: string
}

export const MANUAL_CARTON_OPTIONS: ManualCartonOption[] = [
  {
    code: 'Hộp S',
    label: 'Hộp S: 40 × 30 × 12 cm',
    dimensions: '40 × 30 × 12 cm',
    dim: { w: 40, l: 30, h: 12 },
    costUsd: 0.45,
    shippingFeeUsd: 2.10,
    maxWeight: '3 kg',
    desc: 'Phù hợp áo quần, set thời trang',
  },
  {
    code: 'Hộp A2',
    label: 'Hộp A2: 25 × 18 × 12 cm',
    dimensions: '25 × 18 × 12 cm',
    dim: { w: 25, l: 18, h: 12 },
    costUsd: 0.35,
    shippingFeeUsd: 1.85,
    maxWeight: '2.5 kg',
    desc: 'Phù hợp phụ kiện, áo phông gọn',
  },
  {
    code: 'Hộp M1',
    label: 'Hộp M1: 30 × 20 × 10 cm',
    dimensions: '30 × 20 × 10 cm',
    dim: { w: 30, l: 20, h: 10 },
    costUsd: 0.40,
    shippingFeeUsd: 1.95,
    maxWeight: '3.5 kg',
    desc: 'Dáng dẹt cho váy đầm lụa, khăn',
  },
  {
    code: 'Hộp B1',
    label: 'Hộp B1: 30 × 20 × 15 cm',
    dimensions: '30 × 20 × 15 cm',
    dim: { w: 30, l: 20, h: 15 },
    costUsd: 0.55,
    shippingFeeUsd: 2.30,
    maxWeight: '5 kg',
    desc: 'Dung tích trung bình, quần jeans dày',
  },
  {
    code: 'Hộp C3',
    label: 'Hộp C3: 35 × 25 × 18 cm',
    dimensions: '35 × 25 × 18 cm',
    dim: { w: 35, l: 25, h: 18 },
    costUsd: 0.70,
    shippingFeeUsd: 2.65,
    maxWeight: '8 kg',
    desc: 'Thùng lớn cho áo khoác, đơn nhiều món',
  },
  {
    code: 'Thùng HD',
    label: 'Thùng HD: 40 × 30 × 25 cm',
    dimensions: '40 × 30 × 25 cm',
    dim: { w: 40, l: 30, h: 25 },
    costUsd: 0.95,
    shippingFeeUsd: 3.20,
    maxWeight: '15 kg',
    desc: 'Thùng chịu lực cao cấp, đơn cồng kềnh',
  },
]

export const MANUAL_MATERIAL_OPTIONS = [
  { id: 'bubble', name: 'Xốp bóng khí (Bubble wrap)', cost: 0.10 },
  { id: 'silk', name: 'Giấy lụa bọc sản phẩm', cost: 0.08 },
  { id: 'desiccant', name: 'Túi chống ẩm (Silica gel)', cost: 0.05 },
  { id: 'tape', name: 'Băng keo niêm phong thương hiệu', cost: 0.07 },
  { id: 'pe', name: 'Màng quấn PE chống nước', cost: 0.12 },
  { id: 'fragile_label', name: 'Tem cảnh báo hàng dễ vỡ (Fragile)', cost: 0.04 },
]

// ==========================================
// SUB-COMPONENTS
// ==========================================

/** Realistic Air Waybill Barcode */
function ShippingBarcodeGraphic({ code }: { code: string }) {
  const bars = [
    2, 1, 3, 1, 1, 4, 2, 1, 3, 2, 1, 4, 1, 2, 3, 1, 4, 2, 1, 1, 3, 2, 4, 1, 2,
    3, 1, 4, 2, 1, 1, 3, 2, 4, 1, 1, 3, 1, 2, 4, 2, 1, 3, 1, 4, 2, 1, 2, 3, 1,
  ]

  return (
    <div className="flex flex-col items-center justify-center py-0.5">
      <svg
        className="h-9 w-full max-w-[210px]"
        viewBox="0 0 210 36"
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
              height={36}
              className="fill-slate-950"
            />
          )
        })}
      </svg>
      <span className="mt-0.5 font-mono text-[10px] font-bold tracking-[0.22em] text-slate-900">
        {code}
      </span>
    </div>
  )
}

/** Realistic 2D QR Code Matrix Graphic */
function ShippingQrGraphic() {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-slate-300 bg-white p-0.5 shadow-2xs">
      <svg className="h-full w-full" viewBox="0 0 24 24" fill="currentColor">
        <rect x="2" y="2" width="6" height="6" fill="#0f172a" />
        <rect x="3" y="3" width="4" height="4" fill="#ffffff" />
        <rect x="4" y="4" width="2" height="2" fill="#0f172a" />
        
        <rect x="16" y="2" width="6" height="6" fill="#0f172a" />
        <rect x="17" y="3" width="4" height="4" fill="#ffffff" />
        <rect x="18" y="4" width="2" height="2" fill="#0f172a" />
        
        <rect x="2" y="16" width="6" height="6" fill="#0f172a" />
        <rect x="3" y="17" width="4" height="4" fill="#ffffff" />
        <rect x="4" y="18" width="2" height="2" fill="#0f172a" />

        <rect x="10" y="3" width="2" height="2" fill="#0f172a" />
        <rect x="13" y="5" width="2" height="2" fill="#0f172a" />
        <rect x="9" y="8" width="2" height="2" fill="#0f172a" />
        <rect x="12" y="9" width="3" height="2" fill="#0f172a" />
        <rect x="4" y="10" width="2" height="3" fill="#0f172a" />
        <rect x="17" y="10" width="3" height="2" fill="#0f172a" />
        <rect x="10" y="13" width="2" height="2" fill="#0f172a" />
        <rect x="14" y="13" width="2" height="3" fill="#0f172a" />
        <rect x="10" y="17" width="3" height="2" fill="#0f172a" />
        <rect x="18" y="16" width="2" height="3" fill="#0f172a" />
        <rect x="15" y="19" width="2" height="2" fill="#0f172a" />
      </svg>
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
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-500">
        <Camera className="h-4 w-4" />
      </div>
    )
  }

  return (
    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 p-0.5 dark:border-slate-800 dark:bg-surface-2 shadow-2xs">
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

export interface PackingDashboardProps {
  onNavigateToShipping?: () => void
}

interface OrderDynamicState {
  items: VerificationItem[]
  planApproved: boolean
  packingMode: 'ai' | 'manual'
  boxLabel: string
  boxCode: string
  dimensions: string
  optScore: number
  packagingCost: number
  shippingFee: number
  materials: string[]
}

export function PackingDashboard({ onNavigateToShipping }: PackingDashboardProps = {}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { locale } = usePortal()
  const vi = locale === 'vi'

  // 1. Resolve current batch
  const batchIdParam = searchParams.get('batchId')
  const initialBatchKey =
    batchIdParam && BATCH_PACKAGING_PLANS[batchIdParam]
      ? batchIdParam
      : 'BTH-20240115-001'

  const [currentBatchKey, setCurrentBatchKey] = useState<string>(initialBatchKey)
  const currentBatchPlan = useMemo(() => {
    return BATCH_PACKAGING_PLANS[currentBatchKey] ?? BATCH_PACKAGING_PLANS['BTH-20240115-001']!
  }, [currentBatchKey])

  // 2. Platform orders within current batch
  const platformOrders: PlatformPackageOrder[] = currentBatchPlan.orders

  // 3. Active Platform Order Tab
  const [activeOrderId, setActiveOrderId] = useState<string>(
    () => platformOrders[0]?.id ?? DEFAULT_PLATFORM_PACKING_ORDERS[0]!.id,
  )

  // 4. Completed orders set
  const [completedOrderIds, setCompletedOrderIds] = useState<Set<string>>(new Set())

  // 5. Per-Order Isolated Dynamic State
  const [ordersState, setOrdersState] = useState<Record<string, OrderDynamicState>>(() => {
    const initial: Record<string, OrderDynamicState> = {}
    for (const batchKey of Object.keys(BATCH_PACKAGING_PLANS)) {
      const bPlan = BATCH_PACKAGING_PLANS[batchKey]!
      for (const ord of bPlan.orders) {
        initial[ord.id] = {
          items: structuredClone(ord.items),
          planApproved: false,
          packingMode: 'ai',
          boxLabel: ord.boxLabel,
          boxCode: ord.boxCode,
          dimensions: ord.dimensions,
          optScore: ord.optScore,
          packagingCost: ord.packagingCostUsd,
          shippingFee: ord.shippingFeeUsd,
          materials: [...ord.materials],
        }
      }
    }
    return initial
  })

  // Barcode input state
  const [barcodeQuery, setBarcodeQuery] = useState('')

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const showToast = (msg: string) => {
    setToastMessage(msg)
    window.setTimeout(() => setToastMessage(null), 3800)
  }

  // Modals & Dropdowns
  const [manualOverrideOpen, setManualOverrideOpen] = useState(false)
  const [batchDropdownOpen, setBatchDropdownOpen] = useState(false)

  // Active Order Data
  const activeOrder = useMemo(() => {
    return (
      platformOrders.find((o) => o.id === activeOrderId) ??
      platformOrders[0] ??
      DEFAULT_PLATFORM_PACKING_ORDERS[0]!
    )
  }, [platformOrders, activeOrderId])

  const activeOrderState = useMemo<OrderDynamicState>(() => {
    return (
      ordersState[activeOrder.id] ?? {
        items: activeOrder.items,
        planApproved: false,
        packingMode: 'ai',
        boxLabel: activeOrder.boxLabel,
        boxCode: activeOrder.boxCode,
        dimensions: activeOrder.dimensions,
        optScore: activeOrder.optScore,
        packagingCost: activeOrder.packagingCostUsd,
        shippingFee: activeOrder.shippingFeeUsd,
        materials: activeOrder.materials,
      }
    )
  }, [ordersState, activeOrder])

  // Current order verification metrics
  const currentItems = activeOrderState.items
  const verifiedCount = currentItems.filter((i) => i.verified).length
  const totalItems = currentItems.length
  const allVerified = totalItems > 0 && verifiedCount === totalItems
  const progressPercent = totalItems > 0 ? Math.round((verifiedCount / totalItems) * 100) : 0

  // Order status
  const isCurrentOrderCompleted = completedOrderIds.has(activeOrder.id)
  const isCurrentOrderApproved = activeOrderState.planApproved

  // Finite State: 'scanning' | 'verified' | 'approved' | 'printed'
  const stationStatus: 'scanning' | 'verified' | 'approved' | 'printed' = useMemo(() => {
    if (isCurrentOrderCompleted) return 'printed'
    if (allVerified && isCurrentOrderApproved) return 'approved'
    if (allVerified) return 'verified'
    return 'scanning'
  }, [isCurrentOrderCompleted, allVerified, isCurrentOrderApproved])

  // Are ALL platform orders in current batch completed?
  const allBatchOrdersCompleted = useMemo(() => {
    return (
      platformOrders.length > 0 &&
      platformOrders.every((ord) => completedOrderIds.has(ord.id))
    )
  }, [platformOrders, completedOrderIds])

  // Switch Batch
  const handleSelectBatch = (batchKey: string) => {
    setCurrentBatchKey(batchKey)
    const newPlan = BATCH_PACKAGING_PLANS[batchKey]
    if (newPlan && newPlan.orders[0]) {
      setActiveOrderId(newPlan.orders[0].id)
    }
    setBatchDropdownOpen(false)
  }

  // Switch Packing Mode: AI vs Manual
  const handleSetPackingMode = (mode: 'ai' | 'manual') => {
    setOrdersState((prev) => {
      const orderSt = prev[activeOrder.id]
      if (!orderSt) return prev

      if (mode === 'ai') {
        return {
          ...prev,
          [activeOrder.id]: {
            ...orderSt,
            packingMode: 'ai',
            boxLabel: activeOrder.boxLabel,
            boxCode: activeOrder.boxCode,
            dimensions: activeOrder.dimensions,
            optScore: activeOrder.optScore,
            packagingCost: activeOrder.packagingCostUsd,
            shippingFee: activeOrder.shippingFeeUsd,
            materials: [...activeOrder.materials],
            planApproved: false,
          },
        }
      } else {
        return {
          ...prev,
          [activeOrder.id]: {
            ...orderSt,
            packingMode: 'manual',
            planApproved: false,
          },
        }
      }
    })

    if (mode === 'ai') {
      showToast(
        vi
          ? `Đã khôi phục toàn bộ quy cách gợi ý từ AI cho ${activeOrder.tabLabel}`
          : `Restored AI recommendation for ${activeOrder.tabLabel}`,
      )
    } else {
      showToast(
        vi
          ? `Đã chuyển sang chế độ Đóng gói thủ công cho ${activeOrder.tabLabel}. Tùy chọn thùng và vật tư theo ý muốn.`
          : `Switched to Manual Packaging mode for ${activeOrder.tabLabel}.`,
      )
    }
  }

  // Select Manual Carton Option
  const handleSelectManualCarton = (carton: ManualCartonOption) => {
    setOrdersState((prev) => {
      const orderSt = prev[activeOrder.id]
      if (!orderSt) return prev

      const materialsCost = orderSt.materials.reduce((sum, matName) => {
        const found = MANUAL_MATERIAL_OPTIONS.find((m) => m.name === matName)
        return sum + (found ? found.cost : 0.05)
      }, 0)

      return {
        ...prev,
        [activeOrder.id]: {
          ...orderSt,
          packingMode: 'manual',
          boxCode: carton.code,
          boxLabel: carton.label,
          dimensions: carton.dimensions,
          packagingCost: Number((carton.costUsd + materialsCost).toFixed(2)),
          shippingFee: carton.shippingFeeUsd,
          optScore: 88,
          planApproved: false,
        },
      }
    })

    showToast(
      vi
        ? `Đã chọn thùng thủ công: ${carton.code} (${carton.dimensions})`
        : `Selected manual box: ${carton.code}`,
    )
  }

  // Toggle Manual Material
  const handleToggleManualMaterial = (matName: string) => {
    setOrdersState((prev) => {
      const orderSt = prev[activeOrder.id]
      if (!orderSt) return prev

      const hasMaterial = orderSt.materials.includes(matName)
      const nextMaterials = hasMaterial
        ? orderSt.materials.filter((m) => m !== matName)
        : [...orderSt.materials, matName]

      const currentCarton = MANUAL_CARTON_OPTIONS.find((c) => c.code === orderSt.boxCode)
      const baseCartonCost = currentCarton ? currentCarton.costUsd : 0.40

      const nextMaterialsCost = nextMaterials.reduce((sum, name) => {
        const found = MANUAL_MATERIAL_OPTIONS.find((m) => m.name === name)
        return sum + (found ? found.cost : 0.05)
      }, 0)

      return {
        ...prev,
        [activeOrder.id]: {
          ...orderSt,
          packingMode: 'manual',
          materials: nextMaterials,
          packagingCost: Number((baseCartonCost + nextMaterialsCost).toFixed(2)),
          planApproved: false,
        },
      }
    })
  }

  // Toggle single item verification
  const handleToggleItemVerify = (itemId: string) => {
    setOrdersState((prev) => {
      const orderSt = prev[activeOrder.id]
      if (!orderSt) return prev
      const nextItems = orderSt.items.map((it) => {
        if (it.id !== itemId) return it
        const nextVer = !it.verified
        if (nextVer) {
          showToast(
            vi
              ? `Đã xác minh: ${it.title} (${it.sku})`
              : `Verified: ${it.title} (${it.sku})`,
          )
        }
        return {
          ...it,
          verified: nextVer,
          imageUrl:
            nextVer && !it.imageUrl
              ? 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=300&auto=format&fit=crop&q=80'
              : it.imageUrl,
        }
      })

      return {
        ...prev,
        [activeOrder.id]: {
          ...orderSt,
          items: nextItems,
          planApproved: false,
        },
      }
    })

    setCompletedOrderIds((prev) => {
      if (!prev.has(activeOrder.id)) return prev
      const next = new Set(prev)
      next.delete(activeOrder.id)
      return next
    })
  }

  // Quick verify all items in active order (for fast demo / rapid verification)
  const handleQuickVerifyAll = () => {
    setOrdersState((prev) => {
      const orderSt = prev[activeOrder.id]
      if (!orderSt) return prev
      const nextItems = orderSt.items.map((it) => ({
        ...it,
        verified: true,
        imageUrl:
          !it.imageUrl
            ? 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=300&auto=format&fit=crop&q=80'
            : it.imageUrl,
      }))
      return {
        ...prev,
        [activeOrder.id]: {
          ...orderSt,
          items: nextItems,
        },
      }
    })

    showToast(
      vi
        ? `⚡ Đã xác minh nhanh toàn bộ ${totalItems}/${totalItems} sản phẩm cho ${activeOrder.tabLabel}!`
        : `Verified all ${totalItems} items for ${activeOrder.tabLabel}!`,
    )
  }

  // Barcode input submit
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = barcodeQuery.trim().toLowerCase()
    if (!q) return

    const matched = currentItems.find(
      (it) =>
        it.sku.toLowerCase().includes(q) ||
        it.id.toLowerCase().includes(q) ||
        it.title.toLowerCase().includes(q),
    )

    if (matched) {
      handleToggleItemVerify(matched.id)
      setBarcodeQuery('')
    } else {
      showToast(
        vi
          ? `Mã "${barcodeQuery}" không khớp với sản phẩm nào trong đơn ${activeOrder.tabLabel}`
          : `No matching item found for "${barcodeQuery}" in ${activeOrder.tabLabel}`,
      )
    }
  }

  // Approve AI Plan or Confirm Manual Packaging
  const handleApprovePlan = () => {
    if (!allVerified) {
      showToast(
        vi
          ? `Chưa thể xác nhận! Vui lòng quét và xác minh đủ ${totalItems}/${totalItems} sản phẩm của đơn ${activeOrder.tabLabel}.`
          : `Cannot confirm! Please verify all ${totalItems} items for ${activeOrder.tabLabel} first.`,
      )
      return
    }

    setOrdersState((prev) => {
      const orderSt = prev[activeOrder.id]
      if (!orderSt) return prev
      return {
        ...prev,
        [activeOrder.id]: {
          ...orderSt,
          planApproved: true,
        },
      }
    })

    const isManual = activeOrderState.packingMode === 'manual'
    showToast(
      isManual
        ? (vi
            ? `Đã xác nhận quy cách đóng gói thủ công (${activeOrderState.boxCode}) cho ${activeOrder.tabLabel}! Sẵn sàng in nhãn.`
            : `Manual packaging (${activeOrderState.boxCode}) confirmed for ${activeOrder.tabLabel}! Ready to print label.`)
        : (vi
            ? `Đã phê duyệt kế hoạch đóng gói AI cho ${activeOrder.tabLabel}! Sẵn sàng in nhãn.`
            : `AI packaging plan approved for ${activeOrder.tabLabel}! Ready to print label.`),
    )
  }

  // Print Label & Multi-Order Completion Flow
  const handlePrintLabel = () => {
    if (!isCurrentOrderApproved && !isCurrentOrderCompleted) {
      if (!allVerified) {
        showToast(
          vi
            ? `Vui lòng xác minh đủ ${totalItems}/${totalItems} sản phẩm trước khi in nhãn!`
            : `Please verify all ${totalItems} items before printing shipping label!`,
        )
      } else {
        showToast(
          vi
            ? 'Vui lòng nhấn "Phê duyệt kế hoạch AI" hoặc "Xác nhận đóng gói thủ công" trước khi in nhãn!'
            : 'Please approve plan before printing shipping label!',
        )
      }
      return
    }

    // 1. Mark current platform order as COMPLETED
    const nextCompleted = new Set(completedOrderIds)
    nextCompleted.add(activeOrder.id)
    setCompletedOrderIds(nextCompleted)

    // 2. Check if all platform orders in the batch are completed
    const remainingUncompleted = platformOrders.filter(
      (ord) => ord.id !== activeOrder.id && !nextCompleted.has(ord.id),
    )

    const isBatchFullyFinished = nextCompleted.size === platformOrders.length

    if (!isBatchFullyFinished && remainingUncompleted.length > 0) {
      const nextOrder = remainingUncompleted[0]!
      showToast(
        vi
          ? `Đã in nhãn và hoàn tất kiện [${activeOrder.tabLabel}] (${nextCompleted.size}/${platformOrders.length})! Tự động chuyển sang đóng gói ${nextOrder.tabLabel}...`
          : `Printed label for [${activeOrder.tabLabel}]! Switching to ${nextOrder.tabLabel}...`,
      )

      window.setTimeout(() => {
        setActiveOrderId(nextOrder.id)
      }, 750)
    } else {
      // ALL platform orders in batch are COMPLETED!
      showToast(
        vi
          ? `Đã hoàn tất đóng gói toàn bộ ${platformOrders.length}/${platformOrders.length} kiện hàng trong đợt! Đang chuyển sang Bàn giao vận chuyển...`
          : `All ${platformOrders.length} packages packed! Transferring to Carrier Handover...`,
      )

      window.setTimeout(() => {
        if (onNavigateToShipping) {
          onNavigateToShipping()
        } else {
          navigate('/app/shipping')
        }
      }, 1200)
    }
  }

  // Direct Handover Navigation
  const handleGoToShipping = () => {
    if (!allBatchOrdersCompleted) {
      showToast(
        vi
          ? `Chưa thể bàn giao! Cần đóng gói và in nhãn đầy đủ cho tất cả ${platformOrders.length} kiện hàng trong đợt.`
          : `Cannot handover! All ${platformOrders.length} packages must be packed first.`,
      )
      return
    }
    if (onNavigateToShipping) {
      onNavigateToShipping()
    } else {
      navigate('/app/shipping')
    }
  }

  return (
    <div className="flex-1 overflow-auto bg-[#F8FAFC] p-3.5 sm:p-5 lg:p-6 dark:bg-[#0B0E14]">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Toast Notification */}
        {toastMessage && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-800 shadow-xs flex items-center justify-between dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-300 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
              <span>{toastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-blue-700 hover:text-blue-900 dark:text-blue-400 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Top Header Card: Batch Context & Consolidated Customer */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between rounded-2xl border border-slate-200/90 bg-white p-3.5 sm:px-4 sm:py-3 shadow-xs dark:border-slate-800 dark:bg-surface-1">
          {/* Left: Back Link & Batch Switcher & Customer Info */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 text-xs">
            <Link
              to="/app/warehouse"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 hover:text-blue-600 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300 dark:hover:text-blue-400 cursor-pointer transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{vi ? 'Quay lại Lấy hàng' : 'Back to Picking'}</span>
            </Link>

            <span className="hidden sm:inline-block h-4 w-[1px] bg-slate-200 dark:bg-slate-700" />

            {/* Batch Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setBatchDropdownOpen((v) => !v)}
                className="h-8.5 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 shadow-2xs hover:border-slate-300 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-200 font-mono cursor-pointer"
              >
                <span>{currentBatchPlan.batchId}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {batchDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-80 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg z-30 dark:border-slate-800 dark:bg-surface-1">
                  <p className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {vi ? 'Chọn đợt hàng gộp' : 'Select Consolidated Batch'}
                  </p>
                  {Object.keys(BATCH_PACKAGING_PLANS).map((bKey) => {
                    const plan = BATCH_PACKAGING_PLANS[bKey]!
                    const isSelected = bKey === currentBatchKey
                    return (
                      <button
                        key={bKey}
                        type="button"
                        onClick={() => handleSelectBatch(bKey)}
                        className={`w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors flex items-center justify-between ${
                          isSelected
                            ? 'bg-blue-50 font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                            : 'hover:bg-slate-50 text-slate-700 dark:hover:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        <span className="font-mono">{bKey}</span>
                        <span className="text-[11px] text-slate-400 truncate max-w-[170px]">
                          {plan.customerName} ({plan.orders.length} sàn)
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Warehouse Tag */}
            <span className="rounded-lg bg-blue-50 border border-blue-200/80 px-2.5 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300">
              Kho tổng chung
            </span>

            {/* Consolidated Customer Tag */}
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-purple-200/90 bg-purple-50/70 px-2.5 py-1 text-xs font-semibold text-purple-700 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300">
              <Sparkles className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
              <span>{vi ? 'Khách nhận (Đơn gộp):' : 'Customer:'}</span>
              <strong className="font-bold text-purple-950 dark:text-purple-100">
                {currentBatchPlan.customerName}
              </strong>
              <span className="rounded-full bg-purple-200/80 px-1.5 py-0.2 text-[10px] font-bold text-purple-800 dark:bg-purple-900/60 dark:text-purple-200">
                Gộp {platformOrders.length} đơn sàn
              </span>
            </div>
          </div>

          {/* Right: Progress Tracker & Handover CTA */}
          <div className="flex items-center gap-2 self-end lg:self-auto shrink-0 text-xs">
            {/* Completion Pill */}
            <div className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <Package className="h-3.5 w-3.5 text-blue-600" />
              <span>
                {completedOrderIds.size}/{platformOrders.length} {vi ? 'kiện đã đóng gói' : 'packages packed'}
              </span>
            </div>

            {/* Screen 4 Navigation CTA */}
            <button
              type="button"
              onClick={handleGoToShipping}
              disabled={!allBatchOrdersCompleted}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 font-bold text-xs transition-all ${
                allBatchOrdersCompleted
                  ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs cursor-pointer ring-2 ring-emerald-500/20'
                  : 'bg-slate-200 text-slate-400 opacity-60 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500'
              }`}
              title={
                !allBatchOrdersCompleted
                  ? vi
                    ? `Cần hoàn tất in nhãn cả ${platformOrders.length} kiện trước khi bàn giao vận chuyển`
                    : `Pack and print all ${platformOrders.length} packages before carrier handover`
                  : undefined
              }
            >
              <Truck className="h-3.5 w-3.5" />
              <span>{vi ? 'Bàn giao vận chuyển' : 'Carrier Handover'}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* MAIN 3-COLUMN LAYOUT WITH PLATFORM SPLIT PACKAGING LOGIC  */}
        {/* ========================================================= */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
          {/* ======================================================= */}
          {/* COLUMN 1 (LEFT): PLATFORM TABS, ORDER INFO & VERIFY     */}
          {/* ======================================================= */}
          <div className="lg:col-span-4 xl:col-span-4 space-y-4">
            {/* 1.1 PLATFORM ORDER SWITCHER TABS */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-surface-1 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                    <Package className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    {vi ? 'Tách kiện theo sàn TMĐT' : 'Split Packaging per Platform'}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 font-bold">
                  {completedOrderIds.size}/{platformOrders.length} {vi ? 'kiện hoàn tất' : 'completed'}
                </span>
              </div>

              {/* Tabs Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {platformOrders.map((ord) => {
                  const isActive = ord.id === activeOrderId
                  const isCompleted = completedOrderIds.has(ord.id)
                  const isShopee = ord.channel === 'shopee'
                  const isTikTok = ord.channel === 'tiktok'

                  return (
                    <button
                      key={ord.id}
                      type="button"
                      onClick={() => setActiveOrderId(ord.id)}
                      className={`relative rounded-xl p-2.5 text-left transition-all cursor-pointer border ${
                        isActive
                          ? isShopee
                            ? 'border-orange-500 bg-orange-50/90 ring-2 ring-orange-500/25 shadow-xs dark:bg-orange-950/30 dark:border-orange-600'
                            : isTikTok
                              ? 'border-cyan-500 bg-cyan-50/90 ring-2 ring-cyan-500/25 shadow-xs dark:bg-cyan-950/30 dark:border-cyan-600'
                              : 'border-blue-500 bg-blue-50/90 ring-2 ring-blue-500/25 shadow-xs dark:bg-blue-950/30 dark:border-blue-600'
                          : isCompleted
                            ? 'border-emerald-200 bg-emerald-50/50 text-slate-700 hover:bg-emerald-50/80 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-slate-300'
                            : 'border-slate-200 bg-white hover:bg-slate-50/80 text-slate-700 dark:border-slate-800 dark:bg-surface-2 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          {/* Brand Icon */}
                          {isShopee ? (
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#EE4D2D] text-white shrink-0 shadow-2xs">
                              <ShoppingBag className="h-3.5 w-3.5 fill-current" />
                            </span>
                          ) : isTikTok ? (
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 text-cyan-400 shrink-0 shadow-2xs">
                              <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 3 15.68 6.34 6.34 0 0 0 9.34 22a6.34 6.34 0 0 0 6.34-6.32V8.65a8.28 8.28 0 0 0 4.91 1.59v-3.55z" />
                              </svg>
                            </span>
                          ) : (
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#0f156d] text-orange-400 shrink-0 shadow-2xs">
                              <ShoppingBag className="h-3.5 w-3.5" />
                            </span>
                          )}

                          <div className="min-w-0">
                            <p className="font-bold text-xs truncate text-slate-900 dark:text-slate-100">
                              {ord.tabLabel}
                            </p>
                            <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                              {ord.items.length} {vi ? 'mặt hàng' : 'items'}
                            </p>
                          </div>
                        </div>

                        {/* Status badge */}
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 shrink-0">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                            <span>{vi ? 'Đã xong' : 'Done'}</span>
                          </span>
                        ) : isActive ? (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 shrink-0">
                            {vi ? 'Đang đóng' : 'Active'}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium shrink-0">
                            {vi ? 'Chờ' : 'Wait'}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 1.2 Platform Order Info Card */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-surface-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                      {vi ? 'Đơn hàng' : 'Order'} #{activeOrder.orderNumber}
                    </h2>
                    {isCurrentOrderCompleted && (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800">
                        <Check className="h-3 w-3" />
                        {vi ? 'Đã in nhãn' : 'Printed'}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {activeOrder.customerName} • {activeOrder.deliveryService}
                  </p>
                </div>

                {/* Channel Badge */}
                {activeOrder.channel === 'tiktok' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-2.5 py-1 text-[11px] font-bold text-[#00b4cc] dark:border-cyan-500/40 dark:bg-cyan-950/20 dark:text-cyan-400 shrink-0 select-none">
                    <ShoppingBag className="h-3.5 w-3.5 fill-current" />
                    <span>TIKTOK SHOP</span>
                  </span>
                ) : activeOrder.channel === 'shopee' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-[#f97316]/30 bg-[#fff7ed] px-2.5 py-1 text-[11px] font-bold text-[#ea580c] dark:border-orange-500/40 dark:bg-orange-950/20 dark:text-orange-400 shrink-0 select-none">
                    <ShoppingBag className="h-3.5 w-3.5 fill-current" />
                    <span>SHOPEE</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 shrink-0 select-none">
                    <ShoppingBag className="h-3.5 w-3.5" />
                    <span>LAZADA</span>
                  </span>
                )}
              </div>

              <div className="mt-3.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] font-semibold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                      {vi ? 'ĐIỂM ĐẾN' : 'DESTINATION'}
                    </span>
                    <p className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {activeOrder.destination}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                      {vi ? 'HẠN SLA' : 'SLA LIMIT'}
                    </span>
                    <p className="mt-0.5 font-mono font-semibold text-[#dc2626] dark:text-rose-400">
                      {activeOrder.slaLimit}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 1.3 Item Verification Card with Barcode Scanner & Quick Demo */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-surface-1 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {vi ? 'Xác minh mặt hàng' : 'Item Verification'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {activeOrder.tabLabel}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-[#2563eb] dark:text-blue-400 font-mono">
                    {verifiedCount}/{totalItems}
                  </span>
                  {/* Quick Demo Scan All Button */}
                  {!allVerified && (
                    <button
                      type="button"
                      onClick={handleQuickVerifyAll}
                      className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[10.5px] font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 cursor-pointer transition-colors"
                      title={vi ? 'Xác minh nhanh tất cả sản phẩm đơn này' : 'Quick verify all items'}
                    >
                      <Zap className="h-3 w-3 text-blue-600" />
                      <span>{vi ? 'Quét tất cả' : 'Verify All'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full bg-[#2563eb] transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Interactive Barcode Input Form */}
              <form onSubmit={handleBarcodeSubmit} className="flex gap-1.5">
                <div className="relative flex-1">
                  <ScanBarcode className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={barcodeQuery}
                    onChange={(e) => setBarcodeQuery(e.target.value)}
                    placeholder={vi ? 'Quét mã vạch hoặc nhập SKU...' : 'Scan barcode or SKU...'}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-1.5 pl-8 pr-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-200"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!barcodeQuery.trim()}
                  className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  {vi ? 'Quét' : 'Scan'}
                </button>
              </form>

              {/* Scrollable Items List */}
              <div className="max-h-[310px] overflow-y-auto space-y-2.5 pr-1">
                {currentItems.map((item) => {
                  const isAwaitingScan = !item.verified

                  if (isAwaitingScan) {
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleToggleItemVerify(item.id)}
                        className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-2.5 flex items-center justify-between gap-2.5 transition-colors hover:bg-blue-50/50 hover:border-blue-300 cursor-pointer dark:border-slate-700 dark:bg-surface-2/40"
                        title={vi ? 'Nhấp để quét và xác minh mặt hàng này' : 'Click to scan and verify item'}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-1">
                          <VerificationItemThumb src={item.imageUrl} alt={item.title} />

                          <div className="min-w-0">
                            <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                              SKU: {item.sku}
                            </p>
                            <p className="font-semibold text-xs text-slate-900 truncate dark:text-slate-100">
                              {item.title}
                            </p>
                            <div className="mt-0.5 flex items-center gap-2 font-mono text-[10.5px] text-slate-500 dark:text-slate-400">
                              <span>▱ {item.dimensions}</span>
                              <span>•</span>
                              <span>⚖ {item.weightKg} kg</span>
                            </div>
                          </div>
                        </div>

                        {/* AWAITING SCAN badge */}
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[9.5px] font-bold tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 shrink-0 uppercase select-none">
                          {vi ? 'CHỜ QUÉT' : 'AWAITING'}
                        </span>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleToggleItemVerify(item.id)}
                      className="rounded-xl border border-slate-200/90 bg-white p-2.5 flex items-center justify-between gap-2.5 shadow-2xs transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-surface-1 cursor-pointer"
                      title={vi ? 'Nhấp để hoàn tác trạng thái xác minh' : 'Click to toggle verification'}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-1">
                        <VerificationItemThumb src={item.imageUrl} alt={item.title} />

                        <div className="min-w-0">
                          <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                            SKU: {item.sku}
                          </p>
                          <p className="font-semibold text-xs text-slate-900 truncate dark:text-slate-100">
                            {item.title}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2 font-mono text-[10.5px] text-slate-500 dark:text-slate-400">
                            <span>▱ {item.dimensions}</span>
                            <span>•</span>
                            <span>⚖ {item.weightKg} kg</span>
                          </div>
                        </div>
                      </div>

                      {/* Green circle checkmark */}
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
          {/* COLUMN 2 (CENTER): AI RECOMMENDATION & MANUAL PACKAGING */}
          {/* ======================================================= */}
          <div className="lg:col-span-5 xl:col-span-5">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-surface-1 space-y-3.5">
              {/* Header: Title + Mode Indicator */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      activeOrderState.packingMode === 'manual'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300'
                        : 'bg-blue-50 text-[#2563eb] dark:bg-blue-950/40 dark:text-blue-400'
                    }`}
                  >
                    {activeOrderState.packingMode === 'manual' ? (
                      <SlidersHorizontal className="h-4.5 w-4.5" />
                    ) : (
                      <Bot className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {activeOrderState.packingMode === 'manual'
                        ? (vi ? 'Đóng gói thủ công' : 'Manual Packaging')
                        : (vi ? 'Động cơ gợi ý AI (3D Bin Packing)' : 'AI Recommendation Engine')}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {vi ? 'Kiện hàng sàn ' : 'Package for '}
                      <strong className="text-blue-600 dark:text-blue-400 font-bold">{activeOrder.tabLabel}</strong>
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="block text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                    {activeOrderState.packingMode === 'manual'
                      ? (vi ? 'CHẾ ĐỘ' : 'MODE')
                      : (vi ? 'ĐIỂM TỐI ƯU' : 'OPTIMIZATION')}
                  </span>
                  {activeOrderState.packingMode === 'manual' ? (
                    <span className="font-bold text-xs text-purple-700 dark:text-purple-400 font-mono uppercase bg-purple-50 px-2 py-0.5 rounded border border-purple-200 dark:bg-purple-950/40 dark:border-purple-800">
                      {activeOrderState.boxCode}
                    </span>
                  ) : (
                    <span className="font-bold text-2xl text-[#16a34a] dark:text-emerald-400 leading-none">
                      {activeOrderState.optScore}%
                    </span>
                  )}
                </div>
              </div>

              {/* SEGMENTED SWITCHER: [ ✨ Gợi ý AI (Khuyến nghị) ] | [ 🛠️ Đóng gói thủ công ] */}
              <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => handleSetPackingMode('ai')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition-all cursor-pointer ${
                    activeOrderState.packingMode === 'ai'
                      ? 'bg-white text-blue-700 shadow-xs dark:bg-surface-1 dark:text-blue-300 font-bold ring-1 ring-blue-500/20'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  <span>{vi ? 'Gợi ý từ AI' : 'AI Recommendation'}</span>
                  <span className="rounded-full bg-blue-100 px-1.5 py-0.2 text-[9px] font-bold text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                    {activeOrder.optScore}%
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSetPackingMode('manual')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition-all cursor-pointer ${
                    activeOrderState.packingMode === 'manual'
                      ? 'bg-white text-purple-700 shadow-xs dark:bg-surface-1 dark:text-purple-300 font-bold ring-1 ring-purple-500/20'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Edit3 className="h-3.5 w-3.5 text-purple-600" />
                  <span>{vi ? 'Đóng gói thủ công' : 'Manual Packaging'}</span>
                  <span className="rounded-full bg-purple-100 px-1.5 py-0.2 text-[9px] font-bold text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
                    {vi ? 'Tùy chọn' : 'Custom'}
                  </span>
                </button>
              </div>

              {/* PERSISTENT AI RECOMMENDATION CALLOUT */}
              {activeOrderState.packingMode === 'manual' && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs dark:border-blue-900/50 dark:bg-blue-950/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 animate-in fade-in duration-150">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-2xs">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-blue-950 dark:text-blue-200">
                        {vi ? 'Gợi ý tối ưu từ AI cho đơn này:' : 'AI Optimal Recommendation:'}
                      </p>
                      <p className="text-[11px] text-blue-800 dark:text-blue-300 truncate">
                        <strong>{activeOrder.boxLabel}</strong> • Điểm tối ưu: <strong>{activeOrder.optScore}%</strong> (Tiết kiệm ~25% cước)
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSetPackingMode('ai')}
                    className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-white px-2.5 py-1 text-[11px] font-bold text-blue-700 shadow-2xs hover:bg-blue-50 dark:border-blue-800 dark:bg-surface-2 dark:text-blue-300 shrink-0 cursor-pointer transition-colors"
                    title={vi ? 'Khôi phục quy cách đóng gói theo gợi ý AI' : 'Restore AI suggestion'}
                  >
                    <RotateCcw className="h-3 w-3 text-blue-600" />
                    <span>{vi ? 'Áp dụng lại gợi ý AI' : 'Apply AI Suggestion'}</span>
                  </button>
                </div>
              )}

              {/* 3D Visualizer Box Container */}
              <Packing3DBoxViewer
                boxLabel={activeOrderState.boxLabel}
                boxSub={
                  activeOrderState.packingMode === 'manual'
                    ? vi
                      ? `Quy cách thùng thủ công: ${activeOrderState.boxCode} (${activeOrderState.dimensions})`
                      : `Manual Carton Selected: ${activeOrderState.boxCode}`
                    : vi
                      ? `Thuật toán 3D Bin Packing cho ${activeOrder.tabLabel}`
                      : `3D Bin Packing for ${activeOrder.tabLabel}`
                }
              />

              {/* CONDITIONAL CONTENT: AI VIEW VS MANUAL PACKAGING SELECTION */}
              {activeOrderState.packingMode === 'ai' ? (
                /* AI VIEW: Required Materials */
                <div>
                  <p className="text-[11px] font-bold tracking-wider text-slate-700 dark:text-slate-300 uppercase mb-2">
                    {vi ? 'VẬT TƯ YÊU CẦU THEO AI' : 'AI REQUIRED MATERIALS'}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {activeOrderState.materials.map((mat) => (
                      <div
                        key={mat}
                        className="rounded-xl border border-blue-100 bg-[#f0f6ff] px-3.5 py-2 text-xs font-semibold text-slate-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-slate-200 flex items-center gap-2 shadow-2xs select-none"
                      >
                        <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-[#2563eb] text-white">
                          <Check className="h-3 w-3 stroke-[3]" />
                        </div>
                        <span className="truncate text-[11.5px]">{mat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* MANUAL PACKAGING CONTROLS */
                <div className="space-y-3.5">
                  {/* 1. Carton Selector Grid */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[11px] font-bold tracking-wider text-slate-700 dark:text-slate-300 uppercase">
                        {vi ? '1. CHỌN THÙNG CARTON KHO' : '1. SELECT CARTON SIZE'}
                      </p>
                      <span className="text-[10px] text-slate-400">
                        {vi ? '6 loại thùng tiêu chuẩn' : '6 cartons available'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {MANUAL_CARTON_OPTIONS.map((carton) => {
                        const isSelected = activeOrderState.boxCode === carton.code
                        return (
                          <button
                            key={carton.code}
                            type="button"
                            onClick={() => handleSelectManualCarton(carton)}
                            className={`rounded-xl p-2.5 text-left border transition-all cursor-pointer relative ${
                              isSelected
                                ? 'border-purple-500 bg-purple-50/90 ring-2 ring-purple-500/25 dark:bg-purple-950/30 dark:border-purple-600 shadow-2xs'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-surface-2'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                                {carton.code}
                              </span>
                              {isSelected && (
                                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-purple-600 text-white">
                                  <Check className="h-2.5 w-2.5 stroke-[3]" />
                                </span>
                              )}
                            </div>
                            <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {carton.dimensions}
                            </p>
                            <div className="mt-1 flex items-center justify-between text-[10px]">
                              <span className="text-slate-400">{carton.maxWeight}</span>
                              <span className="font-bold text-purple-700 dark:text-purple-300 font-mono">
                                ${carton.costUsd.toFixed(2)}
                              </span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* 2. Materials Checklist */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[11px] font-bold tracking-wider text-slate-700 dark:text-slate-300 uppercase">
                        {vi ? '2. VẬT TƯ CHÈN LÓT & BẢO VỆ' : '2. PROTECTIVE MATERIALS'}
                      </p>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {activeOrderState.materials.length} {vi ? 'vật tư' : 'items'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {MANUAL_MATERIAL_OPTIONS.map((mat) => {
                        const isChecked = activeOrderState.materials.includes(mat.name)
                        return (
                          <button
                            key={mat.id}
                            type="button"
                            onClick={() => handleToggleManualMaterial(mat.name)}
                            className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold flex items-center justify-between border transition-all cursor-pointer ${
                              isChecked
                                ? 'border-purple-200 bg-purple-50 text-purple-900 dark:border-purple-900/40 dark:bg-purple-950/30 dark:text-purple-200 shadow-2xs'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-surface-2 dark:text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 pr-1">
                              <div
                                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-md border ${
                                  isChecked
                                    ? 'bg-purple-600 border-purple-600 text-white'
                                    : 'border-slate-300 bg-white dark:border-slate-700'
                                }`}
                              >
                                {isChecked && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                              </div>
                              <span className="truncate text-[11px]">{mat.name}</span>
                            </div>
                            <span className="font-mono text-[10px] text-slate-400 shrink-0">
                              +${mat.cost.toFixed(2)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Cost & Shipping Metrics Row */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-surface-2/60">
                  <span className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                    {vi ? 'CHI PHÍ ĐÓNG GÓI' : 'PACKAGING COST'}
                  </span>
                  <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">
                    ${activeOrderState.packagingCost.toFixed(2)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-surface-2/60">
                  <span className="text-[10px] font-bold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
                    {vi ? 'CƯỚC PHÍ VẬN CHUYỂN' : 'EST. SHIPPING FEE'}
                  </span>
                  <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                    <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">
                      ${activeOrderState.shippingFee.toFixed(2)}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      (T.tế: {activeOrder.realWeightKg}kg)
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                {activeOrderState.packingMode === 'manual' ? (
                  <button
                    type="button"
                    onClick={() => handleSetPackingMode('ai')}
                    className="h-11 rounded-xl border border-slate-300 bg-white font-semibold text-xs text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors flex items-center justify-center gap-1.5 cursor-pointer dark:border-slate-700 dark:bg-surface-1 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <RotateCcw className="h-4 w-4 text-blue-600" />
                    <span>{vi ? 'Khôi phục gợi ý AI' : 'Reset to AI'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSetPackingMode('manual')}
                    className="h-11 rounded-xl border border-slate-300 bg-white font-semibold text-xs text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors flex items-center justify-center gap-1.5 cursor-pointer dark:border-slate-700 dark:bg-surface-1 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Edit3 className="h-4 w-4 text-purple-600" />
                    <span>{vi ? 'Tùy chỉnh thủ công' : 'Switch to Manual'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleApprovePlan}
                  disabled={stationStatus === 'scanning' || stationStatus === 'approved' || stationStatus === 'printed'}
                  className={`h-11 rounded-xl font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-2 select-none ${
                    stationStatus === 'scanning'
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 opacity-50 cursor-not-allowed border border-slate-300/60 dark:border-slate-700'
                      : stationStatus === 'verified'
                        ? activeOrderState.packingMode === 'manual'
                          ? 'bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white cursor-pointer shadow-md shadow-purple-600/25 ring-2 ring-purple-500/20'
                          : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white cursor-pointer shadow-md shadow-emerald-600/25 ring-2 ring-emerald-500/20'
                        : 'bg-emerald-700 text-white cursor-default shadow-xs'
                  }`}
                  title={
                    stationStatus === 'scanning'
                      ? vi
                        ? `Cần xác minh đủ ${totalItems}/${totalItems} sản phẩm của đơn ${activeOrder.tabLabel}`
                        : 'Verify all items before approval'
                      : stationStatus === 'verified'
                        ? activeOrderState.packingMode === 'manual'
                          ? vi
                            ? `Xác nhận quy cách thủ công (${activeOrderState.boxCode}) cho ${activeOrder.tabLabel}`
                            : 'Confirm manual packing specifications'
                          : vi
                            ? `Nhấn để phê duyệt kế hoạch AI cho ${activeOrder.tabLabel}`
                            : 'Click to approve AI plan'
                        : vi
                          ? 'Quy cách đã được xác nhận'
                          : 'Plan confirmed'
                  }
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {stationStatus === 'approved' || stationStatus === 'printed'
                      ? activeOrderState.packingMode === 'manual'
                        ? (vi ? 'Đã xác nhận thủ công' : 'Manual Plan Confirmed')
                        : (vi ? 'Đã phê duyệt AI' : 'AI Plan Approved')
                      : activeOrderState.packingMode === 'manual'
                        ? (vi ? 'Xác nhận đóng gói thủ công' : 'Confirm Manual Packaging')
                        : (vi ? 'Phê duyệt kế hoạch AI' : 'Approve AI Plan')}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* ======================================================= */}
          {/* COLUMN 3 (RIGHT): HARDWARE STATUS & PLATFORM AIR WAYBILL */}
          {/* ======================================================= */}
          <div className="lg:col-span-3 xl:col-span-3 space-y-4">
            {/* 3.1 Hardware Status Card with live pulsing indicators */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-surface-1">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-bold tracking-wider text-slate-700 dark:text-slate-300 uppercase">
                  {vi ? 'TRẠNG THÁI THIẾT BỊ' : 'HARDWARE STATUS'}
                </p>
                <span className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>ONLINE</span>
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                {/* Printer */}
                <div className="flex items-center justify-between rounded-xl bg-slate-50/80 p-2 text-slate-800 dark:bg-surface-2 dark:text-slate-200">
                  <div className="flex items-center gap-2">
                    <Printer className="h-4 w-4 text-blue-600" />
                    <div>
                      <span className="font-semibold block">{vi ? 'Máy in Zebra ZD421' : 'Zebra Printer ZD421'}</span>
                      <span className="text-[10px] text-slate-400">{vi ? 'Khổ nhãn A6 cuộn nhiệt' : 'Thermal A6 Roll'}</span>
                    </div>
                  </div>
                  <span className="h-2 w-2 rounded-full bg-[#16a34a] shadow-[0_0_8px_rgba(22,163,74,0.6)] shrink-0" />
                </div>

                {/* Scale */}
                <div className="flex items-center justify-between rounded-xl bg-slate-50/80 p-2 text-slate-800 dark:bg-surface-2 dark:text-slate-200">
                  <div className="flex items-center gap-2">
                    <Scale className="h-4 w-4 text-blue-600" />
                    <div>
                      <span className="font-semibold block">{vi ? 'Cân điện tử Dibal (USB)' : 'Dibal Scale (USB)'}</span>
                      <span className="text-[10px] text-slate-400">{activeOrder.realWeightKg} kg ({vi ? 'Live' : 'Live'})</span>
                    </div>
                  </div>
                  <span className="h-2 w-2 rounded-full bg-[#16a34a] shadow-[0_0_8px_rgba(22,163,74,0.6)] shrink-0" />
                </div>
              </div>
            </div>

            {/* 3.2 Platform-Branded Air Waybill Preview with QR Code */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-surface-1 space-y-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold tracking-wider text-slate-700 dark:text-slate-300 uppercase">
                  {vi ? 'XEM TRƯỚC PHIẾU GỬI' : 'LABEL PREVIEW'}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] font-bold uppercase rounded bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {activeOrder.channel.toUpperCase()} AWB
                  </span>
                </div>
              </div>

              {/* Shipping Label Sheet Container */}
              <div className="relative rounded-xl border-2 border-slate-200 bg-white p-3.5 text-slate-900 shadow-2xs select-none">
                {/* Angled DRAFT Watermark or Ready/Printed Badge */}
                {stationStatus !== 'approved' && stationStatus !== 'printed' ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="rotate-[-25deg] font-mono text-3xl font-extrabold tracking-widest text-slate-200/85">
                      {vi ? 'BẢN NHÁP' : 'DRAFT'}
                    </span>
                  </div>
                ) : stationStatus === 'printed' ? (
                  <div className="pointer-events-none absolute top-2 right-2">
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-800 uppercase shadow-2xs">
                      <Check className="h-3 w-3 stroke-[3]" />
                      {vi ? 'ĐÃ IN NHÃN' : 'PRINTED'}
                    </span>
                  </div>
                ) : (
                  <div className="pointer-events-none absolute top-2 right-2">
                    <span
                      className={`rounded px-2 py-0.5 text-[9px] font-bold uppercase ${
                        activeOrderState.packingMode === 'manual'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {activeOrderState.packingMode === 'manual'
                        ? (vi ? 'SẴN SÀNG (THỦ CÔNG)' : 'READY (MANUAL)')
                        : (vi ? 'SẴN SÀNG (AI)' : 'READY (AI)')}
                    </span>
                  </div>
                )}

                {/* Platform-Specific Brand Header */}
                {activeOrder.channel === 'shopee' ? (
                  <div className="flex items-center justify-between border-b-2 border-orange-500 pb-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#EE4D2D] text-white">
                        <ShoppingBag className="h-3.5 w-3.5 fill-current" />
                      </span>
                      <span className="font-extrabold text-sm tracking-tight text-[#EE4D2D]">
                        Shopee Xpress
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="rounded bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-800">
                        SPX HỎA TỐC
                      </span>
                      <span className="block font-mono text-[9px] font-bold text-slate-500">
                        {activeOrder.sortingHub}
                      </span>
                    </div>
                  </div>
                ) : activeOrder.channel === 'tiktok' ? (
                  <div className="flex items-center justify-between border-b-2 border-cyan-500 pb-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 text-white">
                        <svg className="h-3.5 w-3.5 fill-current text-cyan-400" viewBox="0 0 24 24">
                          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 3 15.68 6.34 6.34 0 0 0 9.34 22a6.34 6.34 0 0 0 6.34-6.32V8.65a8.28 8.28 0 0 0 4.91 1.59v-3.55z" />
                        </svg>
                      </span>
                      <span className="font-extrabold text-sm tracking-tight text-slate-900">
                        TikTok Shop
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="rounded bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-900">
                        TTS LOGISTICS
                      </span>
                      <span className="block font-mono text-[9px] font-bold text-slate-500">
                        {activeOrder.sortingHub}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between border-b-2 border-blue-600 pb-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#0f156d] text-white">
                        <ShoppingBag className="h-3.5 w-3.5 text-orange-400" />
                      </span>
                      <span className="font-extrabold text-sm tracking-tight text-[#0f156d]">
                        Lazada Express
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-900">
                        LEX STANDARD
                      </span>
                      <span className="block font-mono text-[9px] font-bold text-slate-500">
                        {activeOrder.sortingHub}
                      </span>
                    </div>
                  </div>
                )}

                {/* Order & Route Line */}
                <div className="flex items-center justify-between text-[10.5px] pb-1 font-mono">
                  <span className="font-bold text-slate-800">
                    ĐƠN: #{activeOrder.orderNumber}
                  </span>
                  <span className="font-bold text-slate-600">
                    {activeOrder.routeCode}
                  </span>
                </div>

                <div className="border-t border-slate-200 my-1.5" />

                {/* Recipient & Address block */}
                <div className="space-y-0.5 text-[10.5px] leading-tight text-slate-700 pt-0.5">
                  <p className="font-bold text-slate-900">
                    {vi ? 'NGƯỜI NHẬN:' : 'TO:'} {activeOrder.customerName} ({activeOrder.phone})
                  </p>
                  <p className="line-clamp-2 text-slate-600 text-[10px]">{activeOrder.customerAddress}</p>
                </div>

                {/* Dual Barcode & QR code layout */}
                <div className="mt-2.5 mb-1.5 flex items-center justify-between gap-2 border-y border-dashed border-slate-200 py-1.5">
                  <div className="flex-1 min-w-0">
                    <ShippingBarcodeGraphic code={activeOrder.trackingNumber} />
                  </div>
                  <ShippingQrGraphic />
                </div>

                {/* Footer specs & Payment info */}
                <div className="space-y-1 text-[9.5px] text-slate-600 font-mono">
                  <p className="truncate">
                    <strong>Thanh toán:</strong> {activeOrder.paymentInfo}
                  </p>
                  <div className="flex items-center justify-between pt-0.5 border-t border-slate-200 text-slate-500">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      {activeOrderState.boxCode}
                      {activeOrderState.packingMode === 'manual' && ' (Thủ công)'}
                    </span>
                    <span>K.lượng: {activeOrder.realWeightKg}kg</span>
                    <span>K.thước: {activeOrderState.dimensions}</span>
                  </div>
                </div>
              </div>

              {/* Print Button & Multi-Order Completion Action */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handlePrintLabel}
                  disabled={stationStatus !== 'approved' && stationStatus !== 'printed'}
                  className={`w-full h-11 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all select-none shadow-2xs ${
                    stationStatus === 'printed'
                      ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-emerald-500/25 shadow-md cursor-pointer'
                      : stationStatus === 'approved'
                        ? 'bg-[#4338ca] hover:bg-[#3730a3] active:bg-[#312e81] text-white shadow-indigo-500/25 shadow-md cursor-pointer'
                        : 'bg-[#e0e7ff]/70 text-[#4338ca]/50 cursor-not-allowed opacity-50 dark:bg-indigo-950/20 dark:text-indigo-400/40 border border-indigo-200/40 dark:border-indigo-900/40'
                  }`}
                >
                  <Printer className="h-4 w-4" />
                  <span>
                    {stationStatus === 'printed'
                      ? vi
                        ? `Đã in nhãn ${activeOrder.tabLabel} (In lại)`
                        : `Printed ${activeOrder.tabLabel} (Reprint)`
                      : vi
                        ? `In nhãn & Đóng gói ${activeOrder.tabLabel}`
                        : `Print Label & Pack ${activeOrder.tabLabel}`}
                  </span>
                </button>

                {/* Informative Subtext */}
                <p className="text-center text-[10.5px] text-slate-500 dark:text-slate-400">
                  {stationStatus === 'printed'
                    ? vi
                      ? `Kiện ${activeOrder.tabLabel} đã hoàn tất. Tiến độ: ${completedOrderIds.size}/${platformOrders.length} kiện.`
                      : `Package ${activeOrder.tabLabel} completed. Progress: ${completedOrderIds.size}/${platformOrders.length}.`
                    : stationStatus === 'approved'
                      ? vi
                        ? `Quy cách ${activeOrderState.packingMode === 'manual' ? 'thủ công' : 'AI'} đã xác nhận. Nhấn in nhãn A6.`
                        : 'Specifications confirmed. Click to print A6 label.'
                      : stationStatus === 'verified'
                        ? activeOrderState.packingMode === 'manual'
                          ? vi
                            ? 'Nhấn "Xác nhận đóng gói thủ công" trước khi in nhãn'
                            : 'Click "Confirm Manual Packaging" before printing'
                          : vi
                            ? 'Cần phê duyệt kế hoạch AI trước khi in nhãn'
                            : 'Approve AI plan to enable printing'
                        : vi
                          ? 'Hoàn tất quét xác minh các mặt hàng để kích hoạt in nhãn'
                          : 'Complete verification to enable printing'}
                </p>

                {/* Batch Completion Handover Button */}
                <div className="pt-1.5">
                  <button
                    type="button"
                    onClick={handleGoToShipping}
                    disabled={!allBatchOrdersCompleted}
                    className={`w-full h-11 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all select-none ${
                      allBatchOrdersCompleted
                        ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-md shadow-blue-500/25 cursor-pointer ring-2 ring-blue-500/20'
                        : 'bg-slate-100 text-slate-400 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-500 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <Truck className="h-4 w-4" />
                    <span>
                      {allBatchOrdersCompleted
                        ? vi
                          ? `Chuyển sang Bàn giao vận chuyển (${platformOrders.length}/${platformOrders.length} kiện đã xong) →`
                          : `Proceed to Carrier Handover (${platformOrders.length}/${platformOrders.length} ready) →`
                        : vi
                          ? `Cần hoàn tất cả ${platformOrders.length} kiện (${completedOrderIds.size}/${platformOrders.length} đã xong)`
                          : `Complete all ${platformOrders.length} packages (${completedOrderIds.size}/${platformOrders.length} done)`}
                    </span>
                  </button>
                </div>
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
                  {vi ? `Đổi quy cách đóng gói cho [${activeOrder.tabLabel}]` : `Override Box for [${activeOrder.tabLabel}]`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setManualOverrideOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
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
                    onClick={() => {
                      const matched = MANUAL_CARTON_OPTIONS.find((c) => c.code.includes(carton.code)) ?? {
                        code: carton.code,
                        label: `${carton.code}: ${carton.length} x ${carton.width} x ${carton.height} cm`,
                        dimensions: `${carton.length} × ${carton.width} × ${carton.height} cm`,
                        dim: { w: carton.length, l: carton.width, h: carton.height },
                        costUsd: Number((carton.unitCost / 23000).toFixed(2)),
                        shippingFeeUsd: 2.10,
                        maxWeight: carton.maxWeight,
                        desc: 'Thùng carton kho',
                      }
                      handleSelectManualCarton(matched)
                      setManualOverrideOpen(false)
                    }}
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
                className="rounded-lg px-4 py-2 font-medium text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-surface-2 cursor-pointer"
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

export default PackingDashboard
