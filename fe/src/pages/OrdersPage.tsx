import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  ChevronDown,
  RotateCcw,
  Search,
} from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { BatchDetailDrawer } from '../components/orders/BatchDetailDrawer'
import { usePortal } from '../context/use-portal'
import {
  initialPickingBatches,
  type BatchChannel,
  type PickingBatch,
  type PickingPriority,
  type PickingStatus,
} from '../data/picking-batches-mock'

export function OrdersPage() {
  const navigate = useNavigate()
  const { locale } = usePortal()
  const vi = locale === 'vi'

  // Batches state
  const [batches, setBatches] = useState<PickingBatch[]>(() =>
    structuredClone(initialPickingBatches),
  )

  // Filter states matching the screenshot controls
  const [searchTerm, setSearchTerm] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [zoneFilter, setZoneFilter] = useState<string>('all')
  const [staffFilter, setStaffFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Pagination state (Page 1 shows 7, Page 2 shows 8, Page 3 shows 9)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 7 // matching screenshot page 1: 7 rows

  // Detail drawer
  const [selectedBatch, setSelectedBatch] = useState<PickingBatch | null>(null)

  // Unique staff list for dropdown
  const staffList = useMemo(() => {
    const names = Array.from(new Set(initialPickingBatches.map((b) => b.picker.name)))
    return names.sort()
  }, [])

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

      // Priority filter
      if (priorityFilter !== 'all' && batch.priority !== priorityFilter) {
        return false
      }

      // Zone filter
      if (zoneFilter !== 'all' && batch.zone !== zoneFilter) {
        return false
      }

      // Staff filter
      if (staffFilter !== 'all' && batch.picker.name !== staffFilter) {
        return false
      }

      // Status filter
      if (statusFilter !== 'all' && batch.status !== statusFilter) {
        return false
      }

      return true
    })
  }, [batches, searchTerm, priorityFilter, zoneFilter, staffFilter, statusFilter])

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
    setPriorityFilter('all')
    setZoneFilter('all')
    setStaffFilter('all')
    setStatusFilter('all')
    setCurrentPage(1)
  }

  // Start picking action
  const handleStartPicking = (batchId: string) => {
    setBatches((prev) =>
      prev.map((b) =>
        b.id === batchId
          ? {
              ...b,
              status: 'Picking',
              progress: {
                picked: Math.max(1, Math.floor(b.progress.total * 0.25)),
                total: b.progress.total,
              },
            }
          : b,
      ),
    )
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
    setBatches((prev) =>
      prev.map((b) =>
        b.id === batchId
          ? {
              ...b,
              status: 'Picked',
              progress: { picked: b.progress.total, total: b.progress.total },
            }
          : b,
      ),
    )
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

  // Priority badge component
  const renderPriorityBadge = (priority: PickingPriority) => {
    switch (priority) {
      case 'Urgent':
        return (
          <span className="inline-flex items-center rounded bg-[#fee2e2] px-2.5 py-0.5 text-xs font-semibold text-[#ef4444] dark:bg-red-950/30 dark:text-red-400">
            Urgent
          </span>
        )
      case 'High':
        return (
          <span className="inline-flex items-center rounded bg-[#fef3c7] px-2.5 py-0.5 text-xs font-semibold text-[#b45309] dark:bg-amber-950/30 dark:text-amber-400">
            High
          </span>
        )
      case 'Normal':
        return (
          <span className="inline-flex items-center rounded bg-[#f1f5f9] px-2.5 py-0.5 text-xs font-semibold text-[#64748b] dark:bg-slate-800 dark:text-slate-300">
            Normal
          </span>
        )
    }
  }

  // Status badge component
  const renderStatusBadge = (status: PickingStatus) => {
    switch (status) {
      case 'Picked':
        return (
          <span className="inline-flex items-center rounded-full bg-[#dcfce7] px-3 py-1 text-xs font-medium text-[#15803d] dark:bg-emerald-950/30 dark:text-emerald-400">
            Picked
          </span>
        )
      case 'Picking':
        return (
          <span className="inline-flex items-center rounded-full bg-[#dbeafe] px-3 py-1 text-xs font-medium text-[#1d4ed8] dark:bg-blue-950/30 dark:text-blue-400">
            Picking
          </span>
        )
      case 'Pending':
        return (
          <span className="inline-flex items-center rounded-full bg-[#fef9c3] px-3 py-1 text-xs font-medium text-[#a16207] dark:bg-amber-950/30 dark:text-amber-400">
            Pending
          </span>
        )
      case 'Delayed':
        return (
          <span className="inline-flex items-center rounded-full bg-[#fee2e2] px-3 py-1 text-xs font-medium text-[#b91c1c] dark:bg-rose-950/30 dark:text-rose-400">
            Delayed
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
          {/* Top Filter Bar */}
          <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-surface-1">
            {/* Search Input */}
            <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
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
                <option value="all">Priority: All Priorities</option>
                <option value="Urgent">Priority: Urgent</option>
                <option value="High">Priority: High</option>
                <option value="Normal">Priority: Normal</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>

            {/* Dropdown 2: Zone */}
            <div className="relative">
              <select
                value={zoneFilter}
                onChange={(e) => {
                  setZoneFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="h-9.5 cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-normal text-slate-700 transition-colors hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300"
              >
                <option value="all">Zone: All Zones</option>
                <option value="Zone A">Zone: Zone A</option>
                <option value="Zone B">Zone: Zone B</option>
                <option value="Zone C">Zone: Zone C</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>

            {/* Dropdown 3: Staff */}
            <div className="relative">
              <select
                value={staffFilter}
                onChange={(e) => {
                  setStaffFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="h-9.5 cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-normal text-slate-700 transition-colors hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300"
              >
                <option value="all">Staff: All Staff</option>
                {staffList.map((name) => (
                  <option key={name} value={name}>
                    Staff: {name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>

            {/* Dropdown 4: Status */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="h-9.5 cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-xs font-normal text-slate-700 transition-colors hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-surface-2 dark:text-slate-300"
              >
                <option value="all">Status: All Status</option>
                <option value="Picked">Status: Picked</option>
                <option value="Picking">Status: Picking</option>
                <option value="Pending">Status: Pending</option>
                <option value="Delayed">Status: Delayed</option>
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

          {/* Main Data Table Card */}
          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-surface-1">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-xs">
                {/* Table Header */}
                <thead>
                  <tr className="border-b border-slate-200 bg-white text-[11px] font-semibold text-slate-500 uppercase tracking-wider dark:border-slate-800 dark:bg-surface-1 dark:text-slate-400">
                    <th className="px-5 py-3.5">BATCH ID</th>
                    <th className="px-4 py-3.5">ITEMS / SKUS</th>
                    <th className="px-4 py-3.5">SOURCE CHANNELS</th>
                    <th className="px-4 py-3.5">PRIORITY</th>
                    <th className="px-4 py-3.5">ASSIGNED PICKER</th>
                    <th className="px-4 py-3.5">PROGRESS</th>
                    <th className="px-4 py-3.5">STATUS</th>
                    <th className="px-5 py-3.5 text-right">ACTIONS</th>
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
                          {/* 1. BATCH ID */}
                          <td className="px-5 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Box className="h-4 w-4 text-slate-500 shrink-0" strokeWidth={1.75} />
                              <button
                                type="button"
                                onClick={() => navigate(`/app/warehouse?batchId=${batch.id}&action=detail`)}
                                className="font-medium text-[#2563eb] hover:text-[#1d4ed8] hover:underline cursor-pointer transition-colors"
                              >
                                {batch.id}
                              </button>
                            </div>
                          </td>

                          {/* 2. ITEMS / SKUS */}
                          <td className="px-4 py-4 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">
                            {batch.itemsCount} items / {batch.skusCount} SKUs
                          </td>

                          {/* 3. SOURCE CHANNELS */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {batch.channels.map((ch) => renderChannelBadge(ch))}
                            </div>
                          </td>

                          {/* 4. PRIORITY */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            {renderPriorityBadge(batch.priority)}
                          </td>

                          {/* 5. ASSIGNED PICKER */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <img
                                src={batch.picker.avatar}
                                alt={batch.picker.name}
                                className="h-6 w-6 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                                onError={(e) => {
                                  // Fallback to initials circle if image fails to load
                                  e.currentTarget.style.display = 'none'
                                  const fallback = e.currentTarget.nextElementSibling
                                  if (fallback) fallback.classList.remove('hidden')
                                }}
                              />
                              <span className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                                {batch.picker.initials}
                              </span>
                              <span className="font-medium text-slate-800 dark:text-slate-200">
                                {batch.picker.name}
                              </span>
                            </div>
                          </td>

                          {/* 6. PROGRESS */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="w-36 space-y-1.5">
                              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                                <span>
                                  {batch.progress.picked}/{batch.progress.total} items
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

                          {/* 7. STATUS */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            {renderStatusBadge(batch.status)}
                          </td>

                          {/* 8. ACTIONS */}
                          <td className="px-5 py-4 text-right whitespace-nowrap">
                            {batch.status === 'Pending' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  handleStartPicking(batch.id)
                                  navigate(`/app/warehouse?batchId=${batch.id}&action=start`)
                                }}
                                className="inline-flex items-center justify-center rounded-md bg-[#2563eb] px-3.5 py-1.5 text-xs font-medium text-white shadow-xs transition-colors hover:bg-[#1d4ed8] cursor-pointer"
                              >
                                {vi ? 'Bắt đầu lấy hàng' : 'Start Picking'}
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
                  Previous
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
                  Next
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
        locale={locale}
      />
    </>
  )
}
