import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { ADMIN_COOKIE, StorefrontAdminAuthService } from './storefront-admin-auth.service';

export type AdminRequest = Request & { admin: { email: string } };

@Injectable()
export class StorefrontAdminOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    const origins = (this.config.get<string>('CORS_ORIGIN') ?? 'http://localhost:5173')
      .split(',').map((origin) => origin.trim()).filter(Boolean);
    if (this.config.get<string>('NODE_ENV') !== 'production') origins.push('http://localhost:3001');
    if (!request.headers.origin || !origins.includes(request.headers.origin)) {
      throw new ForbiddenException('Nguồn yêu cầu không được phép');
    }
    return true;
  }
}

@Injectable()
export class StorefrontAdminGuard implements CanActivate {
  constructor(private readonly auth: StorefrontAdminAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const cookie = request.headers.cookie?.split(';').map((value) => value.trim())
      .find((value) => value.startsWith(`${ADMIN_COOKIE}=`));
    if (!cookie) throw new UnauthorizedException('Vui lòng đăng nhập quản trị');
    request.admin = this.auth.verify(cookie.slice(ADMIN_COOKIE.length + 1));
    return true;
  }
}
