import { useLayoutEffect, useRef, type MouseEvent, type RefObject } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Giữ vị trí cuộn của thanh menu khi chọn mục.
 * Trình duyệt thường focus vào NavLink rồi scrollIntoView → nav nhảy lên đầu.
 */
export function usePreserveNavScroll(): {
  navRef: RefObject<HTMLElement | null>
  onNavLinkMouseDown: (event: MouseEvent) => void
  rememberScroll: () => void
} {
  const navRef = useRef<HTMLElement | null>(null)
  const savedScrollTop = useRef(0)
  const { pathname } = useLocation()

  const rememberScroll = (): void => {
    const el = navRef.current
    if (el) savedScrollTop.current = el.scrollTop
  }

  const onNavLinkMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) return
    rememberScroll()
    // Chặn focus → scrollIntoView làm nhảy thanh menu.
    event.preventDefault()
  }

  useLayoutEffect(() => {
    const el = navRef.current
    if (!el) return
    if (el.scrollTop !== savedScrollTop.current) {
      el.scrollTop = savedScrollTop.current
    }
  }, [pathname])

  return { navRef, onNavLinkMouseDown, rememberScroll }
}
