'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { ApiError, cancelReturn, getReturn } from '@/lib/api-client'
import { RETURN_TYPE_LABELS } from '@/lib/order-labels'
import type { StorefrontReturnDetail } from '@/types/storefront'

function formatTime(value: string) {
  return new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [data, setData] = useState<StorefrontReturnDetail | null>(null)
  const [error, setError] = useState('')
  const [canceling, setCanceling] = useState(false)

  async function cancel() {
    if (!data || !window.confirm('Hủy yêu cầu trả hàng này?')) return
    setCanceling(true)
    setError('')
    try {
      await cancelReturn(data.id)
      setData(await getReturn(data.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể hủy yêu cầu')
    } finally {
      setCanceling(false)
    }
  }

  useEffect(() => {
    void params.then(({ id }) => getReturn(id)
      .then(setData)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) return router.push(`/auth/login?returnTo=/account/returns/${id}`)
        setError(err instanceof Error ? err.message : 'Không thể tải yêu cầu trả hàng')
      }))
  }, [params, router])

  const events = data ? [...data.events].reverse() : []

  return <>
    <Header />
    <main className="page-shell">
      <div className="form-card order-detail-card">
        <Link className="order-back-link" href="/account/returns">← Yêu cầu trả hàng</Link>
        {error && <p className="error" role="alert">{error}</p>}
        {!error && !data && <p className="order-loading">Đang tải...</p>}
        {data && <>
          <div className="order-detail-header">
            <div className="page-title">
              <span className="eyebrow">{RETURN_TYPE_LABELS[data.type] ?? data.type}</span>
              <h1>Đơn {data.orderNumber}</h1>
              <p className="order-detail-date">Gửi ngày {new Date(data.createdAt).toLocaleDateString('vi-VN')}{data.rmaCode ? ` · Mã xử lý ${data.rmaCode}` : ''}</p>
            </div>
            <span className="order-detail-status">{data.statusLabel}</span>
          </div>

          {data.status === 'rejected' && data.decisionNote && <p className="error" role="status">Lý do từ chối: {data.decisionNote}</p>}
          {data.status === 'requested' && <div className="return-form-actions">
            <button className="button light" disabled={canceling} onClick={() => void cancel()} type="button">{canceling ? 'Đang hủy...' : 'Hủy yêu cầu'}</button>
          </div>}
          {data.status === 'approved' && <p className="return-hint">Cửa hàng đã duyệt. Vui lòng đóng gói và gửi sản phẩm về cửa hàng; chúng tôi sẽ cập nhật khi nhận được hàng.</p>}

          <section aria-labelledby="return-items-title">
            <div className="order-section-heading"><h2 id="return-items-title">Sản phẩm trả</h2></div>
            <div className="order-detail-items">
              {data.items.map((item) => <div className="order-detail-item" key={item.sku}>
                <div className="order-detail-item-copy"><h3>{item.sku}</h3><p>{item.reasonLabel}</p></div>
                <strong className="order-detail-item-price">× {item.quantity}</strong>
              </div>)}
            </div>
            {data.exchangeItems.length > 0 && <p className="order-timeline-tracking">Đổi sang: {data.exchangeItems.map((item) => `${item.sku} × ${String(item.quantity)}`).join(', ')}</p>}
            {data.customerNote && <p className="order-timeline-tracking">Ghi chú của bạn: {data.customerNote}</p>}
          </section>

          <section className="order-timeline-panel" aria-labelledby="return-timeline-title">
            <span className="eyebrow">Tiến trình</span>
            <h2 id="return-timeline-title">Hành trình yêu cầu</h2>
            <ol className="order-timeline">
              {events.map((event, index) => <li className={index === 0 ? 'is-current' : ''} key={`${event.occurredAt}-${index}`}>
                <span className="order-timeline-dot" aria-hidden="true" />
                <div><strong>{event.label}</strong>{event.reason && <p>{event.reason}</p>}<time dateTime={event.occurredAt}>{formatTime(event.occurredAt)}</time></div>
              </li>)}
            </ol>
          </section>
        </>}
      </div>
    </main>
    <Footer />
  </>
}
