export const RETURN_ERROR_CODES = {
  NOT_FOUND: 'RMA_NOT_FOUND',
  INVALID_ID: 'RMA_INVALID_ID',
  ORDER_NOT_DELIVERED: 'RMA_ORDER_NOT_DELIVERED', // chỉ trả hàng khi nhóm đơn đã giao thành công
  OPEN_EXISTS: 'RMA_OPEN_EXISTS', // nhóm đơn đang có phiếu trả chưa đóng
  WINDOW_EXPIRED: 'RMA_WINDOW_EXPIRED', // quá hạn trả hàng
  INVALID_ITEMS: 'RMA_INVALID_ITEMS', // SKU không thuộc nhóm đơn / vượt số lượng đã mua / trùng dòng
  INVALID_STATUS: 'RMA_INVALID_STATUS', // bấm nút sai thứ tự
  STATE_CONFLICT: 'RMA_STATE_CONFLICT', // version không khớp
  SELF_APPROVAL: 'RMA_SELF_APPROVAL', // người tạo phiếu không được tự duyệt
  NOTE_REQUIRED: 'RMA_NOTE_REQUIRED', // từ chối phải có lý do
  INSPECTION_MISMATCH: 'RMA_INSPECTION_MISMATCH', // tổng kiểm hàng != số lượng trả
  BIN_REQUIRED: 'RMA_BIN_REQUIRED', // nhập lại kho phải chọn ô
  EXCHANGE_ITEMS_REQUIRED: 'RMA_EXCHANGE_ITEMS_REQUIRED', // phiếu đổi hàng phải khai hàng đổi sang
  INVALID_EXCHANGE_ITEMS: 'RMA_INVALID_EXCHANGE_ITEMS', // hàng đổi sang không có trong danh mục sản phẩm của shop
  NOT_EXCHANGE: 'RMA_NOT_EXCHANGE', // tạo đơn thay thế cho phiếu không phải đổi hàng / chưa kiểm hàng xong
  REPLACEMENT_EXISTS: 'RMA_REPLACEMENT_EXISTS', // đã tạo đơn thay thế rồi
  QUARANTINE_LINE_NOT_FOUND: 'RMA_QUARANTINE_LINE_NOT_FOUND',
  QUARANTINE_ALREADY_RESOLVED: 'RMA_QUARANTINE_ALREADY_RESOLVED',
} as const;
