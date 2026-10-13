import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

export const ADMIN_COOKIE = 'storefront_admin_access_token';
export const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000;

@Injectable()
export class StorefrontAdminAuthService {
  constructor(private readonly config: ConfigService, private readonly jwt: JwtService) {}

  private credentials(): { email: string; hash: string; secret: string } {
    const email = this.config.get<string>('storefront.admin.email');
    const hash = this.config.get<string>('storefront.admin.passwordHash');
    const secret = this.config.get<string>('storefront.admin.jwtSecret');
    if (!email || !hash || !secret || secret.length < 32) {
      throw new ServiceUnavailableException('Chưa cấu hình tài khoản quản trị storefront');
    }
    return { email, hash, secret };
  }

  async login(email: string, password: string): Promise<{ email: string; token: string }> {
    const credentials = this.credentials();
    const matches = await bcrypt.compare(password, credentials.hash);
    if (!matches || email.trim().toLowerCase() !== credentials.email) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    return {
      email: credentials.email,
      token: this.jwt.sign(
        { sub: credentials.email, type: 'storefront-admin' },
        { secret: credentials.secret, algorithm: 'HS256', expiresIn: '8h', audience: 'storefront-admin' },
      ),
    };
  }

  verify(token: string): { email: string } {
    const credentials = this.credentials();
    try {
      const payload = this.jwt.verify<{ sub: string; type: string }>(token, {
        secret: credentials.secret, algorithms: ['HS256'], audience: 'storefront-admin',
      });
      if (payload.type !== 'storefront-admin' || payload.sub !== credentials.email) {
        throw new Error('Invalid admin session');
      }
      return { email: credentials.email };
    } catch {
      throw new UnauthorizedException('Vui lòng đăng nhập quản trị');
    }
  }
}
