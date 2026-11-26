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
  ORDER_NOT_CANCELLABLE: 'SF_ORDER_NOT_CANCELLABLE', // 409 đơn đã đóng gói/giao/đã hủy — không tự hủy được nữa
  RETURN_NOT_FOUND: 'SF_RETURN_NOT_FOUND', // 404
  RETURN_ORDER_NOT_DELIVERED: 'SF_RETURN_ORDER_NOT_DELIVERED', // 409 chỉ trả hàng sau khi đã nhận hàng
  RETURN_WINDOW_EXPIRED: 'SF_RETURN_WINDOW_EXPIRED', // 409 quá hạn trả hàng
  RETURN_INVALID_ITEMS: 'SF_RETURN_INVALID_ITEMS', // 400 món không thuộc đơn / vượt số lượng còn được trả
  RETURN_OPEN_EXISTS: 'SF_RETURN_OPEN_EXISTS', // 409 đơn đang có yêu cầu trả hàng chưa xử lý xong
  RETURN_NOT_CANCELLABLE: 'SF_RETURN_NOT_CANCELLABLE', // 21/10/2026 — 409 cửa hàng đã xử lý yêu cầu, không tự hủy được nữa
  EXCHANGE_INVALID: 'SF_EXCHANGE_INVALID', // 21/10/2026 — 400 hàng đổi sang không hợp lệ (thiếu / khác sản phẩm / lệch số lượng)
  EXPRESS_UNAVAILABLE: 'SF_EXPRESS_UNAVAILABLE', // 29/10/2026 — 400 chọn giao hỏa tốc nhưng phường ngoài danh sách / ngoài 8:00–14:00 thứ 2–7
  EXPRESS_WARDS_INVALID: 'SF_EXPRESS_WARDS_INVALID', // 29/10/2026 — 400 Admin lưu danh sách phường hỏa tốc rỗng / sai
  EMAIL_IN_USE: 'SF_EMAIL_IN_USE', // 409
  INVALID_CREDENTIALS: 'SF_INVALID_CREDENTIALS', // 401
  ACCOUNT_INACTIVE: 'SF_ACCOUNT_INACTIVE', // 401
} as const;

export type SfErrorCode = (typeof SF_ERROR_CODES)[keyof typeof SF_ERROR_CODES];

export function sfError(code: SfErrorCode, message: string): { error_code: SfErrorCode; message: string } {
  return { error_code: code, message };
}
