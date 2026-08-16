import { Link } from 'react-router-dom'
import { Mail, Menu, Moon, Sun, X } from 'lucide-react'
import { useState } from 'react'
import { useTheme } from '../../hooks/useTheme'

const navLinks = [
  { href: '#features', label: 'Tính năng' },
  { href: '#ai-engine', label: 'AI Engine' },
  { href: '#integrations', label: 'Tích hợp' },
  { href: '#analytics', label: 'Phân tích' },
]

export function LandingHeader() {
  const [open, setOpen] = useState(false)
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="sticky top-0 z-50 border-b border-hairline/80 bg-canvas/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-hover text-xs font-bold text-on-primary shadow-[0_0_20px_rgba(99,102,241,0.45)]">
            OP
          </span>
          <span className="text-base font-semibold tracking-tight text-ink">
            OptiPackAI
          </span>
          <span className="hidden rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary-hover shadow-[0_0_12px_rgba(99,102,241,0.25)] sm:inline">
            AOFP
          </span>
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-ink-muted transition-colors hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-hairline bg-surface-1 text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label={
              theme === 'dark' ? 'Chuyển sang light mode' : 'Chuyển sang dark mode'
            }
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <Moon className="h-4 w-4" strokeWidth={1.75} />
            )}
          </button>

          <div className="hidden items-center gap-2 sm:flex">
            <a
              href="#contact"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-hairline px-3 text-sm text-ink-muted transition-colors hover:border-hairline-strong hover:text-ink"
            >
              <Mail className="h-3.5 w-3.5" strokeWidth={1.75} />
              Liên hệ
            </a>
            <Link
              to="/login"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-hover"
            >
              Mở Dashboard
            </Link>
          </div>

          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-hairline text-ink-muted md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Mở menu"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-hairline bg-canvas px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-ink-muted"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <a
              href="#contact"
              className="text-sm text-ink-muted"
              onClick={() => setOpen(false)}
            >
              Liên hệ
            </a>
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-hairline bg-surface-1 text-sm text-ink"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="h-4 w-4" strokeWidth={1.75} />
                  Light mode
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4" strokeWidth={1.75} />
                  Dark mode
                </>
              )}
            </button>
            <Link
              to="/login"
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary text-sm font-medium text-on-primary"
              onClick={() => setOpen(false)}
            >
              Mở Dashboard
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  )
}
