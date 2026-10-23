'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useCart } from '@/components/cart/cart-provider'
import { siteConfig } from '@/lib/site-config'

const iconProps = {
  width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
}

export function Header({ cartCount: fallbackCount = 0 }: { cartCount?: number }) {
  const { count: currentCount } = useCart()
  const cartCount = currentCount || fallbackCount
  const [menuOpen, setMenuOpen] = useState(false)
  return <>
    <div className="announcement">Miễn phí vận chuyển cho đơn từ 1.000.000₫</div>
    <header className="site-header">
      <Link className="brand" href="/" aria-label={siteConfig.name}>{siteConfig.name}</Link>
      <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Mở menu">
        <svg {...iconProps}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      <nav className={menuOpen ? 'main-nav open' : 'main-nav'}>
        <Link href="/">Trang chủ</Link><Link href="/shop">Sản phẩm</Link><Link href="/shop?category=new">Hàng mới</Link><Link href="/shop?category=featured">Nổi bật</Link><Link href="/developer">Nhà phát triển</Link>
      </nav>
      <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <Link href="/account" aria-label="Tài khoản" style={{ display: 'inline-flex' }}>
          <svg {...iconProps}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
        </Link>
        <Link href="/cart" aria-label="Giỏ hàng" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <svg {...iconProps}><path d="M6 8h12l1 12H5L6 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
          <span className="cart-count">{cartCount}</span>
        </Link>
      </div>
    </header>
  </>
}
