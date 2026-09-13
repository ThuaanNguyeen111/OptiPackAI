import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  Flag,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  Sparkles,
  User,
  UserCheck,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { BatchDetailDrawer } from '../components/orders/BatchDetailDrawer'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'
import {
  getStoredBatches,
  updateBatchPicker,
  type BatchZone,
  type PickingBatch,
} from '../data/picking-batches-mock'
import {
  computeStockStatus,
  getPickingItemsForBatch,
  getStoredWarehouseStock,
  resetWarehouseStock,
  saveStoredWarehouseStock,
  type WarehousePickingItem,
  type WarehouseStockItem,
} from '../data/warehouse-picking-mock'
import { getWarehouseStaffItems } from '../data/staff-mock'

// ==========================================
// CHANNEL BADGE HELPER
// ==========================================

export function renderChannelBadge(
  channel: 'shopee' | 'tiktok' | 'lazada' | 'facebook',
  size: 'sm' | 'md' = 'md',
) {
  const isSm = size === 'sm'
  const padding = isSm ? 'px-1.5 py-0.5' : 'px-2 py-0.5'
  const textClass = isSm ? 'text-[10px] font-semibold' : 'text-xs font-semibold'
  const compactClass = isSm ? 'shrink-0 whitespace-nowrap' : ''

  switch (channel) {
    case 'shopee':
      return (
        <span
          className={`inline-flex items-center gap-1 rounded border border-[#f97316]/50 bg-[#fff7ed] ${padding} ${textClass} ${compactClass} text-[#ea580c] dark:border-orange-500/40 dark:bg-orange-950/20 dark:text-orange-400`}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#ea580c]" />
          Shopee
        </span>
      )
    case 'tiktok':
      return (
        <span
          className={`inline-flex items-center gap-1 rounded border border-slate-900 bg-white ${padding} ${textClass} ${compactClass} text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100`}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-900 dark:bg-zinc-100" />
          {isSm ? 'TikTok' : 'TikTok Shop'}
        </span>
      )
    case 'lazada':
      return (
        <span
          className={`inline-flex items-center gap-1 rounded border border-[#4f46e5]/50 bg-[#eef2ff] ${padding} ${textClass} ${compactClass} text-[#4f46e5] dark:border-indigo-500/40 dark:bg-indigo-950/20 dark:text-indigo-400`}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4f46e5]" />
          Lazada
        </span>
      )
    case 'facebook':
      return (
        <span
          className={`inline-flex items-center gap-1 rounded border border-[#2563eb]/50 bg-[#eff6ff] ${padding} ${textClass} ${compactClass} text-[#2563eb] dark:border-blue-500/40 dark:bg-blue-950/20 dark:text-blue-400`}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2563eb]" />
          {isSm ? 'FB' : 'Facebook'}
        </span>
      )
    default:
      return null
  }
}

// ==========================================
// MOCK WAREHOUSE STAFF LIST FOR ASSIGNMENT
// ==========================================

export interface WarehouseStaffItem {
  id: string
  name: string
  code: string
  avatar: string
  initials: string
  role: string
  zone: BatchZone
  status: 'available' | 'busy'
  activeBatches: number
}

export const WAREHOUSE_STAFF_LIST: WarehouseStaffItem[] = [
  {
    id: 'staff-1',
    name: 'Ahmad R.',
    code: 'NV-KHO-01',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face',
    initials: 'AR',
    role: 'Nhân viên lấy hàng',
    zone: 'Zone A',
    status: 'available',
    activeBatches: 0,
  },
  {
    id: 'staff-2',
    name: 'Rian K.',
    code: 'NV-KHO-02',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face',
    initials: 'RK',
    role: 'Nhân viên lấy hàng',
    zone: 'Zone A',
    status: 'busy',
    activeBatches: 1,
  },
  {
    id: 'staff-3',
    name: 'Siti M.',
    code: 'NV-KHO-03',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&h=100&fit=crop&crop=face',
    initials: 'SM',
    role: 'Nhân viên lấy hàng',
    zone: 'Zone B',
    status: 'available',
    activeBatches: 0,
  },
  {
    id: 'staff-4',
    name: 'Budi P.',
    code: 'NV-KHO-04',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
    initials: 'BP',
    role: 'Nhân viên lấy hàng',
    zone: 'Zone C',
    status: 'available',
    activeBatches: 0,
  },
  {
    id: 'staff-5',
    name: 'Fahmi H.',
    code: 'NV-KHO-05',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&h=100&fit=crop&crop=face',
    initials: 'FH',
    role: 'Nhân viên lấy hàng',
    zone: 'Zone A',
    status: 'available',
    activeBatches: 0,
  },
  {
    id: 'staff-6',
    name: 'Dewi A.',
    code: 'NV-KHO-06',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=face',
    initials: 'DA',
    role: 'Nhân viên lấy hàng',
    zone: 'Zone B',
    status: 'busy',
    activeBatches: 1,
  },
  {
    id: 'staff-7',
    name: 'Eka S.',
    code: 'NV-KHO-07',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face',
    initials: 'ES',
    role: 'Nhân viên lấy hàng',
    zone: 'Zone C',
    status: 'available',
    activeBatches: 0,
  },
]

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

/** Picking list row — title on line 1, platform badge + SKU always on line 2 */
function PickingListItemInfo({
  item,
  titleClassName,
}: {
  item: WarehousePickingItem
  titleClassName: string
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className={`truncate text-xs leading-snug ${titleClassName}`}>
        {item.shortName}
      </p>
      <div className="flex min-w-0 items-center gap-1.5">
        {renderChannelBadge(item.channel, 'sm')}
        <span className="min-w-0 truncate font-mono text-[11px] leading-snug text-slate-500 dark:text-slate-400">
          {item.sku}
          <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            #{item.orderId}
          </span>
        </span>
      </div>
    </div>
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

  // 2. Default active item: first unpicked item in the batch, or first item
  const [activeItemId, setActiveItemId] = useState<string>(() => {
    const unpicked = initialBatchItems.find((i) => i.status !== 'picked')
    return unpicked?.id ?? initialBatchItems[0]?.id ?? ''
  })

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

  // Danh sách nhân viên lấy hàng động (đồng bộ từ hệ thống Quản lý nhân viên của chủ shop)
  const [warehouseStaffList, setWarehouseStaffList] = useState<WarehouseStaffItem[]>(() => getWarehouseStaffItems())

  useEffect(() => {
    const handleStaffUpdate = () => {
      setWarehouseStaffList(getWarehouseStaffItems())
    }
    window.addEventListener('optipack-staff-updated', handleStaffUpdate)
    return () => {
      window.removeEventListener('optipack-staff-updated', handleStaffUpdate)
    }
  }, [])

  // Staff Assignment State (Phân công nhân viên: Auto vs Manual)
  const isPreviouslyUnassigned =
    !batch.picker?.name || batch.picker.name === 'Chưa phân công'

  // Nhân viên tối ưu được AI tự động phân công theo zone
  const autoAssignedStaff = useMemo(() => {
    return (
      warehouseStaffList.find(
        (s) => s.zone === batch.zone && s.status === 'available',
      ) ||
      warehouseStaffList.find((s) => s.zone === batch.zone) ||
      warehouseStaffList[0] ||
      WAREHOUSE_STAFF_LIST[0]!
    )
  }, [batch.zone, warehouseStaffList])

  const initialPicker = useMemo(() => {
    if (!isPreviouslyUnassigned && batch.picker?.name && batch.picker.name !== 'Chưa phân công') {
      const match = warehouseStaffList.find((s) => s.name === batch.picker.name) || WAREHOUSE_STAFF_LIST.find((s) => s.name === batch.picker.name)
      return {
        name: batch.picker.name,
        avatar: batch.picker.avatar || match?.avatar || '',
        initials: batch.picker.initials || match?.initials || 'NV',
        code: match?.code || 'NV-KHO-01',
        role: match?.role || 'Nhân viên lấy hàng',
        zone: match?.zone || batch.zone,
      }
    }
    // Nếu trước đó chưa phân công, AI tự động phân công ngay khi bắt đầu lấy hàng:
    return {
      name: autoAssignedStaff.name,
      avatar: autoAssignedStaff.avatar,
      initials: autoAssignedStaff.initials,
      code: autoAssignedStaff.code,
      role: autoAssignedStaff.role,
      zone: autoAssignedStaff.zone,
    }
  }, [isPreviouslyUnassigned, batch.picker, autoAssignedStaff, batch.zone, warehouseStaffList])

  const [currentPicker, setCurrentPicker] = useState(initialPicker)
  const [assignmentMode, setAssignmentMode] = useState<'auto' | 'manual'>('auto')
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [selectedStaffId, setSelectedStaffId] = useState<string>('staff-1')
  const [modalAssignMode, setModalAssignMode] = useState<'auto' | 'manual'>('auto')
  const [staffSearchQuery, setStaffSearchQuery] = useState('')

  // Lọc danh sách nhân viên theo từ khóa tìm kiếm khi chọn thủ công
  const filteredStaffList = useMemo(() => {
    if (!staffSearchQuery.trim()) return warehouseStaffList
    const q = staffSearchQuery.trim().toLowerCase()
    return warehouseStaffList.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.zone.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q),
    )
  }, [staffSearchQuery, warehouseStaffList])

  // Tự động phân công và đồng bộ cập nhật nếu đợt hàng trước đó chưa phân công
  useEffect(() => {
    if (isPreviouslyUnassigned) {
      updateBatchPicker(batch.id, {
        name: autoAssignedStaff.name,
        avatar: autoAssignedStaff.avatar,
        initials: autoAssignedStaff.initials,
      })
      setToastMessage(
        vi
          ? `⚡ Bắt đầu lấy hàng! AI đã tự động phân công nhân viên ${autoAssignedStaff.name} (${autoAssignedStaff.code}) phụ trách đợt hàng.`
          : `Picking started! AI auto-assigned ${autoAssignedStaff.name} for picking batch.`,
      )
      const timer = window.setTimeout(() => setToastMessage(null), 4000)
      return () => window.clearTimeout(timer)
    }
  }, [batch.id, isPreviouslyUnassigned, autoAssignedStaff, vi])

  // Channel filter for picking list on the right
  const [channelFilter, setChannelFilter] = useState<string>('all')

  // Real-time warehouse inventory state
  const [warehouseStockMap, setWarehouseStockMap] = useState<Record<string, WarehouseStockItem>>(() =>
    getStoredWarehouseStock(initialBatchItems),
  )
  // View mode: 'buyer_items' (default: only show items purchased by buyers) vs 'all_warehouse'
  const [inventoryViewMode, setInventoryViewMode] = useState<'buyer_items' | 'all_warehouse'>('buyer_items')
  const [stockSearchQuery, setStockSearchQuery] = useState('')
  const [stockFilterTab, setStockFilterTab] = useState<'all' | 'pending' | 'picked' | 'low_stock'>('all')
  const [lastDeductedSku, setLastDeductedSku] = useState<string | null>(null)

  // Listen for real-time stock sync
  useEffect(() => {
    const handleStockSync = () => {
      setWarehouseStockMap(getStoredWarehouseStock(items))
    }
    window.addEventListener('optipack:warehouse_stock_updated', handleStockSync)
    return () => {
      window.removeEventListener('optipack:warehouse_stock_updated', handleStockSync)
    }
  }, [items])

  // Active item stock info
  const activeStock = useMemo(() => {
    if (!activeItem) return null
    return warehouseStockMap[activeItem.sku] ?? null
  }, [activeItem, warehouseStockMap])

  // Filtered inventory list: BUYER ITEMS ONLY (mục tiêu chính theo yêu cầu người dùng)
  const buyerInventoryList = useMemo(() => {
    return items.filter((item) => {
      const stock = warehouseStockMap[item.sku]
      // Tab filter
      if (stockFilterTab === 'pending' && item.status === 'picked') {
        return false
      }
      if (stockFilterTab === 'picked' && item.status !== 'picked') {
        return false
      }
      if (stockFilterTab === 'low_stock' && stock?.status !== 'low') {
        return false
      }
      // Search query
      if (stockSearchQuery.trim()) {
        const q = stockSearchQuery.trim().toLowerCase()
        return (
          item.name.toLowerCase().includes(q) ||
          item.shortName.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q) ||
          item.upc.toLowerCase().includes(q) ||
          item.location.toLowerCase().includes(q) ||
          item.customerName.toLowerCase().includes(q) ||
          item.orderId.toLowerCase().includes(q) ||
          item.channel.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [items, warehouseStockMap, stockFilterTab, stockSearchQuery])

  // Filtered inventory list: ALL WAREHOUSE (chế độ xem phụ)
  const allWarehouseInventoryList = useMemo(() => {
    const all = Object.values(warehouseStockMap)
    return all.filter((item) => {
      if (stockFilterTab === 'pending' && item.pickedQuantity >= item.initialStock) {
        return false
      }
      if (stockFilterTab === 'picked' && item.pickedQuantity === 0) {
        return false
      }
      if (stockFilterTab === 'low_stock' && item.status !== 'low') {
        return false
      }
      if (stockSearchQuery.trim()) {
        const q = stockSearchQuery.trim().toLowerCase()
        return (
          item.name.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q) ||
          item.upc.toLowerCase().includes(q) ||
          item.location.toLowerCase().includes(q) ||
          item.zone.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [warehouseStockMap, stockFilterTab, stockSearchQuery])

  // Unique SKUs in current batch
  const batchSkuSet = useMemo(() => new Set(items.map((it) => it.sku)), [items])

  const lowStockBuyerCount = useMemo(() => {
    const uniqueSkus = Array.from(batchSkuSet)
    return uniqueSkus.filter((sku) => warehouseStockMap[sku]?.status === 'low').length
  }, [batchSkuSet, warehouseStockMap])

  const totalPickedUnits = useMemo(() => {
    return Object.values(warehouseStockMap).reduce((sum, it) => sum + it.pickedQuantity, 0)
  }, [warehouseStockMap])

  const lowStockCount = useMemo(() => {
    return Object.values(warehouseStockMap).filter((it) => it.status === 'low').length
  }, [warehouseStockMap])

  const handleResetStock = () => {
    const fresh = resetWarehouseStock(items)
    setWarehouseStockMap(fresh)
    setToastMessage(
      vi
        ? 'Đã khôi phục số lượng tồn kho ban đầu của toàn bộ sản phẩm!'
        : 'Warehouse inventory reset to initial stock!',
    )
    window.setTimeout(() => setToastMessage(null), 3000)
  }

  // Channels count in this batch
  const channelCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    items.forEach((it) => {
      counts[it.channel] = (counts[it.channel] || 0) + 1
    })
    return counts
  }, [items])

  // Thông tin khách hàng nhận của đợt gom đơn (Mỗi đợt gom từ nhiều sàn cho DUY NHẤT 1 khách hàng)
  const batchCustomer = useMemo(() => {
    const firstOrder = batch.orders[0]
    return {
      name: batch.customerName || firstOrder?.customerName || 'Trần Văn An',
      phone: batch.customerPhone || firstOrder?.phone || '0901 882 193',
      address: batch.customerAddress || firstOrder?.address || '123 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
      ordersCount: batch.orders.length,
      channelsText: batch.channels.map((c) => c.toUpperCase()).join(' + '),
    }
  }, [batch])

  const handleConfirmAssignment = () => {
    if (modalAssignMode === 'auto') {
      const bestStaff =
        warehouseStaffList.find(
          (s) => s.zone === batch.zone && s.status === 'available',
        ) ||
        warehouseStaffList.find((s) => s.zone === batch.zone) ||
        warehouseStaffList[0] ||
        WAREHOUSE_STAFF_LIST[0]!

      const newPicker = {
        name: bestStaff.name,
        avatar: bestStaff.avatar,
        initials: bestStaff.initials,
        code: bestStaff.code,
        role: bestStaff.role,
        zone: bestStaff.zone,
      }
      setCurrentPicker(newPicker)
      setAssignmentMode('auto')
      setAssignModalOpen(false)
      setStaffSearchQuery('')
      updateBatchPicker(batch.id, {
        name: bestStaff.name,
        avatar: bestStaff.avatar,
        initials: bestStaff.initials,
      })
      setToastMessage(
        `AI đã tự động phân công nhân viên ${bestStaff.name} (${bestStaff.code}) phụ trách đợt ${batch.id}!`,
      )
    } else {
      const staff =
        warehouseStaffList.find((s) => s.id === selectedStaffId) ||
        warehouseStaffList[0] ||
        WAREHOUSE_STAFF_LIST[0]!

      const newPicker = {
        name: staff.name,
        avatar: staff.avatar,
        initials: staff.initials,
        code: staff.code,
        role: staff.role,
        zone: staff.zone,
      }
      setCurrentPicker(newPicker)
      setAssignmentMode('manual')
      setAssignModalOpen(false)
      setStaffSearchQuery('')
      updateBatchPicker(batch.id, {
        name: staff.name,
        avatar: staff.avatar,
        initials: staff.initials,
      })
      setToastMessage(
        `Đã phân công thủ công nhân viên ${staff.name} (${staff.code}) phụ trách đợt ${batch.id}!`,
      )
    }
    window.setTimeout(() => setToastMessage(null), 4000)
  }

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
    // Tự động khấu trừ toàn bộ số lượng còn lại của đợt khỏi kho hàng theo thời gian thực
    let totalDeductedUnits = 0
    setWarehouseStockMap((prev) => {
      const next = { ...prev }
      items.forEach((it) => {
        const remainingToPick = Math.max(0, it.qty - it.qtyPicked)
        if (remainingToPick > 0) {
          totalDeductedUnits += remainingToPick
          const itemStock = next[it.sku] || {
            sku: it.sku,
            name: it.name,
            shortName: it.shortName,
            upc: it.upc,
            location: it.location,
            zone: it.zone,
            rack: it.rack,
            bin: it.bin,
            initialStock: 60,
            pickedQuantity: 0,
            currentStock: 60,
            safetyThreshold: 12,
            imageUrl: it.imageUrl,
            status: 'optimal' as const,
            lastUpdatedText: 'Thời gian thực',
          }
          const newPicked = itemStock.pickedQuantity + remainingToPick
          const newStock = Math.max(0, itemStock.initialStock - newPicked)
          next[it.sku] = {
            ...itemStock,
            pickedQuantity: newPicked,
            currentStock: newStock,
            status: computeStockStatus(newStock, itemStock.safetyThreshold),
            lastUpdatedText: 'Vừa hoàn tất đợt',
            recentDeduction: -remainingToPick,
          }
        }
      })
      saveStoredWarehouseStock(next)
      return next
    })

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
        ? `Đã hoàn tất đợt lấy hàng ${batch.id}! Kho đã tự động trừ ${totalDeductedUnits} sản phẩm tương ứng, toàn bộ ${items.length} mặt hàng đã sẵn sàng đóng gói.`
        : `Batch ${batch.id} picking completed! Deducted ${totalDeductedUnits} units from warehouse inventory. All items ready for packaging.`,
    )
    window.setTimeout(() => setToastMessage(null), 4000)
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

  // Handle confirm picking action (Quét mã xác nhận lấy hàng -> Trừ kho thực tế)
  const handleConfirmPick = () => {
    if (!activeItem || !canConfirmPick) return
    const isDone = currentQty >= activeItem.qty
    const updatedStatus = isDone ? 'picked' : currentQty > 0 ? 'picking' : 'queued'

    const previouslyPicked = activeItem.qtyPicked
    const deltaPicked = Math.max(0, currentQty - previouslyPicked)

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

    // Khấu trừ số lượng tồn kho theo thời gian thực
    let remainingStockText = ''
    if (deltaPicked > 0) {
      setWarehouseStockMap((prev) => {
        const next = { ...prev }
        const existing = next[activeItem.sku] || {
          sku: activeItem.sku,
          name: activeItem.name,
          shortName: activeItem.shortName,
          upc: activeItem.upc,
          location: activeItem.location,
          zone: activeItem.zone,
          rack: activeItem.rack,
          bin: activeItem.bin,
          initialStock: 60,
          pickedQuantity: 0,
          currentStock: 60,
          safetyThreshold: 12,
          imageUrl: activeItem.imageUrl,
          status: 'optimal' as const,
          lastUpdatedText: 'Thời gian thực',
        }

        const newPicked = existing.pickedQuantity + deltaPicked
        const newStock = Math.max(0, existing.initialStock - newPicked)
        next[activeItem.sku] = {
          ...existing,
          pickedQuantity: newPicked,
          currentStock: newStock,
          status: computeStockStatus(newStock, existing.safetyThreshold),
          lastUpdatedText: 'Vừa trừ xong',
          recentDeduction: -deltaPicked,
        }
        remainingStockText = `${newStock} chiếc`
        saveStoredWarehouseStock(next)
        return next
      })

      setLastDeductedSku(activeItem.sku)
      window.setTimeout(() => setLastDeductedSku(null), 4000)
    }

    const currentRemaining = warehouseStockMap[activeItem.sku]?.currentStock ?? 50
    const finalStockDisplay = remainingStockText || `${Math.max(0, currentRemaining - deltaPicked)} chiếc`

    const notice = `Đã lấy đủ ${currentQty}/${activeItem.qty} ${activeItem.shortName} · Kho đã tự động trừ -${deltaPicked} chiếc (Tồn thực tế tại ${activeItem.location}: ${finalStockDisplay})`
    setToastMessage(notice)
    window.setTimeout(() => setToastMessage(null), 3500)

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

  // Items filtered by channel
  const displayedItems = useMemo(() => {
    if (channelFilter === 'all') return sortedItems
    return sortedItems.filter((it) => it.channel === channelFilter)
  }, [sortedItems, channelFilter])

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
        {/* Top Header Card: Navigation & Batch Selection & Main Actions */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between rounded-2xl border border-slate-200/90 bg-white p-3 sm:px-4 sm:py-3 shadow-xs dark:border-slate-800 dark:bg-surface-1">
          {/* Left: Back Link & Batch Switcher & Customer Info */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 text-xs">
            {/* Back Button */}
            <Link
              to="/app/orders"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 hover:text-blue-600 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300 dark:hover:text-blue-400 cursor-pointer transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{vi ? 'Quay lại Đơn đa kênh' : 'Back to Orders'}</span>
            </Link>

            <span className="hidden sm:inline-block h-4 w-[1px] bg-slate-200 dark:bg-slate-700" />

            {/* Batch Selector Dropdown */}
            <div className="relative">
              <select
                value={batch.id}
                onChange={(e) => navigate(`/app/warehouse?batchId=${e.target.value}&action=start`)}
                className="h-8.5 cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white pl-2.5 pr-7 text-xs font-bold text-slate-800 shadow-2xs transition-colors hover:border-slate-300 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-200 font-mono"
              >
                {getStoredBatches().map((b) => {
                  const bItems = b.id === batch.id ? items.length : b.skusCount
                  const bUnits = b.id === batch.id ? totalUnitsTotal : b.itemsCount
                  return (
                    <option key={b.id} value={b.id}>
                      {b.id} ({bItems} mặt hàng · {bUnits} SP)
                    </option>
                  )
                })}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>

            {/* Warehouse Tag */}
            <span className="rounded-lg bg-blue-50 border border-blue-200/80 px-2.5 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300">
              Kho tổng chung
            </span>

            {/* Consolidated Customer Button */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex h-9 max-w-[min(100%,280px)] items-center gap-1.5 rounded-lg border border-purple-200/90 bg-purple-50/70 px-2.5 text-xs font-semibold text-purple-700 hover:bg-purple-100 hover:border-purple-300 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300 cursor-pointer transition-colors"
              title={`Khách nhận: ${batchCustomer.name} (${batchCustomer.phone}). Đã gom ${batchCustomer.ordersCount} đơn đa kênh. Bấm xem chi tiết!`}
            >
              <User className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
              <span className="shrink-0">{vi ? 'Khách:' : 'Customer:'}</span>
              <strong className="truncate font-bold text-purple-950 dark:text-purple-100 underline decoration-dotted underline-offset-2">
                {batchCustomer.name}
              </strong>
              <span className="shrink-0 rounded-full bg-purple-200/80 px-1.5 py-0.5 text-[10px] font-bold text-purple-800 dark:bg-purple-900/60 dark:text-purple-200">
                {batchCustomer.ordersCount} đơn
              </span>
            </button>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 self-end lg:self-auto shrink-0 text-xs">
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
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 font-semibold text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-slate-800 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              title="Đặt lại tiến độ nhặt hàng về ban đầu"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
              <span>{vi ? 'Đặt lại' : 'Reset'}</span>
            </button>

            {/* Complete Batch Picking Button */}
            <button
              type="button"
              disabled={!isAllPicked}
              onClick={isAllPicked ? handleOpenCompleteModal : undefined}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 font-bold text-white shadow-xs transition-colors ${
                isAllPicked
                  ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 cursor-pointer'
                  : 'bg-slate-300 opacity-60 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400'
              }`}
              title={
                !isAllPicked
                  ? vi
                    ? `Cần lấy đủ tất cả ${items.length} mặt hàng trước khi hoàn tất (${pickedCount}/${items.length})`
                    : `Pick all ${items.length} items first (${pickedCount}/${items.length})`
                  : undefined
              }
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{vi ? 'Hoàn tất lấy hàng' : 'Complete Batch Picking'}</span>
            </button>
          </div>
        </div>

        {/* Coordination Card: Staff Assignment & Omnichannel Platform Breakdown */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-surface-1">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: Batch Info & Omnichannel Breakdown */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                  {batch.id}
                </span>
                <span className="rounded-md bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  Kho tổng chung
                </span>
                <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {items.length} mặt hàng ({totalUnitsTotal} sản phẩm)
                </span>
                <span className="text-xs text-slate-400">·</span>
                <span className="inline-flex items-center gap-1 text-xs text-purple-700 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-300 font-semibold px-2 py-0.5 rounded">
                  <Sparkles className="h-3 w-3" />
                  Gộp {batchCustomer.ordersCount} đơn đa sàn cho khách: <strong className="text-purple-950 dark:text-purple-100">{batchCustomer.name}</strong>
                </span>
              </div>

              {/* Omnichannel Platforms Representation */}
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <span className="text-xs text-slate-500 font-medium">
                  {vi ? 'Nền tảng trong đợt:' : 'Channels in batch:'}
                </span>
                {Object.entries(channelCounts).map(([ch, count]) => (
                  <div
                    key={ch}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-800/60"
                  >
                    {renderChannelBadge(
                      ch as 'shopee' | 'tiktok' | 'lazada' | 'facebook',
                      'sm',
                    )}
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {count} {vi ? 'vật phẩm' : 'items'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Assigned Staff & Manual Assignment CTA */}
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:px-4 sm:py-3 dark:border-slate-700 dark:bg-surface-2/40">
              <div className="flex items-center gap-3">
                {currentPicker.avatar ? (
                  <img
                    src={currentPicker.avatar}
                    alt={currentPicker.name}
                    className="h-10 w-10 rounded-full object-cover ring-2 ring-blue-500/30"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                    {currentPicker.initials}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                      {currentPicker.name}
                    </p>
                    {assignmentMode === 'auto' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <Sparkles className="h-3 w-3 text-emerald-600" />
                        Tự động phân công (AI)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10.5px] font-semibold text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                        <UserCheck className="h-3 w-3 text-blue-600" />
                        Phân công thủ công
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {currentPicker.code} · {currentPicker.role}
                  </p>
                </div>
              </div>

              {/* Nút Phân công thủ công */}
              <button
                type="button"
                onClick={() => {
                  setModalAssignMode(assignmentMode)
                  const matched = warehouseStaffList.find((s) => s.name === currentPicker.name) || WAREHOUSE_STAFF_LIST.find((s) => s.name === currentPicker.name)
                  if (matched) setSelectedStaffId(matched.id)
                  setStaffSearchQuery('')
                  setAssignModalOpen(true)
                }}
                className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 dark:border-slate-600 dark:bg-surface-1 dark:text-slate-200 cursor-pointer transition-colors"
                title="Thay đổi nhân viên lấy hàng"
              >
                <Users className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                <span className="hidden sm:inline">{vi ? 'Phân công thủ công' : 'Manual Assign'}</span>
                <span className="sm:hidden">{vi ? 'Phân công' : 'Assign'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* SLA Alert Banner for Express or Delayed Packing Orders */}
        {batch.orderType === 'express' ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-2.5 text-xs text-amber-950 shadow-xs dark:border-amber-700/80 dark:from-amber-950/40 dark:to-orange-950/20">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white shadow-xs">
                <Zap className="h-3.5 w-3.5 fill-white" />
              </span>
              <span>
                <strong>⚡ ĐỢT LẤY HÀNG HỎA TỐC:</strong> Bắt buộc nhân viên hoàn thành lấy hàng và đóng gói trong vòng <strong>4 tiếng</strong> (Hạn chót: <strong>{batch.slaDetail?.deadlineText ?? '12:15'}</strong>). Tiếp nhận trong giờ hành chính (08:00 - 17:30).
              </span>
            </div>
            <span className="rounded-md bg-amber-200/90 px-2.5 py-0.5 text-[11px] font-bold text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
              {batch.slaDetail?.remainingText ?? 'SLA 4h'}
            </span>
          </div>
        ) : batch.orderType === 'delayed_packing' ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-300 bg-gradient-to-r from-rose-50 to-red-50 px-4 py-2.5 text-xs text-rose-950 shadow-xs dark:border-rose-700/80 dark:from-rose-950/40 dark:to-red-950/20">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-rose-600 text-white shadow-xs">
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
              <span>
                <strong>⚠️ CẢNH BÁO QUÁ HẠN:</strong> Đơn hàng bình thường đã trễ thời gian đóng gói quy định (+45 phút). Vui lòng hoàn tất lấy hàng ngay để chuyển sang đóng gói khẩn cấp!
              </span>
            </div>
            <span className="rounded-md bg-rose-200 px-2.5 py-0.5 text-[11px] font-bold text-rose-800 dark:bg-rose-900/60 dark:text-rose-200 animate-pulse">
              {batch.slaDetail?.deadlineText ?? 'Quá hạn 45 phút'}
            </span>
          </div>
        ) : null}

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
              <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-surface-1">
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

                  <div className="flex-1 text-center sm:text-left space-y-2.5">
                    <h2 className="text-xl font-bold text-slate-900 leading-snug dark:text-slate-100">
                      {activeItem.name}
                    </h2>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                      <span>Mã SKU: {activeItem.sku}</span>
                      <span>Mã UPC: {activeItem.upc}</span>
                    </div>

                    {/* Rõ ràng nền tảng đặt hàng & Đơn hàng của vật phẩm này */}
                    <div className="inline-flex flex-wrap items-center justify-center sm:justify-start gap-2 rounded-xl bg-slate-50 px-3 py-2 border border-slate-200/80 dark:bg-slate-800/40 dark:border-slate-700/60 text-xs">
                      <span className="text-slate-500 font-medium">{vi ? 'Nền tảng đặt hàng:' : 'Channel:'}</span>
                      {renderChannelBadge(activeItem.channel)}
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        Đơn #{activeItem.orderId}
                      </span>
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <span className="text-slate-600 dark:text-slate-300">
                        Người nhận: <strong>{batchCustomer.name}</strong>
                      </span>
                    </div>

                    {/* Tình trạng tồn kho theo thời gian thực của sản phẩm mục tiêu */}
                    <div className="inline-flex flex-wrap items-center justify-center sm:justify-start gap-2 rounded-xl bg-blue-50/70 px-3 py-2 border border-blue-200/80 dark:bg-blue-950/30 dark:border-blue-800/60 text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-blue-900 dark:text-blue-200">
                        <Boxes className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span>{vi ? 'Tồn kho thực tế:' : 'Live Stock:'}</span>
                      </div>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-surface-1 px-2 py-0.5 rounded border border-blue-200 dark:border-slate-700 shadow-2xs">
                        {activeStock?.currentStock ?? 50} chiếc
                      </span>
                      <span className="text-slate-500 text-[11px]">
                        (Sau khi lấy {currentQty || activeItem.qty} còn:{' '}
                        <strong className="text-slate-900 dark:text-slate-100 font-mono">
                          {Math.max(0, (activeStock?.currentStock ?? 50) - (currentQty || activeItem.qty))}
                        </strong>{' '}
                        chiếc)
                      </span>
                      {activeStock?.status === 'low' ? (
                        <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300 animate-pulse">
                          <AlertTriangle className="h-3 w-3" />
                          Sắp hết hàng
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Đủ hàng tại kệ
                        </span>
                      )}
                      {activeStock?.recentDeduction && lastDeductedSku === activeItem.sku && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 animate-bounce">
                          {activeStock.recentDeduction} vừa trừ
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Barcode graphic box */}
                <div className="mt-6">
                  <BarcodeGraphic code={activeItem.upc} />
                </div>

                {/* Pick actions — barcode + quantity in one compact panel */}
                <div className="mt-5 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 sm:p-4 space-y-3 dark:border-slate-800 dark:bg-surface-2/20">
                  <div>
                    <label
                      htmlFor="barcode-input"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Xác minh mã vạch (Quét hoặc nhập mã)
                    </label>

                    <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-blue-300 bg-white px-2.5 py-2 shadow-2xs dark:border-blue-800 dark:bg-surface-2 transition-all focus-within:ring-2 focus-within:ring-blue-400/20">
                      <BarcodeLinesIcon />
                      <input
                        id="barcode-input"
                        type="text"
                        value={barcodeInput}
                        onChange={(e) => setBarcodeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            if (activeItem && barcodeInput.trim() === activeItem.upc) {
                              setCurrentQty(activeItem.qty)
                            }
                          }
                        }}
                        placeholder={activeItem.upc}
                        className="min-w-0 flex-1 bg-transparent font-mono text-sm font-semibold text-slate-800 focus:outline-none dark:text-slate-100"
                      />
                      {isVerified ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700 select-none dark:bg-emerald-950/50 dark:text-emerald-300">
                          <Check className="h-3 w-3 stroke-[3]" />
                          Đã xác minh
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setBarcodeInput(activeItem.upc)
                            if (currentQty < activeItem.qty) {
                              setCurrentQty(activeItem.qty)
                            }
                          }}
                          className="inline-flex shrink-0 items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 transition-colors hover:bg-amber-100 cursor-pointer dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                          title="Click để khớp mã demo"
                        >
                          Chưa xác minh
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                    <div className="flex items-center justify-center gap-1 sm:justify-start">
                      <button
                        type="button"
                        onClick={handleDecrement}
                        disabled={currentQty <= 0}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white font-bold text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer dark:border-slate-700 dark:bg-surface-1 dark:text-slate-200"
                        aria-label="Giảm số lượng"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>

                      <div className="flex h-10 min-w-[76px] items-center justify-center rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm font-bold text-slate-900 select-none shadow-2xs dark:border-slate-700 dark:bg-surface-1 dark:text-slate-100">
                        {currentQty}/{activeItem.qty}
                      </div>

                      <button
                        type="button"
                        onClick={handleIncrement}
                        disabled={currentQty >= activeItem.qty}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white font-bold text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer dark:border-slate-700 dark:bg-surface-1 dark:text-slate-200"
                        aria-label="Tăng số lượng"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={!canConfirmPick}
                      onClick={handleConfirmPick}
                      className={`flex h-10 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold shadow-sm transition-all select-none sm:min-w-[148px] ${
                        canConfirmPick
                          ? 'bg-[#2563eb] text-white shadow-blue-500/20 hover:bg-[#1d4ed8] active:bg-[#1e40af] cursor-pointer'
                          : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400 opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500'
                      }`}
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {vi ? 'Xác nhận lấy hàng' : 'Confirm Pick'}
                      </span>
                    </button>
                  </div>
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
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 font-semibold text-xs text-amber-900 shadow-xs transition-colors hover:bg-amber-50 active:bg-amber-100 cursor-pointer dark:border-amber-800 dark:bg-surface-1 dark:text-amber-300"
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
              <div className="space-y-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-base text-slate-900 dark:text-slate-100">
                      Danh sách lấy hàng
                    </h3>
                    <p className="mt-0.5 text-xs font-medium leading-snug text-slate-500 dark:text-slate-400">
                      {items.length} mặt hàng ({totalUnitsTotal} sản phẩm)
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleCycleSort}
                    className="mt-0.5 inline-flex h-8 shrink-0 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 shadow-2xs transition-colors hover:border-slate-300 hover:bg-slate-50 cursor-pointer dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300"
                  >
                    Sắp xếp: {sortLabel}
                  </button>
                </div>

                {/* Filter Tabs by Channel Platform */}
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setChannelFilter('all')}
                    className={`inline-flex h-8 items-center rounded-md px-2.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                      channelFilter === 'all'
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    Tất cả ({items.length})
                  </button>
                  {Object.entries(channelCounts).map(([ch, count]) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setChannelFilter(ch)}
                      className={`inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                        channelFilter === ch
                          ? 'bg-blue-50 font-bold text-blue-700 ring-1 ring-blue-400 dark:bg-blue-950/60 dark:text-blue-300'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      <span className="capitalize">{ch}</span> ({count})
                    </button>
                  ))}
                </div>
              </div>

              {/* Items Stack */}
              <div className="mt-3 space-y-2 max-h-[380px] lg:max-h-[420px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700">
                {displayedItems.length > 0 ? (
                  displayedItems.map((item) => {
                    const isActive = item.id === activeItemId
                    const isPicked = item.status === 'picked'

                    // 1. ACTIVE ITEM (Thick blue border)
                    if (isActive) {
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleSelectItem(item)}
                          className="flex cursor-pointer items-center justify-between rounded-xl border-2 border-[#3b82f6] bg-[#f8faff] p-2.5 sm:p-3 shadow-xs transition-all dark:bg-blue-950/20"
                        >
                          <div className="flex min-w-0 items-start gap-2.5 pr-2">
                            <div className="mt-0.5 shrink-0">
                              <TargetScanIcon />
                            </div>
                            <PickingListItemInfo
                              item={item}
                              titleClassName="font-semibold text-slate-900 dark:text-slate-100"
                            />
                          </div>

                          <span className="shrink-0 rounded-md bg-[#3b82f6] px-2 py-0.5 font-mono text-[11px] font-bold text-white shadow-2xs tabular-nums">
                            {item.qtyPicked}/{item.qty}
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
                          className="flex cursor-pointer items-center justify-between rounded-xl border border-emerald-200 bg-[#ecfdf5] p-2.5 sm:p-3 transition-colors hover:bg-emerald-100/70 dark:border-emerald-800/80 dark:bg-emerald-950/20"
                        >
                          <div className="flex min-w-0 items-start gap-2.5 pr-2">
                            <div className="mt-0.5 shrink-0">
                              <PickedCheckIcon />
                            </div>
                            <PickingListItemInfo
                              item={item}
                              titleClassName="font-medium text-slate-800 dark:text-slate-200"
                            />
                          </div>

                          <span className="shrink-0 rounded-md bg-[#16a34a] px-2 py-0.5 font-mono text-[11px] font-bold text-white shadow-2xs tabular-nums">
                            {item.qtyPicked}/{item.qty}
                          </span>
                        </div>
                      )
                    }

                    // 3. PENDING ITEM (White/slate card)
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelectItem(item)}
                        className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3 transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-surface-1"
                      >
                        <div className="flex min-w-0 items-start gap-2.5 pr-2">
                          <div className="mt-0.5 shrink-0">
                            <UnpickedCircleIcon />
                          </div>
                          <PickingListItemInfo
                            item={item}
                            titleClassName="font-medium text-slate-700 dark:text-slate-300"
                          />
                        </div>

                        <span className="shrink-0 rounded-md border border-slate-200 bg-[#f8fafc] px-2 py-0.5 font-mono text-[11px] font-medium text-slate-600 tabular-nums dark:border-slate-700 dark:bg-surface-2 dark:text-slate-400">
                          {item.qtyPicked}/{item.qty}
                        </span>
                      </div>
                    )
                  })
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Không có vật phẩm nào cho nền tảng này
                  </div>
                )}
              </div>

              {/* Footer with Accurate Picking Progress & Single Primary Action */}
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs font-medium">
                  <span className="min-w-0 leading-snug text-slate-600 dark:text-slate-300">
                    Tiến độ:{' '}
                    <strong className="text-slate-900 dark:text-slate-100">
                      {pickedCount}/{items.length}
                    </strong>{' '}
                    mặt hàng ({pickedPercent}%)
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {totalUnitsPicked}/{totalUnitsTotal} sản phẩm
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${pickedPercent}%` }}
                  />
                </div>

                {isAllPicked ? (
                  <p className="text-center text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    {vi
                      ? 'Đã lấy đủ — bấm "Hoàn tất lấy hàng" ở thanh trên để chuyển bước tiếp theo'
                      : 'All items picked — use "Complete Batch Picking" in the top bar'}
                  </p>
                ) : (
                  <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
                    {vi
                      ? `Còn ${items.length - pickedCount} mặt hàng chưa lấy xong`
                      : `${items.length - pickedCount} items remaining`}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ==================================================== */}
        {/* MỤC TÌNH TRẠNG CỦA KHO (REAL-TIME WAREHOUSE INVENTORY) */}
        {/* ==================================================== */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-surface-1 space-y-4">
          {/* Header with Title & View Mode Switcher */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3.5 dark:border-slate-800">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 shrink-0">
                <ShoppingBag className="h-5 w-5" />
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {inventoryViewMode === 'buyer_items'
                    ? (vi ? 'Tình trạng kho các mặt hàng người mua đặt' : 'Buyer Items Warehouse Stock Status')
                    : (vi ? 'Tình trạng tồn kho toàn bộ kho hàng' : 'All Warehouse Stock Status')}
                </h3>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 shrink-0">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  {vi ? 'Thời gian thực (Live Sync)' : 'Real-time Live Sync'}
                </span>
              </div>
            </div>

            {/* View Mode Toggle: Buyer Items vs All Warehouse */}
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-100/90 p-0.5 text-xs dark:border-slate-700 dark:bg-surface-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setInventoryViewMode('buyer_items')
                  setStockFilterTab('all')
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold transition-all cursor-pointer ${
                  inventoryViewMode === 'buyer_items'
                    ? 'bg-white text-blue-700 shadow-xs dark:bg-surface-1 dark:text-blue-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
                title="Chỉ hiển thị các vật phẩm mà khách hàng đã đặt trong đợt này"
              >
                <ShoppingBag className="h-3.5 w-3.5 text-blue-600" />
                <span>{vi ? `Vật phẩm người mua (${items.length})` : `Buyer Items (${items.length})`}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setInventoryViewMode('all_warehouse')
                  setStockFilterTab('all')
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-all cursor-pointer ${
                  inventoryViewMode === 'all_warehouse'
                    ? 'bg-white text-blue-700 shadow-xs dark:bg-surface-1 dark:text-blue-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
                title="Xem toàn bộ danh mục sản phẩm trong kho"
              >
                <Boxes className="h-3.5 w-3.5 text-slate-500" />
                <span>{vi ? `Toàn bộ kho (${Object.keys(warehouseStockMap).length})` : `All Warehouse (${Object.keys(warehouseStockMap).length})`}</span>
              </button>
            </div>
          </div>

          {/* Filter Tabs & Search / Reset Bar */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between text-xs">
            {/* Left: Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStockFilterTab('all')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  stockFilterTab === 'all'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {inventoryViewMode === 'buyer_items'
                  ? (vi ? `Tất cả vật phẩm khách mua (${items.length})` : `All Buyer Items (${items.length})`)
                  : (vi ? `Tất cả sản phẩm kho (${Object.keys(warehouseStockMap).length})` : `All Warehouse Items (${Object.keys(warehouseStockMap).length})`)}
              </button>

              <button
                type="button"
                onClick={() => setStockFilterTab('pending')}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  stockFilterTab === 'pending'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                <span>{vi ? 'Chưa lấy xong' : 'Pending Pick'}</span>
                <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                  {inventoryViewMode === 'buyer_items'
                    ? items.length - pickedCount
                    : allWarehouseInventoryList.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStockFilterTab('picked')}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  stockFilterTab === 'picked'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                <span>{vi ? 'Đã lấy đủ & Đã trừ kho' : 'Picked & Deducted'}</span>
                <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                  {inventoryViewMode === 'buyer_items' ? pickedCount : totalPickedUnits}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStockFilterTab('low_stock')}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  stockFilterTab === 'low_stock'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                <span>{vi ? 'Kho sắp hết hàng' : 'Low Stock'}</span>
                {(inventoryViewMode === 'buyer_items' ? lowStockBuyerCount : lowStockCount) > 0 && (
                  <span className="rounded-full bg-rose-200 text-rose-900 px-1.5 py-0.2 text-[10px] font-bold">
                    {inventoryViewMode === 'buyer_items' ? lowStockBuyerCount : lowStockCount}
                  </span>
                )}
              </button>
            </div>

            {/* Right: Search & Reset */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative min-w-[210px] sm:w-56">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={stockSearchQuery}
                  onChange={(e) => setStockSearchQuery(e.target.value)}
                  placeholder={
                    inventoryViewMode === 'buyer_items'
                      ? (vi ? 'Tìm tên khách, mã đơn, SKU...' : 'Search buyer, order, SKU...')
                      : (vi ? 'Tìm SKU, tên sản phẩm, kệ...' : 'Search SKU, name, bin...')
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8.5 pr-7 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100"
                />
                {stockSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setStockSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Reset Stock */}
              <button
                type="button"
                onClick={handleResetStock}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300 cursor-pointer"
                title="Khôi phục lại số lượng tồn kho ban đầu"
              >
                <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                <span>{vi ? 'Đặt lại kho' : 'Reset Stock'}</span>
              </button>
            </div>
          </div>

          {/* Real-time Inventory Data Table */}
          <div className="overflow-x-auto max-h-[300px] overflow-y-auto rounded-xl border border-slate-200/80 dark:border-slate-800 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700">
            {inventoryViewMode === 'buyer_items' ? (
              <table className="w-full min-w-[850px] text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-surface-2 shadow-2xs">
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider dark:border-slate-800 dark:bg-surface-2 dark:text-slate-400">
                    <th className="px-4 py-3">SẢN PHẨM & SKU</th>
                    <th className="px-3 py-3">SÀN & ĐƠN HÀNG (CÙNG KHÁCH)</th>
                    <th className="px-3 py-3">VỊ TRÍ KHO</th>
                    <th className="px-3 py-3 text-center">SL KHÁCH ĐẶT</th>
                    <th className="px-3 py-3 text-center">ĐÃ LẤY & TRỪ KHO</th>
                    <th className="px-3 py-3 text-center">TỒN THỰC TẾ (REAL-TIME)</th>
                    <th className="px-3 py-3 text-center">TÌNH TRẠNG KHO</th>
                    <th className="px-3 py-3 text-right">THAO TÁC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {buyerInventoryList.length > 0 ? (
                    buyerInventoryList.map((item) => {
                      const stock = warehouseStockMap[item.sku]
                      const isJustDeducted = lastDeductedSku === item.sku
                      const isPickedDone = item.status === 'picked'
                      const isCurrentlyActive = item.id === activeItemId

                      return (
                        <tr
                          key={item.id}
                          className={`transition-colors ${
                            isCurrentlyActive
                              ? 'bg-blue-50/70 dark:bg-blue-950/30'
                              : isJustDeducted
                                ? 'bg-amber-50/80 dark:bg-amber-950/30'
                                : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          {/* 1. PRODUCT */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="h-10 w-10 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700 shrink-0"
                              />
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-bold text-xs text-slate-900 truncate dark:text-slate-100 max-w-[200px]">
                                    {item.shortName}
                                  </p>
                                  {isCurrentlyActive && (
                                    <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[10px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                      Đang chọn
                                    </span>
                                  )}
                                </div>
                                <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                  SKU: {item.sku} · UPC: {item.upc}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* 2. BUYER & ORDER */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                {renderChannelBadge(item.channel, 'sm')}
                                <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                                  #{item.orderId}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Khách: <strong className="text-slate-800 dark:text-slate-200">{item.customerName}</strong>
                              </p>
                            </div>
                          </td>

                          {/* 3. LOCATION */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-mono font-semibold text-slate-800 shadow-2xs dark:border-slate-700 dark:bg-surface-2 dark:text-slate-200">
                              <MapPin className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                              <span>{item.location}</span>
                            </div>
                          </td>

                          {/* 4. ORDERED QTY */}
                          <td className="px-3 py-3 text-center whitespace-nowrap font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                            {item.qty} chiếc
                          </td>

                          {/* 5. PICKED & DEDUCTED */}
                          <td className="px-3 py-3 text-center whitespace-nowrap">
                            <div className="inline-flex flex-col items-center gap-0.5">
                              <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                                {item.qtyPicked}/{item.qty} chiếc
                              </span>
                              {isPickedDone ? (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                  <Check className="h-3 w-3 stroke-[3]" />
                                  Đã trừ (-{item.qty})
                                </span>
                              ) : item.qtyPicked > 0 ? (
                                <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[10px] font-bold text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                                  Đang lấy (-{item.qtyPicked})
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400">Chờ quét</span>
                              )}
                              {isJustDeducted && (
                                <span className="rounded bg-rose-100 px-1 py-0.2 text-[10px] font-bold text-rose-700 animate-pulse">
                                  Vừa trừ kho
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 6. CURRENT REAL-TIME STOCK */}
                          <td className="px-3 py-3 text-center whitespace-nowrap">
                            <div>
                              <span className={`font-mono text-sm font-extrabold ${
                                stock?.status === 'low'
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : stock?.status === 'moderate'
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-emerald-700 dark:text-emerald-400'
                              }`}>
                                {stock?.currentStock ?? 50} chiếc
                              </span>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                                Sau xuất: {Math.max(0, (stock?.currentStock ?? 50) - (item.qty - item.qtyPicked))} chiếc
                              </p>
                            </div>
                          </td>

                          {/* 7. STOCK STATUS */}
                          <td className="px-3 py-3 text-center whitespace-nowrap">
                            {stock?.status === 'low' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 animate-pulse">
                                <AlertTriangle className="h-3 w-3" />
                                Sắp hết hàng
                              </span>
                            ) : stock?.status === 'moderate' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                Mức an toàn
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Đủ hàng tại kệ
                              </span>
                            )}
                          </td>

                          {/* 8. ACTIONS */}
                          <td className="px-3 py-3 text-right whitespace-nowrap">
                            {isPickedDone ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                                <CheckCircle2 className="h-4 w-4" />
                                <span>Đã xong</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  handleSelectItem(item)
                                  window.scrollTo({ top: 0, behavior: 'smooth' })
                                }}
                                className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 cursor-pointer transition-colors shadow-2xs"
                              >
                                <TargetScanIcon />
                                <span>Chọn nhặt</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-xs text-slate-400">
                        {vi ? 'Không có vật phẩm người mua nào phù hợp bộ lọc' : 'No buyer items match the filter'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              /* ALL WAREHOUSE TABLE */
              <table className="w-full min-w-[800px] text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-surface-2 shadow-2xs">
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider dark:border-slate-800 dark:bg-surface-2 dark:text-slate-400">
                    <th className="px-4 py-3">SẢN PHẨM & SKU</th>
                    <th className="px-3 py-3">VỊ TRÍ KHO</th>
                    <th className="px-3 py-3 text-center">TỒN BAN ĐẦU</th>
                    <th className="px-3 py-3 text-center">ĐÃ LẤY (ĐỢT NÀY)</th>
                    <th className="px-3 py-3 text-center">TỒN THỰC TẾ (REAL-TIME)</th>
                    <th className="px-3 py-3 text-center">TÌNH TRẠNG</th>
                    <th className="px-3 py-3 text-right">THAO TÁC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {allWarehouseInventoryList.length > 0 ? (
                    allWarehouseInventoryList.map((item) => {
                      const isInBatch = batchSkuSet.has(item.sku)
                      const isJustDeducted = lastDeductedSku === item.sku

                      return (
                        <tr
                          key={item.sku}
                          className={`transition-colors ${
                            isJustDeducted
                              ? 'bg-amber-50/80 dark:bg-amber-950/30'
                              : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          {/* 1. PRODUCT */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="h-10 w-10 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700 shrink-0"
                              />
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-bold text-xs text-slate-900 truncate dark:text-slate-100 max-w-[220px]">
                                    {item.shortName}
                                  </p>
                                  {isInBatch && (
                                    <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[10px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                      Trong đợt
                                    </span>
                                  )}
                                </div>
                                <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                  SKU: {item.sku} · UPC: {item.upc}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* 2. LOCATION */}
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-mono font-semibold text-slate-800 shadow-2xs dark:border-slate-700 dark:bg-surface-2 dark:text-slate-200">
                              <MapPin className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                              <span>{item.location}</span>
                            </div>
                          </td>

                          {/* 3. INITIAL STOCK */}
                          <td className="px-3 py-3 text-center whitespace-nowrap font-mono text-xs text-slate-500 dark:text-slate-400">
                            {item.initialStock} chiếc
                          </td>

                          {/* 4. PICKED IN BATCH */}
                          <td className="px-3 py-3 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1 font-mono font-bold text-xs">
                              <span className={item.pickedQuantity > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}>
                                {item.pickedQuantity > 0 ? `-${item.pickedQuantity}` : '0'}
                              </span>
                              {item.recentDeduction && isJustDeducted && (
                                <span className="rounded bg-rose-100 px-1 py-0.2 text-[10px] font-bold text-rose-700 animate-pulse">
                                  {item.recentDeduction}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 5. CURRENT REAL-TIME STOCK */}
                          <td className="px-3 py-3 text-center whitespace-nowrap">
                            <span className={`font-mono text-sm font-extrabold ${
                              item.status === 'low'
                                ? 'text-rose-600 dark:text-rose-400'
                                : item.status === 'moderate'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                            }`}>
                              {item.currentStock} chiếc
                            </span>
                          </td>

                          {/* 6. STATUS */}
                          <td className="px-3 py-3 text-center whitespace-nowrap">
                            {item.status === 'optimal' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Dồi dào
                              </span>
                            ) : item.status === 'moderate' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                Mức an toàn
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 animate-pulse">
                                <AlertTriangle className="h-3 w-3" />
                                Sắp hết hàng
                              </span>
                            )}
                          </td>

                          {/* 7. ACTIONS */}
                          <td className="px-3 py-3 text-right whitespace-nowrap">
                            {isInBatch ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const target = items.find((it) => it.sku === item.sku)
                                  if (target) {
                                    handleSelectItem(target)
                                    window.scrollTo({ top: 0, behavior: 'smooth' })
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 cursor-pointer transition-colors"
                              >
                                <TargetScanIcon />
                                <span>Chọn nhặt</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400">Khác đợt</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-slate-400">
                        {vi ? 'Không có mặt hàng nào phù hợp bộ lọc' : 'No items match the filter'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
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
                    {batch.id} · Kho tổng · {items.length} mặt hàng ({totalUnitsTotal} sản phẩm)
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
                  <div className="min-w-0 pr-2 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 font-medium">{vi ? 'Khách nhận (Đơn gộp):' : 'Consolidated Customer:'}</span>
                      <span className="rounded bg-purple-100 px-1.5 py-0.2 text-[10px] font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                        Gộp {batchCustomer.ordersCount} đơn đa kênh
                      </span>
                    </div>
                    <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                      {batchCustomer.name} · <span className="font-normal font-mono text-xs text-slate-600 dark:text-slate-300">{batchCustomer.phone}</span>
                    </p>
                    <p className="text-[11px] text-slate-500 font-medium truncate max-w-[320px]">
                      {batchCustomer.address}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-slate-400">{vi ? 'Tiến độ lấy hàng:' : 'Pick progress:'}</span>
                    <p className="font-mono font-bold text-slate-900 dark:text-slate-100">
                      {pickedCount}/{items.length} mặt hàng ({pickedPercent}%)
                    </p>
                    <p className="font-mono text-[11px] text-slate-500">
                      {totalUnitsPicked}/{totalUnitsTotal} sản phẩm
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

      {/* ==================================================== */}
      {/* MANUAL ASSIGN STAFF MODAL                            */}
      {/* ==================================================== */}
      {assignModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-surface-1">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  <Users className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    {vi ? 'Phân công nhân viên lấy hàng' : 'Assign Warehouse Picker'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Đợt {batch.id} · Kho tổng · {items.length} mặt hàng ({totalUnitsTotal} sản phẩm)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAssignModalOpen(false)
                  setStaffSearchQuery('')
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="mt-4 space-y-4 text-xs">
              {/* Option 1: AI Auto-assignment */}
              <label
                className={`flex items-start gap-3 rounded-xl border p-3.5 transition-all cursor-pointer ${
                  modalAssignMode === 'auto'
                    ? 'border-blue-500 bg-blue-50/60 dark:border-blue-500 dark:bg-blue-950/30 ring-1 ring-blue-500/30'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 dark:border-slate-700 dark:bg-surface-2'
                }`}
              >
                <input
                  type="radio"
                  name="assign-mode"
                  checked={modalAssignMode === 'auto'}
                  onChange={() => setModalAssignMode('auto')}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
                    <Sparkles className="h-4 w-4 text-emerald-600" />
                    <span>Tự động phân công bởi AI (Khuyến nghị)</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      Tối ưu nhất
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Hệ thống AI tự động phân tích vị trí kệ hàng, tuyến đường nhặt hàng và tải trọng công việc để gán nhân viên rảnh gần nhất, giảm tối đa thời gian di chuyển trong kho.
                  </p>
                </div>
              </label>

              {/* Option 2: Manual Assignment */}
              <label
                className={`flex items-start gap-3 rounded-xl border p-3.5 transition-all cursor-pointer ${
                  modalAssignMode === 'manual'
                    ? 'border-blue-500 bg-blue-50/60 dark:border-blue-500 dark:bg-blue-950/30 ring-1 ring-blue-500/30'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 dark:border-slate-700 dark:bg-surface-2'
                }`}
              >
                <input
                  type="radio"
                  name="assign-mode"
                  checked={modalAssignMode === 'manual'}
                  onChange={() => setModalAssignMode('manual')}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
                    <Users className="h-4 w-4 text-blue-600" />
                    <span>Phân công nhân viên thủ công</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Người quản lý điều phối tự chỉ định nhân viên lấy hàng cụ thể theo danh sách kho bên dưới.
                  </p>
                </div>
              </label>

              {/* Staff List (Selectable when manual mode is active or to preview) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  <span>
                    DANH SÁCH NHÂN VIÊN KHO ({modalAssignMode === 'manual' && staffSearchQuery.trim() ? `${filteredStaffList.length}/${warehouseStaffList.length}` : warehouseStaffList.length})
                  </span>
                  <span>Chọn 1 nhân viên để bàn giao</span>
                </div>

                {/* Ô tìm kiếm nhân viên khi chọn phân công thủ công */}
                {modalAssignMode === 'manual' && (
                  <div className="relative animate-in fade-in slide-in-from-top-1 duration-150">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={staffSearchQuery}
                      onChange={(e) => setStaffSearchQuery(e.target.value)}
                      placeholder={
                        vi
                          ? 'Tìm kiếm nhân viên theo tên hoặc mã NV (NV-KHO-01)...'
                          : 'Search staff by name or code...'
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white pl-8.5 pr-8 py-2 text-xs text-slate-900 placeholder:text-slate-400 shadow-2xs focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100 transition-colors"
                      autoFocus
                    />
                    {staffSearchQuery ? (
                      <button
                        type="button"
                        onClick={() => setStaffSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        title={vi ? 'Xóa tìm kiếm' : 'Clear search'}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                )}

                <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                  {filteredStaffList.length > 0 ? (
                    filteredStaffList.map((staff) => {
                      const isSelected = selectedStaffId === staff.id
                      return (
                        <div
                          key={staff.id}
                          onClick={() => {
                            setSelectedStaffId(staff.id)
                            setModalAssignMode('manual')
                          }}
                          className={`flex items-center justify-between rounded-xl border p-2.5 transition-all cursor-pointer ${
                            isSelected && modalAssignMode === 'manual'
                              ? 'border-blue-500 bg-blue-50/80 dark:border-blue-500 dark:bg-blue-950/40 ring-1 ring-blue-500/40 shadow-xs'
                              : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-surface-2'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={staff.avatar}
                              alt={staff.name}
                              className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="font-bold text-xs text-slate-900 truncate dark:text-slate-100">
                                  {staff.name}
                                </p>
                                <span className="font-mono text-[10px] text-slate-400">
                                  ({staff.code})
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {staff.role}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {staff.status === 'available' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Đang rảnh
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                Đang phụ trách {staff.activeBatches} đợt
                              </span>
                            )}

                            <input
                              type="radio"
                              name="selected-staff"
                              checked={isSelected && modalAssignMode === 'manual'}
                              onChange={() => {
                                setSelectedStaffId(staff.id)
                                setModalAssignMode('manual')
                              }}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400 dark:border-slate-700">
                      <p>
                        {vi
                          ? `Không tìm thấy nhân viên nào phù hợp với "${staffSearchQuery}"`
                          : `No staff matching "${staffSearchQuery}"`}
                      </p>
                      <button
                        type="button"
                        onClick={() => setStaffSearchQuery('')}
                        className="mt-2 text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                      >
                        {vi ? 'Xóa từ khóa tìm kiếm' : 'Clear search filter'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setAssignModalOpen(false)
                  setStaffSearchQuery('')
                }}
                className="rounded-lg px-3.5 py-2 font-medium text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-surface-2 cursor-pointer"
              >
                {vi ? 'Hủy bỏ' : 'Cancel'}
              </button>

              <button
                type="button"
                onClick={handleConfirmAssignment}
                className="rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af] px-4 py-2 font-semibold text-xs text-white shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>{vi ? 'Xác nhận phân công' : 'Confirm Assignment'}</span>
              </button>
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

  const [batchesList, setBatchesList] = useState<PickingBatch[]>(() => getStoredBatches())

  useEffect(() => {
    const syncBatches = () => {
      setBatchesList(getStoredBatches())
    }
    window.addEventListener('optipack:batches_updated', syncBatches)
    return () => window.removeEventListener('optipack:batches_updated', syncBatches)
  }, [])

  // Find the selected batch or default to the first pending/active batch
  const currentBatch = useMemo(() => {
    if (batchId) {
      const found = batchesList.find((b) => b.id === batchId)
      if (found) return found
    }
    // Default to BTH-20240115-001 or first batch
    return (
      batchesList.find((b) => b.id === 'BTH-20240115-001') ??
      batchesList[0]!
    )
  }, [batchId, batchesList])

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
