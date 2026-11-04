import { useState } from 'react'

export type RevenueDay = {
  date: string
  revenuePlacedVnd: number
  revenueDeliveredVnd: number
}

const GRID_STEPS = [1, 0.5, 0]

function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount))
}

function formatCompact(amount: number, vi: boolean): string {
  if (amount >= 1_000_000) {
    const value = amount / 1_000_000
    return `${Number.isInteger(value) ? value : value.toFixed(1)}${vi ? ' tr' : 'M'}`
  }
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}k`
  return String(Math.round(amount))
}

function formatDay(date: string): string {
  const [, month, day] = date.split('-')
  return `${day}/${month}`
}

export function RevenueChart({ days, vi }: { days: RevenueDay[]; vi: boolean }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const max = Math.max(1, ...days.map((day) => Math.max(day.revenuePlacedVnd, day.revenueDeliveredVnd)))
  const active = hovered === null ? null : (days[hovered] ?? null)
  const placedLabel = vi ? 'Đặt hàng' : 'Placed'
  const deliveredLabel = vi ? 'Đã giao' : 'Delivered'

  if (days.length === 0) {
    return <p className="dash-empty mt-3">{vi ? 'Chưa có doanh thu trong kỳ.' : 'No revenue in range.'}</p>
  }

  return (
    <div className="dash-chart">
      <div className="dash-legend">
        <span>
          <i className="dash-swatch dash-swatch-placed" aria-hidden />
          {placedLabel}
        </span>
        <span>
          <i className="dash-swatch dash-swatch-delivered" aria-hidden />
          {deliveredLabel}
        </span>
      </div>

      <div className="dash-plot" onMouseLeave={() => setHovered(null)}>
        {GRID_STEPS.map((step) => (
          <div key={step} className="dash-grid" style={{ bottom: `${step * 100}%` }}>
            <span>{formatCompact(max * step, vi)}</span>
          </div>
        ))}

        <div className="dash-bars" aria-hidden>
          {days.map((day, index) => (
            <div
              key={day.date}
              className={`dash-col ${hovered === index ? 'is-active' : ''}`}
              onMouseEnter={() => setHovered(index)}
            >
              <span
                className="dash-bar dash-bar-placed"
                style={{ height: `${(day.revenuePlacedVnd / max) * 100}%` }}
              />
              <span
                className="dash-bar dash-bar-delivered"
                style={{ height: `${(day.revenueDeliveredVnd / max) * 100}%` }}
              />
            </div>
          ))}
        </div>

        {active && hovered !== null ? (
          <div
            className="dash-tooltip"
            style={{
              left: `calc(44px + (100% - 44px) * ${(hovered + 0.5) / days.length})`,
              transform: hovered > days.length / 2 ? 'translateX(-100%)' : undefined,
            }}
          >
            <strong>{formatDay(active.date)}</strong>
            <p>
              <i className="dash-swatch dash-swatch-placed" aria-hidden />
              {placedLabel} <b>{formatVnd(active.revenuePlacedVnd)}₫</b>
            </p>
            <p>
              <i className="dash-swatch dash-swatch-delivered" aria-hidden />
              {deliveredLabel} <b>{formatVnd(active.revenueDeliveredVnd)}₫</b>
            </p>
          </div>
        ) : null}
      </div>

      <div className="dash-axis" aria-hidden>
        <span>{formatDay(days[0]!.date)}</span>
        <span>{formatDay(days[days.length - 1]!.date)}</span>
      </div>

      {/* sr-only đặt trên div: thẻ table bỏ qua height 1px và làm cả trang dài ra */}
      <div className="sr-only">
        <table>
          <caption>{vi ? 'Doanh thu theo ngày' : 'Revenue by day'}</caption>
          <thead>
            <tr>
              <th>{vi ? 'Ngày' : 'Date'}</th>
              <th>{placedLabel}</th>
              <th>{deliveredLabel}</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date}>
                <td>{formatDay(day.date)}</td>
                <td>{formatVnd(day.revenuePlacedVnd)}₫</td>
                <td>{formatVnd(day.revenueDeliveredVnd)}₫</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
