export enum UserRole {
  STORE_OWNER = 0, // Report 1: theo dõi vận hành, dashboard, cấu hình quy tắc đóng gói/vận chuyển
  WAREHOUSE_STAFF = 1, // Report 1: picking, quét QR lấy hàng + đóng gói, cập nhật fulfillment
  PACKAGING_STAFF = 2, // Report 1: xem gợi ý AI đóng gói, chọn vật liệu, duyệt trước khi in nhãn
  SHIPPING_COORDINATOR = 3, // Report 1: chọn đơn vị vận chuyển, tạo nhãn, ước tính phí ship
  ADMIN = 4, // Report 1 gọi là "System Administrator" — rút gọn tên trong code
}

export enum LoginType {
  LOCAL = 'local',
  GOOGLE = 'google',
}

export const USER_ROLE_VALUES: readonly UserRole[] = Object.values(
  UserRole,
).filter((v): v is UserRole => typeof v === 'number');

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'number' && USER_ROLE_VALUES.includes(value);
}
