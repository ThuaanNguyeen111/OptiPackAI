import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../common/enums/user-role.enum';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PackingPlanController } from './packing-plan.controller';

describe('PackingPlanController undo-approve permissions', () => {
  const guard = new RolesGuard(new Reflector());
  const context = (role: UserRole): ExecutionContext => ({
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Guard chỉ đọc metadata, không gọi method.
    getHandler: () => PackingPlanController.prototype.undoApprove,
    getClass: () => PackingPlanController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  }) as unknown as ExecutionContext;

  it.each([UserRole.PACKAGING_STAFF, UserRole.ADMIN])('cho phép %s', (role) => {
    expect(guard.canActivate(context(role))).toBe(true);
  });

  it.each([UserRole.WAREHOUSE_STAFF, UserRole.STORE_OWNER, UserRole.SHIPPING_COORDINATOR])('chặn %s', (role) => {
    expect(() => guard.canActivate(context(role))).toThrow(ForbiddenException);
  });
});
