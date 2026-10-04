import { apiRequest } from '../lib/api'
import type {
  DeliveryFailureReason,
  FailureReasonOption,
  Shipment,
  ShipmentEvent,
  ShipmentListResult,
  ShipmentStatus,
} from '../types/shipments'

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

export function mapShipment(raw: unknown): Shipment | null {
  const row = asRecord(raw)
  if (!row) return null
  const id = pickString(row.id, row._id)
  if (!id) return null
  return {
    id,
    shipmentCode: pickString(row.shipmentCode, row.shipment_code),
    orderGroupId: pickString(row.orderGroupId, row.order_group_id),
    status: pickString(row.status) || 'out_for_delivery',
    attemptCount: pickNumber(row.attemptCount, row.attempt_count),
    maxAttempts: pickNumber(row.maxAttempts, row.max_attempts) || 2,
    lastFailureReason: pickString(row.lastFailureReason, row.last_failure_reason) || null,
    dueAt: toIso(row.dueAt) ?? toIso(row.due_at),
    deliveredAt: toIso(row.deliveredAt) ?? toIso(row.delivered_at),
    returnedAt: toIso(row.returnedAt) ?? toIso(row.returned_at),
    version: pickNumber(row.version, row.__v),
    createdAt: toIso(row.createdAt) ?? toIso(row.created_at),
    updatedAt: toIso(row.updatedAt) ?? toIso(row.updated_at),
  }
}

function mapEvent(raw: unknown): ShipmentEvent | null {
  const row = asRecord(raw)
  if (!row) return null
  const id = pickString(row.id, row._id)
  if (!id) return null
  const actorRole = row.actorRole ?? row.actor_role
  return {
    id,
    eventType: pickString(row.eventType, row.event_type),
    statusFrom: pickString(row.statusFrom, row.status_from) || null,
    statusTo: pickString(row.statusTo, row.status_to),
    attemptNo:
      typeof row.attemptNo === 'number'
        ? row.attemptNo
        : typeof row.attempt_no === 'number'
          ? row.attempt_no
          : null,
    actorId: pickString(row.actorId, row.actor_id),
    actorRole:
      typeof actorRole === 'number' || typeof actorRole === 'string' ? actorRole : null,
    reasonCode: pickString(row.reasonCode, row.reason_code) || null,
    reasonLabel: pickString(row.reasonLabel, row.reason_label) || null,
    note: pickString(row.note) || null,
    occurredAt: toIso(row.occurredAt) ?? toIso(row.occurred_at),
  }
}

function requireShipment(raw: unknown): Shipment {
  const mapped = mapShipment(raw)
  if (!mapped) throw new Error('Server không trả vận đơn hợp lệ.')
  return mapped
}

export async function listShipments(params: {
  status?: ShipmentStatus | string
  order_group_id?: string
  page?: number
  limit?: number
} = {}): Promise<ShipmentListResult> {
  const query = toQuery({
    status: params.status,
    order_group_id: params.order_group_id,
    page: params.page != null ? String(params.page) : undefined,
    limit: params.limit != null ? String(params.limit) : undefined,
  })
  const res = await apiRequest<unknown>(`/shipments${query}`, { auth: true })
  const row = asRecord(res)
  const rawItems = Array.isArray(res)
    ? res
    : Array.isArray(row?.items)
      ? row.items
      : []
  const items = rawItems
    .map(mapShipment)
    .filter((item): item is Shipment => item !== null)
  return {
    items,
    total: pickNumber(row?.total) || items.length,
    page: pickNumber(row?.page) || 1,
    limit: pickNumber(row?.limit) || items.length,
  }
}

export async function getShipment(id: string): Promise<Shipment> {
  return requireShipment(
    await apiRequest<unknown>(`/shipments/${encodeURIComponent(id)}`, { auth: true }),
  )
}

export async function listShipmentEvents(id: string): Promise<ShipmentEvent[]> {
  const res = await apiRequest<unknown>(
    `/shipments/${encodeURIComponent(id)}/events`,
    { auth: true },
  )
  if (!Array.isArray(res)) return []
  return res.map(mapEvent).filter((item): item is ShipmentEvent => item !== null)
}

export async function listFailureReasonCodes(): Promise<FailureReasonOption[]> {
  const res = await apiRequest<unknown>('/shipments/reason-codes', { auth: true })
  if (!Array.isArray(res)) return []
  return res
    .map((item) => {
      const row = asRecord(item)
      if (!row) return null
      const code = pickString(row.code)
      const label = pickString(row.label)
      if (!code) return null
      return { code, label: label || code }
    })
    .filter((item): item is FailureReasonOption => item !== null)
}

export async function startShipment(
  orderGroupId: string,
  note?: string,
): Promise<Shipment> {
  return requireShipment(
    await apiRequest<unknown>('/shipments', {
      method: 'POST',
      auth: true,
      body: {
        order_group_id: orderGroupId,
        ...(note?.trim() ? { note: note.trim() } : {}),
      },
    }),
  )
}

export async function deliverShipment(
  id: string,
  expectedVersion: number,
  note?: string,
): Promise<Shipment> {
  return requireShipment(
    await apiRequest<unknown>(`/shipments/${encodeURIComponent(id)}/deliver`, {
      method: 'POST',
      auth: true,
      body: {
        expected_version: expectedVersion,
        ...(note?.trim() ? { note: note.trim() } : {}),
      },
    }),
  )
}

export async function failShipment(
  id: string,
  expectedVersion: number,
  reasonCode: DeliveryFailureReason | string,
  note?: string,
): Promise<Shipment> {
  return requireShipment(
    await apiRequest<unknown>(`/shipments/${encodeURIComponent(id)}/fail`, {
      method: 'POST',
      auth: true,
      body: {
        expected_version: expectedVersion,
        reason_code: reasonCode,
        ...(note?.trim() ? { note: note.trim() } : {}),
      },
    }),
  )
}

export async function retryShipment(
  id: string,
  expectedVersion: number,
  note?: string,
): Promise<Shipment> {
  return requireShipment(
    await apiRequest<unknown>(`/shipments/${encodeURIComponent(id)}/retry`, {
      method: 'POST',
      auth: true,
      body: {
        expected_version: expectedVersion,
        ...(note?.trim() ? { note: note.trim() } : {}),
      },
    }),
  )
}
