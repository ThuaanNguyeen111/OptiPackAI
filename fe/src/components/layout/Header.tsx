import { Bell, Moon, Search, Sun } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import { Button } from '../ui/Button'

type HeaderProps = {
  title: string
  description?: string
}

export function Header({ title, description }: HeaderProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-hairline bg-canvas px-6">
      <div>
        <h1 className="text-base font-semibold tracking-tight text-ink">{title}</h1>
        {description ? (
          <p className="text-xs text-ink-subtle">{description}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative hidden sm:block">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <input
            type="search"
            placeholder="Tìm đơn hàng, mã vận đơn..."
            className="h-9 w-64 rounded-md border border-hairline bg-surface-1 py-2 pr-3 pl-9 text-sm text-ink placeholder:text-ink-tertiary focus:border-hairline-strong focus:outline-none focus:ring-2 focus:ring-primary-focus/50"
          />
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-hairline bg-surface-1 text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
          aria-label={theme === 'dark' ? 'Chuyển sang light mode' : 'Chuyển sang dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <Moon className="h-4 w-4" strokeWidth={1.75} />
          )}
        </button>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-hairline bg-surface-1 text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
          aria-label="Thông báo"
        >
          <Bell className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <Button variant="ghost">Đồng bộ đơn</Button>
      </div>
    </header>
  )
}
