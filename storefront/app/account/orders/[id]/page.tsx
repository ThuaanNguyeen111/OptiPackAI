'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { OrderTimeline } from '@/components/order/order-timeline'
import { ReturnRequestForm } from '@/components/order/return-request-form'
import { ApiError, cancelOrder, getOrder, getReturns } from '@/lib/api-client'
import { getFulfillmentStatusLabel, getOrderStatusLabel, getPaymentMethodLabel, getPaymentStatusLabel } from '@/lib/order-labels'
import { OPEN_RETURN_STATUSES } from '@/lib/order-labels'
import type { StorefrontOrderDetail, StorefrontReturn } from '@/types/storefront'

function formatVnd(value: number) {
  return `${value.toLocaleString('vi-VN')}₫`
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [order, setOrder] = useState<StorefrontOrderDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void params.then(({ id }) => getOrder(id)
      .then(setOrder)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) return router.push(`/auth/login?returnTo=/account/orders/${id}`)
        setError(err instanceof Error ? err.message : 'Không thể tải chi tiết đơn hàng')
      }))
  }, [params, router])

  const [orderReturns, setOrderReturns] = useState<StorefrontReturn[]>([])
  const [showReturnForm, setShowReturnForm] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')
  // Chỉ hủy được khi đơn chưa đóng gói — sau đó hàng đã rời kho, phải dùng luồng trả hàng.
  const canCancel = order?.status === 'pending' && order.fulfillmentStatus === 'awaiting_packaging'

  async function handleCancel() {
    if (!order || !window.confirm('Bạn chắc chắn muốn hủy đơn hàng này?')) return
    setCancelling(true)
    setCancelError('')
    try {
      await cancelOrder(order.id)
      setOrder(await getOrder(order.id)) // tải lại để thấy hành trình mới
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Không thể hủy đơn hàng')
    } finally {
      setCancelling(false)
    }
  }

  // Yêu cầu trả hàng đã gửi cho đơn này (nếu có) — chỉ cần khi đơn đã giao.
  const orderId = order?.id
  const delivered = order?.fulfillmentStatus === 'delivered'
  useEffect(() => {
    if (!orderId || !delivered) return
    getReturns()
      .then((all) => setOrderReturns(all.filter((item) => item.orderId === orderId)))
      .catch(() => setOrderReturns([]))
  }, [orderId, delivered])
  const openReturn = orderReturns.find((item) => OPEN_RETURN_STATUSES.includes(item.status))
  const canReturn = delivered && !openReturn

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
            <div><span>Giao hàng</span><strong>{getFulfillmentStatusLabel(order.fulfillmentStatus)}</strong>{order.activeReturn && <em className="order-status order-status-return">Đang yêu cầu trả hàng</em>}</div>
          </div>

          {canCancel && <div className="order-cancel-box">
            <button className="button order-cancel-button" disabled={cancelling} onClick={() => void handleCancel()} type="button">{cancelling ? 'Đang hủy...' : 'Hủy đơn hàng'}</button>
            {cancelError && <p className="error" role="alert">{cancelError}</p>}
          </div>}

          {delivered && <div className="order-cancel-box">
            {openReturn
              ? <p className="return-hint">Bạn đã gửi yêu cầu trả hàng cho đơn này — <Link href={`/account/returns/${openReturn.id}`}>{openReturn.statusLabel}</Link></p>
              : canReturn && !showReturnForm && <button className="button order-cancel-button" onClick={() => setShowReturnForm(true)} type="button">Yêu cầu trả hàng</button>}
            {!openReturn && orderReturns.length > 0 && <Link href="/account/returns">Xem các yêu cầu trả hàng trước đây →</Link>}
          </div>}
          {canReturn && showReturnForm && <ReturnRequestForm
            orderId={order.id}
            items={order.items}
            onCancel={() => setShowReturnForm(false)}
            onCreated={(created) => { setShowReturnForm(false); router.push(`/account/returns/${created.id}`) }}
          />}

          <OrderTimeline events={order.events ?? []} trackingCode={order.trackingCode} tripCode={order.tripCode} />

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
