'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import type { StorefrontOrder } from '@/types/storefront'
import { getFulfillmentStatusLabel } from '@/lib/order-labels'

export default function OrdersPage() {
  const [orders, setOrders] = useState<StorefrontOrder[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!localStorage.getItem('kaira-customer')) return
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/storefront/orders`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Không thể tải đơn hàng')
        return response.json() as Promise<StorefrontOrder[]>
      })
      .then(setOrders)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Không thể tải đơn hàng'))
  }, [])

  return <>
    <Header />
    <main className="page-shell">
      <div className="page-title orders-page-title">
        <span className="eyebrow">Đơn hàng của bạn</span>
        <h1>Lịch sử đơn hàng</h1>
      </div>
      {error && <p className="error">{error}</p>}
      {!error && !orders.length ? <div className="empty">Bạn chưa có đơn hàng nào. <Link href="/shop">Khám phá sản phẩm →</Link></div> : <div className="orders-list">
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
