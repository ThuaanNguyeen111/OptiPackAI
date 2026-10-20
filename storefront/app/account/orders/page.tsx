'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import type { StorefrontOrder } from '@/types/storefront'
import { ApiError, getOrders } from '@/lib/api-client'
import { getFulfillmentStatusLabel } from '@/lib/order-labels'

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<StorefrontOrder[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Không phụ thuộc cache localStorage: server là nguồn sự thật, 401 → về trang đăng nhập.
    getOrders()
      .then(setOrders)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) return router.push('/auth/login?returnTo=/account/orders')
        setError(err instanceof Error ? err.message : 'Không thể tải đơn hàng')
      })
      .finally(() => setLoading(false))
  }, [router])

  return <>
    <Header />
    <main className="page-shell">
      <div className="page-title orders-page-title">
        <span className="eyebrow">Đơn hàng của bạn</span>
        <h1>Lịch sử đơn hàng</h1>
      </div>
      {error && <p className="error">{error}</p>}
      {loading && !error ? <p className="order-loading">Đang tải đơn hàng...</p> : !error && !orders.length ? <div className="empty">Bạn chưa có đơn hàng nào. <Link href="/shop">Khám phá sản phẩm →</Link></div> : <div className="orders-list">
        {orders.map((order) => <Link className="order-row" href={`/account/orders/${order.id}`} key={order.id}>
          <div className="order-row-main">
            <span className="order-label">Mã đơn hàng</span>
            <h3>{order.orderNumber}</h3>
            <p>{new Date(order.createdAt).toLocaleDateString('vi-VN')}</p>
          </div>
          <span className="order-status">{getFulfillmentStatusLabel(order.fulfillmentStatus)}</span>
          <div className="order-total">
            <span>Tổng thanh toán</span>
            <strong>{order.totalAmount.toLocaleString('vi-VN')}₫</strong>
          </div>
          <span className="order-arrow" aria-hidden="true">→</span>
        </Link>)}
      </div>}
    </main>
    <Footer />
  </>
}
