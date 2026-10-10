import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { requireEnv } from '../../common/utils/env.util';
import { CustomerAuthService } from './customer-auth.service';

function cookieExtractor(request: { headers?: { cookie?: string } }): string | null {
  const cookies = request.headers?.cookie?.split(';').map((entry) => entry.trim()) ?? [];
  const token = cookies.find((entry) => entry.startsWith('storefront_access_token='));
  return token ? decodeURIComponent(token.slice('storefront_access_token='.length)) : null;
}

@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(Strategy, 'customer-jwt') {
  constructor(config: ConfigService, private readonly auth: CustomerAuthService) { super({ jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor, ExtractJwt.fromAuthHeaderAsBearerToken()]), ignoreExpiration: false, secretOrKey: requireEnv(config.get<string>('jwt.accessSecret'), 'JWT_ACCESS_SECRET'), algorithms: ['HS256'] as const }); }
  async validate(payload: { sub: string; email: string; type: string }) { if (payload.type !== 'customer') throw new UnauthorizedException(); const customer = await this.auth.findById(payload.sub); return { customerId: customer.id, email: customer.email }; }
}
