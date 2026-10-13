/** Mã lỗi module documents (prefix DOC_). */
export const DOC_ERROR_CODES = {
  NO_ORDERS: 'DOC_NO_ORDERS', // nhóm không còn đơn để in
  SHIPMENT_NOT_FOUND: 'DOC_SHIPMENT_NOT_FOUND', // chưa có vận đơn để in nhãn
  TRIP_NOT_FOUND: 'DOC_TRIP_NOT_FOUND', // mã chuyến không có vận đơn nào
} as const;
