import { NavLink, Link, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Box,
  Boxes,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
  Truck,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { PLATFORM_META } from '../../context/portal-context-value'
import { usePortal } from '../../context/use-portal'
import { useAuth } from '../../context/use-auth'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useTheme } from '../../hooks/useTheme'
import { canSeeNavItem } from '../../lib/rbac'
import { USER_ROLE_LABELS, UserRole } from '../../types/auth'

type NavSection = 'overview' | 'logistics' | 'analytics' | 'system'

const navItems = [
  {
    to: '/app',
    end: true,
    labelVi: 'Tổng quan',
    labelEn: 'Dashboard Overview',
    icon: LayoutDashboard,
    section: 'overview' as NavSection,
  },
  {
    to: '/app/orders',
    end: false,
    labelVi: 'Đơn đa kênh',
    labelEn: 'Omnichannel Orders',
    icon: Package,
    section: 'logistics' as NavSection,
  },
  {
    to: '/app/packing',
    end: false,
    labelVi: 'AI 3D Packing',
    labelEn: 'AI 3D Packing Engine',
    icon: Boxes,
    section: 'logistics' as NavSection,
  },
  {
    to: '/app/shipping',
    end: false,
    labelVi: 'Vận chuyển',
    labelEn: 'Shipping & Fulfillment',
    icon: Truck,
    section: 'logistics' as NavSection,
  },
  {
    to: '/app/packaging-rules',
    end: false,
    labelVi: 'Quy tắc Bao bì',
    labelEn: 'Packaging Rules',
    icon: Box,
    section: 'logistics' as NavSection,
  },
  {
    to: '/app/analytics',
    end: false,
    labelVi: 'Báo cáo & Xuất file',
    labelEn: 'Analytics & Export',
    icon: BarChart3,
    section: 'analytics' as NavSection,
  },
  {
    to: '/app/profile',
    end: false,
    labelVi: 'Hồ sơ & Cài đặt',
    labelEn: 'Profile & Settings',
    icon: Settings,
    section: 'system' as NavSection,
  },
]

const sectionLabels: Record<
  NavSection,
  { vi: string; en: string } | null
> = {
  overview: null,
  logistics: { vi: 'Logistics', en: 'Logistics' },
  analytics: { vi: 'Analytics', en: 'Analytics' },
  system: { vi: 'System', en: 'System' },
}

export function PortalSidebar() {
  const {
    sidebarCollapsed,
    toggleSidebar,
    locale,
    setLocale,
    mobileNavOpen,
    setMobileNavOpen,
    shops,
    activeShopIds,
    isShopActive,
    toggleShopActive,
    activateAllShops,
  } = usePortal()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const { logout, session } = useAuth()
  const [storeMenuOpen, setStoreMenuOpen] = useState(false)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const role = session?.role ?? UserRole.STORE_OWNER
  const visibleNav = navItems.filter((item) => canSeeNavItem(role, item.to))
  const roleLabel =
    locale === 'vi' ? USER_ROLE_LABELS[role].vi : USER_ROLE_LABELS[role].en

  const width = sidebarCollapsed ? 'w-[72px]' : 'w-60'
  const activeShops = shops.filter((s) => activeShopIds.includes(s.id))
  const platformSummary = [
    ...new Set(activeShops.map((s) => PLATFORM_META[s.platform].label)),
  ].join(' · ')
  const storeLabel =
    activeShops[0]?.store_label ?? shops[0]?.store_label ?? 'OptiPackAI Store'

  async function handleConfirmLogout() {
    setLoggingOut(true)
    try {
      await logout()
      navigate('/login', { replace: true })
    } finally {
      setLoggingOut(false)
      setLogoutConfirmOpen(false)
    }
  }

  const nav = (
    <>
      <div
        className={`flex border-b border-hairline px-2 ${
          sidebarCollapsed
            ? 'h-auto flex-col items-center gap-1.5 py-2.5'
            : 'h-14 items-center justify-between gap-2 px-3'
        }`}
      >
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2"
          title="OptiPackAI"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-hover text-[10px] font-bold text-on-primary shadow-[0_0_16px_rgba(99,102,241,0.35)]">
            OP
          </span>
          {!sidebarCollapsed ? (
            <span className="truncate text-sm font-semibold tracking-tight text-ink">
              OptiPackAI
            </span>
          ) : null}
        </Link>
        <button
          type="button"
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-2 hover:text-ink lg:flex"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
          title={sidebarCollapsed ? 'Mở rộng' : 'Thu gọn'}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
          )}
        </button>
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-subtle hover:bg-surface-2 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Đóng menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!sidebarCollapsed ? (
        <div className="relative border-b border-hairline p-3">
          <button
            type="button"
            onClick={() => setStoreMenuOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-left text-xs transition-colors hover:border-primary/40"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{storeLabel}</p>
              <p className="truncate text-ink-subtle">
                {activeShopIds.length} active
                {platformSummary ? ` · ${platformSummary}` : ''}
              </p>
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 text-ink-subtle transition-transform ${
                storeMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
          {storeMenuOpen ? (
            <div className="absolute top-[calc(100%-4px)] right-3 left-3 z-20 overflow-hidden rounded-lg border border-hairline bg-surface-1 shadow-lg">
              <ul className="max-h-48 overflow-y-auto py-1">
                {shops.map((shop) => {
                  const active = isShopActive(shop.id)
                  return (
                    <li key={shop.id}>
                      <button
                        type="button"
                        onClick={() => toggleShopActive(shop.id)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-surface-2 ${
                          active ? 'bg-primary/10 text-primary-hover' : 'text-ink'
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            active
                              ? 'border-primary bg-primary text-white'
                              : 'border-hairline'
                          }`}
                        >
                          {active ? '✓' : ''}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {shop.account_name}
                          </span>
                          <span className="block text-[10px] text-ink-subtle">
                            {PLATFORM_META[shop.platform].label} ·{' '}
                            {shop.store_label}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <div className="flex border-t border-hairline">
                <button
                  type="button"
                  onClick={() => {
                    activateAllShops()
                    setStoreMenuOpen(false)
                  }}
                  className="flex-1 px-3 py-2 text-[11px] font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"
                >
                  {locale === 'vi' ? 'Chọn tất cả' : 'Select all'}
                </button>
                <Link
                  to="/app/profile"
                  onClick={() => {
                    setStoreMenuOpen(false)
                    setMobileNavOpen(false)
                  }}
                  className="flex-1 border-l border-hairline px-3 py-2 text-center text-[11px] font-medium text-primary-hover hover:bg-surface-2"
                >
                  {locale === 'vi' ? '+ Thêm shop' : '+ Add shop'}
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {visibleNav.map(({ to, end, labelVi, labelEn, icon: Icon, section }, idx) => {
          const prevSection = idx > 0 ? visibleNav[idx - 1].section : null
          const showSection =
            !sidebarCollapsed &&
            section !== prevSection &&
            sectionLabels[section]

          return (
            <div key={to}>
              {showSection ? (
                <p className="mt-2 mb-1 px-2.5 text-[10px] font-medium tracking-wide text-ink-tertiary uppercase">
                  {locale === 'vi'
                    ? sectionLabels[section]!.vi
                    : sectionLabels[section]!.en}
                </p>
              ) : null}
              <NavLink
                to={to}
                end={end}
                onClick={() => setMobileNavOpen(false)}
                title={locale === 'vi' ? labelVi : labelEn}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                    sidebarCollapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'bg-primary/15 text-primary-hover'
                      : 'text-ink-subtle hover:bg-surface-2 hover:text-ink'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                {!sidebarCollapsed ? (
                  <span>{locale === 'vi' ? labelVi : labelEn}</span>
                ) : null}
              </NavLink>
            </div>
          )
        })}
      </nav>

      <div className="border-t border-hairline p-3">
        {!sidebarCollapsed ? (
          <Link
            to="/app/profile"
            onClick={() => setMobileNavOpen(false)}
            className="mb-3 block rounded-lg border border-hairline bg-surface-2 p-2.5 transition-colors hover:border-primary/40"
          >
            <p className="text-sm font-medium text-ink">Nguyễn Minh Anh</p>
            <span className="mt-1 inline-flex rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary-hover">
              {roleLabel}
            </span>
          </Link>
        ) : (
          <Link
            to="/app/profile"
            onClick={() => setMobileNavOpen(false)}
            title="Profile"
            className="mb-2 flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/15 text-[10px] font-bold text-primary-hover"
          >
            NA
          </Link>
        )}

        <div
          className={`flex gap-1 ${sidebarCollapsed ? 'flex-col items-center' : 'items-center'}`}
        >
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-ink-subtle hover:bg-surface-2 hover:text-ink"
            aria-label={
              theme === 'dark' ? 'Chuyển sang sáng' : 'Chuyển sang tối'
            }
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="h-3.5 w-3.5" strokeWidth={1.75} />
            ) : (
              <Moon className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
          </button>
          <button
            type="button"
            onClick={() => setLogoutConfirmOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-ink-subtle hover:bg-surface-2 hover:text-red-500"
            aria-label="Đăng xuất"
            title="Đăng xuất"
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <div className="flex rounded-md border border-hairline p-0.5 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setLocale('vi')}
              className={`rounded px-2 py-1 ${
                locale === 'vi'
                  ? 'bg-primary/15 text-primary-hover'
                  : 'text-ink-subtle hover:text-ink'
              }`}
            >
              VI
            </button>
            <button
              type="button"
              onClick={() => setLocale('en')}
              className={`rounded px-2 py-1 ${
                locale === 'en'
                  ? 'bg-primary/15 text-primary-hover'
                  : 'text-ink-subtle hover:text-ink'
              }`}
            >
              EN
            </button>
          </div>
        </div>
      </div>
    </>
  )

  return (
    <>
      <ConfirmDialog
        open={logoutConfirmOpen}
        title={locale === 'vi' ? 'Đăng xuất' : 'Log out'}
        description={
          locale === 'vi'
            ? 'Bạn có chắc muốn đăng xuất khỏi OptiPackAI? Phiên làm việc hiện tại sẽ kết thúc.'
            : 'Are you sure you want to log out of OptiPackAI? Your current session will end.'
        }
        confirmLabel={locale === 'vi' ? 'Đăng xuất' : 'Log out'}
        cancelLabel={locale === 'vi' ? 'Hủy' : 'Cancel'}
        loading={loggingOut}
        onConfirm={() => void handleConfirmLogout()}
        onCancel={() => setLogoutConfirmOpen(false)}
        icon={<LogOut className="h-4 w-4 text-primary-hover" strokeWidth={1.75} />}
      />
      {/* Desktop */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-hairline bg-canvas transition-[width] lg:flex ${width}`}
      >
        {nav}
      </aside>

      {/* Mobile overlay */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Đóng"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-60 flex-col border-r border-hairline bg-canvas">
            {nav}
          </aside>
        </div>
      ) : null}
    </>
  )
}
