import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCheck,
  Clock,
  Menu,
  Package,
  Zap,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/use-auth'
import { usePortal } from '../../context/use-portal'
import { useNotifications } from '../../hooks/useNotifications'
import { resolveNotificationPath } from '../../lib/notification-nav'
import { UserRole } from '../../types/auth'
import {
  formatNotificationTimeAgo,
  NOTIFICATION_TYPE_LABELS,
  type AppNotification,
  type NotificationType,
} from '../../types/notifications'

type PortalTopBarProps = {
  breadcrumbs: Array<{ label: string; to?: string }>
  variant?: 'ops' | 'admin'
}

type NotifTab = 'all' | 'critical' | 'ops'

function typeLabel(type: string, vi: boolean): string {
  const known = NOTIFICATION_TYPE_LABELS[type as NotificationType]
  if (known) return vi ? known.vi : known.en
  return type
}

function isCriticalTab(n: AppNotification): boolean {
  return (
    n.severity === 'critical' ||
    n.type === 'cancel_confirmation_required' ||
    n.type === 'sla_breach' ||
    n.type === 'missing_item'
  )
}

function isOpsTab(n: AppNotification): boolean {
  return (
    n.type === 'sla_warning' ||
    n.type === 'pending_approval' ||
    n.type === 'abnormal_package' ||
    n.type === 'sync_failed' ||
    n.type === 'connection_lost'
  )
}

function NotifIcon({ type }: { type: string }) {
  if (type === 'cancel_confirmation_required') {
    return <AlertTriangle className="h-3.5 w-3.5" />
  }
  if (type === 'sla_warning' || type === 'sla_breach') {
    return <Zap className="h-3.5 w-3.5 fill-amber-500" />
  }
  if (type === 'pending_approval' || type === 'abnormal_package') {
    return <Package className="h-3.5 w-3.5" />
  }
  return <Bell className="h-3.5 w-3.5" />
}

export function PortalTopBar({
  breadcrumbs,
  variant = 'ops',
}: PortalTopBarProps) {
  const { setMobileNavOpen, locale } = usePortal()
  const { session } = useAuth()
  const isAdminVariant = variant === 'admin'
  const navigate = useNavigate()
  const vi = locale === 'vi'

  // Chuông API cho mọi role đã login (Owner/staff nhận BE mới).
  // Không đụng luồng Admin OAuth / marketplace connect.
  const notifEnabled = Boolean(session)
  const {
    items,
    unreadCount,
    loading,
    error,
    refreshList,
    markRead,
    markAllRead,
  } = useNotifications(notifEnabled)

  const [notifOpen, setNotifOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<NotifTab>('all')
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!notifOpen) return
    void refreshList()
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [notifOpen, refreshList])

  const filteredNotifs = useMemo(() => {
    if (activeTab === 'critical') return items.filter(isCriticalTab)
    if (activeTab === 'ops') return items.filter(isOpsTab)
    return items
  }, [activeTab, items])

  const criticalCount = items.filter(isCriticalTab).length
  const opsCount = items.filter(isOpsTab).length

  const handleOpenNotification = (notif: AppNotification) => {
    void markRead(notif.id)
    setNotifOpen(false)
    navigate(resolveNotificationPath(notif, session?.role))
  }

  const subtitle =
    session?.role === UserRole.STORE_OWNER
      ? vi
        ? 'Hủy cần xác nhận · đồng bộ sàn · thiếu hàng'
        : 'Cancel confirm · sync · missing stock'
      : vi
        ? 'SLA · duyệt đóng gói · cảnh báo kho'
        : 'SLA · packing approval · warehouse alerts'

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
        {isAdminVariant ? (
          <span className="hidden items-center gap-1.5 rounded-full border border-success/20 bg-success-bg px-2.5 py-1 text-[11px] font-medium text-success md:inline-flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            Hệ thống ổn định
          </span>
        ) : null}

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
            title={vi ? 'Thông báo' : 'Notifications'}
          >
            <Bell className="h-4 w-4" strokeWidth={1.75} />
            {unreadCount > 0 ? (
              <span className="absolute -top-1 -right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-xs ring-2 ring-white dark:ring-surface-1 animate-pulse">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </button>

          {notifOpen ? (
            <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl animate-in fade-in zoom-in-95 duration-150 sm:w-96 dark:border-slate-800 dark:bg-surface-1">
              <div className="border-b border-slate-100 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-surface-2/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                      <Bell className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {vi ? 'Thông báo' : 'Notifications'}
                      </h3>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {subtitle}
                      </p>
                    </div>
                  </div>
                  {unreadCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        void markAllRead()
                      }}
                      className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      <CheckCheck className="h-3 w-3" />
                      {vi ? 'Đọc tất cả' : 'Mark all'}
                    </button>
                  ) : null}
                </div>

                <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-slate-200/60 p-1 text-[11px] font-medium dark:bg-slate-800">
                  {(
                    [
                      ['all', vi ? `Tất cả (${items.length})` : `All (${items.length})`],
                      [
                        'critical',
                        vi
                          ? `Khẩn (${criticalCount})`
                          : `Urgent (${criticalCount})`,
                      ],
                      [
                        'ops',
                        vi ? `Vận hành (${opsCount})` : `Ops (${opsCount})`,
                      ],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveTab(key)}
                      className={`flex-1 cursor-pointer rounded-md py-1 text-center transition-colors ${
                        activeTab === key
                          ? 'bg-white font-semibold text-slate-900 shadow-xs dark:bg-surface-1 dark:text-slate-100'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="max-h-[340px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                {loading && items.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    {vi ? 'Đang tải…' : 'Loading…'}
                  </div>
                ) : error && items.length === 0 ? (
                  <div className="p-8 text-center text-xs text-rose-500">
                    {error}
                  </div>
                ) : filteredNotifs.length > 0 ? (
                  filteredNotifs.map((n) => {
                    const urgent = isCriticalTab(n)
                    return (
                      <div
                        key={n.id}
                        onClick={() => handleOpenNotification(n)}
                        className={`cursor-pointer p-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                          !n.isRead
                            ? urgent
                              ? 'bg-rose-50/40 dark:bg-rose-950/10'
                              : 'bg-amber-50/40 dark:bg-amber-950/10'
                            : ''
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                              urgent
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}
                          >
                            <NotifIcon type={n.type} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span
                                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  urgent
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
                                }`}
                              >
                                {typeLabel(n.type, vi).toUpperCase()}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {formatNotificationTimeAgo(n.createdAt, locale)}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs font-medium leading-snug text-slate-800 dark:text-slate-200">
                              {n.title || n.message}
                            </p>
                            {n.message && n.title ? (
                              <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
                                {n.message}
                              </p>
                            ) : null}
                            <div className="mt-1.5 flex items-center justify-between text-[10.5px]">
                              <span className="flex items-center gap-1 font-semibold text-slate-500">
                                <Clock className="h-3 w-3" />
                                {n.severity}
                              </span>
                              <span className="inline-flex items-center gap-0.5 font-semibold text-blue-600 hover:underline dark:text-blue-400">
                                {vi ? 'Xem' : 'Open'}
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
                    {vi
                      ? 'Không có thông báo nào trong mục này.'
                      : 'No notifications in this tab.'}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 bg-slate-50 p-2.5 text-center text-[10px] text-slate-500 dark:border-slate-800 dark:bg-surface-2/30 dark:text-slate-400">
                {vi
                  ? 'Tự làm mới mỗi 45 giây · đánh dấu đã đọc khi mở.'
                  : 'Refreshes every 45s · marks read on open.'}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
