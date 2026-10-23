import type { StorefrontOrderEvent } from '@/types/storefront'

function formatTime(value: string) {
  return new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Hành trình đơn: sự kiện mới nhất ở trên cùng, nêu lý do khi giao không thành công. */
export function OrderTimeline({ events, trackingCode, tripCode, carrier, title }: { events: StorefrontOrderEvent[]; trackingCode?: string | null; tripCode?: string | null; carrier?: string | null; title?: string }) {
  if (!events.length && !trackingCode) return null
  const ordered = [...events].reverse()
  return <section className="order-timeline-panel" aria-labelledby="order-timeline-title">
    <span className="eyebrow">Theo dõi đơn hàng</span>
    <h2 id="order-timeline-title">{title ?? 'Hành trình đơn hàng'}</h2>
    {trackingCode && <p className="order-timeline-tracking">{carrier ? <>Đơn vị vận chuyển: <strong>{carrier}</strong> · </> : null}Mã vận đơn: <strong>{trackingCode}</strong>{tripCode ? ` · Giao cùng chuyến ${tripCode}` : ''}</p>}
    {!trackingCode && tripCode && <p className="order-timeline-tracking">Giao cùng chuyến {tripCode}</p>}
    <ol className="order-timeline">
      {ordered.map((event, index) => <li className={index === 0 ? 'is-current' : ''} key={`${event.status}-${event.occurredAt}-${index}`}>
        <span className="order-timeline-dot" aria-hidden="true" />
        <div>
          <strong>{event.label}</strong>
          {event.reason && <p>Lý do: {event.reason}</p>}
          <time dateTime={event.occurredAt}>{formatTime(event.occurredAt)}</time>
        </div>
      </li>)}
    </ol>
  </section>
}
