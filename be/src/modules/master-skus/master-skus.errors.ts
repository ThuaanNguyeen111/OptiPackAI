export const MASTER_SKU_ERROR_CODES = {
  NOT_FOUND: 'MSKU_NOT_FOUND',
  ALREADY_EXISTS: 'MSKU_ALREADY_EXISTS',
  INACTIVE: 'MSKU_INACTIVE',
  SIZE_NOT_IN_SCALE: 'MSKU_SIZE_NOT_IN_SCALE',
  NOTHING_TO_UPDATE: 'MSKU_NOTHING_TO_UPDATE',
  HAS_MAPPINGS: 'MSKU_HAS_MAPPINGS', // vô hiệu hóa khi còn SKU sàn nối vào
  REPLACE_SAME: 'MSKU_REPLACE_SAME', // thay thế mà không đổi thành phần nào
  COLOR_NOT_FOUND: 'COLOR_NOT_FOUND',
  COLOR_INACTIVE: 'COLOR_INACTIVE',
  COLOR_CODE_IN_USE: 'COLOR_CODE_IN_USE',
  COLOR_IN_USE: 'COLOR_IN_USE', // tắt màu đang có SKU dùng
  SELLER_SKU_UNKNOWN: 'MAP_SELLER_SKU_UNKNOWN', // SKU sàn chưa từng đồng bộ về (gõ sai?)
  ALREADY_MAPPED: 'MAP_ALREADY_MAPPED', // SKU sàn đã nối SKU nội bộ khác
  MAPPING_NOT_FOUND: 'MAP_NOT_FOUND',
  HAS_POOLED_STOCK: 'MAP_HAS_POOLED_STOCK', // K4b — bỏ nối khi tồn đang gộp chung
  // 10/10/2026 — xoá hẳn SKU nội bộ tạo nhầm
  HAS_STOCK: 'MSKU_HAS_STOCK', // SKU còn nằm trên ô nào đó trong kho
  HAS_HISTORY: 'MSKU_HAS_HISTORY', // SKU đã có nhập–xuất → chỉ vô hiệu hoá / thay thế
} as const;
