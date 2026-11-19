import { randomUUID } from 'node:crypto';
import { AUTH_ERROR_CODES, authError } from '../auth.errors';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { hashToken } from '../../../common/utils/hash.util';
import { requireEnv } from '../../../common/utils/env.util';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RefreshToken, RefreshTokenDocument } from '../schemas/refresh-token.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { RedisCacheService } from '../../../common/redis/redis-cache.service';

/**
 * AOFP-334 — 2 tab (hoặc tab + mobile dùng chung token) refresh gần nhau: lượt sau gửi token
 * vừa bị lượt trước xoay. Trong cửa sổ này cấp cặp mới thay vì coi là đánh cắp và thu hồi mọi phiên.
 */
export const REFRESH_GRACE_MS = 10_000;

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
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly redisCache: RedisCacheService,
  ) {}

  async generateTokenPair(user: TokenSubject, meta: RequestMeta = {}): Promise<TokenPair> {
    const version = await this.userModel.findById(user.id).select('token_version').lean();
    const payload = { sub: user.id, email: user.email, role: user.role };
    // AOFP-334 — chỉ access token mang `tv` (JwtStrategy so với User.token_version).
    const accessPayload = { ...payload, tv: version?.token_version ?? 0 };

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
      this.jwtService.signAsync(accessPayload),
      // jwtid ngẫu nhiên: 2 lần cấp trong cùng 1 giây (2 tab cùng refresh) cho payload + iat
      // giống hệt → JWT giống hệt → trùng token_hash (E11000, 500). jti làm mỗi token khác nhau.
      this.jwtService.signAsync(payload, {
        jwtid: randomUUID(),
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
      throw new UnauthorizedException(authError(AUTH_ERROR_CODES.REFRESH_TOKEN_INVALID, 'Refresh token không hợp lệ hoặc đã hết hạn'));
    }

    const now = new Date();
    const inGrace =
      stored.is_revoked && stored.revoked_at != null && now.getTime() - stored.revoked_at.getTime() <= REFRESH_GRACE_MS;
    if (stored.is_revoked && !inGrace) {
      await this.revokeAllForUser(stored.user_id.toString());
      throw new UnauthorizedException(authError(AUTH_ERROR_CODES.REFRESH_TOKEN_REUSED, 'Phát hiện refresh token bị sử dụng lại bất thường — toàn bộ phiên đăng nhập đã bị thu hồi, vui lòng đăng nhập lại'));
    }

    if (stored.exp < now) {
      await this.refreshTokenModel.deleteOne({ _id: stored._id });
      throw new UnauthorizedException(authError(AUTH_ERROR_CODES.REFRESH_TOKEN_EXPIRED, 'Refresh token đã hết hạn, vui lòng đăng nhập lại'));
    }

    const subject = await getSubject(stored.user_id.toString());

    if (!subject.isActive) {
      throw new UnauthorizedException(authError(AUTH_ERROR_CODES.ACCOUNT_INACTIVE, 'Tài khoản đã bị vô hiệu hóa, vui lòng liên hệ Admin'));
    }

    // Ghi có điều kiện: 2 request cùng token chỉ 1 lượt đổi is_revoked; lượt kia (matched 0) nằm trong ân hạn.
    if (!stored.is_revoked) {
      await this.refreshTokenModel.updateOne(
        { _id: stored._id, is_revoked: false },
        { $set: { is_revoked: true, revoked_at: now } },
      );
    }

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
    // AOFP-334 — access token cũ (sống tới 24h) cũng hết hiệu lực ngay lượt gọi kế tiếp.
    await this.userModel.updateOne({ _id: new Types.ObjectId(userId) }, { $inc: { token_version: 1 } }, { session });
    // Có session: người gọi xoá cache SAU khi commit (users.service). Không có: xoá ngay.
    if (!session) await this.redisCache.invalidateUserAuthState(userId);
  }
}
