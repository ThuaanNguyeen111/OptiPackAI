export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  WAREHOUSE_STAFF = 'warehouse_staff',
}

export enum LoginType {
  LOCAL = 'local',
  GOOGLE = 'google',
}

//!=============================================
// STRICT FIX: type guard thay cho việc ép kiểu `as UserRole` không kiểm chứng.
// Đây là nơi DUY NHẤT được phép "khẳng định" giá trị string là UserRole —
// vì có kiểm tra runtime thật sự (Object.values), không phải cast mù.
//!=============================================
const USER_ROLE_VALUES: readonly string[] = Object.values(UserRole);

export function isUserRole(value: string): value is UserRole {
  return USER_ROLE_VALUES.includes(value);
}
