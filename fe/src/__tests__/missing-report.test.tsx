import { describe, expect, it } from 'vitest'
import { missingReportLine } from '../utils/missing-report'

// AOFP-329 AC1 — màn quyết định hiện đủ: SKU, số thiếu / số đặt, người báo, giờ, ghi chú.
describe('missingReportLine', () => {
  const report = { sku: 'AO-M', quantity: 2, stillNeeded: 2, ordered: 5, note: 'Kệ trống', reporterName: 'Minh', pickRound: 1, at: '2026-11-19T03:42:00.000Z' }

  it('đủ thông tin', () => {
    expect(missingReportLine(report, true, () => '10:42')).toBe('Thiếu: AO-M 2/5 · báo bởi Minh 10:42 · Kệ trống')
  })

  it('không ghi chú, không rõ người báo', () => {
    expect(missingReportLine({ ...report, note: null, reporterName: null }, true, () => '10:42')).toBe('Thiếu: AO-M 2/5 · báo bởi — 10:42')
  })
})
