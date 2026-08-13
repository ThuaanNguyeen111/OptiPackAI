import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest, AuthenticatedUser } from '../interfaces/authenticated-request.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

    //!=============================================
    // FIX: user giờ optional trong type -> PHẢI check runtime trước khi
    // dùng. Nếu decorator này lỡ bị dùng trên route thiếu JwtAuthGuard,
    // báo lỗi rõ ràng thay vì trả về `undefined` ngầm gây lỗi khó hiểu sau đó.
    //!=============================================
    if (!request.user) {
      throw new UnauthorizedException('Không tìm thấy thông tin người dùng đã xác thực');
    }

    return request.user;
  },
);
