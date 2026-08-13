import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { requireEnv } from '../../../common/utils/env.util';
import { isUserRole } from '../../../common/enums/user-role.enum';
import { RedisCacheService } from '../../../common/redis/redis-cache.service';
import { UsersService } from '../../users/services/users.service';
import type { AuthenticatedUser } from '../interfaces/authenticated-request.interface';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    //!=============================================
    // FIX: bỏ `private readonly` — configService chỉ cần dùng NGAY TRONG
    // constructor để build super(), không cần lưu thành field của class
    // (this.configService không được dùng lại ở đâu khác -> TS báo unused).
    //!=============================================
    configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly redisCache: RedisCacheService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireEnv(configService.get<string>('jwt.secret'), 'JWT_SECRET'),
      algorithms: ['HS256'] as const,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    let state = await this.redisCache.getUserAuthState(payload.sub);

    if (!state) {
      const user = await this.usersService.findById(payload.sub);
      state = {
        is_active: user.is_active,
        must_change_password: user.must_change_password,
        role: user.role,
      };
      await this.redisCache.setUserAuthState(payload.sub, state);
    }

    if (!state.is_active) {
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa, vui lòng liên hệ Admin');
    }

    if (!isUserRole(state.role)) {
      throw new UnauthorizedException('Vai trò tài khoản không hợp lệ');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: state.role,
      mustChangePassword: state.must_change_password,
    };
  }
}
