import { apiRequest } from '../lib/api'
import type {
  DecidePartialInput,
  LazadaPackInfo,
  LazadaPackItem,
  LazadaPackStatus,
  ListOrderGroupsParams,
  OrderGroup,
  PackableItem,
  PackagingConsumption,
  PackagingConsumptionLine,
  PackOrderGroupResult,
  PickItemInput,
  PickItemResult,
  ReportMissingInput,
  RetryLazadaPackResult,
  SetPriorityInput,
  TransitionOrderGroupInput,
} from '../types/order-groups'
import {
  EMPTY_LAZADA_PACK,
  WAREHOUSE_STAFF_QUEUE_STATUSES,
} from '../types/order-groups'

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
    if (value != null && typeof value === 'object' && 'toString' in value) {
      const text = String(value)
      if (text && text !== '[object Object]') return text
    }
  }
  return ''
}

function pickNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

function pickBool(value: unknown): boolean {
  return value === true
}

function toIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString()
  }
  if (typeof value === 'string' && value.length > 0) return value
  return null
}

const LAZADA_PACK_STATUSES: readonly LazadaPackStatus[] = [
  'disabled',
  'skipped',
  'success',
  'partial',
  'failed',
]

function asLazadaPackStatus(value: unknown): LazadaPackStatus | null {
  if (typeof value !== 'string') return null
  return (LAZADA_PACK_STATUSES as readonly string[]).includes(value)
    ? (value as LazadaPackStatus)
    : null
}

/** Map `lazadaPack` (camelCase từ toResponse) hoặc `lazadaPackSync` (items snake_case từ service). */
export function mapLazadaPackInfo(raw: unknown): LazadaPackInfo {
  const row = asRecord(raw)
  if (!row) return { ...EMPTY_LAZADA_PACK }
  const rawItems = Array.isArray(row.items) ? row.items : []
  const items: LazadaPackItem[] = []
  for (const item of rawItems) {
    const line = asRecord(item)
    if (!line) continue
    const orderId = pickString(line.orderId, line.order_id)
    const orderItemId = pickString(line.orderItemId, line.order_item_id)
    if (!orderId || !orderItemId) continue
    items.push({
      orderId,
      orderItemId,
      ok: line.ok === true,
      errorCode:
        pickString(line.errorCode, line.item_err_code) || null,
      message: pickString(line.message, line.msg) || null,
      packageId: pickString(line.packageId, line.package_id) || null,
      trackingNumber:
        pickString(line.trackingNumber, line.tracking_number) || null,
      shipmentProvider:
        pickString(line.shipmentProvider, line.shipment_provider) || null,
    })
  }
  return {
    status: asLazadaPackStatus(row.status),
    attemptedAt: toIso(row.attemptedAt) ?? toIso(row.attempted_at),
    error: pickString(row.error) || null,
    items,
  }
}

/**
 * `GET /order-groups*` trả camelCase (`toResponse`).
 * `POST /order-groups/:id/assign` hiện trả raw Mongoose (snake_case).
 * Map cả 2 shape để trang Warehouse Staff không gãy.
 */
export function mapOrderGroup(raw: unknown): OrderGroup | null {
  const row = asRecord(raw)
  if (!row) return null
  const id = pickString(row.id, row._id)
  if (!id) return null
  const createdAt = toIso(row.createdAt) ?? toIso(row.created_at) ?? ''
  const updatedAt = toIso(row.updatedAt) ?? toIso(row.updated_at) ?? createdAt
  const lazadaPackRaw =
    row.lazadaPack ??
    row.lazada_pack ??
    (row.lazada_pack_status !== undefined
      ? {
          status: row.lazada_pack_status,
          attemptedAt: row.lazada_pack_attempted_at,
          error: row.lazada_pack_error,
          items: row.lazada_pack_items,
        }
      : null)
  return {
    id,
    platform: pickString(row.platform) || 'lazada',
    shopId: pickString(row.shopId, row.shop_id),
    orderCount: pickNumber(row.orderCount, row.order_count),
    // BE AOFP-52 luôn gửi 2 field này; thiếu (client cũ) → coi toàn bộ orderCount là còn xử lý.
    activeOrderCount:
      typeof row.activeOrderCount === 'number' ||
      typeof row.active_order_count === 'number'
        ? pickNumber(row.activeOrderCount, row.active_order_count)
        : pickNumber(row.orderCount, row.order_count),
    canceledOrderCount: pickNumber(
      row.canceledOrderCount,
      row.canceled_order_count,
    ),
    lazadaPack: mapLazadaPackInfo(lazadaPackRaw),
    fulfillmentStatus: pickString(row.fulfillmentStatus, row.fulfillment_status),
    activePackagingRecommendationId:
      pickString(
        row.activePackagingRecommendationId,
        row.active_packaging_recommendation,
      ) || null,
    assignedStaffId:
      pickString(row.assignedStaffId, row.assigned_staff_id) || null,
    orderPriority: pickString(row.orderPriority, row.order_priority) || 'normal',
    packagingDeadline:
      toIso(row.packagingDeadline) ?? toIso(row.packaging_deadline),
    isOverdue: pickBool(row.isOverdue) || pickBool(row.is_overdue),
    stockShortage:
      row.stockShortage === true || row.stock_shortage === true,
    stockShortageItems: mapShortageItems(
      row.stockShortageItems ?? row.stock_shortage_items,
    ),
    version: pickNumber(row.version, row.__v),
    createdAt,
    updatedAt,
  }
}

function mapShortageItems(raw: unknown): OrderGroup['stockShortageItems'] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const row = asRecord(item)
    if (!row) return []
    const sku = pickString(row.sku)
    if (!sku) return []
    return [
      {
        sku,
        needed: pickNumber(row.needed),
        reserved: pickNumber(row.reserved),
        shortage: pickNumber(row.shortage),
      },
    ]
  })
}

function requireOrderGroup(raw: unknown): OrderGroup {
  const mapped = mapOrderGroup(raw)
  if (!mapped) {
    throw new Error('Server không trả đủ dữ liệu nhóm đơn.')
  }
  return mapped
}

function isPackableItem(value: unknown): value is PackableItem {
  const row = asRecord(value)
  if (!row) return false
  return typeof row.sku === 'string' && row.sku.length > 0
}

function mapPackableItem(value: unknown): PackableItem | null {
  if (!isPackableItem(value)) return null
  const row = asRecord(value)
  if (!row) return null
  return {
    sku: pickString(row.sku),
    quantity: pickNumber(row.quantity),
    length_cm: pickNumber(row.length_cm),
    width_cm: pickNumber(row.width_cm),
    height_cm: pickNumber(row.height_cm),
    weight_kg: pickNumber(row.weight_kg),
    is_fragile: row.is_fragile === true,
  }
}

function extractPackableItems(raw: unknown): PackableItem[] {
  const list = Array.isArray(raw)
    ? raw
    : asRecord(raw) && Array.isArray(asRecord(raw)?.items)
      ? (asRecord(raw)?.items as unknown[])
      : []
  return list
    .map(mapPackableItem)
    .filter((row): row is PackableItem => row !== null)
}

export async function listOrderGroups(
  params: ListOrderGroupsParams = {},
): Promise<OrderGroup[]> {
  const query = toQuery({
    fulfillment_status: params.fulfillment_status,
    platform: params.platform,
    order_priority: params.order_priority,
  })
  const res = await apiRequest<unknown>(`/order-groups${query}`, {
    auth: true,
  })
  if (!Array.isArray(res)) return []
  return res
    .map(mapOrderGroup)
    .filter((row): row is OrderGroup => row !== null)
}

/**
 * Hàng đợi Warehouse Staff: **1 request** `GET /order-groups` rồi lọc
 * status phía FE (đơn mới awaiting_packaging cũng vào hàng lấy hàng —
 * không đợi duyệt kế hoạch thùng). Không gọi song song theo từng status.
 */
export async function listWarehouseStaffQueue(): Promise<OrderGroup[]> {
  const rows = await listOrderGroups()
  const allowed = new Set<string>(WAREHOUSE_STAFF_QUEUE_STATUSES)
  return rows.filter((row) => allowed.has(row.fulfillmentStatus))
}

export async function getOrderGroupById(id: string): Promise<OrderGroup> {
  return requireOrderGroup(
    await apiRequest<unknown>(`/order-groups/${encodeURIComponent(id)}`, {
      auth: true,
    }),
  )
}

export async function getOrderGroupPickingList(
  id: string,
): Promise<PackableItem[]> {
  const res = await apiRequest<unknown>(
    `/order-groups/${encodeURIComponent(id)}/picking-list`,
    { auth: true },
  )
  return extractPackableItems(res)
}

export async function getOrderGroupPickingItem(
  id: string,
  sku: string,
): Promise<PackableItem> {
  const res = await apiRequest<unknown>(
    `/order-groups/${encodeURIComponent(id)}/picking-list/${encodeURIComponent(sku)}`,
    { auth: true },
  )
  const [item] = extractPackableItems(
    Array.isArray(res) || (asRecord(res) && Array.isArray(asRecord(res)?.items))
      ? res
      : [res],
  )
  if (!item) {
    throw new Error('Server không trả chi tiết SKU.')
  }
  return item
}

export async function pickOrderGroupItem(
  id: string,
  input: PickItemInput,
): Promise<PickItemResult> {
  const res = await apiRequest<unknown>(
    `/order-groups/${encodeURIComponent(id)}/fulfillment/pick-item`,
    {
      method: 'POST',
      body: {
        sku: input.sku,
        scanned_quantity: input.scanned_quantity,
        scan_method: input.scan_method,
        warehouse_id: input.warehouse_id,
        ...(input.bin_location_id
          ? { bin_location_id: input.bin_location_id }
          : {}),
        ...(input.client_event_id
          ? { client_event_id: input.client_event_id }
          : {}),
      },
      auth: true,
    },
  )
  const row = asRecord(res)
  const sku = pickString(row?.sku, input.sku)
  return {
    sku,
    decrementedBy: pickNumber(row?.decrementedBy, row?.decremented_by),
    remainingStock: pickNumber(row?.remainingStock, row?.remaining_stock),
  }
}

export async function reportMissingOrderGroupItem(
  id: string,
  input: ReportMissingInput,
): Promise<OrderGroup> {
  return requireOrderGroup(
    await apiRequest<unknown>(
      `/order-groups/${encodeURIComponent(id)}/fulfillment/report-missing`,
      {
        method: 'POST',
        body: {
          sku: input.sku,
          missing_quantity: input.missing_quantity,
          warehouse_id: input.warehouse_id,
          expected_version: input.expected_version,
          ...(input.note ? { note: input.note } : {}),
        },
        auth: true,
      },
    ),
  )
}

async function postFulfillmentTransition(
  id: string,
  action: 'pick' | 'pack' | 'ship' | 'deliver' | 'return',
  input: TransitionOrderGroupInput,
): Promise<OrderGroup> {
  return requireOrderGroup(
    await apiRequest<unknown>(
      `/order-groups/${encodeURIComponent(id)}/fulfillment/${action}`,
      {
        method: 'POST',
        body: { expected_version: input.expected_version },
        auth: true,
      },
    ),
  )
}

export async function completeOrderGroupPick(
  id: string,
  input: TransitionOrderGroupInput,
): Promise<OrderGroup> {
  return postFulfillmentTransition(id, 'pick', input)
}

function mapPackagingConsumption(raw: unknown): PackagingConsumption | null {
  const row = asRecord(raw)
  if (!row) return null
  const rawConsumed = Array.isArray(row.consumed) ? row.consumed : []
  const consumed: PackagingConsumptionLine[] = []
  for (const item of rawConsumed) {
    const line = asRecord(item)
    if (!line) continue
    const materialCode = pickString(line.materialCode, line.material_code)
    if (!materialCode) continue
    consumed.push({
      materialCode,
      condition: pickString(line.condition) || 'new',
      quantity: pickNumber(line.quantity) || 1,
      savingVnd: pickNumber(line.savingVnd, line.saving_vnd),
    })
  }
  const rawWarnings = Array.isArray(row.warnings) ? row.warnings : []
  const warnings = rawWarnings.filter(
    (w): w is string => typeof w === 'string' && w.length > 0,
  )
  const followed = row.followedRecommendation ?? row.followed_recommendation
  return {
    consumed,
    warnings,
    recommendedBoxCode:
      pickString(row.recommendedBoxCode, row.recommended_box_code) || null,
    followedRecommendation:
      typeof followed === 'boolean' ? followed : null,
  }
}

export async function packOrderGroup(
  id: string,
  input: TransitionOrderGroupInput,
): Promise<PackOrderGroupResult> {
  const raw = await apiRequest<unknown>(
    `/order-groups/${encodeURIComponent(id)}/fulfillment/pack`,
    {
      method: 'POST',
      body: { expected_version: input.expected_version },
      auth: true,
    },
  )
  const row = asRecord(raw)
  const group = requireOrderGroup(raw)
  const lazadaPackSync = mapLazadaPackInfo(
    row?.lazadaPackSync ?? row?.lazada_pack_sync,
  )
  return {
    group: {
      ...group,
      lazadaPack:
        lazadaPackSync.status != null ? lazadaPackSync : group.lazadaPack,
    },
    packagingConsumption: mapPackagingConsumption(
      row?.packagingConsumption ?? row?.packaging_consumption,
    ),
    lazadaPackSync,
  }
}

export async function retryLazadaPack(
  id: string,
): Promise<RetryLazadaPackResult> {
  const raw = await apiRequest<unknown>(
    `/order-groups/${encodeURIComponent(id)}/lazada-pack/retry`,
    {
      method: 'POST',
      auth: true,
    },
  )
  const row = asRecord(raw)
  const group = requireOrderGroup(raw)
  const lazadaPackSync = mapLazadaPackInfo(
    row?.lazadaPackSync ?? row?.lazada_pack_sync,
  )
  return {
    group: {
      ...group,
      lazadaPack:
        lazadaPackSync.status != null ? lazadaPackSync : group.lazadaPack,
    },
    lazadaPackSync,
  }
}

export async function returnOrderGroup(
  id: string,
  input: TransitionOrderGroupInput,
): Promise<OrderGroup> {
  return postFulfillmentTransition(id, 'return', input)
}

export async function setOrderGroupPriority(
  id: string,
  input: SetPriorityInput,
): Promise<OrderGroup> {
  return requireOrderGroup(
    await apiRequest<unknown>(
      `/order-groups/${encodeURIComponent(id)}/priority`,
      {
        method: 'PATCH',
        body: {
          order_priority: input.order_priority,
          ...(input.deadline_hours !== undefined
            ? { deadline_hours: input.deadline_hours }
            : {}),
        },
        auth: true,
      },
    ),
  )
}

export async function decidePartialOrderGroup(
  id: string,
  input: DecidePartialInput,
): Promise<OrderGroup> {
  return requireOrderGroup(
    await apiRequest<unknown>(
      `/order-groups/${encodeURIComponent(id)}/fulfillment/decide-partial`,
      {
        method: 'POST',
        body: {
          approve: input.approve,
          expected_version: input.expected_version,
        },
        auth: true,
      },
    ),
  )
}

export async function assignOrderGroup(
  id: string,
  staffId?: string,
): Promise<OrderGroup> {
  return requireOrderGroup(
    await apiRequest<unknown>(
      `/order-groups/${encodeURIComponent(id)}/assign`,
      {
        method: 'POST',
        body: staffId ? { staff_id: staffId } : {},
        auth: true,
      },
    ),
  )
}

export type StaffSearchItem = {
  staffId: string
  fullName: string
  email: string
  activeWorkload: number
}

function mapStaffSearchItem(raw: unknown): StaffSearchItem | null {
  const row = asRecord(raw)
  if (!row) return null
  const staffId = pickString(row.staffId, row.staff_id, row.id, row._id)
  if (!staffId) return null
  return {
    staffId,
    fullName: pickString(row.fullName, row.full_name, row.name) || staffId,
    email: pickString(row.email),
    activeWorkload: pickNumber(row.activeWorkload, row.active_workload),
  }
}

export async function searchOrderGroupStaff(
  q: string,
): Promise<StaffSearchItem[]> {
  const query = toQuery({ q: q.trim() || undefined })
  const res = await apiRequest<unknown>(
    `/order-groups/staff/search${query}`,
    { auth: true },
  )
  if (!Array.isArray(res)) return []
  return res
    .map(mapStaffSearchItem)
    .filter((row): row is StaffSearchItem => row !== null)
}
