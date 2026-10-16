import { apiRequest } from '../lib/api'
import type {
  CreateReturnInput,
  ExchangeItem,
  InspectReturnLineInput,
  QuarantineLine,
  ReturnActionInput,
  ReturnInspectionLine,
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

function mapExchangeItem(raw: unknown): ExchangeItem | null {
  const row = asRecord(raw)
  if (!row) return null
  const sellerSku = pickString(row.sellerSku, row.seller_sku)
  if (!sellerSku) return null
  return { sellerSku, quantity: pickNumber(row.quantity) || 1 }
}

function mapInspection(raw: unknown): ReturnInspectionLine | null {
  const row = asRecord(raw)
  if (!row) return null
  const sellerSku = pickString(row.sellerSku, row.seller_sku)
  if (!sellerSku) return null
  return {
    sellerSku,
    quantity: pickNumber(row.quantity) || 1,
    result: pickString(row.result),
    disposition: pickString(row.disposition) || null,
    note: pickString(row.note) || null,
  }
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
  const rawExchange = Array.isArray(row.exchangeItems)
    ? row.exchangeItems
    : Array.isArray(row.exchange_items)
      ? row.exchange_items
      : []
  const rawInspection = Array.isArray(row.inspection) ? row.inspection : []
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
    exchangeItems: rawExchange
      .map(mapExchangeItem)
      .filter((item): item is ExchangeItem => item !== null),
    inspection: rawInspection
      .map(mapInspection)
      .filter((item): item is ReturnInspectionLine => item !== null),
    replacementStatus:
      pickString(row.replacementStatus, row.replacement_status) || null,
    replacementGroupId:
      pickString(row.replacementGroupId, row.replacement_group_id) || null,
    replacementError:
      pickString(row.replacementError, row.replacement_error) || null,
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

export async function listReturnReasonCodes(): Promise<
  { code: string; label: string }[]
> {
  const res = await apiRequest<unknown>('/returns/reason-codes', { auth: true })
  if (!Array.isArray(res)) return []
  return res.flatMap((raw) => {
    const row = asRecord(raw)
    if (!row) return []
    const code = pickString(row.code)
    if (!code) return []
    return [{ code, label: pickString(row.label) || code }]
  })
}

export async function createReturn(
  input: CreateReturnInput,
): Promise<ReturnRequest> {
  return requireReturn(
    await apiRequest<unknown>('/returns', {
      method: 'POST',
      body: input,
      auth: true,
    }),
  )
}

export async function receiveReturn(
  id: string,
  input: ReturnActionInput,
): Promise<ReturnRequest> {
  return requireReturn(
    await apiRequest<unknown>(`/returns/${encodeURIComponent(id)}/receive`, {
      method: 'POST',
      body: { expected_version: input.expected_version },
      auth: true,
    }),
  )
}

export type PackagingInspectInput = {
  material_code: string
  quantity: number
  grade: 'A' | 'B' | 'C'
  reuse_cycle_seen?: number
  old_label_removed?: boolean
}

export async function inspectReturn(
  id: string,
  input: {
    expected_version: number
    lines: InspectReturnLineInput[]
    packaging?: PackagingInspectInput[]
  },
): Promise<ReturnRequest> {
  return requireReturn(
    await apiRequest<unknown>(`/returns/${encodeURIComponent(id)}/inspect`, {
      method: 'POST',
      body: {
        expected_version: input.expected_version,
        lines: input.lines,
        ...(input.packaging && input.packaging.length > 0
          ? { packaging: input.packaging }
          : {}),
      },
      auth: true,
    }),
  )
}

export async function cancelReturn(
  id: string,
  input: ReturnActionInput,
): Promise<ReturnRequest> {
  return requireReturn(
    await apiRequest<unknown>(`/returns/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: input,
      auth: true,
    }),
  )
}

export async function createReplacementReturn(
  id: string,
): Promise<ReturnRequest> {
  return requireReturn(
    await apiRequest<unknown>(
      `/returns/${encodeURIComponent(id)}/create-replacement`,
      { method: 'POST', auth: true },
    ),
  )
}

export async function listQuarantine(): Promise<QuarantineLine[]> {
  const res = await apiRequest<unknown>('/returns/quarantine', { auth: true })
  if (!Array.isArray(res)) return []
  return res.flatMap((raw) => {
    const row = asRecord(raw)
    if (!row) return []
    const returnId = pickString(row.returnId, row.return_id)
    if (!returnId) return []
    return [
      {
        returnId,
        rmaCode: pickString(row.rmaCode, row.rma_code),
        lineIndex: pickNumber(row.lineIndex, row.line_index),
        sellerSku: pickString(row.sellerSku, row.seller_sku),
        quantity: pickNumber(row.quantity) || 1,
        note: pickString(row.note) || null,
        since: toIso(row.since),
      },
    ]
  })
}

export async function resolveQuarantine(
  id: string,
  lineIndex: number,
  input: {
    action: 'restock' | 'discard'
    warehouse_id?: string
    bin_location_id?: string
    note?: string
  },
): Promise<ReturnRequest> {
  return requireReturn(
    await apiRequest<unknown>(
      `/returns/${encodeURIComponent(id)}/quarantine/${String(lineIndex)}/resolve`,
      { method: 'POST', body: input, auth: true },
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
