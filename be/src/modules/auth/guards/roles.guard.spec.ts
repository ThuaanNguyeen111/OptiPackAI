import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RolesGuard } from './roles.guard';

//!=============================================
// FIX #38: Tạo 1 ExecutionContext GIẢ tối thiểu - Guard thật của NestJS chỉ
// cần đúng 2 method: getHandler()/getClass() (để Reflector đọc metadata) và
// switchToHttp().getRequest() (để lấy request.user). Không cần dựng cả HTTP
// server thật như E2E - đây vẫn là unit test, chỉ mock đúng phần Guard cần.
//!=============================================
function createMockContext(user?: { role: UserRole }): ExecutionContext {
  return {
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('route KHÔNG gắn @Roles() -> cho qua luôn, không cần user', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext(undefined);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('route gắn @Roles(), user CÓ đúng role -> cho qua', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN, UserRole.STORE_OWNER]);
    const context = createMockContext({ role: UserRole.ADMIN });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('route gắn @Roles(), user SAI role -> 403', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = createMockContext({ role: UserRole.WAREHOUSE_STAFF });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('route gắn @Roles(), KHÔNG có user trong request -> 403', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = createMockContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
