/**
 * ===================================================================
 * DANH SÁCH MÃ LỖI — module shipments (prefix: SHP_)
 * ===================================================================
 * Cùng nguyên tắc đã áp dụng ở ORD_ERROR_CODES/MKT_ERROR_CODES: prefix
 * theo MODULE, đăng ký hết vào đây, không gõ string lỗi trực tiếp.
 * ===================================================================
 */
export const SHP_ERROR_CODES = {
  EMPTY_GROUP_LIST: 'SHP_EMPTY_GROUP_LIST', // order_group_ids rỗng
  GROUP_NOT_PACKED: 'SHP_GROUP_NOT_PACKED', // group chưa ở fulfillment_status = packed
  RECIPIENT_MISMATCH: 'SHP_RECIPIENT_MISMATCH', // ≥2 group nhưng recipient_key khác nhau/thiếu — không tự đoán liên kết
  GROUP_ALREADY_SHIPPED: 'SHP_GROUP_ALREADY_SHIPPED', // group đã có shipment từ trước
  PICKUP_IN_PAST: 'SHP_PICKUP_IN_PAST', // lịch hãng đến lấy hàng ở quá khứ
  SHIPMENT_NOT_FOUND: 'SHP_SHIPMENT_NOT_FOUND', // không có vận đơn
} as const;
