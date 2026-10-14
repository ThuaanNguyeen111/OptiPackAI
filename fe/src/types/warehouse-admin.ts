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
  isActive: boolean
}

export type BinDesignation = {
  categoryCode: string | null
  size: string | null
  colorCode: string | null
}

export type BinLocationRecord = {
  id: string
  warehouseId: string
  zoneId: string
  binCode: string
  aisle: string
  rack: number
  level: number
  isActive: boolean
  layoutVersion: 1 | 2
  side: 'T' | 'P' | null
  cell: number | null
  capacity: number | null
  designated: BinDesignation | null
  pickSequence: number | null
}

export type SkuBinAssignmentRecord = {
  id: string
  warehouseId: string
  platform: string
  shopId: string
  sellerSku: string
  binLocationId: string
  quantityOnHand: number
  masterSku: string | null
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
  pick_sequence: number | null
  master_sku: string | null
  bin_location_id: string | null
  other_bins: OtherBin[]
}

export type OtherBin = {
  bin_location_id: string
  bin_code: string
  quantity_on_hand: number
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
  force?: boolean
}

export type UpdateWarehouseInput = {
  warehouse_name?: string
  address?: string
}

export type UpdateZoneInput = {
  zone_name?: string
  description?: string
}

export type CreateRackInput = {
  aisle: string
  side: 'T' | 'P'
  bay: number
  category_code: string
  tiers: Array<{ tier: number; size: string }>
  cells_per_tier: number
  cell_colors?: string[]
  capacity_per_cell?: number
}

export type StockAdjustReason =
  | 'count_correction'
  | 'damaged'
  | 'lost'
  | 'found'
  | 'other'

export type AdjustStockInput = {
  counted_quantity: number
  reason_code: StockAdjustReason
  note?: string
}

export type TransferStockInput = {
  to_bin_location_id: string
  quantity: number
  force?: boolean
  note?: string
}

export type InventoryMovementRecord = {
  id: string
  type: string
  masterSku: string | null
  delta: number
  quantityBefore: number
  quantityAfter: number
  reasonCode: string | null
  note: string | null
  refType: string | null
  refId: string | null
  actorId: string | null
  createdAt: string
}

export type CategoryRecord = {
  code: string
  name: string
  parentCode: string | null
  level: number
  sizeScale: string[]
  isActive: boolean
  children?: CategoryRecord[]
}

export const WAREHOUSE_ERROR_MESSAGES: Record<string, string> = {
  WH_WAREHOUSE_NOT_FOUND: 'Không tìm thấy kho.',
  WH_ZONE_NOT_FOUND: 'Không tìm thấy khu trong kho.',
  WH_INVALID_BIN_RANGE: 'Khoảng kệ/tầng không hợp lệ (from phải ≤ to).',
  WH_WAREHOUSE_CODE_IN_USE: 'Mã kho đã tồn tại. Kho cũ vẫn còn trong hệ thống — tải lại trang nếu không thấy.',
  WH_ZONE_CODE_IN_USE: 'Mã khu đã tồn tại trong kho này.',
  WH_HAS_STOCK: 'Còn hàng — chuyển hết hàng đi trước khi vô hiệu hóa.',
  WH_WAREHOUSE_INACTIVE: 'Kho đang tắt. Kích hoạt lại kho trước.',
  WH_ZONE_INACTIVE: 'Khu đang tắt. Kích hoạt lại khu trước.',
  WH_BIN_INACTIVE: 'Kệ đang tắt.',
  WH_BIN_NOT_FOUND: 'Không tìm thấy kệ.',
  WH_BIN_NOT_IN_WAREHOUSE: 'Kệ không thuộc kho đang thao tác.',
  WH_BIN_OVER_CAPACITY: 'Vượt sức chứa ô. Xác nhận để vẫn xếp.',
  WH_BIN_HAS_STOCK_DESIGNATION: 'Ô còn hàng — không đổi danh mục/size/màu.',
  WH_STOCK_CHANGED: 'Tồn vừa đổi. Tải lại rồi đếm lại.',
  WH_INSUFFICIENT_STOCK: 'Ô nguồn không đủ hàng để chuyển.',
  WH_ASSIGNMENT_HAS_STOCK: 'Còn hàng — không bỏ gán được.',
  WH_NOTE_REQUIRED: 'Lý do «Khác» bắt buộc ghi chú.',
  WH_NOTHING_TO_UPDATE: 'Chưa có gì để sửa.',
  WH_ZONE_LEGACY_FORMAT: 'Kệ chuẩn mới chỉ tạo trong khu KA–KZ.',
  WH_ZONE_V2_USE_RACKS: 'Khu chuẩn mới dùng «Tạo kệ», không dùng sinh kệ cũ.',
  CAT_NOT_FOUND: 'Không tìm thấy danh mục.',
  CAT_CODE_IN_USE: 'Mã danh mục đã tồn tại.',
  CAT_PARENT_NOT_FOUND: 'Không tìm thấy nhóm cha.',
  CAT_PARENT_NOT_LEVEL_1: 'Loại chỉ gắn vào nhóm cấp 1.',
  CAT_PARENT_INACTIVE: 'Nhóm cha đang tắt. Bật nhóm trước.',
  CAT_SIZE_SCALE_REQUIRED: 'Loại cấp 2 phải có thang size.',
  CAT_SIZE_SCALE_NOT_ALLOWED: 'Nhóm cấp 1 không có thang size.',
  CAT_SIZE_IN_USE: 'Size này đang được kệ dùng. Đổi đăng ký các ô trước khi bỏ size.',
  CAT_HAS_ACTIVE_CHILDREN: 'Còn loại đang bật trong nhóm này.',
  CAT_IN_USE: 'Kệ đang đăng ký danh mục này. Tắt kệ hoặc đổi đăng ký trước.',
  CAT_INACTIVE: 'Danh mục đang tắt.',
  CAT_NOT_LEVEL_2: 'Kệ chỉ gắn danh mục cấp 2.',
  CAT_NOTHING_TO_UPDATE: 'Chưa có gì để sửa.',
  MSKU_NOT_FOUND: 'Không tìm thấy SKU nội bộ.',
  MSKU_ALREADY_EXISTS: 'SKU nội bộ này đã tồn tại.',
  MSKU_INACTIVE: 'SKU nội bộ đang tắt.',
  MSKU_SIZE_NOT_IN_SCALE: 'Size không thuộc thang size của danh mục.',
  MSKU_NOTHING_TO_UPDATE: 'Chưa có gì để sửa trên SKU nội bộ.',
  MSKU_HAS_MAPPINGS: 'Còn SKU sàn đang nối — bỏ nối trước khi tắt.',
  MSKU_REPLACE_SAME: 'Thay thế phải đổi ít nhất một thành phần của mã.',
  COLOR_NOT_FOUND: 'Không tìm thấy màu.',
  COLOR_INACTIVE: 'Màu đang tắt.',
  COLOR_CODE_IN_USE: 'Mã màu đã tồn tại.',
  COLOR_IN_USE: 'Còn SKU nội bộ đang dùng màu này.',
  MAP_SELLER_SKU_UNKNOWN: 'SKU sàn chưa được đồng bộ về. Đồng bộ sản phẩm rồi nối lại.',
  MAP_ALREADY_MAPPED: 'SKU sàn đã nối với một SKU nội bộ khác.',
  MAP_NOT_FOUND: 'Không tìm thấy liên kết SKU sàn.',
  MAP_HAS_POOLED_STOCK: 'SKU nội bộ còn tồn gộp chung — đưa tồn về 0 trước khi bỏ nối.',
}
