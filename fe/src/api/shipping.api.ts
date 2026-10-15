import { apiRequest, apiRequestBlob } from '../lib/api'
import type { ShipmentToLocation } from './shipments.api'

export type ShippingCarrier = {
  id: string
  code: string
  name: string
  kind: 'table' | 'live' | string
  isSample: boolean
  services: { code: string; name: string }[]
}

export type ShippingServiceQuote = {
  carrierCode: string
  carrierName: string
  serviceCode: string
  serviceName: string
  etaMinDays: number
  etaMaxDays: number
  totalCostVnd: number
  isSample: boolean
  isLive: boolean
  unavailableReason: string | null
  assumptions: string[]
}

export type ShippingGroupQuote = {
  quotes: ShippingServiceQuote[]
  recommended: { carrierCode: string; serviceCode: string } | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value
  }
  return ''
}

function pickNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

function mapCarrier(value: unknown): ShippingCarrier | null {
  const row = asRecord(value)
  if (!row) return null
  const code = pickString(row.code)
  if (!code) return null
  const services = Array.isArray(row.services)
    ? row.services.flatMap((service) => {
        const entry = asRecord(service)
        if (!entry) return []
        const serviceCode = pickString(entry.code)
        if (!serviceCode) return []
        return [{ code: serviceCode, name: pickString(entry.name) || serviceCode }]
      })
    : []
  return {
    id: pickString(row.id),
    code,
    name: pickString(row.name) || code,
    kind: pickString(row.kind) || 'table',
    isSample: row.isSample === true,
    services,
  }
}

export async function listShippingCarriers(): Promise<ShippingCarrier[]> {
  const res = await apiRequest<unknown>('/shipping/carriers', { auth: true })
  if (!Array.isArray(res)) return []
  return res.flatMap((item) => {
    const mapped = mapCarrier(item)
    return mapped ? [mapped] : []
  })
}

export type ShippingSettings = {
  strategy: 'cheapest' | 'fastest' | 'fixed'
  defaultCarrierCode: string | null
  defaultServiceCode: string | null
}

export type PackagingOptionsView = {
  totalCurrentVnd: number
  totalBestVnd: number
  totalSavingVnd: number
  lines: string[]
}

export async function getShippingSettings(): Promise<ShippingSettings> {
  const res = await apiRequest<unknown>('/shipping/settings', { auth: true })
  const row = asRecord(res)
  const strategy = pickString(row?.strategy)
  return {
    strategy:
      strategy === 'fastest' || strategy === 'fixed' ? strategy : 'cheapest',
    defaultCarrierCode: pickString(row?.defaultCarrierCode) || null,
    defaultServiceCode: pickString(row?.defaultServiceCode) || null,
  }
}

export async function updateShippingSettings(input: {
  strategy: ShippingSettings['strategy']
  default_carrier_code?: string
  default_service_code?: string
}): Promise<ShippingSettings> {
  const res = await apiRequest<unknown>('/shipping/settings', {
    method: 'PUT',
    auth: true,
    body: input,
  })
  const row = asRecord(res)
  const strategy = pickString(row?.strategy)
  return {
    strategy:
      strategy === 'fastest' || strategy === 'fixed' ? strategy : input.strategy,
    defaultCarrierCode: pickString(row?.defaultCarrierCode) || null,
    defaultServiceCode: pickString(row?.defaultServiceCode) || null,
  }
}

export async function createShippingCarrier(input: {
  code: string
  name: string
  services: {
    code: string
    name: string
    eta_min_days: number
    eta_max_days: number
    bands: { up_to_g: number; price_vnd: number }[]
  }[]
  is_sample?: boolean
}): Promise<ShippingCarrier> {
  const res = await apiRequest<unknown>('/shipping/carriers', {
    method: 'POST',
    auth: true,
    body: input,
  })
  const mapped = mapCarrier(res)
  if (!mapped) throw new Error('Server không trả hãng vận chuyển hợp lệ.')
  return mapped
}

export async function updateShippingCarrier(
  id: string,
  input: { is_active?: boolean },
): Promise<ShippingCarrier> {
  const res = await apiRequest<unknown>(
    `/shipping/carriers/${encodeURIComponent(id)}`,
    { method: 'PATCH', auth: true, body: input },
  )
  const mapped = mapCarrier(res)
  if (!mapped) throw new Error('Server không trả hãng vận chuyển hợp lệ.')
  return mapped
}

export async function quotePackagingOptions(
  groupId: string,
  carrierCode: string,
  serviceCode: string,
  location?: ShipmentToLocation,
): Promise<PackagingOptionsView> {
  const qs = new URLSearchParams({
    carrier_code: carrierCode,
    service_code: serviceCode,
  })
  if (location?.street) qs.set('street', location.street)
  if (location?.ward_name) qs.set('ward_name', location.ward_name)
  if (location?.province_name) qs.set('province_name', location.province_name)
  if (location?.phone) qs.set('phone', location.phone)
  const res = await apiRequest<unknown>(
    `/shipping/packaging-options/${encodeURIComponent(groupId)}?${qs.toString()}`,
    { auth: true },
  )
  const row = asRecord(res)
  const parcels = Array.isArray(row?.parcels) ? row.parcels : []
  const lines = parcels.flatMap((item): string[] => {
    const parcel = asRecord(item)
    if (!parcel) return []
    const no = pickNumber(parcel.parcelNo)
    const current = asRecord(parcel.current)
    const best = asRecord(parcel.best)
    const currentCode = pickString(current?.boxCode) || '—'
    const bestCode = pickString(best?.boxCode)
    const saving = pickNumber(parcel.savingVnd)
    return [
      `Kiện ${no}: đang ${currentCode}${bestCode ? `, rẻ hơn ${bestCode}` : ''}${saving > 0 ? ` (−${saving}đ)` : ''}`,
    ]
  })
  return {
    totalCurrentVnd: pickNumber(row?.totalCurrentVnd),
    totalBestVnd: pickNumber(row?.totalBestVnd),
    totalSavingVnd: pickNumber(row?.totalSavingVnd),
    lines,
  }
}

export async function quoteShippingGroup(
  groupId: string,
  location?: ShipmentToLocation,
): Promise<ShippingGroupQuote> {
  const qs = new URLSearchParams()
  if (location?.street) qs.set('street', location.street)
  if (location?.ward_name) qs.set('ward_name', location.ward_name)
  if (location?.province_name) qs.set('province_name', location.province_name)
  if (location?.phone) qs.set('phone', location.phone)
  const query = qs.toString()
  const res = await apiRequest<unknown>(
    `/shipping/quote/${encodeURIComponent(groupId)}${query ? `?${query}` : ''}`,
    { auth: true },
  )
  const row = asRecord(res)
  const quotes = Array.isArray(row?.quotes)
    ? row.quotes.flatMap((item): ShippingServiceQuote[] => {
        const quote = asRecord(item)
        if (!quote) return []
        const carrierCode = pickString(quote.carrierCode)
        const serviceCode = pickString(quote.serviceCode)
        if (!carrierCode || !serviceCode) return []
        const assumptions = Array.isArray(quote.assumptions)
          ? quote.assumptions.filter((line): line is string => typeof line === 'string')
          : []
        return [
          {
            carrierCode,
            carrierName: pickString(quote.carrierName) || carrierCode,
            serviceCode,
            serviceName: pickString(quote.serviceName) || serviceCode,
            etaMinDays: pickNumber(quote.etaMinDays),
            etaMaxDays: pickNumber(quote.etaMaxDays),
            totalCostVnd: pickNumber(quote.totalCostVnd),
            isSample: quote.isSample === true,
            isLive: quote.isLive === true,
            unavailableReason:
              typeof quote.unavailableReason === 'string' && quote.unavailableReason
                ? quote.unavailableReason
                : null,
            assumptions,
          },
        ]
      })
    : []
  const recommended = asRecord(row?.recommended)
  return {
    quotes,
    recommended:
      recommended && pickString(recommended.carrierCode) && pickString(recommended.serviceCode)
        ? {
            carrierCode: pickString(recommended.carrierCode),
            serviceCode: pickString(recommended.serviceCode),
          }
        : null,
  }
}

export async function openShippingDocument(path: string): Promise<void> {
  const blob = await apiRequestBlob(path)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener')
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
