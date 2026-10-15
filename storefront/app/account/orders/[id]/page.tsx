'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { getFulfillmentStatusLabel, getOrderStatusLabel, getPaymentMethodLabel, getPaymentStatusLabel } from '@/lib/order-labels'
import type { StorefrontOrderDetail } from '@/types/storefront'

function formatVnd(value: number) {
  return `${value.toLocaleString('vi-VN')}₫`
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [order, setOrder] = useState<StorefrontOrderDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void params.then(({ id }) => {
      if (!localStorage.getItem('kaira-customer')) return
      fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/storefront/orders/${id}`, { credentials: 'include' })
        .then(async (response) => {
          if (!response.ok) throw new Error('Không thể tải chi tiết đơn hàng')
          return response.json() as Promise<StorefrontOrderDetail>
        })
        .then(setOrder)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Không thể tải chi tiết đơn hàng'))
    })
  }, [params])

  const subtotal = order?.subtotal ?? order?.items.reduce((sum, item) => sum + item.line_total, 0) ?? 0
  const discount = order?.discountAmount ?? 0
  const shippingFee = order?.shippingFee ?? 0

  return <>
    <Header />
    <main className="page-shell">
      <div className="form-card order-detail-card">
        <Link className="order-back-link" href="/account/orders">← Lịch sử đơn hàng</Link>
        {error && <p className="error" role="alert">{error}</p>}
        {!error && !order && <p className="order-loading">Đang tải chi tiết đơn hàng...</p>}
        {order && <>
          <div className="order-detail-header">
            <div className="page-title">
              <span className="eyebrow">Chi tiết đơn hàng</span>
              <h1>{order.orderNumber}</h1>
              <p className="order-detail-date">Đặt ngày {new Date(order.createdAt).toLocaleDateString('vi-VN')}</p>
            </div>
            <span className="order-detail-status">{getOrderStatusLabel(order.status)}</span>
          </div>

          <div className="order-detail-layout">
            <section aria-labelledby="order-items-title">
              <div className="order-section-heading">
                <h2 id="order-items-title">Sản phẩm trong đơn</h2>
                <span>{order.items.length} sản phẩm</span>
              </div>
              <div className="order-detail-items">
                {order.items.map((item) => <div className="order-detail-item" key={`${item.variant_id}-${item.sku_snapshot}`}>
                  <div className="order-detail-image">
                    {item.image_snapshot ? <Image src={item.image_snapshot} alt={item.product_name_snapshot} fill sizes="88px" /> : null}
                  </div>
                  <div className="order-detail-item-copy">
                    <h3>{item.product_name_snapshot}</h3>
                    <p>{item.variant_snapshot}</p>
                    <p>{formatVnd(item.unit_price)} × {item.quantity}</p>
                  </div>
                  <strong className="order-detail-item-price">{formatVnd(item.line_total)}</strong>
                </div>)}
              </div>
            </section>

            <aside className="order-cost-panel" aria-labelledby="order-cost-title">
              <span className="eyebrow">Chi phí</span>
              <h2 id="order-cost-title">Tóm tắt thanh toán</h2>
              <div className="order-cost-line"><span>Tạm tính</span><strong>{formatVnd(subtotal)}</strong></div>
              <div className="order-cost-line"><span>Giảm giá</span><strong>{discount ? `− ${formatVnd(discount)}` : '—'}</strong></div>
              <div className="order-cost-line"><span>Phí vận chuyển</span><strong>{shippingFee ? formatVnd(shippingFee) : 'Miễn phí'}</strong></div>
              <div className="order-cost-total"><span>Tổng thanh toán</span><strong>{formatVnd(order.totalAmount)}</strong></div>
            </aside>
          </div>

          <div className="order-detail-facts">
            <div><span>Phương thức thanh toán</span><strong>{getPaymentMethodLabel(order.paymentMethod)}</strong></div>
            <div><span>Trạng thái thanh toán</span><strong>{getPaymentStatusLabel(order.paymentStatus)}</strong></div>
            <div><span>Giao hàng</span><strong>{getFulfillmentStatusLabel(order.fulfillmentStatus)}</strong></div>
          </div>

          {order.shippingAddress && <section className="order-address-panel" aria-labelledby="order-address-title">
            <span className="eyebrow">Giao đến</span>
            <h2 id="order-address-title">Thông tin nhận hàng</h2>
            <p><strong>{order.shippingAddress.recipient_name}</strong> · {order.shippingAddress.phone}</p>
            <p>{order.shippingAddress.address_line}, {order.shippingAddress.ward}{order.shippingAddress.district ? `, ${order.shippingAddress.district}` : ''}, {order.shippingAddress.province}</p>
          </section>}
        </>}
      </div>
    </main>
    <Footer />
  </>
}
