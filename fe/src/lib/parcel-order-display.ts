import { recipientBorderClass } from './recipient-color'

export type ParcelOrderFields = {
  parcelNo: number
  orderId?: string | null
  platformOrderId?: string | null
  recipientName?: string | null
  orderIds?: string[]
  platformOrderIds?: (string | null)[]
}

export type ParcelOrderGroup<T extends ParcelOrderFields> = {
  key: string
  platformOrderId: string | null
  recipientName: string | null
  /** Kiện gộp nhiều đơn: mã các đơn trong kiện. Kiện thường = rỗng. */
  sharedOrderCodes: string[]
  parcels: T[]
}

/** Mã các đơn trong kiện gộp. Rỗng nếu kiện chỉ thuộc 1 đơn. */
export function sharedOrderCodes(parcel: ParcelOrderFields): string[] {
  if ((parcel.orderIds?.length ?? 0) < 2) return []
  return (parcel.platformOrderIds ?? []).flatMap((code) => (code ? [code] : []))
}

function isShared(parcel: ParcelOrderFields): boolean {
  return (parcel.orderIds?.length ?? 0) >= 2
}

export type ParcelOrderLine = {
  orderId: string
  platformOrderId: string | null
  recipientName: string | null
  items: { sku: string; quantity: number }[]
}

/** Kiện gộp: món của từng đơn, để nhân viên biết món nào thuộc phiếu nào. */
export function parcelOrderLines(
  parcel: ParcelOrderFields & { placements?: { sku: string; orderId?: string | null }[] },
  orders: { orderId?: string; platformOrderId?: string | null; recipientName?: string | null }[],
): ParcelOrderLine[] {
  if (!isShared(parcel)) return []
  return (parcel.orderIds ?? []).map((orderId, index) => {
    const order = orders.find((row) => row.orderId === orderId)
    const counts = new Map<string, number>()
    for (const placement of parcel.placements ?? []) {
      if ((placement.orderId ?? parcel.orderId) !== orderId) continue
      counts.set(placement.sku, (counts.get(placement.sku) ?? 0) + 1)
    }
    return {
      orderId,
      platformOrderId: order?.platformOrderId ?? parcel.platformOrderIds?.[index] ?? null,
      recipientName: order?.recipientName ?? null,
      items: [...counts].map(([sku, quantity]) => ({ sku, quantity })),
    }
  })
}

export function groupParcelsByOrder<T extends ParcelOrderFields>(
  parcels: T[],
): { multi: boolean; groups: ParcelOrderGroup<T>[] } {
  const buckets = new Map<string, ParcelOrderGroup<T>>()
  for (const parcel of parcels) {
    const key = isShared(parcel)
      ? `shared-${[...(parcel.orderIds ?? [])].sort().join('+')}`
      : parcel.orderId || parcel.platformOrderId || `parcel-${String(parcel.parcelNo)}`
    const existing = buckets.get(key)
    if (existing) {
      existing.parcels.push(parcel)
      continue
    }
    buckets.set(key, {
      key,
      platformOrderId: parcel.platformOrderId ?? null,
      recipientName: parcel.recipientName ?? null,
      sharedOrderCodes: sharedOrderCodes(parcel),
      parcels: [parcel],
    })
  }
  const groups = [...buckets.values()]
  const names = new Set(
    groups
      .map((group) => (group.recipientName ?? '').trim())
      .filter((name) => name.length > 0 && !name.includes('*')),
  )
  const anyShared = groups.some((group) => group.sharedOrderCodes.length > 0)
  return { multi: names.size >= 2 || anyShared, groups }
}

export function parcelOrderCaption(
  parcel: ParcelOrderFields,
  vi: boolean,
): string | null {
  const shared = sharedOrderCodes(parcel)
  if (shared.length > 0) {
    return vi ? `Kiện chung đơn ${shared.join(' + ')}` : `Shared parcel: ${shared.join(' + ')}`
  }
  const name = (parcel.recipientName ?? '').trim()
  const code = (parcel.platformOrderId ?? '').trim()
  if (!name && !code) return null
  if (!code) return name || null
  if (!name) return vi ? `Đơn ${code}` : `Order ${code}`
  return vi ? `Đơn ${code} · ${name}` : `Order ${code} · ${name}`
}

export function parcelOrderHeading(
  group: ParcelOrderGroup<ParcelOrderFields>,
  vi: boolean,
): string {
  const count = group.parcels.length
  const name = (group.recipientName ?? '').trim()
  const code = (group.platformOrderId ?? '').trim()
  const countLabel = vi ? `${String(count)} kiện` : `${String(count)} parcel(s)`
  if (group.sharedOrderCodes.length > 0) {
    const codes = group.sharedOrderCodes.join(' + ')
    return vi ? `Kiện chung đơn ${codes} (${countLabel})` : `Shared: ${codes} (${countLabel})`
  }
  if (!code) {
    return name ? `${name} (${countLabel})` : countLabel
  }
  const who = name || (vi ? '—' : '—')
  return vi
    ? `Đơn ${code} — ${who} (${countLabel})`
    : `Order ${code} — ${who} (${countLabel})`
}

export function parcelBorderClass(name: string | null | undefined, multi: boolean): string {
  if (!multi) return ''
  const color = recipientBorderClass(name)
  return color ? `border-l-4 ${color}` : ''
}
