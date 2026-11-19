import { AUTH_ERROR_CODES, authError } from '../auth.errors';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

/**
 * Route vẫn gọi được khi đang dùng mật khẩu tạm: đổi mật khẩu, đăng xuất, và 2 route chỉ đọc
 * web/mobile cần ngay sau đăng nhập (hồ sơ, danh sách trang được vào).
 */
const ALLOWED_WHEN_MUST_CHANGE = new Set([
  'POST /auth/change-password',
  'POST /auth/logout',
  'GET /users/me',
  'GET /role-permissions/me',
]);

/** AOFP-335 — JwtAuthGuard gọi hàm này sau khi xác thực, nên mọi API có JWT đều bị chặn (không chỉ /users). */
export function assertPasswordChanged(request: AuthenticatedRequest): void {
  const { user } = request;
  if (user?.mustChangePassword && !ALLOWED_WHEN_MUST_CHANGE.has(`${request.method} ${request.path}`)) {
    throw new ForbiddenException(
      authError(AUTH_ERROR_CODES.PASSWORD_CHANGE_REQUIRED, 'Bạn phải đổi mật khẩu trước khi tiếp tục sử dụng hệ thống'),
    );
  }
}

@Injectable()
export class ForcePasswordChangeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    assertPasswordChanged(context.switchToHttp().getRequest<AuthenticatedRequest>());
    return true;
  }
}
