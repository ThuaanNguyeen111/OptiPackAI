export const PRODUCT_MASTER_ERROR_CODES = {
  INVALID_ID: 'PM_INVALID_ID',
  NOT_FOUND: 'PM_NOT_FOUND',
  ZIP_BAG_NOT_FOUND: 'PM_ZIP_BAG_NOT_FOUND', // (21/09/2026) mã túi zip không có/không còn dùng trong danh mục
  FOLD_NOT_ALLOWED: 'PM_FOLD_NOT_ALLOWED', // (22/09/2026) giày (hộp cứng) không được đánh dấu gập đôi
} as const;
