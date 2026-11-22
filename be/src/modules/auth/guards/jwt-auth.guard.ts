import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { assertPasswordChanged } from './force-password-change.guard';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = (await super.canActivate(context)) as boolean;
    // AOFP-335 — APP_GUARD chạy trước guard JWT (chưa có user), nên chặn mật khẩu tạm ở đây.
    if (ok) assertPasswordChanged(context.switchToHttp().getRequest<AuthenticatedRequest>());
    return ok;
  }
}
