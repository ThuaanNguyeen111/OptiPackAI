import { NavLink, Link, useNavigate } from 'react-router-dom'
import {
  Box,
  Cpu,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  Sun,
  Users,
  X,
} from 'lucide-react'
import { usePortal } from '../../../context/use-portal'
import { useTheme } from '../../../hooks/useTheme'

type NavSection = 'directory' | 'ai'

const navItems = [
  {
    to: '/app/admin',
    end: true,
    labelVi: 'Người dùng',
    labelEn: 'Users',
    icon: Users,
    section: 'directory' as NavSection,
  },
  {
    to: '/app/admin/roles',
    end: false,
    labelVi: 'Phân quyền',
    labelEn: 'Role access',
    icon: Shield,
    section: 'directory' as NavSection,
  },
  {
    to: '/app/admin/ai',
    end: false,
    labelVi: 'Tham số AI',
    labelEn: 'AI parameters',
    icon: Cpu,
    section: 'ai' as NavSection,
  },
  {
    to: '/app/admin/templates',
    end: false,
    labelVi: 'Templates đóng gói',
    labelEn: 'Packaging templates',
    icon: Box,
    section: 'ai' as NavSection,
  },
]

const sectionLabels: Record<NavSection, { vi: string; en: string } | null> = {
  directory: { vi: 'Quản trị', en: 'Administration' },
  ai: { vi: 'AI & đóng gói', en: 'AI & packing' },
}

export function AdminSidebar() {
  const {
    sidebarCollapsed,
    toggleSidebar,
    locale,
    setLocale,
    mobileNavOpen,
    setMobileNavOpen,
  } = usePortal()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const vi = locale === 'vi'

  const width = sidebarCollapsed ? 'w-[72px]' : 'w-60'

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
          to="/app/admin"
          className="flex min-w-0 items-center gap-2"
          title="OptiPackAI Admin"
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
        <div className="border-b border-hairline p-3">
          <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2">
            <p className="text-xs font-medium text-primary-hover">
              {vi ? 'Admin Console' : 'Admin Console'}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-subtle">
              {vi
                ? 'FE-08 · Users · RBAC · AI · Templates'
                : 'FE-08 · Users · RBAC · AI · Templates'}
            </p>
          </div>
        </div>
      ) : null}

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        <NavLink
          to="/app"
          end
          onClick={() => setMobileNavOpen(false)}
          title={vi ? 'Về vận hành' : 'Back to operations'}
          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink ${
            sidebarCollapsed ? 'justify-center' : ''
          }`}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          {!sidebarCollapsed ? (
            <span>{vi ? 'Về vận hành' : 'Operations'}</span>
          ) : null}
        </NavLink>

        {navItems.map(({ to, end, labelVi, labelEn, icon: Icon, section }, idx) => {
          const prevSection = idx > 0 ? navItems[idx - 1].section : null
          const showSection =
            !sidebarCollapsed &&
            section !== prevSection &&
            sectionLabels[section]

          return (
            <div key={to}>
              {showSection ? (
                <p className="mt-2 mb-1 px-2.5 text-[10px] font-medium tracking-wide text-ink-tertiary uppercase">
                  {vi ? sectionLabels[section]!.vi : sectionLabels[section]!.en}
                </p>
              ) : null}
              <NavLink
                to={to}
                end={end}
                onClick={() => setMobileNavOpen(false)}
                title={vi ? labelVi : labelEn}
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
                  <span>{vi ? labelVi : labelEn}</span>
                ) : null}
              </NavLink>
            </div>
          )
        })}
      </nav>

      <div className="border-t border-hairline p-3">
        {!sidebarCollapsed ? (
          <div className="mb-3 rounded-lg border border-hairline bg-surface-2 p-2.5">
            <p className="text-sm font-medium text-ink">Alice Nguyễn</p>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary-hover">
              <Shield className="h-3 w-3" strokeWidth={2} />
              Admin
            </span>
          </div>
        ) : (
          <div
            title="Admin"
            className="mb-2 flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/15 text-[10px] font-bold text-primary-hover"
          >
            AN
          </div>
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
            onClick={() => navigate('/login', { replace: true })}
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
      <aside
        className={`hidden shrink-0 flex-col border-r border-hairline bg-canvas transition-[width] lg:flex ${width}`}
      >
        {nav}
      </aside>

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
