import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { requireEnv } from '../../../common/utils/env.util';
import { isUserRole, UserRole } from '../../../common/enums/user-role.enum';
import { RedisCacheService } from '../../../common/redis/redis-cache.service';
import { UsersService } from '../../users/services/users.service';
import type { AuthenticatedUser } from '../interfaces/authenticated-request.interface';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(

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
        must_change_password_by: user.must_change_password_by?.toISOString(),
      };
      await this.redisCache.setUserAuthState(payload.sub, state);
    }

    if (!state.is_active) {
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa, vui lòng liên hệ Admin');
    }

    if (!isUserRole(state.role)) {
      throw new UnauthorizedException('Vai trò tài khoản không hợp lệ');
    }

    //!=============================================
    //Khóa CỨNG nếu quá 72h chưa đổi mật khẩu — kiểm tra NGAY Ở ĐÂY,
    // trước cả ForcePasswordChangeGuard, vì khóa cứng phải chặn TOÀN BỘ route
    // kể cả /auth/change-password và /auth/logout (khác với trạng thái "phải
    // đổi mật khẩu" thông thường, vốn còn cho đi qua 2 route đó). Access token
    // cũ phát hành trước khi khóa cũng bị chặn ngay lần request tiếp theo, vì
    // check này chạy trên MỌI request có JWT, không đợi tới lần login sau.
    //!=============================================
    if (
      state.must_change_password &&
      state.must_change_password_by &&
      new Date(state.must_change_password_by) < new Date()
    ) {
      throw new UnauthorizedException(
        'Tài khoản đã bị khóa do không đổi mật khẩu trong vòng 72 giờ. Vui lòng liên hệ Admin để được mở khóa.',
      );
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: state.role,
      mustChangePassword: state.must_change_password,
    };
  }
}
