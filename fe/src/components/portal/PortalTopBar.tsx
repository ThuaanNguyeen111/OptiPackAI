import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCheck,
  Clock,
  Menu,
  Zap,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { usePortal } from '../../context/use-portal'
import {
  DEFAULT_STAFF_NOTIFICATIONS,
  type StaffNotificationItem,
} from '../../data/picking-batches-mock'

type PortalTopBarProps = {
  breadcrumbs: Array<{ label: string; to?: string }>
  variant?: 'ops' | 'admin'
}

export function PortalTopBar({
  breadcrumbs,
  variant = 'ops',
}: PortalTopBarProps) {
  const { setMobileNavOpen } = usePortal()
  const isAdmin = variant === 'admin'
  const navigate = useNavigate()

  // Notification state for express and delayed packing orders
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications] = useState<StaffNotificationItem[]>(
    DEFAULT_STAFF_NOTIFICATIONS,
  )
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<
    'all' | 'express' | 'delayed_packing'
  >('all')
  const notifRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!notifOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [notifOpen])

  const handleMarkAllRead = () => {
    setReadIds(new Set(notifications.map((n) => n.id)))
  }

  const handleOpenNotification = (notif: StaffNotificationItem) => {
    setReadIds((prev) => new Set([...prev, notif.id]))
    setNotifOpen(false)
    navigate(`/app/warehouse?batchId=${notif.batchId}&action=start`)
  }

  const filteredNotifs = notifications.filter((n) => {
    if (activeTab === 'all') return true
    return n.type === activeTab
  })

  return (
    <header className="relative flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-canvas px-4 sm:px-6">
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-md border border-hairline text-ink-subtle lg:hidden"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Mở menu"
      >
        <Menu className="h-4 w-4" />
      </button>

      <nav className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.label} className="flex items-center gap-1.5">
            {i > 0 ? <span className="text-ink-tertiary">/</span> : null}
            {crumb.to ? (
              <Link to={crumb.to} className="text-ink-subtle hover:text-ink">
                {crumb.label}
              </Link>
            ) : (
              <span className="font-medium text-ink">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {isAdmin ? (
          <span className="hidden items-center gap-1.5 rounded-full border border-success/20 bg-success-bg px-2.5 py-1 text-[11px] font-medium text-success md:inline-flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            Hệ thống ổn định
          </span>
        ) : null}

        {/* Staff Notification Center (Noti cho đơn hỏa tốc và trễ đóng gói) */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            className={`relative flex h-9 w-9 items-center justify-center rounded-md border transition-colors cursor-pointer ${
              notifOpen
                ? 'border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                : 'border-hairline bg-surface-1 text-ink-subtle hover:bg-surface-2 hover:text-ink'
            }`}
            aria-label="Thông báo"
            title="Thông báo đơn hỏa tốc & trễ đóng gói"
          >
            <Bell className="h-4 w-4" strokeWidth={1.75} />
            {unreadCount > 0 ? (
              <span className="absolute -top-1 -right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-xs ring-2 ring-white dark:ring-surface-1 animate-pulse">
                {unreadCount}
              </span>
            ) : null}
          </button>

          {/* Dropdown panel */}
          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl z-50 dark:border-slate-800 dark:bg-surface-1 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="border-b border-slate-100 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-surface-2/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                      <Bell className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="font-semibold text-slate-900 text-xs dark:text-slate-100">
                        Thông báo điều phối nhân viên
                      </h3>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Ưu tiên đơn hỏa tốc (SLA 4h) & đơn trễ đóng gói
                      </p>
                    </div>
                  </div>
                  {unreadCount > 0 ? (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                    >
                      <CheckCheck className="h-3 w-3" />
                      Đọc tất cả
                    </button>
                  ) : null}
                </div>

                {/* Filter Tabs */}
                <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-slate-200/60 p-1 text-[11px] font-medium dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    className={`flex-1 rounded-md py-1 text-center transition-colors cursor-pointer ${
                      activeTab === 'all'
                        ? 'bg-white text-slate-900 font-semibold shadow-xs dark:bg-surface-1 dark:text-slate-100'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    Tất cả ({notifications.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('express')}
                    className={`flex-1 rounded-md py-1 text-center transition-colors cursor-pointer ${
                      activeTab === 'express'
                        ? 'bg-white text-amber-700 font-semibold shadow-xs dark:bg-surface-1 dark:text-amber-400'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    ⚡ Hỏa tốc (2)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('delayed_packing')}
                    className={`flex-1 rounded-md py-1 text-center transition-colors cursor-pointer ${
                      activeTab === 'delayed_packing'
                        ? 'bg-white text-rose-700 font-semibold shadow-xs dark:bg-surface-1 dark:text-rose-400'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    ⚠️ Trễ đóng gói (1)
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="max-h-[340px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                {filteredNotifs.length > 0 ? (
                  filteredNotifs.map((n) => {
                    const isRead = readIds.has(n.id)
                    const isExpress = n.type === 'express'

                    return (
                      <div
                        key={n.id}
                        onClick={() => handleOpenNotification(n)}
                        className={`p-3.5 transition-colors cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                          !isRead
                            ? isExpress
                              ? 'bg-amber-50/40 dark:bg-amber-950/10'
                              : 'bg-rose-50/40 dark:bg-rose-950/10'
                            : ''
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg mt-0.5 ${
                              isExpress
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                            }`}
                          >
                            {isExpress ? (
                              <Zap className="h-3.5 w-3.5 fill-amber-500" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5" />
                            )}
                          </span>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span
                                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  isExpress
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
                                    : 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200'
                                }`}
                              >
                                {isExpress
                                  ? '⚡ ĐƠN HỎA TỐC'
                                  : '⚠️ TRỄ ĐÓNG GÓI'}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {n.timeAgo}
                              </span>
                            </div>

                            <p className="mt-1 text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-2 leading-snug">
                              {n.message}
                            </p>

                            <div className="mt-1.5 flex items-center justify-between text-[10.5px]">
                              <span
                                className={`font-semibold flex items-center gap-1 ${
                                  isExpress
                                    ? 'text-amber-700 dark:text-amber-300'
                                    : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                <Clock className="h-3 w-3" />
                                {n.deadlineInfo}
                              </span>
                              <span className="inline-flex items-center gap-0.5 text-blue-600 font-semibold hover:underline dark:text-blue-400">
                                Xử lý ngay
                                <ArrowRight className="h-2.5 w-2.5" />
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="p-8 text-center text-xs text-slate-400">
                    Không có thông báo nào trong mục này.
                  </div>
                )}
              </div>

              {/* Policy Footer */}
              <div className="border-t border-slate-100 bg-slate-50 p-2.5 text-[10px] text-slate-500 dark:border-slate-800 dark:bg-surface-2/30 dark:text-slate-400">
                <p className="leading-tight text-center">
                  💡 <strong>Quy định kho:</strong> Đơn hỏa tốc hoàn thành trong{' '}
                  <strong>4 tiếng</strong> (tiếp nhận trong giờ hành chính 08:00
                  - 17:30). Đơn trễ đóng gói cần xử lý khẩn cấp.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
