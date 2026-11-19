import type { MissingReport } from '../types/order-groups'

/** AOFP-329 — "Thiếu: SKU X 2/5 · báo bởi Minh 10:42 · <ghi chú>" cho màn quyết định thiếu hàng. */
export function missingReportLine(
  report: MissingReport,
  vi: boolean,
  formatAt: (iso: string) => string,
): string {
  const parts = [
    vi
      ? `Thiếu: ${report.sku} ${String(report.quantity)}/${String(report.ordered)}`
      : `Missing: ${report.sku} ${String(report.quantity)}/${String(report.ordered)}`,
    `${vi ? 'báo bởi' : 'reported by'} ${report.reporterName ?? '—'}${report.at ? ` ${formatAt(report.at)}` : ''}`,
  ]
  if (report.note) parts.push(report.note)
  return parts.join(' · ')
}
