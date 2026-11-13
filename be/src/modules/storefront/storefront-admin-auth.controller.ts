import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Response } from 'express';
import { LoginCustomerDto } from './dto/storefront.dto';
import { ADMIN_COOKIE, ADMIN_SESSION_MS, StorefrontAdminAuthService } from './storefront-admin-auth.service';
import { StorefrontAdminGuard, StorefrontAdminOriginGuard } from './storefront-admin.guard';
import type { AdminRequest } from './storefront-admin.guard';

@ApiTags('Storefront Admin')
@Controller('storefront/admin/auth')
@UseGuards(StorefrontAdminOriginGuard)
export class StorefrontAdminAuthController {
  constructor(private readonly auth: StorefrontAdminAuthService, private readonly config: ConfigService) {}

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: this.config.get<string>('NODE_ENV') === 'production', sameSite: 'lax', path: '/storefront/admin' };
  }

  @Post('login') @HttpCode(200) @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() dto: LoginCustomerDto, @Res({ passthrough: true }) response: Response): Promise<{ email: string }> {
    const result = await this.auth.login(dto.email, dto.password);
    response.cookie(ADMIN_COOKIE, result.token, { ...this.cookieOptions(), maxAge: ADMIN_SESSION_MS });
    response.setHeader('Cache-Control', 'no-store');
    return { email: result.email };
  }

  @Get('me') @UseGuards(StorefrontAdminGuard)
  me(@Req() request: AdminRequest, @Res({ passthrough: true }) response: Response): { email: string } {
    response.setHeader('Cache-Control', 'no-store');
    return request.admin;
  }

  @Post('logout') @HttpCode(200)
  logout(@Res({ passthrough: true }) response: Response): { message: string } {
    response.clearCookie(ADMIN_COOKIE, this.cookieOptions());
    return { message: 'Đã đăng xuất' };
  }
}
