import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { requireEnv } from '../../common/utils/env.util';
import { UserDocument } from '../users/schemas/user.schema';
import { UsersService } from '../users/services/users.service';
import { LoginAuditLog, LoginAuditLogDocument } from './schemas/login-audit-log.schema';
import { MfaService } from './services/mfa.service';
import { RequestMeta, TokenPair, TokenService } from './services/token.service';

export interface LoginResult extends TokenPair {
  must_change_password: boolean;
  role: string;
}

export interface MfaRequiredResult {
  mfa_required: true;
}

interface GoogleTokenResponse {
  access_token: string;
}

interface GoogleUserInfo {
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
}

//!=============================================
// STRICT FIX: type guard cho response fetch() từ Google — .json() luôn trả
// `any`, trước đây ép kiểu thẳng bằng `as` (unsafe). Giờ kiểm tra runtime
// từng field bắt buộc trước khi tin dùng.
//!=============================================
function isGoogleTokenResponse(value: unknown): value is GoogleTokenResponse {
  if (typeof value !== 'object' || value === null) return false;
  return typeof (value as Record<string, unknown>).access_token === 'string';
}

function isGoogleUserInfo(value: unknown): value is GoogleUserInfo {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.email === 'string' &&
    typeof c.email_verified === 'boolean' &&
    typeof c.name === 'string' &&
    typeof c.picture === 'string'
  );
}

const DUMMY_PASSWORD_HASH =
  '$2b$12$Xk9m3vN7pQ2wZ8yB1cD4EeR5tY6uI7oP0aS3fG9hJ2kL4mN6oQ8wS';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mfaService: MfaService,
    @InjectModel(LoginAuditLog.name)
    private readonly auditLogModel: Model<LoginAuditLogDocument>,
  ) {}

  //!=============================================
  // 1. LOGIN BẰNG EMAIL/PASSWORD
  //!=============================================
  async login(
    email: string,
    password: string,
    mfaToken: string | undefined,
    meta: RequestMeta,
  ): Promise<LoginResult | MfaRequiredResult> {
    const user = await this.usersService.findByEmail(email);

    if (user && this.usersService.isLocked(user)) {
      await this.writeAuditLog(email, false, meta, user.id, 'account_locked');
      throw new ForbiddenException(
        'Tài khoản tạm thời bị khóa do đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user?.password ?? DUMMY_PASSWORD_HASH);

    if (!user?.password || !isPasswordValid) {
      if (user) {
        await this.usersService.incrementFailedLoginAttempts(user.id);
      }
      await this.writeAuditLog(email, false, meta, user?.id, 'invalid_credentials');
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    if (!user.is_active) {
      await this.writeAuditLog(email, false, meta, user.id, 'account_inactive');
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa, vui lòng liên hệ Admin');
    }

    if (user.mfa_enabled) {
      //!=============================================
      // STRICT FIX: thay `user.mfa_secret!` bằng kiểm tra rõ ràng — nếu
      // mfa_enabled=true nhưng mfa_secret rỗng thì đây là dữ liệu bất thường
      // (không nên xảy ra, nhưng KHÔNG được cast mù nếu nó xảy ra).
      //!=============================================
      if (!user.mfa_secret) {
        await this.writeAuditLog(email, false, meta, user.id, 'mfa_misconfigured');
        throw new UnauthorizedException(
          'Tài khoản cấu hình MFA không hợp lệ, vui lòng liên hệ Admin',
        );
      }

      if (!mfaToken) {
        return { mfa_required: true };
      }

      const isMfaValid = this.mfaService.verifyToken(mfaToken, user.mfa_secret);
      if (!isMfaValid) {
        await this.writeAuditLog(email, false, meta, user.id, 'invalid_mfa');
        throw new UnauthorizedException('Mã xác thực MFA không chính xác');
      }
    }

    await this.usersService.resetFailedLoginAttempts(user.id);
    const tokens = await this.tokenService.generateTokenPair(
      { id: user.id, email: user.email, role: user.role },
      meta,
    );
    await this.usersService.updateLastLogin(user.id);
    await this.writeAuditLog(email, true, meta, user.id);

    return { ...tokens, must_change_password: user.must_change_password, role: user.role };
  }

  //!=============================================
  // 2. LOGIN BẰNG GOOGLE
  //!=============================================
  async googleLogin(
    code: string,
    state: string,
    meta: RequestMeta,
    codeVerifier?: string,
  ): Promise<LoginResult> {
    this.verifyOAuthState(state);

    const googleUserInfo = await this.getGoogleUserInfo(code, codeVerifier);

    if (!googleUserInfo.email_verified) {
      throw new UnauthorizedException('Email Google chưa được xác thực');
    }

    const normalizedEmail = googleUserInfo.email.toLowerCase().trim();
    const user = await this.usersService.findByEmail(normalizedEmail);

    if (!user) {
      await this.writeAuditLog(
        normalizedEmail,
        false,
        meta,
        undefined,
        'google_account_not_registered',
      );
      throw new UnauthorizedException(
        'Email này chưa được đăng ký trong hệ thống. Vui lòng liên hệ Admin để được tạo tài khoản.',
      );
    }

    if (!user.is_active) {
      await this.writeAuditLog(normalizedEmail, false, meta, user.id, 'account_inactive');
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa, vui lòng liên hệ Admin');
    }

    await this.usersService.syncGoogleAvatar(user, googleUserInfo.picture);

    const tokens = await this.tokenService.generateTokenPair(
      { id: user.id, email: user.email, role: user.role },
      meta,
    );
    await this.usersService.updateLastLogin(user.id);
    await this.writeAuditLog(normalizedEmail, true, meta, user.id);

    return { ...tokens, must_change_password: user.must_change_password, role: user.role };
  }

  generateOAuthState(): string {
    return this.jwtService.sign(
      { nonce: Math.random().toString(36).slice(2) },
      { expiresIn: '5m' },
    );
  }

  private verifyOAuthState(state: string): void {
    if (!state) {
      throw new UnauthorizedException('Thiếu tham số state — yêu cầu OAuth không hợp lệ');
    }
    try {
      this.jwtService.verify(state);
    } catch {
      throw new UnauthorizedException('State không hợp lệ hoặc đã hết hạn (khả năng bị giả mạo)');
    }
  }

  getGoogleAuthorizationUrl(state: string, codeChallenge?: string): string {
    const clientId = requireEnv(this.configService.get<string>('google.clientId'), 'GOOGLE_CLIENT_ID');
    const redirectUri = requireEnv(
      this.configService.get<string>('google.redirectUri'),
      'GOOGLE_REDIRECT_URI',
    );
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'email profile',
      state,
      ...(codeChallenge ? { code_challenge: codeChallenge, code_challenge_method: 'S256' } : {}),
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  private async getGoogleUserInfo(code: string, codeVerifier?: string): Promise<GoogleUserInfo> {
    const clientId = requireEnv(this.configService.get<string>('google.clientId'), 'GOOGLE_CLIENT_ID');
    const clientSecret = requireEnv(
      this.configService.get<string>('google.clientSecret'),
      'GOOGLE_CLIENT_SECRET',
    );
    const redirectUri = requireEnv(
      this.configService.get<string>('google.redirectUri'),
      'GOOGLE_REDIRECT_URI',
    );

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      }),
    });

    if (!tokenResponse.ok) {
      throw new UnauthorizedException('Xác thực Google thất bại');
    }

    //!=============================================
    // STRICT FIX: validate response bằng type guard thay vì `as` mù —
    // fetch().json() trả `Promise<any>` theo lib.dom.d.ts, đây là điểm unsafe
    // kinh điển nếu không kiểm tra.
    //!=============================================
    const tokenData: unknown = await tokenResponse.json();
    if (!isGoogleTokenResponse(tokenData)) {
      throw new UnauthorizedException('Phản hồi từ Google không đúng định dạng mong đợi');
    }

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const userInfoData: unknown = await userInfoResponse.json();
    if (!isGoogleUserInfo(userInfoData)) {
      throw new UnauthorizedException('Thông tin người dùng Google không đúng định dạng mong đợi');
    }

    return userInfoData;
  }

  //!=============================================
  // 3. ĐỔI MẬT KHẨU
  //!=============================================
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user: UserDocument = await this.usersService.findById(userId);

    if (user.password) {
      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        throw new UnauthorizedException('Mật khẩu hiện tại không chính xác');
      }
    }

    await this.usersService.changePassword(userId, newPassword);
    await this.tokenService.revokeAllForUser(userId);
  }

  //!=============================================
  // MFA
  //!=============================================
  async setupMfa(userId: string, email: string): Promise<{ otpauthUrl: string }> {
    const { secret, otpauthUrl } = this.mfaService.generateSecret(email);
    await this.usersService.setPendingMfaSecret(userId, secret);
    return { otpauthUrl };
  }

  async verifyMfaSetup(userId: string, token: string): Promise<{ message: string }> {
    const user = await this.usersService.findById(userId);
    if (!user.mfa_secret) {
      throw new UnauthorizedException('Chưa khởi tạo MFA, gọi /auth/mfa/setup trước');
    }
    const isValid = this.mfaService.verifyToken(token, user.mfa_secret);
    if (!isValid) {
      throw new UnauthorizedException('Mã xác thực không chính xác');
    }
    await this.usersService.enableMfa(userId);
    return { message: 'Đã bật MFA thành công' };
  }

  //!=============================================
  // 4. REFRESH TOKEN & LOGOUT
  //!=============================================
  async refreshAccessToken(refreshToken: string, meta: RequestMeta): Promise<TokenPair> {
    return this.tokenService.rotateRefreshToken(refreshToken, meta, async (userId) => {
      const user = await this.usersService.findById(userId);
      return { id: user.id, email: user.email, role: user.role, isActive: user.is_active };
    });
  }

  async logout(refreshToken: string): Promise<{ message: string }> {
    await this.tokenService.revokeToken(refreshToken);
    return { message: 'Đăng xuất thành công' };
  }

  private async writeAuditLog(
    emailAttempted: string,
    success: boolean,
    meta: RequestMeta,
    userId?: string,
    failureReason?: string,
  ): Promise<void> {
    try {
      await this.auditLogModel.create({
        user_id: userId,
        email_attempted: emailAttempted,
        success,
        failure_reason: failureReason,
        ip_address: meta.ip_address,
        user_agent: meta.user_agent,
      });
    } catch (err: unknown) {
      // STRICT FIX: useUnknownInCatchVariables (mặc định trong strict mode) —
      // catch variable giờ là `unknown`, không phải `any` ngầm định.
      console.error('Ghi audit log đăng nhập thất bại:', err);
    }
  }
}
