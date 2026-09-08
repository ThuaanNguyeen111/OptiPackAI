import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  ChevronDown,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { BatchDetailDrawer } from '../components/orders/BatchDetailDrawer'
import { usePortal } from '../context/use-portal'
import {
  getStoredBatches,
  saveStoredBatches,
  type BatchChannel,
  type OrderFulfillmentType,
  type PickingBatch,
  type PickingStatus,
} from '../data/picking-batches-mock'

export function OrdersPage() {
  const navigate = useNavigate()
  const { locale } = usePortal()
  const vi = locale === 'vi'

  // Batches state synchronized with localStorage and cross-screen updates
  const [batches, setBatches] = useState<PickingBatch[]>(() => getStoredBatches())

  // Listen for batch changes from WarehousePage or other components
  useEffect(() => {
    const syncBatches = () => {
      setBatches(getStoredBatches())
    }
    window.addEventListener('optipack:batches_updated', syncBatches)
    window.addEventListener('focus', syncBatches)
    return () => {
      window.removeEventListener('optipack:batches_updated', syncBatches)
      window.removeEventListener('focus', syncBatches)
    }
  }, [])

  // Filter states matching the screenshot controls + Order Type filter
  const [searchTerm, setSearchTerm] = useState('')
  const [orderTypeFilter, setOrderTypeFilter] = useState<
    'all' | OrderFulfillmentType
  >('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Pagination state (Page 1 shows 7, Page 2 shows 8, Page 3 shows 9)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 7 // matching screenshot page 1: 7 rows

  // Detail drawer
  const [selectedBatch, setSelectedBatch] = useState<PickingBatch | null>(null)

  // Consolidated batch creation modal & toast message
  const [createBatchModalOpen, setCreateBatchModalOpen] = useState(false)
  const [newBatchType, setNewBatchType] =
    useState<OrderFulfillmentType>('normal')
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const handleConfirmCreateConsolidatedBatch = () => {
    const nextNum = batches.length + 1
    const newId = `BTH-20260908-${String(nextNum).padStart(3, '0')}`
    const isExpress = newBatchType === 'express'

    const newBatch: PickingBatch = {
      id: newId,
      itemsCount: 16,
      skusCount: 10,
      channels: ['shopee', 'tiktok'],
      priority: isExpress ? 'Urgent' : 'Normal',
      orderType: newBatchType,
      slaDetail: isExpress
        ? {
            orderType: 'express',
            title: 'Đơn hỏa tốc',
            slaHours: 4,
            deadlineText: '14:30',
            remainingText: 'Còn 3h 50m',
            receivedAtText: '10:40 (Giờ hành chính: 08:00 - 17:30)',
            officeHoursOnly: true,
            description:
              'Bắt buộc nhân viên hoàn thành trong 4 tiếng. Chỉ tiếp nhận trong khung giờ hành chính (08:00 - 17:30).',
          }
        : {
            orderType: 'normal',
            title: 'Đơn bình thường',
            deadlineText: '18:00 hôm nay',
            remainingText: 'Còn 7h 20m',
            receivedAtText: '10:40',
            officeHoursOnly: false,
            description: 'Đơn hàng xử lý tiêu chuẩn trong ngày (SLA 24h).',
          },
      picker: {
        name: 'Chưa phân công',
        avatar: '',
        initials: 'CP',
      },
      progress: { picked: 0, total: 16 },
      status: 'Pending',
      zone: 'Zone A',
      createdAt: new Date().toISOString(),
      orders: [
        {
          orderId: `SP-${Math.floor(10000 + Math.random() * 90000)}`,
          channel: 'shopee',
          customerName: 'Hoàng Minh Quân',
          phone: '0912 345 678',
          address: '15 Lê Duẩn, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
          createdAt: '10:20',
          paymentMethod: 'ShopeePay (Đã thanh toán)',
          totalAmount: 650000,
          items: [
            {
              sku: 'AT-POLO-NEW',
              name: 'Áo Polo Nam Phối Cổ Trắng Thể Thao',
              qty: 4,
              price: 150000,
              bin: 'A-01-08',
              picked: false,
            },
            {
              sku: 'QS-JEAN-01',
              name: 'Quần Short Jean Nam Rách Cá Tính',
              qty: 2,
              price: 180000,
              bin: 'A-02-12',
              picked: false,
            },
          ],
        },
        {
          orderId: `TT-${Math.floor(10000 + Math.random() * 90000)}`,
          channel: 'tiktok',
          customerName: 'Hoàng Minh Quân',
          phone: '0912 345 678',
          address: '15 Lê Duẩn, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
          createdAt: '10:35',
          paymentMethod: 'COD (Thu tiền khi nhận hàng)',
          totalAmount: 890000,
          notes: 'Gộp cùng đơn Shopee giao cho Hoàng Minh Quân',
          items: [
            {
              sku: 'AK-HOOD-02',
              name: 'Áo Khoác Nỉ Hoodie Unisex Form Rộng',
              qty: 4,
              price: 220000,
              bin: 'A-03-05',
              picked: false,
            },
            {
              sku: 'ML-BASE-05',
              name: 'Mũ Lưỡi Trai Unisex Logo Kim Loại',
              qty: 6,
              price: 85000,
              bin: 'A-04-11',
              picked: false,
            },
          ],
        },
      ],
      items: [
        {
          sku: 'AT-POLO-NEW',
          name: 'Áo Polo Nam Phối Cổ Trắng Thể Thao',
          qty: 4,
          bin: 'A-01-08',
          picked: false,
        },
        {
          sku: 'QS-JEAN-01',
          name: 'Quần Short Jean Nam Rách Cá Tính',
          qty: 2,
          bin: 'A-02-12',
          picked: false,
        },
        {
          sku: 'AK-HOOD-02',
          name: 'Áo Khoác Nỉ Hoodie Unisex Form Rộng',
          qty: 4,
          bin: 'A-03-05',
          picked: false,
        },
        {
          sku: 'ML-BASE-05',
          name: 'Mũ Lưỡi Trai Unisex Logo Kim Loại',
          qty: 6,
          bin: 'A-04-11',
          picked: false,
        },
      ],
      aiPackaging: {
        boxCode: 'CARTON-C2',
        dimensions: '30 × 22 × 18 cm',
        fillRatio: 0.91,
        cushioning: 'Giấy nến bọc áo khoác chống ẩm',
      },
    }

    setBatches((prev) => {
      const next = [newBatch, ...prev]
      saveStoredBatches(next)
      return next
    })
    setCreateBatchModalOpen(false)
    setToastMessage(
      vi
        ? `Đã tạo thành công đợt lấy hàng gộp ${newId} (Shopee + TikTok Shop, 16 món / 10 SKU)!`
        : `Successfully generated consolidated batch ${newId}!`,
    )
    window.setTimeout(() => setToastMessage(null), 4000)
  }

  // Counts of express and delayed packing orders for staff notification banner
  const expressCount = useMemo(
    () => batches.filter((b) => b.orderType === 'express').length,
    [batches],
  )
  const delayedPackingCount = useMemo(
    () => batches.filter((b) => b.orderType === 'delayed_packing').length,
    [batches],
  )

  // Filter logic
  const filteredBatches = useMemo(() => {
    return batches.filter((batch) => {
      // Search by Batch ID
      if (
        searchTerm.trim() &&
        !batch.id.toLowerCase().includes(searchTerm.trim().toLowerCase())
      ) {
        return false
      }

      // Order Type filter
      if (orderTypeFilter !== 'all' && batch.orderType !== orderTypeFilter) {
        return false
      }

      // Priority filter
      if (priorityFilter !== 'all') {
        if (
          priorityFilter === 'Normal' &&
          (batch.priority !== 'Normal' || batch.orderType === 'delayed_packing')
        ) {
          return false
        }
        if (priorityFilter === 'Urgent' && batch.priority !== 'Urgent') {
          return false
        }
      }

      // Status filter
      if (statusFilter !== 'all' && batch.status !== statusFilter) {
        return false
      }

      return true
    })
  }, [
    batches,
    searchTerm,
    orderTypeFilter,
    priorityFilter,
    statusFilter,
  ])

  // Total pages
  const totalBatches = filteredBatches.length
  const totalPages = Math.max(1, Math.ceil(totalBatches / pageSize))

  // Paginated slice
  const paginatedBatches = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredBatches.slice(startIndex, startIndex + pageSize)
  }, [filteredBatches, currentPage, pageSize])

  // Reset filters
  const handleResetFilters = () => {
    setSearchTerm('')
    setOrderTypeFilter('all')
    setPriorityFilter('all')
    setStatusFilter('all')
    setCurrentPage(1)
  }

  // Start picking action
  const handleStartPicking = (batchId: string) => {
    setBatches((prev) => {
      const next = prev.map((b) =>
        b.id === batchId
          ? {
              ...b,
              status: 'Picking' as PickingStatus,
              progress: {
                picked: Math.max(1, Math.floor(b.progress.total * 0.25)),
                total: b.progress.total,
              },
            }
          : b,
      )
      saveStoredBatches(next)
      return next
    })
    if (selectedBatch?.id === batchId) {
      setSelectedBatch((prev) =>
        prev
          ? {
              ...prev,
              status: 'Picking',
              progress: {
                picked: Math.max(1, Math.floor(prev.progress.total * 0.25)),
                total: prev.progress.total,
              },
            }
          : null,
      )
    }
  }

  // Complete batch action
  const handleCompleteBatch = (batchId: string) => {
    setBatches((prev) => {
      const next = prev.map((b) =>
        b.id === batchId
          ? {
              ...b,
              status: 'Picked' as PickingStatus,
              progress: { picked: b.progress.total, total: b.progress.total },
            }
          : b,
      )
      saveStoredBatches(next)
      return next
    })
    if (selectedBatch?.id === batchId) {
      setSelectedBatch((prev) =>
        prev
          ? {
              ...prev,
              status: 'Picked',
              progress: { picked: prev.progress.total, total: prev.progress.total },
            }
          : null,
      )
    }
  }

  // Khi đơn bình thường bị trễ thời gian đóng gói -> chuyển sang Đơn trễ đóng gói
  const handleToggleDelayedPacking = (batchId: string) => {
    setBatches((prev) => {
      const next = prev.map((b) => {
        if (b.id !== batchId) return b
        if (b.orderType === 'delayed_packing') {
          // Khôi phục về đơn bình thường đúng hạn
          const updated: PickingBatch = {
            ...b,
            orderType: 'normal',
            status: b.status === 'Delayed' ? 'Pending' : b.status,
            priority: 'Normal',
            slaDetail: {
              orderType: 'normal',
              title: 'Đơn bình thường',
              deadlineText: '18:00 hôm nay',
              remainingText: 'Còn 7h 30m',
              receivedAtText: b.slaDetail?.receivedAtText ?? '08:30',
              officeHoursOnly: false,
              description: 'Đơn hàng xử lý tiêu chuẩn trong ngày (SLA 24h).',
            },
          }
          if (selectedBatch?.id === batchId) setSelectedBatch(updated)
          return updated
        } else if (b.orderType === 'normal') {
          // Đơn bình thường bị trễ thời gian đóng gói -> chuyển sang Đơn trễ đóng gói
          const updated: PickingBatch = {
            ...b,
            orderType: 'delayed_packing',
            status: 'Delayed',
            priority: 'Urgent',
            slaDetail: {
              orderType: 'delayed_packing',
              title: 'Đơn trễ thời gian đóng gói',
              overdueMinutes: 45,
              deadlineText: 'Quá hạn 45 phút',
              remainingText: 'Đã quá hạn đóng gói quy định',
              receivedAtText: b.slaDetail?.receivedAtText ?? '08:30',
              officeHoursOnly: false,
              description:
                'Đơn bình thường bị trễ thời gian đóng gói quy định (+45 phút) nên tự động chuyển sang đơn Trễ đóng gói để nhân viên ưu tiên xử lý khẩn cấp!',
            },
          }
          if (selectedBatch?.id === batchId) setSelectedBatch(updated)
          return updated
        }
        return b
      })
      saveStoredBatches(next)
      return next
    })
  }

  // Channel badge component
  const renderChannelBadge = (channel: BatchChannel) => {
    switch (channel) {
      case 'shopee':
        return (
          <span
            key={channel}
            className="inline-flex items-center rounded border border-[#f97316]/50 bg-[#fff7ed] px-2 py-0.5 text-xs font-medium text-[#ea580c] dark:border-orange-500/40 dark:bg-orange-950/20 dark:text-orange-400"
          >
            Shopee
          </span>
        )
      case 'tiktok':
        return (
          <span
            key={channel}
            className="inline-flex items-center rounded border border-slate-900 bg-white px-2 py-0.5 text-xs font-semibold text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            TikTok
          </span>
        )
      case 'lazada':
        return (
          <span
            key={channel}
            className="inline-flex items-center rounded border border-[#4f46e5]/50 bg-[#eef2ff] px-2 py-0.5 text-xs font-medium text-[#4f46e5] dark:border-indigo-500/40 dark:bg-indigo-950/20 dark:text-indigo-400"
          >
            Lazada
          </span>
        )
      case 'facebook':
        return (
          <span
            key={channel}
            className="inline-flex items-center rounded border border-[#2563eb]/50 bg-[#eff6ff] px-2 py-0.5 text-xs font-medium text-[#2563eb] dark:border-blue-500/40 dark:bg-blue-950/20 dark:text-blue-400"
          >
            Facebook
          </span>
        )
    }
  }

  // Order Case & Priority badge component (3 trường hợp: Đơn hỏa tốc, Đơn bình thường, Đơn trễ đóng gói)
  const renderOrderCaseBadge = (batch: PickingBatch) => {
    if (batch.orderType === 'express') {
      return (
        <div className="flex flex-col items-start gap-1">
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 border border-amber-300 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-950/60 dark:border-amber-700 dark:text-amber-300 shadow-2xs">
            <Zap className="h-3 w-3 fill-amber-500 text-amber-600 shrink-0" />
            Hỏa tốc (4h)
          </span>
          <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
            {batch.slaDetail?.remainingText ?? 'Hạn 4h'} · Giờ HC
          </span>
        </div>
      )
    }

    if (batch.orderType === 'delayed_packing') {
      return (
        <div
          className="flex flex-col items-start gap-1 cursor-pointer group"
          onClick={(e) => {
            e.stopPropagation()
            handleToggleDelayedPacking(batch.id)
          }}
          title="Nhấn để khôi phục về Đơn bình thường (Đúng hạn)"
        >
          <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 border border-rose-300 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-950/60 dark:border-rose-700 dark:text-rose-300 shadow-2xs group-hover:bg-rose-200 transition-colors">
            <AlertTriangle className="h-3 w-3 text-rose-600 shrink-0" />
            Trễ đóng gói
          </span>
          <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">
            {batch.slaDetail?.deadlineText ?? 'Quá hạn 45p'} (từ đơn thường)
          </span>
        </div>
      )
    }

    // Đơn bình thường (Không còn loại đơn Cao)
    return (
      <div
        className="flex flex-col items-start gap-1 cursor-pointer group"
        onClick={(e) => {
          e.stopPropagation()
          handleToggleDelayedPacking(batch.id)
        }}
        title="Nhấn để mô phỏng trễ thời gian đóng gói (Chuyển sang Đơn trễ đóng gói)"
      >
        <span className="inline-flex items-center rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 group-hover:border-rose-300 group-hover:bg-rose-50 group-hover:text-rose-700 transition-colors">
          Bình thường
        </span>
        <span className="text-[10px] text-slate-400 group-hover:text-rose-500 transition-colors">
          Tiêu chuẩn 24h
        </span>
      </div>
    )
  }

  // Status badge component
  const renderStatusBadge = (status: PickingStatus) => {
    switch (status) {
      case 'Picked':
        return (
          <span className="inline-flex items-center rounded-full bg-[#dcfce7] px-3 py-1 text-xs font-medium text-[#15803d] dark:bg-emerald-950/30 dark:text-emerald-400">
            Đã lấy hàng
          </span>
        )
      case 'Picking':
        return (
          <span className="inline-flex items-center rounded-full bg-[#dbeafe] px-3 py-1 text-xs font-medium text-[#1d4ed8] dark:bg-blue-950/30 dark:text-blue-400">
            Đang lấy hàng
          </span>
        )
      case 'Pending':
        return (
          <span className="inline-flex items-center rounded-full bg-[#fef9c3] px-3 py-1 text-xs font-medium text-[#a16207] dark:bg-amber-950/30 dark:text-amber-400">
            Chờ xử lý
          </span>
        )
      case 'Delayed':
        return (
          <span className="inline-flex items-center rounded-full bg-[#fee2e2] px-3 py-1 text-xs font-medium text-[#b91c1c] dark:bg-rose-950/30 dark:text-rose-400">
            Chậm trễ
          </span>
        )
    }
  }

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Đơn đa kênh' : 'Omnichannel Orders' },
        ]}
      />

      <div className="flex-1 overflow-auto bg-[#F9FAFB] p-4 sm:p-6 dark:bg-[#0B0E14]">
        <div className="mx-auto max-w-7xl space-y-4">
          {/* Toast Notification */}
          {toastMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 shadow-xs flex items-center justify-between dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300 animate-in fade-in slide-in-from-top duration-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{toastMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setToastMessage(null)}
                className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Notification Alert Banner cho nhân viên */}
          <div className="rounded-2xl border border-amber-300/80 bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 p-4 shadow-xs dark:border-amber-800/60 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-rose-950/20">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
                  <Zap className="h-5 w-5 fill-white" />
                </span>
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-950 dark:text-amber-200">
                      THÔNG BÁO ĐIỀU PHỐI ĐÓNG GÓI & LẤY HÀNG
                    </h3>
                    <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs animate-pulse">
                      Ưu tiên khẩn cấp
                    </span>
                  </div>
                  <p className="text-xs text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
                    Đang có <strong className="text-amber-800 dark:text-amber-300 font-bold">{expressCount} đợt HỎA TỐC</strong> (bắt buộc hoàn tất trong <strong>4 tiếng</strong>, chỉ tiếp nhận trong <strong>giờ hành chính 08:00 - 17:30</strong>) và <strong className="text-rose-700 dark:text-rose-300 font-bold">{delayedPackingCount} đợt TRỄ THỜI GIAN ĐÓNG GÓI</strong> cần ưu tiên thực hiện ngay!
                  </p>
                </div>
              </div>

              {/* Quick Action Filter Buttons */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setOrderTypeFilter('express')
                    setCurrentPage(1)
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-xs ${
                    orderTypeFilter === 'express'
                      ? 'bg-amber-600 text-white ring-2 ring-amber-400'
                      : 'bg-white text-amber-900 border border-amber-300 hover:bg-amber-50 dark:bg-surface-1 dark:text-amber-300 dark:border-amber-700'
                  }`}
                >
                  <Zap className="h-3.5 w-3.5 fill-amber-500" />
                  Lọc {expressCount} đợt Hỏa tốc (4h)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOrderTypeFilter('delayed_packing')
                    setCurrentPage(1)
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-xs ${
                    orderTypeFilter === 'delayed_packing'
                      ? 'bg-rose-600 text-white ring-2 ring-rose-400'
                      : 'bg-white text-rose-900 border border-rose-300 hover:bg-rose-50 dark:bg-surface-1 dark:text-rose-300 dark:border-rose-700'
                  }`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Lọc {delayedPackingCount} đợt Trễ đóng gói
                </button>

                {orderTypeFilter !== 'all' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOrderTypeFilter('all')
                      setCurrentPage(1)
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer dark:border-slate-700 dark:bg-surface-1 dark:text-slate-300"
                  >
                    Hiện tất cả
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Top Filter Bar */}
          <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-surface-1">
            {/* Search Input */}
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={vi ? 'Tìm theo Batch ID...' : 'Search by Batch ID...'}
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(1)
                }}
                className="h-9.5 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-200"
              />
            </div>

            {/* Dropdown 0: Order Type (Loại đơn) */}
            <div className="relative">
              <select
                value={orderTypeFilter}
                onChange={(e) => {
                  setOrderTypeFilter(e.target.value as 'all' | OrderFulfillmentType)
                  setCurrentPage(1)
                }}
                className="h-9.5 cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300"
              >
                <option value="all">Loại đơn: Tất cả</option>
                <option value="express">⚡ Đơn hỏa tốc (SLA 4h)</option>
                <option value="delayed_packing">⚠️ Đơn trễ đóng gói</option>
                <option value="normal">Đơn bình thường</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>

            {/* Dropdown 1: Priority */}
            <div className="relative">
              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="h-9.5 cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-normal text-slate-700 transition-colors hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300"
              >
                <option value="all">Độ ưu tiên: Tất cả</option>
                <option value="Urgent">Độ ưu tiên: Khẩn cấp (Hỏa tốc / Trễ SLA)</option>
                <option value="Normal">Độ ưu tiên: Bình thường</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>

            {/* Dropdown 2: Status */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="h-9.5 cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-normal text-slate-700 transition-colors hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300"
              >
                <option value="all">Trạng thái: Tất cả</option>
                <option value="Picked">Trạng thái: Đã lấy hàng</option>
                <option value="Picking">Trạng thái: Đang lấy hàng</option>
                <option value="Pending">Trạng thái: Chờ xử lý</option>
                <option value="Delayed">Trạng thái: Chậm trễ</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>

            {/* Reset Action (Right Aligned) */}
            <button
              type="button"
              onClick={handleResetFilters}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 cursor-pointer dark:text-slate-400 dark:hover:bg-surface-2 dark:hover:text-slate-200"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{vi ? 'Đặt lại bộ lọc' : 'Reset Filters'}</span>
            </button>
          </div>

          {/* Top Table Header Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>{vi ? 'Danh sách đợt lấy hàng' : 'Batch Picking List'}</span>
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  {totalBatches} {vi ? 'đợt' : 'batches'}
                </span>
              </h2>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {vi ? 'Đồng bộ từ Shopee & TikTok Shop' : 'Omnichannel live sync'}
              </span>
            </div>
          </div>

          {/* Main Data Table Card */}
          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-surface-1">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-xs">
                {/* Table Header */}
                <thead>
                  <tr className="border-b border-slate-200 bg-white text-[11px] font-semibold text-slate-500 uppercase tracking-wider dark:border-slate-800 dark:bg-surface-1 dark:text-slate-400">
                    <th className="px-5 py-3.5">MÃ ĐỢT</th>
                    <th className="px-4 py-3.5">SẢN PHẨM / SKU</th>
                    <th className="px-4 py-3.5">KÊNH ĐẶT HÀNG</th>
                    <th className="px-4 py-3.5">LOẠI ĐƠN & ƯU TIÊN</th>
                    <th className="px-4 py-3.5">NHÂN VIÊN</th>
                    <th className="px-4 py-3.5">TIẾN ĐỘ</th>
                    <th className="px-4 py-3.5">TRẠNG THÁI</th>
                    <th className="px-5 py-3.5 text-right">THAO TÁC</th>
                  </tr>
                </thead>

                {/* Table Body */}
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {paginatedBatches.length > 0 ? (
                    paginatedBatches.map((batch) => {
                      const progressPct = Math.round(
                        (batch.progress.picked / batch.progress.total) * 100,
                      )

                      return (
                        <tr
                          key={batch.id}
                          className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                        >
                          {/* 1. BATCH ID & CUSTOMER */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Box className="h-4 w-4 text-slate-500 shrink-0" strokeWidth={1.75} />
                              <div>
                                <button
                                  type="button"
                                  onClick={() => navigate(`/app/warehouse?batchId=${batch.id}&action=detail`)}
                                  className="font-semibold text-[#2563eb] hover:text-[#1d4ed8] hover:underline cursor-pointer transition-colors block text-left"
                                >
                                  {batch.id}
                                </button>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                                    {batch.customerName || batch.orders[0]?.customerName}
                                  </span>
                                  {batch.orders.length > 1 && (
                                    <span
                                      className="rounded bg-purple-50 px-1 py-0.2 text-[9px] font-bold text-purple-700 dark:bg-purple-950/40 dark:text-purple-300"
                                      title={`Đã gom ${batch.orders.length} đơn hàng lẻ từ nhiều sàn của khách ${batch.customerName || batch.orders[0]?.customerName}`}
                                    >
                                      Gộp {batch.orders.length} đơn
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* 2. ITEMS / SKUS */}
                          <td className="px-4 py-4 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">
                            {batch.itemsCount} món / {batch.skusCount} SKU
                          </td>

                          {/* 3. SOURCE CHANNELS */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {batch.channels.slice(0, 3).map((ch) => renderChannelBadge(ch))}
                              {batch.channels.length > 3 && (
                                <span
                                  title={batch.channels
                                    .slice(3)
                                    .map((c) => c.toUpperCase())
                                    .join(', ')}
                                  className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                >
                                  +{batch.channels.length - 3}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 4. ORDER TYPE & PRIORITY */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            {renderOrderCaseBadge(batch)}
                          </td>

                          {/* 5. ASSIGNED PICKER */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            {!batch.picker?.name ||
                            batch.picker.name === 'Chưa phân công' ||
                            batch.status === 'Pending' ? (
                              <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 border border-slate-200/80 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                {vi ? 'Chưa phân công' : 'Unassigned'}
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                {batch.picker.avatar ? (
                                  <img
                                    src={batch.picker.avatar}
                                    alt={batch.picker.name}
                                    className="h-6 w-6 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700 shrink-0"
                                  />
                                ) : (
                                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shrink-0">
                                    {batch.picker.initials || 'NV'}
                                  </span>
                                )}
                                <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                                  {batch.picker.name}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* 6. PROGRESS */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="w-36 space-y-1.5">
                              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                                <span>
                                  {batch.progress.picked}/{batch.progress.total} món
                                </span>
                                <span className="font-medium">{progressPct}%</span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                <div
                                  className="h-full rounded-full bg-[#2563eb] transition-all duration-300"
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* 6. STATUS */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            {renderStatusBadge(batch.status)}
                          </td>

                          {/* 7. ACTIONS */}
                          <td className="px-5 py-4 text-right whitespace-nowrap">
                            {batch.status === 'Pending' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  handleStartPicking(batch.id)
                                  navigate(`/app/warehouse?batchId=${batch.id}&action=start`)
                                }}
                                className="inline-flex items-center justify-center rounded-md bg-[#2563eb] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#1d4ed8] active:bg-[#1e40af] cursor-pointer"
                              >
                                {vi ? 'Bắt đầu lấy hàng' : 'Start Picking'}
                              </button>
                            ) : batch.status === 'Delayed' ? (
                              <button
                                type="button"
                                onClick={() => navigate(`/app/warehouse?batchId=${batch.id}&action=start`)}
                                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-rose-700 active:bg-rose-800 cursor-pointer animate-pulse"
                                title={vi ? 'Đơn đã trễ đóng gói - Nhấn để tiếp tục lấy hàng ngay' : 'Delayed batch - Continue picking now'}
                              >
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                <span>{vi ? 'Tiếp tục lấy hàng' : 'Continue Picking'}</span>
                              </button>
                            ) : batch.status === 'Picking' ? (
                              <button
                                type="button"
                                onClick={() => navigate(`/app/warehouse?batchId=${batch.id}&action=start`)}
                                className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 shadow-2xs transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 cursor-pointer"
                              >
                                {vi ? 'Tiếp tục' : 'Continue'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => navigate(`/app/warehouse?batchId=${batch.id}&action=detail`)}
                                className="text-xs font-medium text-[#2563eb] hover:text-[#1d4ed8] hover:underline cursor-pointer"
                              >
                                {vi ? 'Xem chi tiết' : 'View Details'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        {vi ? 'Không có đợt lấy hàng phù hợp bộ lọc' : 'No picking batches match the filters'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer with Pagination matching screenshot */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 text-xs dark:border-slate-800 dark:bg-surface-1">
              <span className="text-slate-500 dark:text-slate-400">
                {vi
                  ? `Hiển thị ${paginatedBatches.length} trên tổng số ${totalBatches} đợt lấy hàng đang hoạt động`
                  : `Showing ${paginatedBatches.length} of ${totalBatches} active picking batches`}
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-slate-200 px-3 py-1.5 font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Trước
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`h-7 w-7 rounded-md font-medium text-xs transition-colors cursor-pointer ${
                      currentPage === pageNum
                        ? 'bg-[#2563eb] text-white shadow-xs'
                        : 'border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}

                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-md border border-slate-200 px-3 py-1.5 font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Sau
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Batch detail drawer */}
      <BatchDetailDrawer
        batch={selectedBatch}
        onClose={() => setSelectedBatch(null)}
        onStartPicking={(batchId) => {
          handleStartPicking(batchId)
          navigate(`/app/warehouse?batchId=${batchId}&action=start`)
        }}
        onCompleteBatch={handleCompleteBatch}
        onToggleDelayedPacking={handleToggleDelayedPacking}
        locale={locale}
      />

      {/* Modal: Tạo đợt lấy hàng gộp tự động */}
      {createBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setCreateBatchModalOpen(false)}
          />

          {/* Modal Container */}
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-surface-1 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm dark:text-slate-100">
                    {vi
                      ? 'Tạo đợt lấy hàng gộp tự động'
                      : 'Generate Consolidated Batch'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {vi
                      ? 'Gộp đơn trùng người nhận từ Shopee & TikTok Shop'
                      : 'Consolidate matching orders via AI'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreateBatchModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 py-4 text-xs">
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
                <p className="font-semibold flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  Thuật toán AI phát hiện 2 đơn hàng đủ điều kiện gộp:
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-blue-800/90 dark:text-blue-300/90">
                  Khách hàng: <strong>Hoàng Minh Quân</strong> (SĐT: 0912 345 678)
                  có 1 đơn từ Shopee (6 SP) và 1 đơn từ TikTok Shop (10 SP) cùng
                  giao về 15 Lê Duẩn, Quận 1.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2 dark:border-slate-800 dark:bg-surface-2/40">
                <div className="flex justify-between">
                  <span className="text-slate-500">Mã đợt dự kiến:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    BTH-20260908-{String(batches.length + 1).padStart(3, '0')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Kênh đặt hàng:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    Shopee, TikTok Shop
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tổng quy mô:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    16 món / 10 SKU (2 đơn gộp)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Kho hàng:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    Kho tổng chung
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">AI Đề xuất đóng gói:</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    CARTON-C2 (Độ lấp đầy 91%)
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Chọn loại đơn & Thời hạn đóng gói:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors ${
                      newBatchType === 'normal'
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-1 ring-blue-500/20'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-200">
                        Đơn bình thường
                      </p>
                      <p className="text-[10.5px] text-slate-500">
                        SLA tiêu chuẩn 24h
                      </p>
                    </div>
                    <input
                      type="radio"
                      name="newBatchType"
                      value="normal"
                      checked={newBatchType === 'normal'}
                      onChange={() => setNewBatchType('normal')}
                      className="accent-blue-600"
                    />
                  </label>

                  <label
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors ${
                      newBatchType === 'express'
                        ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 ring-1 ring-amber-500/20'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div>
                      <p className="font-bold text-amber-900 dark:text-amber-200">
                        ⚡ Đơn hỏa tốc
                      </p>
                      <p className="text-[10.5px] text-amber-700/80">
                        SLA hoàn thành 4 tiếng
                      </p>
                    </div>
                    <input
                      type="radio"
                      name="newBatchType"
                      value="express"
                      checked={newBatchType === 'express'}
                      onChange={() => setNewBatchType('express')}
                      className="accent-amber-600"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCreateBatchModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmCreateConsolidatedBatch}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#1d4ed8] cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Xác nhận tạo đợt
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
