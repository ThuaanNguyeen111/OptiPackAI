import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Package } from 'lucide-react'
import { handleLandingHashClick } from '../scroll-landing'
import { LandingAuthCta } from '../LandingAuthCta'
import { LandingUserAvatar } from '../LandingUserAvatar'

const LINKS = [
  { href: '#top', label: 'Trang chủ' },
  { href: '#services', label: 'Dịch vụ' },
  { href: '#process', label: 'Quy trình' },
  { href: '#works', label: 'Tác vụ' },
] as const

export function EditorialNav(): ReactNode {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = (): void => {
      setScrolled(window.scrollY > 24)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="ed-nav-shell pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-4 sm:px-6"
    >
      <div
        className={`ed-nav-pill pointer-events-auto flex w-full max-w-[1120px] items-center gap-3 rounded-full px-2 py-2 pl-4 backdrop-blur-md transition-[background,box-shadow,border-color] duration-300 sm:gap-4 sm:px-3 ${
          scrolled ? 'is-scrolled' : ''
        }`}
      >
        <a
          href="#top"
          onClick={(e) => handleLandingHashClick(e, '#top')}
          className="flex min-w-0 items-center gap-2 text-[var(--ed-ink)]"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--ed-ink)] text-[var(--ed-sage)]">
            <Package className="h-4 w-4" strokeWidth={2} />
          </span>
          <span className="hidden truncate text-sm font-semibold tracking-tight sm:inline">
            OptiPackAI
          </span>
        </a>

        <nav className="mx-auto flex min-w-0 max-w-[min(100%,12.5rem)] items-center gap-0.5 overflow-x-auto sm:max-w-[22rem] md:max-w-none">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => handleLandingHashClick(e, link.href)}
              className="shrink-0 rounded-full px-2.5 py-1.5 text-[12px] font-medium text-[var(--ed-ink-soft)] transition-colors hover:bg-[color-mix(in_srgb,var(--ed-sage)_55%,transparent)] hover:text-[var(--ed-ink)] sm:px-3 sm:text-[13px]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LandingUserAvatar />
          <LandingAuthCta variant="header" />
        </div>
      </div>
    </motion.header>
  )
}
