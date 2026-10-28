/** 28/10/2026 — Mã lỗi Bảng điều khiển (prefix theo module). */
export const DASHBOARD_ERROR_CODES = {
  INVALID_DATE_RANGE: 'DASH_INVALID_DATE_RANGE', // from >= to, sai ISO, hoặc dài quá 366 ngày
  INVALID_PLATFORM: 'DASH_INVALID_PLATFORM', // ?platform không thuộc MarketplacePlatform
} as const;
