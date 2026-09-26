export const WAREHOUSE_ERROR_CODES = {
  WAREHOUSE_NOT_FOUND: 'WH_WAREHOUSE_NOT_FOUND',
  ZONE_NOT_FOUND: 'WH_ZONE_NOT_FOUND',
  INVALID_BIN_RANGE: 'WH_INVALID_BIN_RANGE',
  // BỔ SUNG (16/09/2026) — báo cáo thật: tạo trùng warehouse_code/zone_code
  // trước đây rơi thẳng lỗi MongoDB thô (E11000, 500) thay vì lỗi nghiệp
  // vụ rõ ràng cho FE bắt riêng.
  WAREHOUSE_CODE_IN_USE: 'WH_WAREHOUSE_CODE_IN_USE',
  ZONE_CODE_IN_USE: 'WH_ZONE_CODE_IN_USE',
  // BỔ SUNG (26/09/2026, K1) — vòng đời kho/khu/kệ
  WAREHOUSE_INACTIVE: 'WH_WAREHOUSE_INACTIVE', // thao tác trên kho đã vô hiệu hóa
  ZONE_INACTIVE: 'WH_ZONE_INACTIVE',
  BIN_NOT_FOUND: 'WH_BIN_NOT_FOUND',
  BIN_INACTIVE: 'WH_BIN_INACTIVE',
  BIN_NOT_IN_WAREHOUSE: 'WH_BIN_NOT_IN_WAREHOUSE', // gán SKU vào kệ của kho KHÁC
  HAS_STOCK: 'WH_HAS_STOCK', // chặn vô hiệu hóa khi còn hàng tồn
  NOTHING_TO_UPDATE: 'WH_NOTHING_TO_UPDATE',
} as const;
