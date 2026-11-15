export type FulfillmentStage = 'pick' | 'pack' | 'ship' | 'return'

const STAGE_PATHS: { stage: FulfillmentStage; paths: string[] }[] = [
  { stage: 'pick', paths: ['/app/order-groups', '/app/warehouse', '/app/inventory', '/app/admin/warehouse'] },
  {
    stage: 'pack',
    paths: [
      '/app/packing',
      '/app/packaging-rules',
      '/app/packaging-materials',
      '/app/admin/packaging-materials',
    ],
  },
  { stage: 'ship', paths: ['/app/shipping'] },
  { stage: 'return', paths: ['/app/returns', '/app/admin/returns'] },
]

/** Bước xử lý của một mục menu. Mục không thuộc bước nào giữ màu chữ thường. */
export function stageOfPath(path: string): FulfillmentStage | undefined {
  return STAGE_PATHS.find((entry) => entry.paths.includes(path))?.stage
}

export type StatusTone =
  | FulfillmentStage
  | 'danger'
  | 'warning'
  | 'success'
  | 'primary'
  | 'default'

const GROUP_TONES: Record<string, StatusTone> = {
  awaiting_packaging: 'pick',
  picking: 'pick',
  partial_needs_review: 'warning',
  picked: 'pack',
  pending_approval: 'pack',
  approved_for_packing: 'pack',
  packed: 'ship',
  shipped: 'ship',
  delivered: 'success',
  returning: 'return',
  returned: 'return',
  canceled: 'default',
}

const SHIPMENT_TONES: Record<string, StatusTone> = {
  packed: 'ship',
  awaiting_pickup: 'ship',
  in_transit: 'ship',
  out_for_delivery: 'ship',
  delivered: 'success',
  delivery_failed: 'danger',
  returning_to_warehouse: 'return',
  returned_to_warehouse: 'return',
  cancelled: 'default',
}

const RETURN_TONES: Record<string, StatusTone> = {
  requested: 'return',
  awaiting_receipt: 'return',
  received: 'return',
  closed: 'success',
  rejected: 'danger',
  canceled: 'default',
}

const ORDER_TONES: Record<string, StatusTone> = {
  unpaid: 'warning',
  pending: 'pick',
  topack: 'pick',
  packed: 'pack',
  toship: 'ship',
  ready_to_ship: 'ship',
  shipped: 'ship',
  delivered: 'success',
  canceled: 'danger',
  failed: 'danger',
  lost: 'danger',
  lost_by_3pl: 'danger',
  damaged_by_3pl: 'danger',
  failed_delivery: 'danger',
  shipped_back_failed: 'danger',
  package_scrapped: 'danger',
  returned: 'return',
  shipped_back: 'return',
  shipped_back_success: 'return',
}

export function groupStatusTone(status: string): StatusTone {
  return GROUP_TONES[status] ?? 'default'
}

export function shipmentStatusTone(status: string): StatusTone {
  return SHIPMENT_TONES[status] ?? 'default'
}

export function returnStatusTone(status: string): StatusTone {
  return RETURN_TONES[status] ?? 'default'
}

export function orderStatusTone(status: string): StatusTone {
  return ORDER_TONES[status] ?? 'default'
}
