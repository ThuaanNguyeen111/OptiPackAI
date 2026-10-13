/**
 * (09/10/2026) Mã lỗi website AURELLE (storefront + tài khoản khách). Exception
 * Nest giữ nguyên lớp/HTTP status, body thêm `error_code` (GlobalExceptionFilter đọc).
 */
export const SF_ERROR_CODES = {
  PRODUCT_NOT_FOUND: 'SF_PRODUCT_NOT_FOUND', // 404
  VARIANT_INVALID: 'SF_VARIANT_INVALID', // 400 mã biến thể sai định dạng
  VARIANT_NOT_FOUND: 'SF_VARIANT_NOT_FOUND', // 404
  VARIANT_UNAVAILABLE: 'SF_VARIANT_UNAVAILABLE', // 400 biến thể không còn bán
  OUT_OF_STOCK: 'SF_OUT_OF_STOCK', // 400 hết hàng / vượt tồn
  QUANTITY_INVALID: 'SF_QUANTITY_INVALID', // 400
  CART_ITEM_NOT_FOUND: 'SF_CART_ITEM_NOT_FOUND', // 404
  CART_EMPTY: 'SF_CART_EMPTY', // 400
  ORDER_NOT_FOUND: 'SF_ORDER_NOT_FOUND', // 404 (cả khi id sai định dạng)
  EMAIL_IN_USE: 'SF_EMAIL_IN_USE', // 409
  INVALID_CREDENTIALS: 'SF_INVALID_CREDENTIALS', // 401
  ACCOUNT_INACTIVE: 'SF_ACCOUNT_INACTIVE', // 401
} as const;

export type SfErrorCode = (typeof SF_ERROR_CODES)[keyof typeof SF_ERROR_CODES];

export function sfError(code: SfErrorCode, message: string): { error_code: SfErrorCode; message: string } {
  return { error_code: code, message };
}
