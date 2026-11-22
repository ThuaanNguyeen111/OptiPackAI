import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ForcePasswordChangeGuard } from './force-password-change.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

function createMockContext(params: {
  user?: { mustChangePassword: boolean };
  path: string;
  method?: string;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: params.user, path: params.path, method: params.method ?? 'POST' }),
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

  it('mustChangePassword=true: GET /users/me, /role-permissions/me đọc được; PATCH /users/me bị chặn', () => {
    const user = { mustChangePassword: true };
    expect(guard.canActivate(createMockContext({ user, path: '/users/me', method: 'GET' }))).toBe(true);
    expect(guard.canActivate(createMockContext({ user, path: '/role-permissions/me', method: 'GET' }))).toBe(true);
    expect(() => guard.canActivate(createMockContext({ user, path: '/users/me', method: 'PATCH' }))).toThrow(ForbiddenException);
  });
});

// AOFP-335 AC1 — chặn ở JwtAuthGuard nên áp cho MỌI controller có JWT, không chỉ /users.
describe('JwtAuthGuard + mật khẩu tạm', () => {
  const base = Object.getPrototypeOf(JwtAuthGuard.prototype) as { canActivate: () => Promise<boolean> };
  let spy: jest.SpyInstance;
  beforeEach(() => {
    spy = jest.spyOn(base, 'canActivate').mockResolvedValue(true);
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it('GET /orders với mật khẩu tạm → 403 AUTH_PASSWORD_CHANGE_REQUIRED', async () => {
    const ctx = createMockContext({ user: { mustChangePassword: true }, path: '/orders', method: 'GET' });
    const err = await new JwtAuthGuard().canActivate(ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({ error_code: 'AUTH_PASSWORD_CHANGE_REQUIRED' });
  });

  it('đã đổi mật khẩu → qua', async () => {
    const ctx = createMockContext({ user: { mustChangePassword: false }, path: '/orders', method: 'GET' });
    await expect(new JwtAuthGuard().canActivate(ctx)).resolves.toBe(true);
  });
});
