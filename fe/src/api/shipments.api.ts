import { apiRequest } from '../lib/api'
import type {
  DeliveryFailureReason,
  FailureReasonOption,
  Shipment,
  ShipmentEvent,
  ShipmentListResult,
  ShipmentStatus,
} from '../types/shipments'
import { SHIPMENT_STATUSES } from '../types/shipments'

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
    status: (SHIPMENT_STATUSES as readonly string[]).includes(pickString(row.status))
      ? (pickString(row.status) as ShipmentStatus)
      : 'out_for_delivery',
    attemptCount: pickNumber(row.attemptCount, row.attempt_count),
    maxAttempts: pickNumber(row.maxAttempts, row.max_attempts) || 2,
    lastFailureReason: pickString(row.lastFailureReason, row.last_failure_reason) || null,
    dueAt: toIso(row.dueAt) ?? toIso(row.due_at),
    deliveredAt: toIso(row.deliveredAt) ?? toIso(row.delivered_at),
    returnedAt: toIso(row.returnedAt) ?? toIso(row.returned_at),
    nextAttemptNotBefore:
      toIso(row.nextAttemptNotBefore) ?? toIso(row.next_attempt_not_before),
    isOverdue: row.isOverdue === true || row.is_overdue === true,
    trackingCode: pickString(row.trackingCode, row.tracking_code) || null,
    carrierCode: pickString(row.carrierCode, row.carrier_code) || null,
    carrierName: pickString(row.carrierName, row.carrier_name) || null,
    shipperId: pickString(row.shipperId, row.shipper_id) || null,
    shipperName: pickString(row.shipperName, row.shipper_name) || null,
    shipperPhone: pickString(row.shipperPhone, row.shipper_phone) || null,
    serviceCode: pickString(row.serviceCode, row.service_code) || null,
    serviceName: pickString(row.serviceName, row.service_name) || null,
    carrierManaged: row.carrierManaged === true || row.carrier_managed === true,
    carrierStatus: pickString(row.carrierStatus, row.carrier_status) || null,
    carrierStatusLabel: pickString(row.carrierStatusLabel, row.carrier_status_label) || null,
    carrierBookingError: pickString(row.carrierBookingError, row.carrier_booking_error) || null,
    carrierIncident: pickString(row.carrierIncident, row.carrier_incident) || null,
    estimatedCostVnd:
      typeof row.estimatedCostVnd === 'number'
        ? row.estimatedCostVnd
        : typeof row.estimated_cost_vnd === 'number'
          ? row.estimated_cost_vnd
          : null,
    tripCode: pickString(row.tripCode, row.trip_code) || null,
    pickupAt: toIso(row.pickupAt) ?? toIso(row.pickup_at),
    toLocation: mapToLocation(row.toLocation ?? row.to_location),
    carrierParcels: mapCarrierParcels(row.carrierParcels ?? row.carrier_parcels),
    version: pickNumber(row.version, row.__v),
    createdAt: toIso(row.createdAt) ?? toIso(row.created_at),
    updatedAt: toIso(row.updatedAt) ?? toIso(row.updated_at),
  }
}

function mapToLocation(raw: unknown): Shipment['toLocation'] {
  const row = asRecord(raw)
  if (!row) return null
  return {
    street: pickString(row.street) || null,
    wardName: pickString(row.wardName, row.ward_name) || null,
    provinceName: pickString(row.provinceName, row.province_name) || null,
    phone: pickString(row.phone) || null,
  }
}

function mapCarrierParcels(raw: unknown): Shipment['carrierParcels'] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const row = asRecord(item)
    if (!row) return []
    return [
      {
        parcelNo: pickNumber(row.parcelNo, row.parcel_no),
        carrierOrderCode: pickString(row.carrierOrderCode, row.carrier_order_code) || null,
        sortCode: pickString(row.sortCode, row.sort_code) || null,
        feeTotalVnd:
          typeof row.feeTotalVnd === 'number'
            ? row.feeTotalVnd
            : typeof row.fee_total_vnd === 'number'
              ? row.fee_total_vnd
              : null,
        carrierStatusLabel: pickString(row.carrierStatusLabel, row.carrier_status_label) || null,
        bookingError: pickString(row.bookingError, row.booking_error) || null,
        recipientName: pickString(row.recipientName, row.recipient_name) || null,
        orderId: pickString(row.orderId, row.order_id) || null,
      },
    ]
  })
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

export type ShipmentToLocation = {
  street?: string
  ward_name?: string
  province_name?: string
  phone?: string
}

export type ShipmentShipper = {
  id: string
  name: string
  phone: string | null
  email: string
}

export async function listShippers(): Promise<ShipmentShipper[]> {
  const res = await apiRequest<unknown>('/shipments/shippers', { auth: true })
  if (!Array.isArray(res)) return []
  return res.flatMap((item) => {
    const row = asRecord(item)
    if (!row) return []
    const id = pickString(row.id)
    const name = pickString(row.name)
    if (!id || !name) return []
    return [
      {
        id,
        name,
        phone: pickString(row.phone) || null,
        email: pickString(row.email),
      },
    ]
  })
}

export async function startShipment(
  orderGroupId: string,
  note?: string,
  choice?: {
    carrierCode?: string
    serviceCode?: string
    shipperId?: string
    toLocation?: ShipmentToLocation
  },
): Promise<Shipment> {
  const toLocation = compactLocation(choice?.toLocation)
  const shipperId = choice?.shipperId?.trim()
  return requireShipment(
    await apiRequest<unknown>('/shipments', {
      method: 'POST',
      auth: true,
      body: {
        order_group_id: orderGroupId,
        ...(note?.trim() ? { note: note.trim() } : {}),
        ...(shipperId
          ? { shipper_id: shipperId }
          : {
              ...(choice?.carrierCode ? { carrier_code: choice.carrierCode } : {}),
              ...(choice?.serviceCode ? { service_code: choice.serviceCode } : {}),
              ...(toLocation ? { to_location: toLocation } : {}),
            }),
      },
    }),
  )
}

function compactLocation(input: ShipmentToLocation | undefined): ShipmentToLocation | undefined {
  if (!input) return undefined
  const out: ShipmentToLocation = {}
  if (input.street !== undefined && input.street !== '') out.street = input.street
  if (input.ward_name?.trim()) out.ward_name = input.ward_name.trim()
  if (input.province_name?.trim()) out.province_name = input.province_name.trim()
  if (input.phone?.trim()) out.phone = input.phone.trim()
  return Object.keys(out).length > 0 ? out : undefined
}

export async function listCarrierStatuses(): Promise<{ status: string; label: string }[]> {
  const res = await apiRequest<unknown>('/shipments/carrier/statuses', { auth: true })
  if (!Array.isArray(res)) return []
  return res.flatMap((item) => {
    const row = asRecord(item)
    if (!row) return []
    const status = pickString(row.status)
    if (!status) return []
    return [{ status, label: pickString(row.label) || status }]
  })
}

export async function bookCarrierShipment(id: string): Promise<Shipment> {
  return requireShipment(
    await apiRequest<unknown>(`/shipments/${encodeURIComponent(id)}/carrier/book`, {
      method: 'POST',
      auth: true,
      body: {},
    }),
  )
}

export async function updateShipmentLocation(
  id: string,
  location: ShipmentToLocation,
): Promise<Shipment> {
  return requireShipment(
    await apiRequest<unknown>(`/shipments/${encodeURIComponent(id)}/to-location`, {
      method: 'PATCH',
      auth: true,
      body: location,
    }),
  )
}

export async function getCarrierLabel(
  id: string,
): Promise<{ url: string; expiresAt: string | null; carrierOrderCodes: string[] }> {
  const res = await apiRequest<unknown>(`/shipments/${encodeURIComponent(id)}/carrier/label`, {
    auth: true,
  })
  const row = asRecord(res)
  const codes = Array.isArray(row?.carrierOrderCodes)
    ? row.carrierOrderCodes.filter((code): code is string => typeof code === 'string')
    : []
  return {
    url: pickString(row?.url),
    expiresAt: toIso(row?.expiresAt),
    carrierOrderCodes: codes,
  }
}

export async function cancelCarrierShipment(id: string, note?: string): Promise<Shipment> {
  return requireShipment(
    await apiRequest<unknown>(`/shipments/${encodeURIComponent(id)}/carrier/cancel`, {
      method: 'POST',
      auth: true,
      body: {
        reason_code: 'GHN-CO001',
        ...(note?.trim() ? { note: note.trim() } : {}),
      },
    }),
  )
}

export async function syncCarrierShipment(id: string): Promise<Shipment> {
  return requireShipment(
    await apiRequest<unknown>(`/shipments/${encodeURIComponent(id)}/carrier/sync`, {
      method: 'POST',
      auth: true,
      body: {},
    }),
  )
}

export async function simulateCarrierStatus(id: string, status: string): Promise<Shipment> {
  return requireShipment(
    await apiRequest<unknown>(`/shipments/${encodeURIComponent(id)}/carrier/simulate`, {
      method: 'POST',
      auth: true,
      body: { status },
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
  /** (14/10/2026) Khách hẹn giao lại lúc nào (ISO 8601) — tuỳ chọn. */
  rescheduleAt?: string,
): Promise<Shipment> {
  return requireShipment(
    await apiRequest<unknown>(`/shipments/${encodeURIComponent(id)}/fail`, {
      method: 'POST',
      auth: true,
      body: {
        expected_version: expectedVersion,
        reason_code: reasonCode,
        ...(note?.trim() ? { note: note.trim() } : {}),
        ...(rescheduleAt ? { reschedule_at: rescheduleAt } : {}),
      },
    }),
  )
}

export async function createShipmentBatch(input: {
  order_group_ids: string[]
  carrier_code: string
  service_code: string
  note?: string
  pickup_at?: string
  to_location?: ShipmentToLocation
}): Promise<{ tripCode: string }> {
  const location = input.to_location ? compactLocation(input.to_location) : undefined
  const res = await apiRequest<unknown>('/shipments/batch', {
    method: 'POST',
    auth: true,
    body: {
      order_group_ids: input.order_group_ids,
      carrier_code: input.carrier_code,
      service_code: input.service_code,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      ...(input.pickup_at ? { pickup_at: input.pickup_at } : {}),
      ...(location ? { to_location: location } : {}),
    },
  })
  const row = asRecord(res)
  return { tripCode: pickString(row?.tripCode) }
}

export async function scheduleShipmentPickup(
  id: string,
  pickupAt: string,
): Promise<Shipment> {
  return requireShipment(
    await apiRequest<unknown>(`/shipments/${encodeURIComponent(id)}/pickup`, {
      method: 'PATCH',
      auth: true,
      body: { pickup_at: pickupAt },
    }),
  )
}

export async function getShipmentByGroup(groupId: string): Promise<Shipment | null> {
  const res = await apiRequest<unknown>(
    `/shipments/group/${encodeURIComponent(groupId)}`,
    { auth: true },
  )
  return mapShipment(res)
}

export async function scanOverdueShipments(): Promise<number> {
  const res = await apiRequest<unknown>('/shipments/overdue-scan', {
    method: 'POST',
    auth: true,
    body: {},
  })
  return pickNumber(asRecord(res)?.flagged)
}

export async function receiveReturnedShipment(
  id: string,
  expectedVersion: number,
  note?: string,
): Promise<Shipment> {
  return requireShipment(
    await apiRequest<unknown>(`/shipments/${encodeURIComponent(id)}/receive-return`, {
      method: 'POST',
      auth: true,
      body: {
        expected_version: expectedVersion,
        ...(note?.trim() ? { note: note.trim() } : {}),
      },
    }),
  )
}

export async function retryShipment(
  id: string,
  expectedVersion: number,
  note?: string,
  /**
   * (14/10/2026) Lý do giao lại SỚM hơn `nextAttemptNotBefore` (3–300 ký tự).
   * Thiếu mà còn trong khoảng chờ → BE trả lỗi khoảng chờ.
   */
  overrideReason?: string,
): Promise<Shipment> {
  return requireShipment(
    await apiRequest<unknown>(`/shipments/${encodeURIComponent(id)}/retry`, {
      method: 'POST',
      auth: true,
      body: {
        expected_version: expectedVersion,
        ...(note?.trim() ? { note: note.trim() } : {}),
        ...(overrideReason?.trim() ? { override_reason: overrideReason.trim() } : {}),
      },
    }),
  )
}
