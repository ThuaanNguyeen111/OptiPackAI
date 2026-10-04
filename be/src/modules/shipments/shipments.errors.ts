export const SHIPMENT_ERROR_CODES = {
  NOT_FOUND: 'SHP_NOT_FOUND',
  INVALID_ID: 'SHP_INVALID_ID',
  ALREADY_EXISTS: 'SHP_ALREADY_EXISTS', // nhóm đơn đã có vận đơn
  GROUP_NOT_READY: 'SHP_GROUP_NOT_READY', // nhóm đơn chưa đóng gói xong
  INVALID_TRANSITION: 'SHP_INVALID_TRANSITION',
  STATE_CONFLICT: 'SHP_STATE_CONFLICT', // version không khớp
  NOTE_REQUIRED: 'SHP_NOTE_REQUIRED', // lý do "other" phải có ghi chú
  RETRY_TOO_EARLY: 'SHP_RETRY_TOO_EARLY', // giao lại trước giờ cho phép mà không nêu lý do
  INVALID_RESCHEDULE: 'SHP_INVALID_RESCHEDULE', // giờ hẹn giao lại ở quá khứ
  // Gộp từ thi_dev (04/10/2026) — giao chung chuyến + chọn hãng
  EMPTY_GROUP_LIST: 'SHP_EMPTY_GROUP_LIST', // POST /shipments/batch không có nhóm nào
  RECIPIENT_MISMATCH: 'SHP_RECIPIENT_MISMATCH', // ≥2 nhóm khác người nhận (recipient_key)
  PICKUP_IN_PAST: 'SHP_PICKUP_IN_PAST', // lịch hãng đến lấy hàng ở quá khứ
  CARRIER_REQUIRED: 'SHP_CARRIER_REQUIRED', // gửi carrier_code mà thiếu service_code (hoặc ngược lại)
} as const;
