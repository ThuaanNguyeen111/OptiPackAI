/**
 * Mã lỗi module shipping (prefix SHIP_) — module vận chuyển: hãng, bảng cước,
 * báo giá, tùy chọn. Vận đơn/chuyến giao nằm ở module shipments (SHP_).
 */
export const SHIP_ERROR_CODES = {
  INVALID_CARRIER_ID: 'SHIP_INVALID_CARRIER_ID',
  CARRIER_NOT_FOUND: 'SHIP_CARRIER_NOT_FOUND',
  CARRIER_CODE_IN_USE: 'SHIP_CARRIER_CODE_IN_USE',
  SERVICE_NOT_FOUND: 'SHIP_SERVICE_NOT_FOUND', // carrier_code/service_code không có hoặc đã ngừng dùng
  INVALID_RATE_TABLE: 'SHIP_INVALID_RATE_TABLE', // bậc cước trống/trùng/không tăng dần, ETA min > max
  NO_PARCELS: 'SHIP_NO_PARCELS', // nhóm chưa có kiện hợp lệ để báo giá
  SETTINGS_SERVICE_INVALID: 'SHIP_SETTINGS_SERVICE_INVALID', // dịch vụ mặc định không tồn tại
  // C4/C6 (14/10/2026)
  LIVE_CARRIER_SERVICES_LOCKED: 'SHIP_LIVE_CARRIER_SERVICES_LOCKED', // không sửa danh sách dịch vụ của hãng API (GHN) qua PATCH
  LIVE_CARRIER_UNAVAILABLE: 'SHIP_LIVE_CARRIER_UNAVAILABLE', // module carriers chưa nạp (không gọi được hãng)
  NOT_LIVE_CARRIER: 'SHIP_NOT_LIVE_CARRIER', // thao tác chỉ dành cho hãng API
} as const;
