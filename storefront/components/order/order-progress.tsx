import type { OrderProgress } from '@/types/storefront'

function formatTime(value: string) {
  return new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}

/**
 * 23/10/2026 — Thanh tiến trình CỐ ĐỊNH 7 bước, hiện ngay từ lúc đặt hàng: khách luôn thấy đơn
 * đang ở đâu và còn những bước nào. Nhánh hủy / giao thất bại / hoàn hàng hiện ngay dưới thanh.
 */
export function OrderProgressBar({ progress, carrier, trackingCode }: { progress: OrderProgress; carrier?: string | null; trackingCode?: string | null }) {
  const { steps, branch, hint, displayStatus } = progress
  return <section className={`order-progress order-progress-${displayStatus.tone}`} aria-labelledby="order-progress-title">
    <div className="order-progress-head">
      <span className="eyebrow">Theo dõi đơn hàng</span>
      <h2 id="order-progress-title">{displayStatus.label}</h2>
      <p className="order-progress-hint">{hint}</p>
      {trackingCode && <p className="order-progress-tracking">{carrier ? <>{carrier} · </> : null}Mã vận đơn <strong>{trackingCode}</strong></p>}
    </div>
    <ol className="order-progress-steps">
      {steps.map((step) => <li className={`order-progress-step is-${step.state}`} key={step.key} aria-current={step.state === 'current' ? 'step' : undefined}>
        <span className="order-progress-marker" aria-hidden="true">{step.state === 'done' ? '✓' : step.state === 'problem' ? '!' : ''}</span>
        <span className="order-progress-label">{step.label}</span>
        {step.at && <time dateTime={step.at}>{formatTime(step.at)}</time>}
      </li>)}
    </ol>
    {branch && <div className={`order-progress-branch is-${branch.key}`} role="status">
      <strong>{branch.label}</strong>
      {branch.reason && <span>Lý do: {branch.reason}</span>}
      {branch.at && <time dateTime={branch.at}>{formatTime(branch.at)}</time>}
    </div>}
  </section>
}
