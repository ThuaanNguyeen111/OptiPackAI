import { UserRole } from './user-role.enum';

/**
 * 12/11/2026 — Trang (feature) Admin bật/tắt được cho từng role ở trang Phân quyền.
 * Mỗi key ứng với 1 trang FE (fe/src/lib/rbac.ts FEATURE_PATHS). ADMIN luôn full, không cấu hình.
 */
export const FEATURE_VALUES = [
  'dashboard',
  'orders',
  'order_groups',
  'returns',
  'order_sync',
  'picking',
  'inventory',
  'packing',
  'shipping',
  'packaging_rules',
  'packaging_materials',
  'staff',
  'analytics',
  'history',
] as const;
export type Feature = (typeof FEATURE_VALUES)[number];

export type ConfigurableRole = Exclude<UserRole, UserRole.ADMIN>;
export const CONFIGURABLE_ROLES: readonly ConfigurableRole[] = [
  UserRole.STORE_OWNER,
  UserRole.WAREHOUSE_STAFF,
  UserRole.PACKAGING_STAFF,
  UserRole.SHIPPING_COORDINATOR,
];

export function isConfigurableRole(role: UserRole): role is ConfigurableRole {
  return role !== UserRole.ADMIN;
}

/** Quyền mặc định = đúng quyền trước khi có trang cấu hình (role chưa có bản ghi DB thì dùng cái này). */
export const DEFAULT_ROLE_FEATURES: Readonly<Record<ConfigurableRole, readonly Feature[]>> = {
  [UserRole.STORE_OWNER]: [
    'dashboard',
    'orders',
    'order_groups',
    'returns',
    'order_sync',
    'packaging_rules',
    'packaging_materials',
    'staff',
    'analytics',
    'history',
  ],
  [UserRole.WAREHOUSE_STAFF]: ['picking', 'inventory', 'packaging_materials', 'history'],
  [UserRole.PACKAGING_STAFF]: ['packing', 'packaging_materials', 'history'],
  [UserRole.SHIPPING_COORDINATOR]: ['shipping', 'history'],
};
