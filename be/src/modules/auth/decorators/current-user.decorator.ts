import { AUTH_ERROR_CODES, authError } from '../auth.errors';
import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest, AuthenticatedUser } from '../interfaces/authenticated-request.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

  
    if (!request.user) {
      throw new UnauthorizedException(authError(AUTH_ERROR_CODES.UNAUTHENTICATED, 'Không tìm thấy thông tin người dùng đã xác thực'));
    }

    return request.user;
  },
);
