/** Mã lỗi module documents (prefix DOC_). */
export const DOC_ERROR_CODES = {
  NO_ORDERS: 'DOC_NO_ORDERS', // nhóm không còn đơn để in
  SHIPMENT_NOT_FOUND: 'DOC_SHIPMENT_NOT_FOUND', // chưa có vận đơn để in nhãn
  TRIP_NOT_FOUND: 'DOC_TRIP_NOT_FOUND', // mã chuyến không có vận đơn nào
  // ---- tem + phiếu in kho (21/10/2026)
  INVALID_ID: 'DOC_INVALID_ID', // id kho/nhóm/phiếu sai định dạng
  WAREHOUSE_NOT_FOUND: 'DOC_WAREHOUSE_NOT_FOUND',
  NO_BINS: 'DOC_NO_BINS', // không có ô nào khớp bộ lọc để in tem
  NO_CODES: 'DOC_NO_CODES', // in tem SKU mà không có mã nào
  TOO_MANY_LABELS: 'DOC_TOO_MANY_LABELS', // vượt giới hạn tem 1 lần in
} as const;
