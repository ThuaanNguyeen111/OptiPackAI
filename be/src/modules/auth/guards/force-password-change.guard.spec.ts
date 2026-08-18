import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ForcePasswordChangeGuard } from './force-password-change.guard';

function createMockContext(params: {
  user?: { mustChangePassword: boolean };
  path: string;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: params.user, path: params.path }),
    }),
  } as unknown as ExecutionContext;
}

describe('ForcePasswordChangeGuard', () => {
  const guard = new ForcePasswordChangeGuard();

  it('KHÔNG có user (chưa qua JwtAuthGuard) -> cho qua, để guard khác xử lý', () => {
    const context = createMockContext({ user: undefined, path: '/users' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('mustChangePassword=false -> cho qua bình thường', () => {
    const context = createMockContext({
      user: { mustChangePassword: false },
      path: '/users',
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('mustChangePassword=true, gọi route KHÔNG nằm trong whitelist -> 403', () => {
    const context = createMockContext({
      user: { mustChangePassword: true },
      path: '/users',
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('mustChangePassword=true, gọi /auth/change-password -> vẫn cho qua (whitelist)', () => {
    const context = createMockContext({
      user: { mustChangePassword: true },
      path: '/auth/change-password',
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('mustChangePassword=true, gọi /auth/logout -> vẫn cho qua (whitelist)', () => {
    const context = createMockContext({
      user: { mustChangePassword: true },
      path: '/auth/logout',
    });
    expect(guard.canActivate(context)).toBe(true);
  });
});
