/** Khớp response camelCase từ `warehouse.controller.ts`. */

export type WarehouseRecord = {
  id: string
  warehouseCode: string
  warehouseName: string
  address: string
  isActive: boolean
}

export type WarehouseZoneRecord = {
  id: string
  warehouseId: string
  zoneCode: string
  zoneName: string
  description: string
}

export type BinLocationRecord = {
  id: string
  warehouseId: string
  zoneId: string
  binCode: string
  aisle: string
  rack: number
  level: number
}

export type SkuBinAssignmentRecord = {
  id: string
  warehouseId: string
  platform: string
  shopId: string
  sellerSku: string
  binLocationId: string
  quantityOnHand: number
  binCode?: string
}

/** `GET /warehouse/sku-bin-assignments/unassigned` — BE trả snake_case. */
export type UnassignedSku = {
  platform: string
  shop_id: string
  seller_sku: string
}

/** `GET /warehouse/:warehouseId/picking-list/:groupId` — giữ snake_case (PackableItem). */
export type WarehousePickingListItem = {
  sku: string
  quantity: number
  length_cm: number
  width_cm: number
  height_cm: number
  weight_kg: number
  is_fragile: boolean
  zone_code: string
  bin_code: string
}

export type CreateWarehouseInput = {
  warehouse_code: string
  warehouse_name: string
  address: string
}

export type CreateZoneInput = {
  zone_code: string
  zone_name: string
  description?: string
}

export type GenerateBinsInput = {
  aisle: string
  rack_from: number
  rack_to: number
  level_from: number
  level_to: number
}

export type AssignSkuInput = {
  platform: string
  shop_id: string
  seller_sku: string
  bin_location_id: string
  initial_quantity?: number
}

export const WAREHOUSE_ERROR_MESSAGES: Record<string, string> = {
  WH_WAREHOUSE_NOT_FOUND: 'Không tìm thấy kho.',
  WH_ZONE_NOT_FOUND: 'Không tìm thấy khu trong kho.',
  WH_INVALID_BIN_RANGE: 'Khoảng kệ/tầng không hợp lệ (from phải ≤ to).',
}
