/** Mã lỗi ổn định BE ↔ FE cho khâu đơn vị vận chuyển (08/10/2026, C2). */
export const CARRIER_ERROR_CODES = {
  NOT_CONFIGURED: 'CARRIER_NOT_CONFIGURED', // thiếu token / shop id
  UNAVAILABLE: 'CARRIER_UNAVAILABLE', // hãng không phản hồi / lỗi 5xx / mạng
  INVALID_REQUEST: 'CARRIER_INVALID_REQUEST', // hãng báo dữ liệu gửi sai (thiếu field, sai định dạng)
  INVALID_PHONE: 'CARRIER_INVALID_PHONE',
  INVALID_ADDRESS: 'CARRIER_INVALID_ADDRESS', // hãng không nhận ra tỉnh/quận/phường
  // C3 (10/10/2026)
  ADDRESS_CONFLICT: 'CARRIER_ADDRESS_CONFLICT', // số nhà/đường không thuộc phường đã chọn (GHN "To address conflict")
  ADDRESS_INCOMPLETE: 'CARRIER_ADDRESS_INCOMPLETE', // đơn thiếu phường hoặc tỉnh → Coordinator nhập tay
  ROUTE_NOT_SUPPORTED: 'CARRIER_ROUTE_NOT_SUPPORTED', // không có tuyến giữa kho và địa chỉ nhận
  UNAUTHORIZED: 'CARRIER_UNAUTHORIZED', // token không thuộc shop / sai token
  ORDER_NOT_FOUND: 'CARRIER_ORDER_NOT_FOUND',
  PARCEL_LIMIT_EXCEEDED: 'CARRIER_PARCEL_LIMIT_EXCEEDED', // vượt 50 kg / 200 cm
} as const;

export type CarrierErrorCode =
  (typeof CARRIER_ERROR_CODES)[keyof typeof CARRIER_ERROR_CODES];
