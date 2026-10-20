'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { ApiError, getReturns } from '@/lib/api-client'
import { RETURN_TYPE_LABELS } from '@/lib/order-labels'
import type { StorefrontReturn } from '@/types/storefront'

export default function ReturnsPage() {
  const router = useRouter()
  const [returns, setReturns] = useState<StorefrontReturn[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getReturns()
      .then(setReturns)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) return router.push('/auth/login?returnTo=/account/returns')
        setError(err instanceof Error ? err.message : 'Không thể tải yêu cầu trả hàng')
      })
      .finally(() => setLoading(false))
  }, [router])

  return <>
    <Header />
    <main className="page-shell">
      <div className="page-title orders-page-title">
        <span className="eyebrow">Hậu mãi</span>
        <h1>Yêu cầu trả hàng</h1>
      </div>
      {error && <p className="error">{error}</p>}
      {loading && !error ? <p className="order-loading">Đang tải yêu cầu trả hàng...</p> : !error && !returns.length ? <div className="empty">Bạn chưa có yêu cầu trả hàng nào. <Link href="/account/orders">Xem đơn hàng →</Link></div> : <div className="orders-list">
        {returns.map((item) => <Link className="order-row" href={`/account/returns/${item.id}`} key={item.id}>
          <div className="order-row-main">
            <span className="order-label">Đơn hàng</span>
            <h3>{item.orderNumber}</h3>
            <p>{RETURN_TYPE_LABELS[item.type] ?? item.type} · {new Date(item.createdAt).toLocaleDateString('vi-VN')}</p>
          </div>
          <span className="order-status">{item.statusLabel}</span>
          <div className="order-total">
            <span>Số sản phẩm</span>
            <strong>{item.items.reduce((sum, line) => sum + line.quantity, 0)}</strong>
          </div>
          <span className="order-arrow" aria-hidden="true">→</span>
        </Link>)}
      </div>}
    </main>
    <Footer />
  </>
}
