import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { hashToken } from '../../common/utils/hash.util';
import { requireEnv } from '../../common/utils/env.util';
import { UserRole } from '../../common/enums/user-role.enum';
import { MailService } from '../mail/mail.service';
import { UserDocument } from '../users/schemas/user.schema';
import { UsersService } from '../users/services/users.service';
import { LoginAuditLog, LoginAuditLogDocument } from './schemas/login-audit-log.schema';
import { TrustedDevice, TrustedDeviceDocument } from './schemas/trusted-device.schema';
import { MfaService } from './services/mfa.service';
import { RequestMeta, TokenPair, TokenService } from './services/token.service';

export interface LoginResult extends TokenPair {
  must_change_password: boolean;
  role: UserRole;
  trusted_device_token?: string;
}

export interface MfaRequiredResult {
  mfa_required: true;
}

export interface LoginParams {
  email: string;
  password: string;
  mfaToken?: string;
  backupCode?: string;
  deviceToken?: string;
  meta: RequestMeta;
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

// FIX #27: thiết bị tin cậy sống 30 ngày, không hỏi lại MFA trong khoảng này
const TRUSTED_DEVICE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
// FIX #24: link quên mật khẩu có hạn 30 phút
const PASSWORD_RESET_WINDOW_MINUTES = 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mfaService: MfaService,
    private readonly mailService: MailService,
    @InjectModel(LoginAuditLog.name)
    private readonly auditLogModel: Model<LoginAuditLogDocument>,
    @InjectModel(TrustedDevice.name)
    private readonly trustedDeviceModel: Model<TrustedDeviceDocument>,
  ) {}

  //!=============================================
  // 1. LOGIN BẰNG EMAIL/PASSWORD
  //!=============================================
  async login(params: LoginParams): Promise<LoginResult | MfaRequiredResult> {
    const { email, password, mfaToken, backupCode, deviceToken, meta } = params;
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

    //!=============================================
    // FIX #25: Quá hạn 72h chưa đổi mật khẩu -> khóa cứng, chặn NGAY TỪ LÚC
    // LOGIN (không đợi tới request sau mới bị JwtStrategy chặn —
    // tườn minh hơn: báo lỗi ngay, không cho tưởng nhầm là đăng nhập thành công).
    //!=============================================
    if (this.usersService.isPastPasswordDeadline(user)) {
      await this.writeAuditLog(email, false, meta, user.id, 'password_deadline_exceeded');
      void this.mailService.sendAccountLocked({ to: user.email, name: user.name });
      throw new ForbiddenException(
        'Tài khoản đã bị khóa do không đổi mật khẩu trong vòng 72 giờ kể từ khi được cấp. Vui lòng liên hệ Admin để được mở khóa.',
      );
    }

    let newTrustedDeviceToken: string | undefined;

    if (user.mfa_enabled) {
      if (!user.mfa_secret) {
        await this.writeAuditLog(email, false, meta, user.id, 'mfa_misconfigured');
        throw new UnauthorizedException(
          'Tài khoản cấu hình MFA không hợp lệ, vui lòng liên hệ Admin',
        );
      }

      //!=============================================
      // Ưu tiên kiểm tra device_token TRƯỚC — nếu thiết bị đã tin
      // cậy (verify MFA thành công trong 30 ngày gần đây trên đúng thiết bị
      // này), bỏ qua hoàn toàn bước hỏi mã MFA.
      //!=============================================
      const isTrustedDevice = deviceToken
        ? await this.isDeviceTrusted(user.id, deviceToken)
        : false;

      if (!isTrustedDevice) {
        //!=============================================
        // Cho phép đăng nhập bằng 1 trong 10 mã dự phòng thay vì mã
        // TOTP — dùng khi mất điện thoại/mất app Authenticator.
        //!=============================================
        if (backupCode) {
          const usedIndex = await this.mfaService.verifyBackupCode(
            backupCode,
            user.mfa_backup_codes,
          );
          if (usedIndex === -1) {
            await this.writeAuditLog(email, false, meta, user.id, 'invalid_mfa_backup_code');
            throw new UnauthorizedException('Mã dự phòng không chính xác hoặc đã được sử dụng');
          }
          await this.usersService.consumeBackupCode(user.id, usedIndex);
          newTrustedDeviceToken = await this.issueTrustedDeviceToken(user.id, meta);
        } else if (mfaToken) {
          const isMfaValid = this.mfaService.verifyToken(mfaToken, user.mfa_secret);
          if (!isMfaValid) {
            await this.writeAuditLog(email, false, meta, user.id, 'invalid_mfa');
            throw new UnauthorizedException('Mã xác thực MFA không chính xác');
          }
          newTrustedDeviceToken = await this.issueTrustedDeviceToken(user.id, meta);
        } else {
          return { mfa_required: true };
        }
      }
    }

    await this.usersService.resetFailedLoginAttempts(user.id);
    const tokens = await this.tokenService.generateTokenPair(
      { id: user.id, email: user.email, role: user.role },
      meta,
    );
    await this.usersService.updateLastLogin(user.id);
    await this.writeAuditLog(email, true, meta, user.id);

    return {
      ...tokens,
      must_change_password: user.must_change_password,
      role: user.role,
      ...(newTrustedDeviceToken ? { trusted_device_token: newTrustedDeviceToken } : {}),
    };
  }

  //!=============================================
  //Sinh token thiết bị tin cậy mới sau khi verify MFA thật thành
  // công. Trả về bản PLAINTEXT cho client lưu lại — server chỉ giữ HASH.
  //!=============================================
  private async issueTrustedDeviceToken(userId: string, meta: RequestMeta): Promise<string> {
    const rawToken = randomBytes(32).toString('hex');
    await this.trustedDeviceModel.create({
      user_id: new Types.ObjectId(userId),
      token_hash: hashToken(rawToken),
      user_agent: meta.user_agent,
      expires_at: new Date(Date.now() + TRUSTED_DEVICE_WINDOW_MS),
    });
    return rawToken;
  }

  private async isDeviceTrusted(userId: string, deviceToken: string): Promise<boolean> {
    const found = await this.trustedDeviceModel.findOne({
      user_id: new Types.ObjectId(userId),
      token_hash: hashToken(deviceToken),
      expires_at: { $gt: new Date() },
    });
    return !!found;
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

    //  đồng bộ luôn quy tắc khóa 72h cho cả đường login Google
    if (this.usersService.isPastPasswordDeadline(user)) {
      await this.writeAuditLog(normalizedEmail, false, meta, user.id, 'password_deadline_exceeded');
      throw new ForbiddenException(
        'Tài khoản đã bị khóa do không đổi mật khẩu trong vòng 72 giờ kể từ khi được cấp. Vui lòng liên hệ Admin để được mở khóa.',
      );
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
  //  QUÊN MẬT KHẨU — tự động qua email.
  // Luôn trả về message GIỐNG NHAU dù email có tồn tại hay không -> chống dò
  // email nào đã đăng ký trong hệ thống (information disclosure).
  //!=============================================
  async forgotPassword(email: string): Promise<{ message: string }> {
    const genericMessage = {
      message: 'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.',
    };

    const user = await this.usersService.findByEmail(email);
    if (!user) return genericMessage;

    const rawToken = randomBytes(32).toString('hex');
    await this.usersService.setPasswordResetToken(
      user.id,
      hashToken(rawToken),
      PASSWORD_RESET_WINDOW_MINUTES,
    );

    void this.mailService.sendPasswordReset({
      to: user.email,
      name: user.name,
      resetToken: rawToken,
      expiresInMinutes: PASSWORD_RESET_WINDOW_MINUTES,
    });

    return genericMessage;
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.usersService.findByValidResetToken(hashToken(token));
    if (!user) {
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn, vui lòng yêu cầu lại');
    }

    await this.usersService.changePassword(user.id, newPassword);
    await this.usersService.clearPasswordResetToken(user.id);
    // Đổi mật khẩu qua đường quên mật khẩu cũng phải thu hồi mọi session cũ,
    // giống hệt đổi mật khẩu thông thường (FIX #3 gốc) — phòng trường hợp
    // chính kẻ chiếm được máy cũ mới là người kích hoạt luồng quên mật khẩu.
    await this.tokenService.revokeAllForUser(user.id);

    return { message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.' };
  }

  //!=============================================
  // MFA
  //!=============================================
  async setupMfa(userId: string, email: string): Promise<{ otpauthUrl: string }> {
    const { secret, otpauthUrl } = this.mfaService.generateSecret(email);
    await this.usersService.setPendingMfaSecret(userId, secret);
    return { otpauthUrl };
  }

  //!=============================================
  //Sinh 10 mã dự phòng NGAY KHI bật MFA thành công — trả PLAINTEXT
  // về cho client hiển thị ĐÚNG 1 LẦN DUY NHẤT (client có trách nhiệm nhắc
  // user lưu/in ra giấy). Server chỉ giữ lại bản HASH.
  //!=============================================
  async verifyMfaSetup(userId: string, token: string): Promise<{ message: string; backup_codes: string[] }> {
    const user = await this.usersService.findById(userId);
    if (!user.mfa_secret) {
      throw new UnauthorizedException('Chưa khởi tạo MFA, gọi /auth/mfa/setup trước');
    }
    const isValid = this.mfaService.verifyToken(token, user.mfa_secret);
    if (!isValid) {
      throw new UnauthorizedException('Mã xác thực không chính xác');
    }

    const { plainCodes, hashedCodes } = await this.mfaService.generateBackupCodes();
    await this.usersService.enableMfa(userId, hashedCodes);
    void this.mailService.sendMfaEnabled({ to: user.email, name: user.name });

    return {
      message:
        'Đã bật MFA thành công. LƯU LẠI 10 mã dự phòng bên dưới ở nơi an toàn — mỗi mã chỉ hiển thị 1 lần duy nhất và dùng được 1 lần.',
      backup_codes: plainCodes,
    };
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
      console.error('Ghi audit log đăng nhập thất bại:', err);
    }
  }
}
