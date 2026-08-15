import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

const ALLOWED_PATHS_WHEN_MUST_CHANGE = ['/auth/change-password', '/auth/logout'];

@Injectable()
export class ForcePasswordChangeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { user } = request;
    if (!user) {
      return true;
    }

    if (user.mustChangePassword && !ALLOWED_PATHS_WHEN_MUST_CHANGE.includes(request.path)) {
      throw new ForbiddenException('Bạn phải đổi mật khẩu trước khi tiếp tục sử dụng hệ thống');
    }

    return true;
  }
}
