import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { hashToken } from '../../../common/utils/hash.util';
import { requireEnv } from '../../../common/utils/env.util';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RefreshToken, RefreshTokenDocument } from '../schemas/refresh-token.schema';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export interface TokenSubject {
  id: string;
  email: string;
  role: UserRole;
}

export interface RequestMeta {
  ip_address?: string;
  user_agent?: string;
}


interface DecodedJwtTimestamps {
  iat: number;
  exp: number;
}

function isDecodedJwtTimestamps(value: unknown): value is DecodedJwtTimestamps {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.iat === 'number' && typeof candidate.exp === 'number';
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
  ) {}

  async generateTokenPair(user: TokenSubject, meta: RequestMeta = {}): Promise<TokenPair> {
    const payload = { sub: user.id, email: user.email, role: user.role };

    //!=============================================
    // FIX #32: refresh token ký bằng SECRET RIÊNG (jwt.refreshSecret), KHÁC
    // với access token (đang dùng secret mặc định của JwtModule, xem
    // token.module.ts) - 2 secret độc lập hoàn toàn, không suy ra nhau được.
    //!=============================================
    const refreshSecret = requireEnv(
      this.configService.get<string>('jwt.refreshSecret'),
      'JWT_REFRESH_SECRET',
    );

    const [accessToken, refreshTokenValue] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: this.configService.get<number>('jwt.refreshExpiresIn', 2592000),
      }),
    ]);

    const decoded: unknown = this.jwtService.decode(refreshTokenValue);
    if (!isDecodedJwtTimestamps(decoded)) {
      throw new Error('Không thể giải mã refresh token vừa sinh ra — lỗi hệ thống nghiêm trọng');
    }

    await this.refreshTokenModel.create({
      token_hash: hashToken(refreshTokenValue),
      user_id: new Types.ObjectId(user.id),
      user_role: user.role,
      iat: new Date(decoded.iat * 1000),
      exp: new Date(decoded.exp * 1000),
      is_revoked: false,
      ip_address: meta.ip_address,
      user_agent: meta.user_agent,
    });

    return { access_token: accessToken, refresh_token: refreshTokenValue };
  }

  async rotateRefreshToken(
    rawToken: string,
    meta: RequestMeta,
    getSubject: (userId: string) => Promise<TokenSubject & { isActive: boolean }>,
  ): Promise<TokenPair> {
    const tokenHash = hashToken(rawToken);
    const stored = await this.refreshTokenModel.findOne({ token_hash: tokenHash });

    if (!stored) {
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn');
    }

    if (stored.is_revoked) {
      await this.revokeAllForUser(stored.user_id.toString());
      throw new UnauthorizedException(
        'Phát hiện refresh token bị sử dụng lại bất thường — toàn bộ phiên đăng nhập đã bị thu hồi, vui lòng đăng nhập lại',
      );
    }

    if (stored.exp < new Date()) {
      await this.refreshTokenModel.deleteOne({ _id: stored._id });
      throw new UnauthorizedException('Refresh token đã hết hạn, vui lòng đăng nhập lại');
    }

    const subject = await getSubject(stored.user_id.toString());

    if (!subject.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa, vui lòng liên hệ Admin');
    }

    stored.is_revoked = true;
    await stored.save();

    return this.generateTokenPair(subject, meta);
  }

  async revokeToken(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    await this.refreshTokenModel.deleteOne({ token_hash: tokenHash });
  }

  //!=============================================
  // FIX #33: tham số `session` tùy chọn - cho phép UsersService gộp lệnh
  // xóa này vào chung 1 Mongoose transaction với thao tác sửa User (xem
  // adminResetPassword/deactivate trong users.service.ts). Không truyền
  // session vẫn hoạt động bình thường như cũ (các chỗ gọi hiện tại không
  // cần transaction, ví dụ reuse-detection ở trên).
  //!=============================================
  async revokeAllForUser(userId: string, session?: ClientSession): Promise<void> {
    await this.refreshTokenModel.deleteMany(
      { user_id: new Types.ObjectId(userId) },
      { session },
    );
  }
}
