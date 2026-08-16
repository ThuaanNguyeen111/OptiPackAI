import { Link } from 'react-router-dom'
import { Box, Moon, Sparkles, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTheme } from '../../hooks/useTheme'

type AuthLayoutProps = {
  children: ReactNode
  mode: 'login' | 'register'
}

function PackingPreview() {
  return (
    <div className="relative z-10 mx-auto my-6 w-full max-w-sm">
      <div
        className="pointer-events-none absolute -inset-8 rounded-full opacity-60 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, color-mix(in srgb, var(--app-primary) 35%, transparent), transparent 70%)',
        }}
      />
      <div className="relative overflow-hidden rounded-xl border border-hairline bg-canvas/80 p-4 shadow-[0_0_40px_rgba(99,102,241,0.15)] backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <Box className="h-3.5 w-3.5 text-primary-hover" strokeWidth={1.75} />
            3D Bin Packing
          </div>
          <span className="font-mono text-[10px] text-success">fill 92%</span>
        </div>

        {/* Mini carton with packed blocks */}
        <div className="relative mx-auto aspect-[5/3] w-full max-w-[240px] rounded-lg border border-[#27272A] bg-surface-2 p-2">
          <div className="grid h-full grid-cols-3 grid-rows-2 gap-1.5">
            <div className="col-span-2 row-span-2 rounded-md bg-primary/80 shadow-[inset_0_0_0_1px_rgba(129,140,248,0.4)]" />
            <div className="rounded-md bg-tiktok/70 shadow-[inset_0_0_0_1px_rgba(0,229,255,0.35)]" />
            <div className="rounded-md bg-shopee/80 shadow-[inset_0_0_0_1px_rgba(255,107,0,0.35)]" />
          </div>
          <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-primary/20" />
        </div>

        <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-ink-subtle">
          <span>Carton-A2 · 25×15×10</span>
          <span className="text-primary-hover">unused 8%</span>
        </div>
      </div>
    </div>
  )
}

export function AuthLayout({ children, mode }: AuthLayoutProps) {
  const { theme, toggleTheme } = useTheme()
  const compact = mode === 'register'

  return (
    <div className="grid h-svh overflow-hidden bg-canvas lg:grid-cols-2">
      {/* Left — Brand panel */}
      <aside className="relative hidden overflow-hidden border-r border-hairline bg-surface-1 lg:flex lg:flex-col lg:justify-between lg:p-8 xl:p-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage: `
              linear-gradient(to right, color-mix(in srgb, var(--app-hairline) 55%, transparent) 1px, transparent 1px),
              linear-gradient(to bottom, color-mix(in srgb, var(--app-hairline) 55%, transparent) 1px, transparent 1px),
              radial-gradient(ellipse 70% 50% at 20% 20%, color-mix(in srgb, var(--app-primary) 28%, transparent), transparent),
              radial-gradient(ellipse 50% 40% at 80% 80%, color-mix(in srgb, var(--app-tiktok) 12%, transparent), transparent)
            `,
            backgroundSize: '48px 48px, 48px 48px, 100% 100%, 100% 100%',
          }}
        />

        <div className="relative z-10 shrink-0">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-hover text-xs font-bold text-on-primary shadow-[0_0_24px_rgba(99,102,241,0.4)]">
              OP
            </span>
            <span className="text-lg font-semibold tracking-tight text-ink">
              OptiPackAI
            </span>
          </Link>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-muted">
            OptiPackAI — AI-Assisted Omnichannel Fulfillment & Packaging System
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/35 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary-hover shadow-[0_0_20px_rgba(99,102,241,0.2)]">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
            AI 3D Bin Packing & Multi-Channel Order Sync
          </div>
        </div>

        <PackingPreview />

        <div className="relative z-10 max-w-md shrink-0 rounded-xl border border-hairline bg-canvas/70 p-4 backdrop-blur-sm">
          <p className="text-xs font-medium tracking-wider text-ink-subtle uppercase">
            Live impact
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="font-mono text-2xl font-semibold text-success">35%</p>
              <p className="mt-0.5 text-xs text-ink-subtle">Packaging cost saved</p>
            </div>
            <div>
              <p className="font-mono text-2xl font-semibold text-ink">10k+</p>
              <p className="mt-0.5 text-xs text-ink-subtle">Orders processed</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <span className="rounded-md bg-[#FF6B00] px-2 py-0.5 font-mono text-[10px] font-medium text-white">
              Shopee
            </span>
            <span className="rounded-md bg-[#00E5FF] px-2 py-0.5 font-mono text-[10px] font-medium text-[#0B0E14]">
              TikTok Shop
            </span>
          </div>
        </div>
      </aside>

      {/* Right — Form panel */}
      <main
        className={`relative flex min-h-0 flex-col overflow-hidden px-4 sm:px-8 ${
          compact ? 'py-3' : 'py-5'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-on-primary">
              OP
            </span>
            <span className="text-sm font-semibold text-ink">OptiPackAI</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-[#27272A] bg-surface-1 text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label={
                theme === 'dark' ? 'Chuyển sang light mode' : 'Chuyển sang dark mode'
              }
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" strokeWidth={1.75} />
              ) : (
                <Moon className="h-4 w-4" strokeWidth={1.75} />
              )}
            </button>
            {mode === 'login' ? (
              <Link
                to="/register"
                className="rounded-md border border-[#27272A] px-3 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
              >
                Create account
              </Link>
            ) : (
              <Link
                to="/login"
                className="rounded-md border border-[#27272A] px-3 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>

        <div
          className={`mx-auto flex w-full max-w-md min-h-0 flex-1 flex-col justify-center ${
            compact ? 'py-2' : 'py-6'
          }`}
        >
          {children}
        </div>
      </main>
    </div>
  )
}
