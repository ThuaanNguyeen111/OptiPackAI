'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useCart } from '@/components/cart/cart-provider'
import { siteConfig } from '@/lib/site-config'

export function Header({ cartCount: fallbackCount = 0 }: { cartCount?: number }) {
  const { count: currentCount } = useCart()
  const cartCount = currentCount || fallbackCount
  const [menuOpen, setMenuOpen] = useState(false)
  return <>
    <div className="announcement">Miễn phí vận chuyển cho đơn từ 1.000.000₫</div>
    <header className="site-header">
      <Link className="brand" href="/" aria-label={siteConfig.name}>{siteConfig.name}</Link>
      <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Mở menu">☰</button>
      <nav className={menuOpen ? 'main-nav open' : 'main-nav'}>
        <Link href="/">Trang chủ</Link><Link href="/shop">Sản phẩm</Link><Link href="/shop?category=new">Hàng mới</Link><Link href="/shop?category=featured">Nổi bật</Link>
      </nav>
      <div className="header-actions"><Link href="/auth/login" aria-label="Tài khoản">♙</Link><Link href="/cart" aria-label="Giỏ hàng">🛍 <span className="cart-count">{cartCount}</span></Link></div>
    </header>
  </>
}
