import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../common/enums/user-role.enum';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DEFAULT_ROLE_FEATURES } from '../../common/enums/feature.enum';
import type { RolePermissionsService } from '../role-permissions/role-permissions.service';
import { PackingPlanController } from './packing-plan.controller';

describe('PackingPlanController undo-approve permissions', () => {
  // Ma trận mặc định → quyền như @Roles cũ.
  const permissions = {
    getFeatures: (role: UserRole) => Promise.resolve(role === UserRole.ADMIN ? [] : [...DEFAULT_ROLE_FEATURES[role]]),
  } as unknown as RolePermissionsService;
  const guard = new RolesGuard(new Reflector(), permissions);
  const context = (role: UserRole): ExecutionContext => ({
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Guard chỉ đọc metadata, không gọi method.
    getHandler: () => PackingPlanController.prototype.undoApprove,
    getClass: () => PackingPlanController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  }) as unknown as ExecutionContext;

  it.each([UserRole.PACKAGING_STAFF, UserRole.ADMIN])('cho phép %s', async (role) => {
    await expect(guard.canActivate(context(role))).resolves.toBe(true);
  });

  it.each([UserRole.WAREHOUSE_STAFF, UserRole.STORE_OWNER, UserRole.SHIPPING_COORDINATOR])('chặn %s', async (role) => {
    await expect(guard.canActivate(context(role))).rejects.toThrow(ForbiddenException);
  });
});
