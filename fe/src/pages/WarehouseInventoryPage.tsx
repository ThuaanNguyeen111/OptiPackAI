import { useState, useMemo, useEffect } from 'react'
import {
  Database,
  Search,
  X,
  RotateCcw,
  Download,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  TrendingDown,
  Plus,
  ArrowUpDown,
  Check,
  Eye,
  ArrowRight,
  Minus,
} from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import {
  getStoredWarehouseStock,
  saveStoredWarehouseStock,
  resetWarehouseStock,
  computeStockStatus,
  type WarehouseStockItem,
  WAREHOUSE_STOCK_STORAGE_KEY,
} from '../data/warehouse-picking-mock'

export function WarehouseInventoryPage() {
  const [stockMap, setStockMap] = useState<Record<string, WarehouseStockItem>>(() =>
    getStoredWarehouseStock(),
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'optimal' | 'moderate' | 'low' | 'picked'>('all')
  const [sortBy, setSortBy] = useState<'currentStock' | 'pickedQuantity' | 'sku' | 'name'>('currentStock')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const [lastDeductedSku, setLastDeductedSku] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Modal Điều chỉnh tồn kho / Nhập thêm
  const [restockModalOpen, setRestockModalOpen] = useState(false)
  const [selectedStockItem, setSelectedStockItem] = useState<WarehouseStockItem | null>(null)
  const [adjustAmount, setAdjustAmount] = useState<number>(20)
  const [adjustType, setAdjustType] = useState<'add' | 'set'>('add')
  const [adjustNote, setAdjustNote] = useState('')

  // Modal Chi tiết vị trí kho
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [detailItem, setDetailItem] = useState<WarehouseStockItem | null>(null)

  // Đồng bộ thời gian thực từ CustomEvent & Storage
  useEffect(() => {
    const handleStockUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<Record<string, WarehouseStockItem>>
      if (customEvent.detail) {
        setStockMap(customEvent.detail)
      } else {
        setStockMap(getStoredWarehouseStock())
      }
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === WAREHOUSE_STOCK_STORAGE_KEY) {
        setStockMap(getStoredWarehouseStock())
      }
    }

    window.addEventListener('optipack:warehouse_stock_updated', handleStockUpdate)
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener('optipack:warehouse_stock_updated', handleStockUpdate)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  // Show toast notification
  const showToast = (msg: string) => {
    setToastMessage(msg)
    window.setTimeout(() => setToastMessage(null), 3500)
  }

  // Danh sách sản phẩm tồn kho dạng mảng
  const inventoryList = useMemo(() => {
    return Object.values(stockMap)
  }, [stockMap])

  // Thống kê tổng quan KPI (Real-time Metrics)
  const stats = useMemo(() => {
    const totalSKUs = inventoryList.length
    const totalCurrentUnits = inventoryList.reduce((acc, it) => acc + it.currentStock, 0)
    const totalInitialUnits = inventoryList.reduce((acc, it) => acc + it.initialStock, 0)
    const totalPickedUnits = inventoryList.reduce((acc, it) => acc + it.pickedQuantity, 0)

    const optimalCount = inventoryList.filter((it) => it.status === 'optimal').length
    const moderateCount = inventoryList.filter((it) => it.status === 'moderate').length
    const lowStockList = inventoryList.filter((it) => it.status === 'low')
    const lowStockCount = lowStockList.length

    return {
      totalSKUs,
      totalCurrentUnits,
      totalInitialUnits,
      totalPickedUnits,
      optimalCount,
      moderateCount,
      lowStockCount,
    }
  }, [inventoryList])

  // Danh sách đã lọc và sắp xếp
  const filteredAndSortedList = useMemo(() => {
    return inventoryList
      .filter((item) => {
        // 1. Search Query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim()
          const matchName = item.name.toLowerCase().includes(q)
          const matchShortName = item.shortName?.toLowerCase().includes(q)
          const matchSku = item.sku.toLowerCase().includes(q)
          const matchUpc = item.upc.includes(q)
          const matchLoc = item.location.toLowerCase().includes(q)
          if (!matchName && !matchShortName && !matchSku && !matchUpc && !matchLoc) {
            return false
          }
        }

        // 2. Status Filter
        if (statusFilter === 'optimal' && item.status !== 'optimal') return false
        if (statusFilter === 'moderate' && item.status !== 'moderate') return false
        if (statusFilter === 'low' && item.status !== 'low') return false
        if (statusFilter === 'picked' && item.pickedQuantity <= 0) return false

        return true
      })
      .sort((a, b) => {
        let valA: string | number = a[sortBy]
        let valB: string | number = b[sortBy]

        if (typeof valA === 'string') {
          valA = valA.toLowerCase()
          valB = (valB as string).toLowerCase()
          return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
        }

        return sortDirection === 'asc'
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number)
      })
  }, [inventoryList, searchQuery, statusFilter, sortBy, sortDirection])

  // Toggle sort direction
  const handleSort = (field: 'currentStock' | 'pickedQuantity' | 'sku' | 'name') => {
    if (sortBy === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortDirection('asc')
    }
  }

  // Khôi phục kho về ban đầu
  const handleResetStock = () => {
    if (confirm('Khôi phục toàn bộ số lượng tồn kho về trạng thái mẫu ban đầu?')) {
      const resetMap = resetWarehouseStock()
      setStockMap(resetMap)
      setLastDeductedSku(null)
      showToast('Đã khôi phục dữ liệu tồn kho về ban đầu!')
    }
  }

  // Mở modal điều chỉnh / nhập kho
  const handleOpenRestockModal = (item: WarehouseStockItem) => {
    setSelectedStockItem(item)
    setAdjustAmount(20)
    setAdjustType('add')
    setAdjustNote('')
    setRestockModalOpen(true)
  }

  // Xác nhận điều chỉnh tồn kho
  const handleConfirmAdjust = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStockItem) return

    const newStock =
      adjustType === 'add'
        ? selectedStockItem.currentStock + Number(adjustAmount)
        : Number(adjustAmount)

    const updatedMap: Record<string, WarehouseStockItem> = {
      ...stockMap,
      [selectedStockItem.sku]: {
        ...selectedStockItem,
        currentStock: Math.max(0, newStock),
        status: computeStockStatus(Math.max(0, newStock), selectedStockItem.safetyThreshold),
        lastUpdatedText: 'Vừa cập nhật',
      },
    }

    saveStoredWarehouseStock(updatedMap)
    setStockMap(updatedMap)
    setLastDeductedSku(selectedStockItem.sku)
    setRestockModalOpen(false)
    showToast(
      `Đã cập nhật tồn kho cho [${selectedStockItem.sku}]: ${newStock} chiếc thành công!`,
    )
  }

  // Mở modal chi tiết vị trí kệ
  const handleOpenDetailModal = (item: WarehouseStockItem) => {
    setDetailItem(item)
    setDetailModalOpen(true)
  }

  // Xuất file CSV báo cáo tồn kho
  const handleExportCsv = () => {
    const headers = [
      'Mã SKU',
      'Tên sản phẩm',
      'Mã vạch UPC',
      'Vị trí kệ & ngăn',
      'Tồn ban đầu',
      'Đã xuất kho',
      'Tồn hiện tại',
      'Ngưỡng an toàn',
      'Tình trạng tồn kho',
    ]

    const rows = filteredAndSortedList.map((it) => [
      `"${it.sku}"`,
      `"${it.name.replace(/"/g, '""')}"`,
      `"${it.upc}"`,
      `"${it.location}"`,
      it.initialStock,
      it.pickedQuantity,
      it.currentStock,
      it.safetyThreshold,
      `"${it.status === 'low' ? 'Sắp hết hàng' : it.status === 'moderate' ? 'Mức an toàn' : 'Đủ hàng tại kệ'}"`,
    ])

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `OptiPackAI_TonKho_Realtime_${new Date().toISOString().split('T')[0]}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('Đã xuất file báo cáo tồn kho (CSV) thành công!')
  }

  return (
    <>
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: 'Vận hành kho', to: '/app/warehouse' },
          { label: 'Tình trạng kho theo thời gian thực' },
        ]}
      />

      <div className="flex-1 overflow-auto bg-[#F8FAFC] p-4 sm:p-6 dark:bg-[#0B0E14]">
        <div className="mx-auto max-w-7xl space-y-4 sm:space-y-5">
          {/* Toast Notification */}
          {toastMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 shadow-xs flex items-center justify-between dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300 animate-in fade-in duration-200">
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

          {/* Top Hero Banner */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/90 bg-white p-4.5 sm:p-5 shadow-xs dark:border-slate-800 dark:bg-surface-1">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xs shrink-0">
                <Database className="h-5 w-5" />
              </span>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                    Tình trạng kho theo thời gian thực
                  </h1>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/90 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    Kho tổng chung · Live Sync
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Giám sát định lượng tồn thực tế trên từng ngăn kệ · Tự động trừ kho tức thì khi nhân viên quét mã barcode tại kệ
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-surface-1 dark:text-slate-300 cursor-pointer transition-colors"
                title="Xuất bảng kê tồn kho ra file CSV"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                <span>Xuất file Excel/CSV</span>
              </button>

              <button
                type="button"
                onClick={handleResetStock}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-surface-1 dark:text-slate-300 cursor-pointer transition-colors"
                title="Khôi phục lại dữ liệu tồn kho mặc định"
              >
                <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                <span>Đặt lại kho</span>
              </button>
            </div>
          </div>

          {/* 4 Metric KPI Cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Tổng tồn kho hiện tại */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-surface-1 transition-all hover:border-blue-300">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider dark:text-slate-400">
                  TỒN KHO THỰC TẾ
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                  <Database className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold font-mono text-slate-900 dark:text-slate-100">
                  {stats.totalCurrentUnits.toLocaleString('vi-VN')}
                </span>
                <span className="text-xs text-slate-500 font-medium">sản phẩm</span>
              </div>
              <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {stats.totalSKUs} mã SKU
                </span>
                <span className="font-mono text-slate-400">
                  Gốc: {stats.totalInitialUnits.toLocaleString('vi-VN')}
                </span>
              </div>
            </div>

            {/* 2. Đã xuất & Khấu trừ kho */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-surface-1 transition-all hover:border-purple-300">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider dark:text-slate-400">
                  ĐÃ XUẤT / KHẤU TRỪ
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">
                  <TrendingDown className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold font-mono text-purple-700 dark:text-purple-400">
                  {stats.totalPickedUnits.toLocaleString('vi-VN')}
                </span>
                <span className="text-xs text-purple-600/80 font-medium">đã lấy</span>
              </div>
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="rounded bg-purple-100/80 px-1.5 py-0.5 font-bold text-purple-800 dark:bg-purple-950/50 dark:text-purple-300">
                  Tự động trừ
                </span>
                <span>Quét mã xác nhận tại kệ</span>
              </div>
            </div>

            {/* 3. Tồn kho an toàn / Đầy đủ */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-surface-1 transition-all hover:border-emerald-300">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider dark:text-slate-400">
                  ĐỦ HÀNG TẠI KỆ
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold font-mono text-emerald-700 dark:text-emerald-400">
                  {stats.optimalCount}
                </span>
                <span className="text-xs text-emerald-600/80 font-medium">SKU tối ưu</span>
              </div>
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Đạt ngưỡng quy định
                </span>
                <span>· {stats.moderateCount} an toàn</span>
              </div>
            </div>

            {/* 4. Cảnh báo sắp hết hàng */}
            <div
              onClick={() => setStatusFilter(stats.lowStockCount > 0 ? 'low' : 'all')}
              className={`rounded-2xl border p-4 shadow-xs transition-all cursor-pointer ${
                statusFilter === 'low'
                  ? 'border-rose-600 bg-rose-50/60 ring-2 ring-rose-500/20 dark:border-rose-500 dark:bg-rose-950/40'
                  : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-surface-1 hover:border-rose-300'
              }`}
              title="Bấm để lọc ngay các sản phẩm sắp hết hàng"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider dark:text-slate-400">
                  CẢNH BÁO SẮP HẾT
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                  <AlertTriangle className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span
                  className={`text-2xl font-extrabold font-mono ${
                    stats.lowStockCount > 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {stats.lowStockCount}
                </span>
                <span className="text-xs text-rose-600 font-medium">SKU cảnh báo</span>
              </div>
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px]">
                {stats.lowStockCount > 0 ? (
                  <span className="font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                    Bấm để xem {stats.lowStockCount} mặt hàng cần nhập
                  </span>
                ) : (
                  <span className="text-emerald-600">Đầy đủ tồn an toàn</span>
                )}
              </div>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-xs space-y-3 dark:border-slate-800 dark:bg-surface-1">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between text-xs">
              {/* Left: Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'all', label: `Tất cả (${inventoryList.length})` },
                  { id: 'optimal', label: `Đủ hàng (${stats.optimalCount})` },
                  { id: 'moderate', label: `An toàn (${stats.moderateCount})` },
                  { id: 'low', label: `Sắp hết (${stats.lowStockCount})`, alert: stats.lowStockCount > 0 },
                  { id: 'picked', label: `Đã có trừ kho (${inventoryList.filter((i) => i.pickedQuantity > 0).length})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id as typeof statusFilter)}
                    className={`rounded-xl px-3 py-1.5 font-bold transition-all cursor-pointer ${
                      statusFilter === tab.id
                        ? tab.alert
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Right: Search Input */}
              <div className="flex items-center gap-2">
                <div className="relative min-w-[240px] sm:min-w-[320px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm tên sản phẩm, SKU, UPC, vị trí kệ..."
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8.5 pr-8 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-200"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Main Inventory Data Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-surface-1">
            <div className="overflow-x-auto max-h-[580px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700">
              <table className="w-full min-w-[980px] text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs text-[11px] font-bold text-slate-500 uppercase tracking-wider dark:bg-surface-2/95 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 shadow-2xs">
                  <tr>
                    <th className="px-5 py-3.5">
                      <button
                        type="button"
                        onClick={() => handleSort('name')}
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                      >
                        <span>SẢN PHẨM & SKU</span>
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="px-4 py-3.5">VỊ TRÍ LƯU KHO</th>
                    <th className="px-4 py-3.5 text-center">TỒN BAN ĐẦU</th>
                    <th className="px-4 py-3.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleSort('pickedQuantity')}
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                      >
                        <span>ĐÃ LẤY / TRỪ KHO</span>
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="px-4 py-3.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleSort('currentStock')}
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                      >
                        <span>TỒN HIỆN TẠI (REAL-TIME)</span>
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    <th className="px-4 py-3.5 text-center">NGƯỠNG AN TOÀN</th>
                    <th className="px-4 py-3.5 text-center">TÌNH TRẠNG KHO</th>
                    <th className="px-5 py-3.5 text-right">THAO TÁC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {filteredAndSortedList.length > 0 ? (
                    filteredAndSortedList.map((item) => {
                      const isJustDeducted = lastDeductedSku === item.sku
                      const isLow = item.status === 'low'
                      const isModerate = item.status === 'moderate'
                      const stockRatio = Math.round((item.currentStock / Math.max(1, item.initialStock)) * 100)

                      return (
                        <tr
                          key={item.sku}
                          className={`transition-colors ${
                            isJustDeducted
                              ? 'bg-amber-50/80 dark:bg-amber-950/30'
                              : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          {/* 1. SẢN PHẨM & SKU */}
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="h-10 w-10 rounded-xl object-cover ring-1 ring-slate-200 dark:ring-slate-700 shrink-0"
                              />
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <strong className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate max-w-[260px] block" title={item.name}>
                                    {item.shortName || item.name}
                                  </strong>
                                  {isJustDeducted && (
                                    <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 animate-pulse">
                                      Vừa trừ kho
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500">
                                  <span className="font-bold text-blue-600 dark:text-blue-400">
                                    SKU: {item.sku}
                                  </span>
                                  <span>·</span>
                                  <span>UPC: {item.upc}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* 2. VỊ TRÍ KHO */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-200">
                              <MapPin className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                              <span>{item.location}</span>
                            </div>
                          </td>

                          {/* 3. TỒN BAN ĐẦU */}
                          <td className="px-4 py-3.5 text-center font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {item.initialStock} chiếc
                          </td>

                          {/* 4. ĐÃ LẤY & KHẤU TRỪ */}
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            {item.pickedQuantity > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-bold text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                                -{item.pickedQuantity} chiếc
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono text-xs">0 chiếc</span>
                            )}
                          </td>

                          {/* 5. TỒN THỰC TẾ & THANH TIẾN ĐỘ TỒN */}
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            <div className="inline-flex flex-col items-center">
                              <span
                                className={`font-mono text-sm font-extrabold ${
                                  isLow
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : isModerate
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-emerald-700 dark:text-emerald-400'
                                }`}
                              >
                                {item.currentStock} chiếc
                              </span>
                              {/* Mini health progress meter */}
                              <div className="mt-1 w-16 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    isLow
                                      ? 'bg-rose-500'
                                      : isModerate
                                        ? 'bg-amber-500'
                                        : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(5, stockRatio))}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* 6. NGƯỠNG AN TOÀN */}
                          <td className="px-4 py-3.5 text-center font-mono text-xs text-slate-500 whitespace-nowrap">
                            ≥ {item.safetyThreshold} chiếc
                          </td>

                          {/* 7. TÌNH TRẠNG KHO */}
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            {isLow ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 animate-pulse">
                                <AlertTriangle className="h-3 w-3" />
                                Sắp hết hàng
                              </span>
                            ) : isModerate ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                Mức an toàn
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Đủ hàng tại kệ
                              </span>
                            )}
                          </td>

                          {/* 8. THAO TÁC */}
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenDetailModal(item)}
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                                title="Xem chi tiết vị trí kệ & lịch sử"
                              >
                                <Eye className="h-4 w-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenRestockModal(item)}
                                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 cursor-pointer transition-colors"
                                title="Nhập thêm hàng hoặc cập nhật số lượng tồn"
                              >
                                <Plus className="h-3 w-3" />
                                <span>Nhập tồn</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center">
                        <AlertTriangle className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                        <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                          Không tìm thấy sản phẩm nào trong kho
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Hãy thử kiểm tra lại từ khóa tìm kiếm hoặc bấm chọn tab "Tất cả".
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-slate-200/80 bg-slate-50/50 px-5 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-surface-2/40">
              <span>
                Hiển thị <strong>{filteredAndSortedList.length}</strong> / <strong>{inventoryList.length}</strong> mặt hàng trong kho
              </span>
              <span className="font-mono text-[11px]">
                Đồng bộ hai chiều với màn hình Lấy hàng trong kho & Đóng gói AI
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODAL 1: ĐIỀU CHỈNH TỒN KHO / NHẬP THÊM HÀNG             */}
      {/* ========================================================= */}
      {restockModalOpen && selectedStockItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-surface-1">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <Plus className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Cập nhật tồn kho sản phẩm
                  </h3>
                  <p className="text-xs text-slate-500">
                    Nhập thêm hoặc điều chỉnh số lượng tồn thực tế tại kệ
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRestockModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmAdjust} className="mt-4 space-y-4 text-xs">
              {/* Product preview */}
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-surface-2">
                <img
                  src={selectedStockItem.imageUrl}
                  alt={selectedStockItem.name}
                  className="h-12 w-12 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700 shrink-0"
                />
                <div className="space-y-0.5">
                  <p className="font-bold text-slate-900 dark:text-slate-100">
                    {selectedStockItem.name}
                  </p>
                  <p className="font-mono text-slate-500">
                    SKU: {selectedStockItem.sku} · {selectedStockItem.location}
                  </p>
                  <p className="text-blue-600 dark:text-blue-400 font-semibold">
                    Tồn kho hiện tại: <strong>{selectedStockItem.currentStock} chiếc</strong>
                  </p>
                </div>
              </div>

              {/* Adjust mode toggle */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Phương thức điều chỉnh
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('add')}
                    className={`rounded-xl border p-2.5 font-bold transition-all cursor-pointer ${
                      adjustType === 'add'
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    + Nhập thêm số lượng
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('set')}
                    className={`rounded-xl border p-2.5 font-bold transition-all cursor-pointer ${
                      adjustType === 'set'
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    Đặt lại số lượng chính xác
                  </button>
                </div>
              </div>

              {/* Quick increment buttons */}
              {adjustType === 'add' && (
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Chọn nhanh số lượng nhập:
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[5, 10, 20, 50, 100].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setAdjustAmount(num)}
                        className={`rounded-lg px-2.5 py-1 font-bold text-xs cursor-pointer transition-colors ${
                          adjustAmount === num
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        +{num}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Amount input */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  {adjustType === 'add' ? 'Số lượng nhập thêm vào kệ' : 'Số lượng tồn kho mới'}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustAmount(Math.max(1, adjustAmount - 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    required
                    min={0}
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(Math.max(0, parseInt(e.target.value) || 0))}
                    className="h-10 flex-1 rounded-xl border border-slate-300 font-mono text-center font-bold text-base px-3 text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setAdjustAmount(adjustAmount + 1)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  {adjustType === 'add'
                    ? `Dự kiến sau khi nhập: ${selectedStockItem.currentStock + adjustAmount} chiếc`
                    : `Dự kiến sau khi đặt: ${adjustAmount} chiếc`}
                </p>
              </div>

              {/* Note */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Lý do / Ghi chú kiểm kho
                </label>
                <input
                  type="text"
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  placeholder="Ví dụ: Nhập bổ sung lô hàng mới từ xưởng may..."
                  className="h-9 w-full rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-surface-2 dark:text-slate-100"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setRestockModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-700 cursor-pointer shadow-xs"
                >
                  <Check className="h-4 w-4" />
                  <span>Xác nhận cập nhật</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: CHI TIẾT VỊ TRÍ LƯU KHO & THÔNG SỐ SẢN PHẨM     */}
      {/* ========================================================= */}
      {detailModalOpen && detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-surface-1">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <Eye className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Chi tiết vị trí & Tồn kho
                  </h3>
                  <p className="text-xs text-slate-500">
                    Thông số lưu trữ chi tiết của mặt hàng trong kho
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div className="flex items-start gap-3.5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-surface-2">
                <img
                  src={detailItem.imageUrl}
                  alt={detailItem.name}
                  className="h-16 w-16 rounded-xl object-cover ring-2 ring-slate-200 dark:ring-slate-700 shrink-0"
                />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {detailItem.name}
                  </h4>
                  <div className="flex items-center gap-2 font-mono text-slate-500 text-[11px]">
                    <span className="font-bold text-blue-600 dark:text-blue-400">SKU: {detailItem.sku}</span>
                    <span>·</span>
                    <span>Mã vạch: {detailItem.upc}</span>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                      Kho chung
                    </span>
                    <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                      {detailItem.rack}
                    </span>
                    <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                      {detailItem.bin}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stock stats grid */}
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="rounded-xl border border-slate-200 p-3 bg-white dark:border-slate-800 dark:bg-surface-2">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Tồn ban đầu</span>
                  <strong className="text-base font-bold font-mono text-slate-800 dark:text-slate-200 mt-0.5 block">
                    {detailItem.initialStock} chiếc
                  </strong>
                </div>
                <div className="rounded-xl border border-purple-200 p-3 bg-purple-50/50 dark:border-purple-900/40 dark:bg-purple-950/20">
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 block uppercase font-bold">Đã xuất kho</span>
                  <strong className="text-base font-bold font-mono text-purple-700 dark:text-purple-300 mt-0.5 block">
                    {detailItem.pickedQuantity} chiếc
                  </strong>
                </div>
                <div className="rounded-xl border border-emerald-200 p-3 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block uppercase font-bold">Tồn hiện tại</span>
                  <strong className="text-base font-bold font-mono text-emerald-700 dark:text-emerald-300 mt-0.5 block">
                    {detailItem.currentStock} chiếc
                  </strong>
                </div>
              </div>

              {/* Location path breakdown */}
              <div className="rounded-xl border border-slate-200 p-3.5 space-y-2 dark:border-slate-800">
                <span className="font-bold text-slate-700 dark:text-slate-300 block">
                  Đường dẫn lấy hàng tại kho (Picking Route):
                </span>
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700 font-bold dark:bg-blue-950/50 dark:text-blue-300">
                    Kho tổng
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700 font-bold dark:bg-slate-800 dark:text-slate-300">
                    {detailItem.rack}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-700 font-bold dark:bg-slate-800 dark:text-slate-300">
                    {detailItem.bin}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Định vị chính xác ngăn kệ giúp nhân viên tối ưu quãng đường di chuyển và nhặt hàng theo thuật toán gom đơn.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setDetailModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300 cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDetailModalOpen(false)
                    handleOpenRestockModal(detailItem)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700 cursor-pointer shadow-xs"
                >
                  <Plus className="h-4 w-4" />
                  <span>Nhập thêm vào kệ này</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
export default WarehouseInventoryPage
