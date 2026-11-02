import { apiRequest } from '../lib/api'
import type {
  DecidePartialInput,
  GroupOrderLine,
  GroupOrderView,
  ManualLink,
  ListOrderGroupsParams,
  OrderGroup,
  PackableItem,
  PackingBlocked,
  PickItemInput,
  PickItemResult,
  ReportMissingInput,
  SetPriorityInput,
  StockAvailability,
  StockReservationLine,
  TransitionOrderGroupInput,
} from '../types/order-groups'
import { WAREHOUSE_STAFF_QUEUE_STATUSES } from '../types/order-groups'

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
    fulfillmentStatus: pickString(row.fulfillmentStatus, row.fulfillment_status),
    assignedStaffId:
      pickString(row.assignedStaffId, row.assigned_staff_id) || null,
    orderPriority: pickString(row.orderPriority, row.order_priority) || 'normal',
    packagingDeadline:
      toIso(row.packagingDeadline) ?? toIso(row.packaging_deadline),
    requiresSelfDelivery:
      row.requiresSelfDelivery === true || row.requires_self_delivery === true,
    deliveryDeadline:
      toIso(row.deliveryDeadline) ?? toIso(row.delivery_deadline),
    isOverdue: pickBool(row.isOverdue) || pickBool(row.is_overdue),
    stockShortage:
      row.stockShortage === true || row.stock_shortage === true,
    stockShortageItems: mapShortageItems(
      row.stockShortageItems ?? row.stock_shortage_items,
    ),
    manualLink: mapManualLink(row.manualLink ?? row.manual_link),
    linkedGroupCount: pickNumber(
      row.linkedGroupCount,
      row.linked_group_count,
    ),
    origin: pickString(row.origin) || 'marketplace',
    warehouseId: pickString(row.warehouseId, row.warehouse_id) || null,
    orders: mapGroupOrders(row.orders),
    packingBlocked: mapPackingBlocked(row.packingBlocked ?? row.packing_blocked),
    assignedPackerId:
      pickString(row.assignedPackerId, row.assigned_packer_id) || null,
    assignedPackerName:
      pickString(row.assignedPackerName, row.assigned_packer_name) || null,
    recipientNames: pickStringList(row.recipientNames ?? row.recipient_names),
    recipientNamesDiffer:
      row.recipientNamesDiffer === true || row.recipient_names_differ === true,
    packScanRequired:
      row.packScanRequired === true || row.pack_scan_required === true,
    hasMaskedRecipientName:
      row.hasMaskedRecipientName === true ||
      row.has_masked_recipient_name === true,
    splitFromGroupId:
      pickString(row.splitFromGroupId, row.split_from_group_id) || null,
    mergedIntoGroupId:
      pickString(row.mergedIntoGroupId, row.merged_into_group_id) || null,
    consolidationClosed:
      row.consolidationClosed === true || row.consolidation_closed === true,
    version: pickNumber(row.version, row.__v),
    createdAt,
    updatedAt,
  }
}

function pickStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
}

function mapPackingBlocked(raw: unknown): PackingBlocked | null {
  const row = asRecord(raw)
  if (!row) return null
  return {
    reason: pickString(row.reason),
    skus: pickStringList(row.skus),
    at: toIso(row.at),
  }
}

function mapManualLink(raw: unknown): ManualLink | null {
  const row = asRecord(raw)
  if (!row) return null
  const linkId = pickString(row.linkId, row.link_id, row.manual_link_id)
  if (!linkId) return null
  return {
    linkId,
    linkedBy: pickString(row.linkedBy, row.linked_by) || null,
    linkedAt: toIso(row.linkedAt) ?? toIso(row.linked_at),
    note: pickString(row.note) || null,
  }
}

function mapGroupOrders(raw: unknown): GroupOrderView[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const row = asRecord(item)
    if (!row) return []
    const id = pickString(row.id, row._id)
    if (!id) return []
    const recipient = asRecord(row.recipient)
    return [
      {
        id,
        platform: pickString(row.platform) || 'lazada',
        platformOrderId: pickString(
          row.platformOrderId,
          row.platform_order_id,
        ),
        status: pickString(row.status),
        recipientName: pickString(
          recipient?.fullName,
          recipient?.full_name,
        ),
        recipientPhone: pickString(recipient?.phone),
        recipientCity: pickString(recipient?.city),
        items: mapGroupOrderLines(row.items),
      },
    ]
  })
}

function mapGroupOrderLines(raw: unknown): GroupOrderLine[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const row = asRecord(item)
    if (!row) return []
    const sku = pickString(row.sku)
    if (!sku) return []
    return [
      {
        sku,
        name: pickString(row.name),
        quantity: pickNumber(row.quantity),
        status: pickString(row.status),
      },
    ]
  })
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
    assigned_staff_id: params.assigned_staff_id,
    assigned_packer_id: params.assigned_packer_id,
    before: params.before,
    limit: params.limit === undefined ? undefined : String(params.limit),
    stock_shortage:
      params.stock_shortage === undefined
        ? undefined
        : String(params.stock_shortage),
    is_overdue:
      params.is_overdue === undefined ? undefined : String(params.is_overdue),
    packing_blocked:
      params.packing_blocked === undefined
        ? undefined
        : String(params.packing_blocked),
    q: params.q?.trim() || undefined,
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
  action: 'pick' | 'return',
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
  onLeave: boolean
  onLeaveUntil: string | null
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
    onLeave: row.onLeave === true || row.on_leave === true,
    onLeaveUntil: toIso(row.onLeaveUntil ?? row.on_leave_until),
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

export async function listLinkedOrderGroups(id: string): Promise<OrderGroup[]> {
  const res = await apiRequest<unknown>(
    `/order-groups/${encodeURIComponent(id)}/linked`,
    { auth: true },
  )
  const row = asRecord(res)
  const raw = row?.linkedGroups ?? row?.linked_groups
  if (!Array.isArray(raw)) return []
  return raw
    .map(mapOrderGroup)
    .filter((group): group is OrderGroup => group !== null)
}

export async function linkOrderGroups(
  id: string,
  targetGroupId: string,
  note?: string,
): Promise<OrderGroup[]> {
  const res = await apiRequest<unknown>(`/order-groups/${encodeURIComponent(id)}/link`, {
    method: 'POST',
    auth: true,
    body: {
      target_group_id: targetGroupId,
      ...(note?.trim() ? { note: note.trim() } : {}),
    },
  })
  const row = asRecord(res)
  const raw = row?.linkedGroups ?? row?.linked_groups
  if (!Array.isArray(raw)) return []
  return raw
    .map(mapOrderGroup)
    .filter((group): group is OrderGroup => group !== null)
}

export async function splitOrderFromGroup(
  groupId: string,
  orderId: string,
  input: { expected_version: number; note: string },
): Promise<{ sourceGroup: OrderGroup; newGroup: OrderGroup }> {
  const res = await apiRequest<unknown>(
    `/order-groups/${encodeURIComponent(groupId)}/orders/${encodeURIComponent(orderId)}/split`,
    { method: 'POST', auth: true, body: { expected_version: input.expected_version, note: input.note.trim() } },
  )
  const row = asRecord(res)
  return {
    sourceGroup: requireOrderGroup(row?.sourceGroup ?? row?.source_group),
    newGroup: requireOrderGroup(row?.newGroup ?? row?.new_group),
  }
}

export async function mergeOrderGroups(
  targetGroupId: string,
  input: { source_group_id: string; expected_version: number; note: string },
): Promise<OrderGroup> {
  return requireOrderGroup(
    await apiRequest<unknown>(`/order-groups/${encodeURIComponent(targetGroupId)}/merge`, {
      method: 'POST',
      auth: true,
      body: {
        source_group_id: input.source_group_id,
        expected_version: input.expected_version,
        note: input.note.trim(),
      },
    }),
  )
}

export async function sellerCancelOrder(orderId: string, reason: string): Promise<void> {
  await apiRequest(`/order-groups/orders/${encodeURIComponent(orderId)}/seller-cancel`, {
    method: 'POST',
    auth: true,
    body: { reason: reason.trim() },
  })
}

export async function unlinkOrderGroup(id: string): Promise<void> {
  await apiRequest(`/order-groups/${encodeURIComponent(id)}/link`, {
    method: 'DELETE',
    auth: true,
  })
}

export async function listStockReservation(
  id: string,
): Promise<StockReservationLine[]> {
  const res = await apiRequest<unknown>(
    `/order-groups/${encodeURIComponent(id)}/stock-reservation`,
    { auth: true },
  )
  if (!Array.isArray(res)) return []
  return res.flatMap((item) => {
    const row = asRecord(item)
    if (!row) return []
    const sellerSku = pickString(row.sellerSku, row.seller_sku)
    if (!sellerSku) return []
    return [
      {
        sellerSku,
        masterSku: pickString(row.masterSku, row.master_sku) || null,
        stockKey: pickString(row.stockKey, row.stock_key),
        status: pickString(row.status),
        quantityNeeded: pickNumber(row.quantityNeeded, row.quantity_needed),
        quantityPicked: pickNumber(row.quantityPicked, row.quantity_picked),
        quantityReserved: pickNumber(
          row.quantityReserved,
          row.quantity_reserved,
        ),
        shortage: pickNumber(row.shortage),
      },
    ]
  })
}

export async function recheckStockReservation(id: string): Promise<{
  stockShortage: boolean
}> {
  const res = await apiRequest<unknown>(
    `/order-groups/${encodeURIComponent(id)}/stock-reservation/recheck`,
    { method: 'POST', auth: true },
  )
  const row = asRecord(res)
  return {
    stockShortage:
      row?.stockShortage === true || row?.stock_shortage === true,
  }
}

export async function releaseStockReservation(
  id: string,
): Promise<{ releasedUnits: number }> {
  const res = await apiRequest<unknown>(
    `/order-groups/${encodeURIComponent(id)}/stock-reservation/release`,
    { method: 'POST', auth: true },
  )
  const row = asRecord(res)
  return {
    releasedUnits: pickNumber(row?.releasedUnits, row?.released_units),
  }
}

export async function getStockAvailability(params: {
  platform: string
  shop_id: string
  seller_sku: string
}): Promise<StockAvailability> {
  const query = toQuery(params)
  const res = await apiRequest<unknown>(`/stock-availability${query}`, {
    auth: true,
  })
  const row = asRecord(res)
  return {
    stockKey: pickString(row?.stockKey, row?.stock_key),
    masterSku: pickString(row?.masterSku, row?.master_sku) || null,
    onHand: pickNumber(row?.onHand, row?.on_hand),
    reserved: pickNumber(row?.reserved),
    available: pickNumber(row?.available),
  }
}
