import { apiRequest } from '../lib/api'
import type {
  ReturnActionInput,
  ReturnItem,
  ReturnListResult,
  ReturnRequest,
} from '../types/returns'

function toQuery(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    qs.set(key, value)
  }
  const encoded = qs.toString()
  return encoded ? `?${encoded}` : ''
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function pickNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

function toIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString()
  }
  if (typeof value === 'string' && value.length > 0) return value
  return null
}

function mapItem(raw: unknown): ReturnItem | null {
  const row = asRecord(raw)
  if (!row) return null
  const sellerSku = pickString(row.sellerSku, row.seller_sku)
  if (!sellerSku) return null
  return {
    sellerSku,
    quantity: pickNumber(row.quantity) || 1,
    reasonCode: pickString(row.reasonCode, row.reason_code),
    reasonLabel: pickString(row.reasonLabel, row.reason_label),
  }
}

export function mapReturnRequest(raw: unknown): ReturnRequest | null {
  const row = asRecord(raw)
  if (!row) return null
  const id = pickString(row.id, row._id)
  if (!id) return null
  const rawItems = Array.isArray(row.items) ? row.items : []
  return {
    id,
    rmaCode: pickString(row.rmaCode, row.rma_code),
    orderGroupId: pickString(row.orderGroupId, row.order_group_id),
    shipmentId: pickString(row.shipmentId, row.shipment_id) || null,
    type: pickString(row.type) || 'return_refund',
    source: pickString(row.source),
    status: pickString(row.status) || 'requested',
    items: rawItems
      .map(mapItem)
      .filter((item): item is ReturnItem => item !== null),
    customerNote: pickString(row.customerNote, row.customer_note) || null,
    decisionNote: pickString(row.decisionNote, row.decision_note) || null,
    createdBy: pickString(row.createdBy, row.created_by) || null,
    decidedBy: pickString(row.decidedBy, row.decided_by) || null,
    version: pickNumber(row.version, row.__v),
    closedAt: toIso(row.closedAt) ?? toIso(row.closed_at),
    createdAt: toIso(row.createdAt) ?? toIso(row.created_at),
    updatedAt: toIso(row.updatedAt) ?? toIso(row.updated_at),
  }
}

function requireReturn(raw: unknown): ReturnRequest {
  const mapped = mapReturnRequest(raw)
  if (!mapped) throw new Error('Server không trả phiếu trả hàng hợp lệ.')
  return mapped
}

export async function listReturns(params: {
  status?: string
  order_group_id?: string
  page?: number
  limit?: number
} = {}): Promise<ReturnListResult> {
  const query = toQuery({
    status: params.status,
    order_group_id: params.order_group_id,
    page: params.page != null ? String(params.page) : undefined,
    limit: params.limit != null ? String(params.limit) : undefined,
  })
  const res = await apiRequest<unknown>(`/returns${query}`, { auth: true })
  const row = asRecord(res)
  const rawItems = Array.isArray(res)
    ? res
    : Array.isArray(row?.items)
      ? row.items
      : []
  const items = rawItems
    .map(mapReturnRequest)
    .filter((item): item is ReturnRequest => item !== null)
  return {
    items,
    total: pickNumber(row?.total) || items.length,
    page: pickNumber(row?.page) || 1,
    limit: pickNumber(row?.limit) || items.length,
  }
}

export async function getReturn(id: string): Promise<ReturnRequest> {
  return requireReturn(
    await apiRequest<unknown>(`/returns/${encodeURIComponent(id)}`, {
      auth: true,
    }),
  )
}

export async function approveReturn(
  id: string,
  input: ReturnActionInput,
): Promise<ReturnRequest> {
  return requireReturn(
    await apiRequest<unknown>(
      `/returns/${encodeURIComponent(id)}/approve`,
      {
        method: 'POST',
        body: {
          expected_version: input.expected_version,
          ...(input.note ? { note: input.note } : {}),
        },
        auth: true,
      },
    ),
  )
}

export async function rejectReturn(
  id: string,
  input: ReturnActionInput,
): Promise<ReturnRequest> {
  return requireReturn(
    await apiRequest<unknown>(`/returns/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: {
        expected_version: input.expected_version,
        note: input.note ?? '',
      },
      auth: true,
    }),
  )
}
