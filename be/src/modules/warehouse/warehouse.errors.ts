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
  // K2 (26/09/2026) — bố cục kho mới
  ZONE_LEGACY_FORMAT: 'WH_ZONE_LEGACY_FORMAT', // tạo kệ chuẩn mới trong khu mã cũ (VD "A")
  RACK_EXISTS: 'WH_RACK_EXISTS', // kệ (dãy+bên+số kệ) đã tồn tại
  INVALID_RACK_LAYOUT: 'WH_INVALID_RACK_LAYOUT', // tầng trùng, số màu != số ô...
  SIZE_NOT_IN_SCALE: 'WH_SIZE_NOT_IN_SCALE', // size không thuộc thang size của danh mục
  BIN_OVER_CAPACITY: 'WH_BIN_OVER_CAPACITY', // vượt sức chứa ô (gửi force=true để bỏ qua)
  // K2 rà soát (26/09/2026)
  ZONE_V2_USE_RACKS: 'WH_ZONE_V2_USE_RACKS', // gọi generate kiểu cũ trong khu chuẩn mới
  BIN_HAS_STOCK_DESIGNATION: 'WH_BIN_HAS_STOCK_DESIGNATION', // đổi danh mục/size/màu của ô đang có hàng
  // K3 (27/09/2026) — sổ cái, kiểm kê, chuyển ô
  ASSIGNMENT_NOT_FOUND: 'WH_ASSIGNMENT_NOT_FOUND',
  ASSIGNMENT_HAS_STOCK: 'WH_ASSIGNMENT_HAS_STOCK', // bỏ gán khi ô còn hàng
  STOCK_CHANGED: 'WH_STOCK_CHANGED', // tồn vừa bị người khác đổi trong lúc kiểm kê
  INSUFFICIENT_STOCK: 'WH_INSUFFICIENT_STOCK', // chuyển nhiều hơn số đang có
  SAME_BIN: 'WH_SAME_BIN', // chuyển sang chính ô đang đứng
  NOTE_REQUIRED: 'WH_NOTE_REQUIRED', // lý do "other" phải có ghi chú
  // 10/10/2026 — xoá hẳn mục tạo nhầm (báo cáo Hải Phượng)
  HAS_HISTORY: 'WH_HAS_HISTORY', // đã có nhập–xuất → chỉ vô hiệu hoá được, không xoá hẳn
} as const;
