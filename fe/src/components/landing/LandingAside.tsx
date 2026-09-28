import { handleLandingHashClick } from './scroll-landing'

const asideLinks = [
  { href: '#top', label: 'Tổng quan' },
  { href: '#ai-engine', label: 'AI Engine' },
  { href: '#features', label: 'Tính năng' },
  { href: '#integrations', label: 'Tích hợp' },
  { href: '#analytics', label: 'Phân tích' },
  { href: '#actors', label: 'Vai trò' },
  { href: '#contact', label: 'Liên hệ' },
]

export function LandingAside() {
  return (
    <aside className="landing-aside">
      <div className="landing-aside-brand">
        <span className="lp-mark">OP</span>
        <div>
          <p className="text-sm font-semibold tracking-tight">OptiPackAI</p>
          <p className="text-[11px] text-[var(--ls-muted)]">AOFP · đa kênh</p>
        </div>
      </div>
      <nav>
        {asideLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            onClick={(event) => handleLandingHashClick(event, link.href)}
          >
            {link.label}
          </a>
        ))}
      </nav>
      <div className="landing-aside-foot">
        <p>Đại học FPT · FA26SE036</p>
        <a href="mailto:contact@optipackai.local" className="mt-1 block text-[var(--ls-link)]">
          contact@optipackai.local
        </a>
      </div>
    </aside>
  )
}
