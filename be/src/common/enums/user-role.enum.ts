export enum UserRole {
  STORE_OWNER = 0, 
  WAREHOUSE_STAFF = 1, 
  PACKAGING_STAFF = 2,
  SHIPPING_COORDINATOR = 3, 
  ADMIN = 4, 
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
