/**
 * Nhãn UI giữ layout bàn giao cũ.
 * Dữ liệu kiện / hãng 3PL không còn dùng — hàng đợi lấy từ `/shipments` + group `packed`.
 */

export const OWN_FLEET_ACCOUNT = {
  id: 'own-fleet',
  name: 'Shop tự giao',
  hub: 'SOF — không qua GHN/SPX',
} as const
