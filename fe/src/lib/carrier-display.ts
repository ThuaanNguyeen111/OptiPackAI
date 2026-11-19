import type { Shipment } from '../types/shipments'

/** AOFP-325 — lỗi hãng lưu dạng "MÃ_MÁY: câu lỗi" → chỉ giữ câu cho người đọc. */
export function humanCarrierError(text: string): string {
  return text.replace(/^[A-Z][A-Z0-9_]+:\s*/, '')
}

/** Kiện chưa có mã hãng hoặc đã bị hãng hủy (AOFP-326) → "Tạo lại ở hãng" / sửa địa chỉ còn tác dụng. */
export function hasUnbookedParcels(shipment: Pick<Shipment, 'carrierParcels'>): boolean {
  return (shipment.carrierParcels ?? []).some((parcel) => !parcel.carrierOrderCode || parcel.carrierStatus === 'cancel')
}

/** Mỗi kiện đặt hãng lỗi → 1 câu "Chưa tạo được vận đơn GHN cho kiện 2: …". */
export function carrierBookingProblems(shipment: Pick<Shipment, 'carrierParcels' | 'carrierName'>, vi: boolean): string[] {
  const carrier = shipment.carrierName ?? (vi ? 'hãng' : 'carrier')
  return (shipment.carrierParcels ?? [])
    .filter((parcel) => !parcel.carrierOrderCode && parcel.bookingError)
    .map((parcel) =>
      vi
        ? `Chưa tạo được vận đơn ${carrier} cho kiện ${String(parcel.parcelNo)}: ${humanCarrierError(parcel.bookingError ?? '')}`
        : `Could not book parcel ${String(parcel.parcelNo)} with ${carrier}: ${humanCarrierError(parcel.bookingError ?? '')}`,
    )
}
