import { describe, expect, it } from 'vitest'
import { carrierBookingProblems, hasUnbookedParcels, humanCarrierError } from './carrier-display'
import type { Shipment } from '../types/shipments'

/** AOFP-325 — banner lỗi đặt hãng: câu cho người đọc, không hiện mã máy. */
const parcel = (no: number, code: string | null, bookingError: string | null) => ({
  parcelNo: no, orderId: 'o1', clientOrderCode: `SHP-${String(no)}`, carrierOrderCode: code, sortCode: null,
  weightG: null, dimensionsCm: null, feeTotalVnd: null, expectedDeliveryAt: null,
  carrierStatus: null, carrierStatusLabel: null, bookingError,
})
const shipment = (parcels: ReturnType<typeof parcel>[]): Shipment =>
  ({ carrierName: 'GHN', carrierParcels: parcels }) as unknown as Shipment

describe('carrier-display', () => {
  it('bỏ mã máy ở đầu câu lỗi', () => {
    expect(humanCarrierError('CARRIER_ADDRESS_CONFLICT: Địa chỉ không hợp lệ')).toBe('Địa chỉ không hợp lệ')
    expect(humanCarrierError('Địa chỉ không hợp lệ')).toBe('Địa chỉ không hợp lệ')
  })

  it('AC1 — kiện 2 bị hãng từ chối → câu "Chưa tạo được vận đơn GHN cho kiện 2: …"', () => {
    const s = shipment([parcel(1, 'GHN1', null), parcel(2, null, 'CARRIER_ADDRESS_CONFLICT: địa chỉ không hợp lệ')])
    expect(carrierBookingProblems(s, true)).toEqual(['Chưa tạo được vận đơn GHN cho kiện 2: địa chỉ không hợp lệ'])
    expect(hasUnbookedParcels(s)).toBe(true)
  })

  it('mọi kiện đã có mã → không còn gì để tạo lại', () => {
    const s = shipment([parcel(1, 'GHN1', null), parcel(2, 'GHN2', null)])
    expect(carrierBookingProblems(s, true)).toEqual([])
    expect(hasUnbookedParcels(s)).toBe(false)
  })

  it('AOFP-326 — kiện đã có mã nhưng hãng đã hủy → vẫn tạo lại được', () => {
    const s = shipment([parcel(1, 'GHN1', null), { ...parcel(2, 'GHN2', null), carrierStatus: 'cancel' }])
    expect(hasUnbookedParcels(s)).toBe(true)
  })
})
