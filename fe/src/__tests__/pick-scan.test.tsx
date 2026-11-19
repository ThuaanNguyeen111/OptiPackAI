import { describe, expect, it } from 'vitest'
import { createPickEventIds, matchPickScan, pickScanLabel } from '../utils/pick-scan'

// AOFP-327 — quét ô phụ phải trừ đúng ô phụ; bấm lại sau khi mất phản hồi dùng lại mã thao tác cũ.
const line = {
  sku: 'AO-M-01',
  master_sku: 'ATHUN-M',
  bin_code: 'A-01-02',
  bin_location_id: 'binA',
  other_bins: [{ bin_location_id: 'binB', bin_code: 'B-02', quantity_on_hand: 4 }],
}

describe('matchPickScan (AOFP-327)', () => {
  it('AC1: quét mã ô phụ B → gửi id ô B, không phải ô chính A', () => {
    expect(matchPickScan(line, ' b-02 ')).toEqual({ kind: 'other_bin', code: 'B-02', binLocationId: 'binB', quantityOnHand: 4 })
  })

  it('quét SKU / SKU nội bộ / ô chính / "ô SKU" → ô chính', () => {
    expect(matchPickScan(line, 'ao-m-01')).toMatchObject({ kind: 'sku', binLocationId: 'binA' })
    expect(matchPickScan(line, 'ATHUN-M')).toMatchObject({ kind: 'sku', binLocationId: 'binA' })
    expect(matchPickScan(line, 'A-01-02')).toMatchObject({ kind: 'bin', binLocationId: 'binA' })
    expect(matchPickScan(line, 'A-01-02 AO-M-01')).toMatchObject({ kind: 'bin', binLocationId: 'binA' })
    expect(matchPickScan(line, 'C-09')).toBeNull()
    expect(matchPickScan(line, '  ')).toBeNull()
  })

  it('nhãn ghi rõ khớp cái gì', () => {
    expect(pickScanLabel(matchPickScan(line, 'A-01-02')!, true)).toBe('Khớp ô A-01-02')
    expect(pickScanLabel(matchPickScan(line, 'AO-M-01')!, true)).toBe('Khớp SKU AO-M-01')
  })
})

describe('createPickEventIds (AOFP-327 AC3)', () => {
  it('cùng (dòng, số lượng, ô) giữ nguyên mã tới khi thành công; đổi số lượng là mã mới', () => {
    let n = 0
    const ids = createPickEventIds(() => `id-${String(++n)}`)
    const first = ids.idFor('g1|AO|2|binA')
    expect(ids.idFor('g1|AO|2|binA')).toBe(first) // bấm lại sau khi mất phản hồi
    expect(ids.idFor('g1|AO|1|binA')).not.toBe(first)
    ids.done('g1|AO|2|binA')
    expect(ids.idFor('g1|AO|2|binA')).not.toBe(first) // lần lấy tiếp theo sau khi đã ghi
  })
})
