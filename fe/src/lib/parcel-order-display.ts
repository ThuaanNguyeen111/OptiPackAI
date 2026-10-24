import { recipientBorderClass } from './recipient-color'

export type ParcelOrderFields = {
  parcelNo: number
  orderId?: string | null
  platformOrderId?: string | null
  recipientName?: string | null
}

export type ParcelOrderGroup<T extends ParcelOrderFields> = {
  key: string
  platformOrderId: string | null
  recipientName: string | null
  parcels: T[]
}

export function groupParcelsByOrder<T extends ParcelOrderFields>(
  parcels: T[],
): { multi: boolean; groups: ParcelOrderGroup<T>[] } {
  const buckets = new Map<string, ParcelOrderGroup<T>>()
  for (const parcel of parcels) {
    const key = parcel.orderId || parcel.platformOrderId || `parcel-${String(parcel.parcelNo)}`
    const existing = buckets.get(key)
    if (existing) {
      existing.parcels.push(parcel)
      continue
    }
    buckets.set(key, {
      key,
      platformOrderId: parcel.platformOrderId ?? null,
      recipientName: parcel.recipientName ?? null,
      parcels: [parcel],
    })
  }
  const groups = [...buckets.values()]
  const names = new Set(
    groups
      .map((group) => (group.recipientName ?? '').trim())
      .filter((name) => name.length > 0 && !name.includes('*')),
  )
  return { multi: names.size >= 2, groups }
}

export function parcelOrderCaption(
  parcel: ParcelOrderFields,
  vi: boolean,
): string | null {
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
