import { ArgumentsHost, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';
import { AUTH_ERROR_CODES, authError } from '../../modules/auth/auth.errors';

// (09/10/2026) Exception Nest thường có `error_code` trong body (Auth, Users,
// Storefront) phải giữ mã đó thay vì mã chung theo HTTP status.
describe('GlobalExceptionFilter', () => {
  function run(exception: unknown): { status: number; body: { error_code: string; message: string } } {
    let status = 0;
    let body = { error_code: '', message: '' };
    const res = {
      status: (s: number) => {
        status = s;
        return res;
      },
      json: (b: { error_code: string; message: string }) => {
        body = b;
      },
    };
    const host = {
      switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ url: '/x', method: 'GET' }) }),
    } as unknown as ArgumentsHost;
    new GlobalExceptionFilter().catch(exception, host);
    return { status, body };
  }

  it('giữ error_code riêng trong body, giữ HTTP status và message', () => {
    const { status, body } = run(
      new ForbiddenException(authError(AUTH_ERROR_CODES.PASSWORD_CHANGE_REQUIRED, 'Phải đổi mật khẩu')),
    );
    expect(status).toBe(403);
    expect(body.error_code).toBe('AUTH_PASSWORD_CHANGE_REQUIRED');
    expect(body.message).toBe('Phải đổi mật khẩu');
  });

  it('không có error_code → mã chung theo HTTP status như trước', () => {
    expect(run(new UnauthorizedException('x')).body.error_code).toBe('UNAUTHORIZED');
  });
});
