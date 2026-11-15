import { Controller, ExecutionContext, ForbiddenException, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DEFAULT_ROLE_FEATURES, type Feature } from '../../../common/enums/feature.enum';
import { UserRole } from '../../../common/enums/user-role.enum';
import { Features } from '../../role-permissions/feature-scope';
import type { RolePermissionsService } from '../../role-permissions/role-permissions.service';
import { Roles } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

@Features('packing', 'picking')
@Controller('demo')
class DemoController {
  @Get('pack') @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN) pack(): string { return 'pack'; }
  @Get('admin-only') @Roles(UserRole.ADMIN) adminOnly(): string { return 'admin'; }
}

class PlainController {
  @Roles(UserRole.WAREHOUSE_STAFF) plain(): string { return 'plain'; }
}

/** Ma trận giả: mặc định, ghi đè được từng role. */
function permissions(override: Partial<Record<UserRole, Feature[]>> = {}): RolePermissionsService {
  return {
    getFeatures: (role: UserRole) =>
      Promise.resolve(override[role] ?? (role === UserRole.ADMIN ? [] : [...DEFAULT_ROLE_FEATURES[role]])),
  } as unknown as RolePermissionsService;
}

function ctx(cls: object, handler: unknown, user?: { role: UserRole }): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

// Lấy hàm handler qua descriptor (guard chỉ đọc metadata, không gọi method).
const pack = Object.getOwnPropertyDescriptor(DemoController.prototype, 'pack')?.value as unknown;
const adminOnly = Object.getOwnPropertyDescriptor(DemoController.prototype, 'adminOnly')?.value as unknown;
const plain = Object.getOwnPropertyDescriptor(PlainController.prototype, 'plain')?.value as unknown;

describe('RolesGuard', () => {
  const reflector = new Reflector();

  it('không gắn @Roles → cho qua, không cần user', async () => {
    const guard = new RolesGuard(reflector, permissions());
    await expect(guard.canActivate(ctx(PlainController, () => undefined))).resolves.toBe(true);
  });

  it('có @Roles mà không có user → 403', async () => {
    const guard = new RolesGuard(reflector, permissions());
    await expect(guard.canActivate(ctx(PlainController, plain))).rejects.toThrow(ForbiddenException);
  });

  it('controller không có @Features → theo @Roles như cũ', async () => {
    const guard = new RolesGuard(reflector, permissions());
    await expect(guard.canActivate(ctx(PlainController, plain, { role: UserRole.WAREHOUSE_STAFF }))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(PlainController, plain, { role: UserRole.PACKAGING_STAFF }))).rejects.toThrow(ForbiddenException);
  });

  it('Admin luôn qua, kể cả endpoint không liệt kê Admin', async () => {
    const guard = new RolesGuard(reflector, permissions());
    await expect(guard.canActivate(ctx(PlainController, plain, { role: UserRole.ADMIN }))).resolves.toBe(true);
  });

  it('ma trận mặc định → giống hệt @Roles', async () => {
    const guard = new RolesGuard(reflector, permissions());
    await expect(guard.canActivate(ctx(DemoController, pack, { role: UserRole.PACKAGING_STAFF }))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(DemoController, pack, { role: UserRole.STORE_OWNER }))).rejects.toThrow(ForbiddenException);
  });

  it('Admin tắt trang Đóng gói của nhân viên đóng gói → 403 dù @Roles có role đó', async () => {
    const guard = new RolesGuard(reflector, permissions({ [UserRole.PACKAGING_STAFF]: ['history'] }));
    await expect(guard.canActivate(ctx(DemoController, pack, { role: UserRole.PACKAGING_STAFF }))).rejects.toThrow(ForbiddenException);
  });

  it('Admin bật trang Đóng gói cho Store Owner → qua dù @Roles không có Owner', async () => {
    const guard = new RolesGuard(reflector, permissions({ [UserRole.STORE_OWNER]: ['packing'] }));
    await expect(guard.canActivate(ctx(DemoController, pack, { role: UserRole.STORE_OWNER }))).resolves.toBe(true);
  });

  it('endpoint chỉ Admin không mở được bằng bật trang', async () => {
    const guard = new RolesGuard(reflector, permissions({ [UserRole.STORE_OWNER]: ['packing', 'picking'] }));
    await expect(guard.canActivate(ctx(DemoController, adminOnly, { role: UserRole.STORE_OWNER }))).rejects.toThrow(ForbiddenException);
  });
});
