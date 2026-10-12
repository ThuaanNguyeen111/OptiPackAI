'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import type { Customer } from '@/types/storefront'
import { getCurrentCustomer, logoutCustomer } from '@/lib/api-client'

export default function AccountPage() {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true

    async function restoreCustomer() {
      const raw = localStorage.getItem('kaira-customer')
      let hasCachedProfile = false
      if (raw) {
        try {
          hasCachedProfile = true
          if (active) setCustomer(JSON.parse(raw) as Customer)
        } catch {
          hasCachedProfile = false
          localStorage.removeItem('kaira-customer')
        }
      }

      if (!hasCachedProfile) {
        try {
          const result = await getCurrentCustomer()
          if (!active) return
          setCustomer(result.customer)
          localStorage.setItem('kaira-customer', JSON.stringify(result.customer))
          window.dispatchEvent(new Event('kaira-auth-changed'))
        } catch {
          // The cached profile remains the fallback when the API is unavailable.
        }
      }

      if (active) setReady(true)
    }

    void restoreCustomer()
    return () => {
      active = false
    }
  }, [])

  function handleLogout() {
    void logoutCustomer()
    localStorage.removeItem('kaira-access-token')
    localStorage.removeItem('kaira-customer')
    window.dispatchEvent(new Event('kaira-auth-changed'))
    setCustomer(null)
  }

  return <>
    <Header />
    <main className="page-shell">
      <div className="form-card account-card">
        {!ready ? <span className="eyebrow">Đang tải tài khoản...</span> : <>
          <span className="eyebrow">Tài khoản của tôi</span>
          <h1>{customer ? `Xin chào, ${customer.name}` : 'Tài khoản của tôi'}</h1>
        </>}
        {ready && customer ? <>
          <p className="account-email">{customer.email}</p>
          <div className="account-actions">
            <Link className="button" href="/account/orders">Xem đơn hàng</Link>
            <button className="button light" type="button" onClick={handleLogout}>Đăng xuất</button>
          </div>
        </> : ready ? <Link className="button" href="/auth/login">Đăng nhập</Link> : null}
      </div>
    </main>
    <Footer />
  </>
}
