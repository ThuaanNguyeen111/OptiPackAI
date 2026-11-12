import { AUTH_ERROR_CODES, authError } from '../auth.errors';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Feature } from '../../../common/enums/feature.enum';
import { UserRole } from '../../../common/enums/user-role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { FEATURES_KEY, resolveFeatureGate } from '../../role-permissions/feature-scope';
import { RolePermissionsService } from '../../role-permissions/role-permissions.service';

/**
 * 12/11/2026 — Admin luôn qua. Endpoint thuộc controller có `@Features(...)` và suy được trang
 * (resolveFeatureGate) → quyết theo ma trận trang Admin cấu hình; còn lại theo `@Roles` như cũ.
 */
type Targets = [ReturnType<ExecutionContext['getHandler']>, ReturnType<ExecutionContext['getClass']>];

@Injectable()
export class RolesGuard implements CanActivate {
  // Cổng trang theo handler; tính 1 lần vì metadata không đổi lúc chạy.
  private readonly gateCache = new WeakMap<object, Feature[] | null>();

  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: RolePermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets: Targets = [context.getHandler(), context.getClass()];
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, targets);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) throw this.forbidden();
    if (user.role === UserRole.ADMIN) return true;

    const gate = this.gateFor(context.getHandler(), requiredRoles, targets);
    if (gate) {
      const enabled = await this.permissions.getFeatures(user.role);
      if (gate.some((f) => enabled.includes(f))) return true;
      throw this.forbidden();
    }

    if (!requiredRoles.includes(user.role)) throw this.forbidden();
    return true;
  }

  private gateFor(handler: object, requiredRoles: UserRole[], targets: Targets): Feature[] | null {
    if (this.gateCache.has(handler)) return this.gateCache.get(handler) ?? null;
    const scope = this.reflector.getAllAndOverride<Feature[] | undefined>(FEATURES_KEY, targets);
    const gate = scope ? resolveFeatureGate(requiredRoles, scope) : null;
    this.gateCache.set(handler, gate);
    return gate;
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException(authError(AUTH_ERROR_CODES.FORBIDDEN_ROLE, 'Bạn không có quyền thực hiện thao tác này'));
  }
}
