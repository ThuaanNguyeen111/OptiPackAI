import { Mail, Menu, Moon, Sun, X } from 'lucide-react'
import { useState } from 'react'
import { useTheme } from '../../hooks/useTheme'
import { handleLandingHashClick } from './scroll-landing'
import { LandingAuthCta } from './LandingAuthCta'
import { LandingUserAvatar } from './LandingUserAvatar'

const navLinks = [
  { href: '#ai-engine', label: 'AI Engine' },
  { href: '#features', label: 'Tính năng' },
  { href: '#integrations', label: 'Tích hợp' },
  { href: '#analytics', label: 'Phân tích' },
]

export function LandingHeader() {
  const [open, setOpen] = useState(false)
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="landing-top">
      <a
        href="#top"
        className="landing-pill landing-brand"
        onClick={(event) => handleLandingHashClick(event, '#top')}
      >
        <span className="lp-mark">OP</span>
        <span className="text-sm font-semibold tracking-tight">OptiPackAI</span>
        <span className="hidden rounded-full bg-[color-mix(in_srgb,var(--ls-cta)_14%,transparent)] px-2 py-0.5 text-[10px] font-medium text-[var(--ls-cta)] sm:inline">
          AOFP
        </span>
      </a>

      <nav className="landing-pill landing-nav-pill">
        {navLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            onClick={(event) => handleLandingHashClick(event, link.href)}
          >
            {link.label}
          </a>
        ))}
      </nav>

      <div className="landing-pill landing-actions">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center text-[var(--ls-muted)] transition-colors hover:text-[var(--ls-ink)]"
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

        <a
          href="#contact"
          className="hidden h-9 items-center gap-1.5 px-3 text-sm text-[var(--ls-muted)] hover:text-[var(--ls-ink)] sm:inline-flex"
          onClick={(event) => handleLandingHashClick(event, '#contact')}
        >
          <Mail className="h-3.5 w-3.5" strokeWidth={1.75} />
          Liên hệ
        </a>
        <LandingUserAvatar />
        <LandingAuthCta variant="header" />

        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center text-[var(--ls-muted)] md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Mở menu"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {open ? (
        <div className="absolute top-[68px] right-4 left-4 z-50 rounded-2xl border border-[var(--ls-card-border)] bg-[var(--ls-card-solid)] p-4 shadow-[var(--ls-shadow)] backdrop-blur-xl md:hidden">
          <nav className="flex flex-col gap-2">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-2 py-2 text-sm text-[var(--ls-muted)]"
                onClick={(event) => {
                  handleLandingHashClick(event, link.href)
                  setOpen(false)
                }}
              >
                {link.label}
              </a>
            ))}
            <a
              href="#contact"
              className="rounded-lg px-2 py-2 text-sm text-[var(--ls-muted)]"
              onClick={(event) => {
                handleLandingHashClick(event, '#contact')
                setOpen(false)
              }}
            >
              Liên hệ
            </a>
            <LandingUserAvatar
              showName
              onNavigate={() => setOpen(false)}
            />
            <LandingAuthCta variant="mobile" onNavigate={() => setOpen(false)} />
          </nav>
        </div>
      ) : null}
    </header>
  )
}
