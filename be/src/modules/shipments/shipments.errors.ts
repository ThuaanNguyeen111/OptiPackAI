export const SHIPMENT_ERROR_CODES = {
  NOT_FOUND: 'SHP_NOT_FOUND',
  INVALID_ID: 'SHP_INVALID_ID',
  ALREADY_EXISTS: 'SHP_ALREADY_EXISTS', // nhóm đơn đã có vận đơn
  GROUP_NOT_READY: 'SHP_GROUP_NOT_READY', // nhóm đơn chưa đóng gói xong
  PARCELS_TO_UNPACK: 'SHP_PARCELS_TO_UNPACK', // (05/10/2026) còn kiện của đơn hủy chưa tháo — không giao
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
  // C4/C5 (14/10/2026) — vận đơn giao qua hãng thật (GHN)
  MANAGED_BY_CARRIER: 'SHP_MANAGED_BY_CARRIER', // nút G1 (giao/thất bại/giao lại) không dùng cho vận đơn do hãng quản lý
  NOT_CARRIER_SHIPMENT: 'SHP_NOT_CARRIER_SHIPMENT', // thao tác hãng trên vận đơn tự giao / hãng mẫu
  CARRIER_NOT_BOOKED: 'SHP_CARRIER_NOT_BOOKED', // chưa kiện nào có mã hãng (in nhãn / đồng bộ)
  CARRIER_CANCEL_NOT_ALLOWED: 'SHP_CARRIER_CANCEL_NOT_ALLOWED', // chỉ huỷ khi vận đơn còn "chờ lấy hàng"
  CARRIER_CANCEL_REJECTED: 'SHP_CARRIER_CANCEL_REJECTED', // hãng từ chối huỷ (đã lấy hàng)
  CARRIER_SIMULATION_DISABLED: 'SHP_CARRIER_SIMULATION_DISABLED', // CARRIER_MANUAL_STATUS_ENABLED khác true
  CARRIER_STATUS_INVALID: 'SHP_CARRIER_STATUS_INVALID', // trạng thái mô phỏng không hợp lệ
  TO_LOCATION_LOCKED: 'SHP_TO_LOCATION_LOCKED', // mọi kiện đã có mã hãng — không sửa địa chỉ được nữa
  WEBHOOK_UNAUTHORIZED: 'SHP_WEBHOOK_UNAUTHORIZED', // webhook hãng sai khoá bí mật / sai shop
} as const;
