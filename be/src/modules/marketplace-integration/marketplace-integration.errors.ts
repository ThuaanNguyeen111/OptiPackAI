/**
 * ===================================================================
 * DANH SÁCH MÃ LỖI — module marketplace-integration (prefix: MKT_)
 * ===================================================================
 * Đăng ký TẤT CẢ mã lỗi module này dùng vào đây — khi cần ném lỗi ở
 * service/adapter, import từ file này, KHÔNG gõ string trực tiếp tại
 * chỗ ném lỗi (tránh gõ sai chính tả tạo ra 2 mã lỗi tưởng giống nhau
 * nhưng thực ra khác nhau, FE match theo string sẽ sai).
 * ===================================================================
 */
export const MKT_ERROR_CODES = {
  OAUTH_STATE_INVALID: 'MKT_OAUTH_STATE_INVALID',
  ADAPTER_NOT_REGISTERED: 'MKT_ADAPTER_NOT_REGISTERED',
  SHOP_NOT_CONNECTED: 'MKT_SHOP_NOT_CONNECTED',
  TOKEN_EXCHANGE_FAILED: 'MKT_TOKEN_EXCHANGE_FAILED',
  TOKEN_REFRESH_FAILED: 'MKT_TOKEN_REFRESH_FAILED',
  TOKEN_DECRYPT_FAILED: 'MKT_TOKEN_DECRYPT_FAILED',
  WEBHOOK_SIGNATURE_INVALID: 'MKT_WEBHOOK_SIGNATURE_INVALID',
  SHOP_LOOKUP_FAILED: 'MKT_SHOP_LOOKUP_FAILED',
} as const;
