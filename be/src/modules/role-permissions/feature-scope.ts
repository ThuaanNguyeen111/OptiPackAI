import { CustomDecorator, SetMetadata } from '@nestjs/common';
import {
  CONFIGURABLE_ROLES,
  type ConfigurableRole,
  DEFAULT_ROLE_FEATURES,
  type Feature,
} from '../../common/enums/feature.enum';
import { UserRole } from '../../common/enums/user-role.enum';

export const FEATURES_KEY = 'feature_scope';

/**
 * Gắn ở class controller: các trang FE dùng API của controller này.
 * Không thay `@Roles` — RolesGuard tự suy từng endpoint thuộc trang nào (xem resolveFeatureGate).
 */
export const Features = (...features: Feature[]): CustomDecorator =>
  SetMetadata(FEATURES_KEY, features);

function rolesWithFeatureByDefault(feature: Feature): ConfigurableRole[] {
  return CONFIGURABLE_ROLES.filter((r) => DEFAULT_ROLE_FEATURES[r].includes(feature));
}

/**
 * Suy các trang mở khóa 1 endpoint, từ `@Roles` cũ + phạm vi `@Features` của controller:
 * lấy những trang (trong phạm vi) mà mọi role mặc định có trang đó đều đã nằm trong `@Roles`.
 * Chỉ dùng khi hợp các role đó BẰNG ĐÚNG `@Roles` (trừ Admin) → với ma trận mặc định, quyền
 * API không đổi so với trước. Không khớp (VD endpoint chỉ Admin) → trả null, guard dùng `@Roles`.
 *
 * Hệ quả: bật trang X cho role R = R gọi được đúng những endpoint mà role mặc định của X gọi được.
 */
export function resolveFeatureGate(
  requiredRoles: readonly UserRole[],
  scope: readonly Feature[],
): Feature[] | null {
  const required = new Set<UserRole>(requiredRoles.filter((r) => r !== UserRole.ADMIN));
  if (required.size === 0) return null;
  const gate = scope.filter((f) => {
    const holders = rolesWithFeatureByDefault(f);
    return holders.length > 0 && holders.every((r) => required.has(r));
  });
  const covered = new Set(gate.flatMap(rolesWithFeatureByDefault));
  if (covered.size !== required.size) return null;
  return gate;
}
