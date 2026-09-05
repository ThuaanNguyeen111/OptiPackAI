/**
 * ===================================================================
 * DANH SÁCH MÃ LỖI — module orders (prefix: ORD_)
 * ===================================================================
 * Cùng nguyên tắc đã áp dụng ở MKT_ERROR_CODES (marketplace-integration.errors.ts):
 * đăng ký hết vào đây, không gõ string lỗi trực tiếp tại nơi ném lỗi.
 * ===================================================================
 */
export const ORD_ERROR_CODES = {
  SYNC_FAILED: 'ORD_SYNC_FAILED',
  UNSUPPORTED_PLATFORM: 'ORD_UNSUPPORTED_PLATFORM',
  INVALID_ORDER_ID: 'ORD_INVALID_ORDER_ID',
  ORDER_NOT_FOUND: 'ORD_ORDER_NOT_FOUND',
} as const;
