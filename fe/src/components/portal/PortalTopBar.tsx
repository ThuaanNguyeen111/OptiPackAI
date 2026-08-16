import { Bell, Menu, Plus, ScanLine, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePortal } from '../../context/use-portal'
import { WarehouseScannerModal } from '../warehouse/WarehouseScannerModal'
import { Button } from '../ui/Button'

type PortalTopBarProps = {
  breadcrumbs: Array<{ label: string; to?: string }>
}

export function PortalTopBar({ breadcrumbs }: PortalTopBarProps) {
  const { setMobileNavOpen, locale, scannerOpen, setScannerOpen } = usePortal()

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-canvas px-4 sm:px-6">
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
          <span className="hidden items-center gap-1.5 rounded-full border border-success/20 bg-success-bg px-2.5 py-1 text-[11px] font-medium text-success md:inline-flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            {locale === 'vi'
              ? 'Live Sync: TikTok Shop & Shopee'
              : 'Live Sync: TikTok Shop & Shopee active'}
          </span>

          <div className="relative hidden md:block">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
            <input
              type="search"
              placeholder={
                locale === 'vi' ? 'Tìm SKU / Order ID…' : 'Search SKU / Order ID…'
              }
              className="h-9 w-48 rounded-md border border-hairline bg-surface-1 py-1.5 pr-3 pl-8 text-xs text-ink placeholder:text-ink-tertiary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 lg:w-56"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border border-hairline bg-surface-2 px-1 font-mono text-[10px] text-ink-tertiary lg:inline">
              ⌘K
            </kbd>
          </div>

          <Button
            variant="ghost"
            className="h-9 min-h-9 px-2.5 text-xs sm:px-3"
            onClick={() => setScannerOpen(true)}
            title={locale === 'vi' ? 'Warehouse Scanner' : 'Warehouse Scanner'}
          >
            <ScanLine className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">
              {locale === 'vi' ? 'Quét mã' : 'Scan'}
            </span>
          </Button>

          <Button
            variant="ghost"
            className="hidden h-9 min-h-9 px-3 text-xs sm:inline-flex"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {locale === 'vi' ? 'Tạo đơn thủ công' : 'Create Manual Order'}
          </Button>

          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-hairline bg-surface-1 text-ink-subtle hover:bg-surface-2 hover:text-ink"
            aria-label="Thông báo"
          >
            <Bell className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <WarehouseScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        locale={locale}
      />
    </>
  )
}
