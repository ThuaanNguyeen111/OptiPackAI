export const WAREHOUSE_ERROR_CODES = {
  WAREHOUSE_NOT_FOUND: 'WH_WAREHOUSE_NOT_FOUND',
  ZONE_NOT_FOUND: 'WH_ZONE_NOT_FOUND',
  INVALID_BIN_RANGE: 'WH_INVALID_BIN_RANGE',
  // BỔ SUNG (16/09/2026) — báo cáo thật: tạo trùng warehouse_code/zone_code
  // trước đây rơi thẳng lỗi MongoDB thô (E11000, 500) thay vì lỗi nghiệp
  // vụ rõ ràng cho FE bắt riêng.
  WAREHOUSE_CODE_IN_USE: 'WH_WAREHOUSE_CODE_IN_USE',
  ZONE_CODE_IN_USE: 'WH_ZONE_CODE_IN_USE',
  // BỔ SUNG (29/09/2026, Mục 9.5) — Picking List gộp nhiều group
  // (GET :warehouseId/picking-list?group_ids=...): tham số group_ids rỗng
  // hoặc chứa ObjectId sai định dạng.
  INVALID_GROUP_IDS: 'WH_INVALID_GROUP_IDS',
} as const;
