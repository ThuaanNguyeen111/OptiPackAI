import { apiRequest, apiRequestBlob } from '../lib/api'

export function historyShippingLine(item: HistoryItem): string | null {
  if (item.category !== 'shipping' || !item.details) return null
  const details = item.details
  const read = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = details[key]
      if (value == null || value === '') continue
      return String(value)
    }
    return null
  }
  const parts = [
    read('carrier'),
    read('service'),
    read('trackingCode', 'tracking_code'),
  ].filter((part): part is string => part != null)
  return parts.length > 0 ? parts.join(' · ') : null
}

export type HistoryActor = {
  id: string
  name: string
  role: string | null
}

export type HistoryItem = {
  id: string
  occurredAt: string
  category: string
  categoryLabel: string
  action: string
  summary: string
  actor: HistoryActor | null
  orderGroupId: string | null
  entity: { type: string; id: string | null; code: string | null } | null
  skus: string[]
  quantity: number | null
  fromStatus: string | null
  toStatus: string | null
  details?: Record<string, unknown>
}

export type HistoryCategoryOption = {
  code: string
  label: string
}

export type HistoryListResult = {
  items: HistoryItem[]
  nextBefore: string | null
  categories: HistoryCategoryOption[]
}

export type HistoryQuery = {
  category?: string
  from?: string
  to?: string
  before?: string
  limit?: number
  actor_id?: string
  mine?: boolean
  sku?: string
  order_group_id?: string
  order_code?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

function toQuery(params: HistoryQuery): string {
  const qs = new URLSearchParams()
  if (params.category) qs.set('category', params.category)
  if (params.from) qs.set('from', params.from)
  if (params.to) qs.set('to', params.to)
  if (params.before) qs.set('before', params.before)
  if (params.limit != null) qs.set('limit', String(params.limit))
  if (params.actor_id) qs.set('actor_id', params.actor_id)
  if (params.mine === true) qs.set('mine', 'true')
  if (params.mine === false) qs.set('mine', 'false')
  if (params.sku) qs.set('sku', params.sku)
  if (params.order_group_id) qs.set('order_group_id', params.order_group_id)
  if (params.order_code) qs.set('order_code', params.order_code)
  const encoded = qs.toString()
  return encoded ? `?${encoded}` : ''
}

function mapActor(raw: unknown): HistoryActor | null {
  const row = asRecord(raw)
  if (!row) return null
  const id = pickString(row.id, row._id)
  if (!id) return null
  return {
    id,
    name: pickString(row.name) || id,
    role: pickString(row.role) || null,
  }
}

function mapItem(raw: unknown): HistoryItem | null {
  const row = asRecord(raw)
  if (!row) return null
  const id = pickString(row.id, row._id)
  const occurredAt = pickString(row.occurredAt, row.occurred_at)
  if (!id || !occurredAt) return null
  const entityRow = asRecord(row.entity)
  const skus = Array.isArray(row.skus)
    ? row.skus.filter((sku): sku is string => typeof sku === 'string')
    : []
  return {
    id,
    occurredAt,
    category: pickString(row.category),
    categoryLabel: pickString(row.categoryLabel, row.category_label),
    action: pickString(row.action),
    summary: pickString(row.summary),
    actor: mapActor(row.actor),
    orderGroupId: pickString(row.orderGroupId, row.order_group_id) || null,
    entity: entityRow
      ? {
          type: pickString(entityRow.type),
          id: pickString(entityRow.id) || null,
          code: pickString(entityRow.code) || null,
        }
      : null,
    skus,
    quantity: typeof row.quantity === 'number' ? row.quantity : null,
    fromStatus: pickString(row.fromStatus, row.from_status) || null,
    toStatus: pickString(row.toStatus, row.to_status) || null,
    details: asRecord(row.details) ?? undefined,
  }
}

function mapCategory(raw: unknown): HistoryCategoryOption | null {
  const row = asRecord(raw)
  if (!row) return null
  const code = pickString(row.code)
  if (!code) return null
  return { code, label: pickString(row.label) || code }
}

export async function listHistory(params: HistoryQuery = {}): Promise<HistoryListResult> {
  const res = asRecord(await apiRequest<unknown>(`/history${toQuery(params)}`, { auth: true }))
  const items = Array.isArray(res?.items) ? res.items.flatMap((row) => {
    const item = mapItem(row)
    return item ? [item] : []
  }) : []
  const categories = Array.isArray(res?.categories)
    ? res.categories.flatMap((row) => {
        const item = mapCategory(row)
        return item ? [item] : []
      })
    : []
  return {
    items,
    nextBefore: pickString(res?.nextBefore, res?.next_before) || null,
    categories,
  }
}

export async function listHistoryCategories(): Promise<HistoryCategoryOption[]> {
  const res = asRecord(await apiRequest<unknown>('/history/categories', { auth: true }))
  const rows = Array.isArray(res?.categories) ? res.categories : Array.isArray(res) ? res : []
  return rows.flatMap((row) => {
    const item = mapCategory(row)
    return item ? [item] : []
  })
}

export async function getOrderGroupTimeline(
  groupId: string,
): Promise<{ orderGroupId: string; items: HistoryItem[] }> {
  const res = asRecord(
    await apiRequest<unknown>(
      `/history/order-groups/${encodeURIComponent(groupId)}/timeline`,
      { auth: true },
    ),
  )
  const items = Array.isArray(res?.items)
    ? res.items.flatMap((row) => {
        const item = mapItem(row)
        return item ? [item] : []
      })
    : []
  return {
    orderGroupId: pickString(res?.orderGroupId, res?.order_group_id) || groupId,
    items,
  }
}

export async function exportHistoryCsv(params: HistoryQuery = {}): Promise<Blob> {
  return apiRequestBlob(`/history/export${toQuery(params)}`, { auth: true })
}
