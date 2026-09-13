import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDown,
  Clock,
  FileText,
  GripVertical,
  TrendingUp,
} from 'lucide-react'
import { PortalTopBar } from '../components/portal/PortalTopBar'
import { usePortal } from '../context/use-portal'
import {
  DASHBOARD_KANBAN_COLUMNS,
  type DashboardChannel,
  type DashboardKanbanColumn,
  type DashboardKanbanItem,
} from '../data/dashboard-mock'

/** Channel Pill Badge */
function ChannelBadge({ channel }: { channel: DashboardChannel }) {
  if (channel === 'Shopee') {
    return (
      <span className="rounded-md border border-[#fed7aa] bg-[#fff7ed] px-2 py-0.5 text-[11px] font-bold text-[#ea580c] dark:border-orange-900/40 dark:bg-orange-950/30 dark:text-orange-400 select-none">
        Shopee
      </span>
    )
  }
  if (channel === 'TikTok Shop') {
    return (
      <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 select-none">
        TikTok Shop
      </span>
    )
  }
  return (
    <span className="rounded-md border border-[#bfdbfe] bg-[#eff6ff] px-2 py-0.5 text-[11px] font-bold text-[#2563eb] dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-400 select-none">
      Lazada
    </span>
  )
}

/** Individual Order Card in Kanban Column */
function KanbanOrderCard({
  item,
  vi,
  onClick,
}: {
  item: DashboardKanbanItem
  vi: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className="group rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs transition-all hover:border-blue-300 hover:shadow-xs dark:border-slate-800 dark:bg-surface-1 dark:hover:border-slate-700 cursor-pointer"
      title={vi ? `Xem chi tiết đơn #${item.id}` : `View details for #${item.id}`}
    >
      {/* Top row: Drag Grip + Order Code + Channel Pill */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <GripVertical className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 dark:text-slate-500 shrink-0" />
          <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
            #{item.id}
          </span>
        </div>
        <ChannelBadge channel={item.channel} />
      </div>

      {/* Middle row: Items count + Optional SLA Warning */}
      <div className="mt-2 flex items-center justify-between gap-1 text-xs">
        <span className="text-slate-500 dark:text-slate-400">
          {item.itemsCount} {vi ? 'mặt hàng' : 'items'}
        </span>

        {item.slaWarning && (
          <span className="inline-flex items-center gap-1 rounded bg-[#fef2f2] px-1.5 py-0.5 text-[10px] font-bold text-[#dc2626] border border-[#fecaca] dark:bg-rose-950/30 dark:border-rose-900/40 dark:text-rose-400 select-none">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>{item.slaWarning}</span>
          </span>
        )}
      </div>

      {/* Bottom row: Time ago + Optional Picker Staff */}
      <div className="mt-2.5 flex items-center justify-between gap-2 pt-1 border-t border-slate-50 dark:border-slate-800/60">
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          {vi ? item.timeAgoVi : item.timeAgoEn}
        </span>

        {item.pickerStaff && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="text-[10px]">{vi ? 'Nhân viên lấy hàng:' : 'Picker:'}</span>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 font-mono text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              {item.pickerStaff}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/** Kanban Column Component */
function KanbanColumn({
  col,
  vi,
  onNavigate,
}: {
  col: DashboardKanbanColumn
  vi: boolean
  onNavigate: (route: string) => void
}) {
  // Border vertical bar color
  const barColorClass =
    col.color === 'blue'
      ? 'bg-blue-600'
      : col.color === 'amber'
        ? 'bg-amber-500'
        : col.color === 'emerald'
          ? 'bg-emerald-600'
          : 'bg-slate-700 dark:bg-slate-300'

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/90 bg-[#f8fafc]/90 p-3 sm:p-3.5 shadow-2xs dark:border-slate-800 dark:bg-surface-1/60">
      {/* Column Header */}
      <div className="flex items-center justify-between gap-2 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-4 w-1 rounded-full shrink-0 ${barColorClass}`} />
          <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate">
            {vi ? col.titleVi : col.titleEn}
          </h3>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300 shrink-0">
          {col.count}
        </span>
      </div>

      {/* Cards List */}
      <div className="space-y-2.5 flex-1 py-1">
        {col.items.map((item) => (
          <KanbanOrderCard
            key={item.id}
            item={item}
            vi={vi}
            onClick={() => onNavigate(col.route)}
          />
        ))}
      </div>

      {/* Footer "More orders" link */}
      {col.moreCount ? (
        <button
          type="button"
          onClick={() => onNavigate(col.route)}
          className="mt-2 text-center text-xs font-medium text-blue-600 hover:text-blue-700 py-1 transition-colors cursor-pointer dark:text-blue-400 dark:hover:text-blue-300"
        >
          {vi ? `+ ${col.moreCount} đơn hàng khác` : `+ ${col.moreCount} more orders`}
        </button>
      ) : (
        <div className="h-5" />
      )}
    </div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { locale } = usePortal()
  const vi = locale === 'vi'

  const [columns] = useState<DashboardKanbanColumn[]>(DASHBOARD_KANBAN_COLUMNS)

  const handleNavigate = (route: string) => {
    navigate(route)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950">
      {/* Top Breadcrumb Navigation */}
      <PortalTopBar
        breadcrumbs={[
          { label: 'OptiPackAI', to: '/app' },
          { label: vi ? 'Tổng quan' : 'Dashboard Overview' },
        ]}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* ========================================================= */}
          {/* 1. TOP 4-COLUMN KANBAN BOARD MATCHING SCREENSHOT EXACTLY  */}
          {/* ========================================================= */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 items-start">
            {columns.map((col) => (
              <KanbanColumn
                key={col.id}
                col={col}
                vi={vi}
                onNavigate={handleNavigate}
              />
            ))}
          </div>

          {/* ========================================================= */}
          {/* 2. BOTTOM SECTION: CHỈ SỐ XỬ LÝ TRỰC TIẾP (LIVE METRICS)  */}
          {/* ========================================================= */}
          <section className="space-y-3 pt-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {vi ? 'Chỉ số xử lý trực tiếp' : 'Live Processing Metrics'}
            </h2>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {/* Card 1: Thời gian lấy hàng trung bình */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-surface-1">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {vi ? 'Thời gian lấy hàng trung bình' : 'Avg. Picking Time'}
                  </span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                    <Clock className="h-4 w-4" />
                  </div>
                </div>

                <div className="mt-3">
                  <p className="font-mono text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                    4m 32s
                  </p>
                  <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <ArrowDown className="h-3.5 w-3.5 stroke-[2.5]" />
                    <span>{vi ? '-12% so với hôm qua' : '-12% vs yesterday'}</span>
                  </p>
                </div>
              </div>

              {/* Card 2: Chi phí đóng gói tiết kiệm nhờ AI */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-surface-1">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {vi ? 'Chi phí đóng gói tiết kiệm nhờ AI' : 'AI Packaging Cost Savings'}
                  </span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                    <FileText className="h-4 w-4" />
                  </div>
                </div>

                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <p className="font-mono text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                      $1,284
                    </p>
                    <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                      {vi ? 'Tổng tiết kiệm tuần này' : 'Total saved this week'}
                    </p>
                  </div>

                  {/* Rising Green Sparkline matching screenshot */}
                  <div className="pb-1">
                    <svg
                      className="h-9 w-24 text-emerald-500 dark:text-emerald-400 overflow-visible"
                      viewBox="0 0 80 30"
                      fill="none"
                    >
                      <path
                        d="M 2 26 L 16 23 L 28 20 L 40 22 L 52 14 L 66 12 L 78 4"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Card 3: Tỷ lệ hoàn thành xử lý hàng ngày */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-surface-1">
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {vi ? 'Tỷ lệ hoàn thành xử lý hàng ngày' : 'Daily Completion Rate'}
                  </span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                </div>

                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <p className="font-mono text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                      94.7%
                    </p>
                    <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                      {vi ? 'Ngưỡng SLA mục tiêu: 92%' : 'Target SLA threshold: 92%'}
                    </p>
                  </div>

                  {/* Circular Progress Donut Ring (94%) matching screenshot */}
                  <div className="relative flex h-12 w-12 items-center justify-center">
                    <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                      <circle
                        cx="18"
                        cy="18"
                        r="15"
                        fill="none"
                        className="stroke-emerald-100 dark:stroke-emerald-950/60"
                        strokeWidth="3.2"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="15"
                        fill="none"
                        className="stroke-emerald-600 dark:stroke-emerald-400"
                        strokeWidth="3.2"
                        strokeDasharray="94.25"
                        strokeDashoffset="5.6"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute font-mono text-[10.5px] font-bold text-slate-800 dark:text-slate-200">
                      94%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
