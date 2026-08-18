import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Redirect,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService, LoginResult, MfaRequiredResult } from './auth.service';
import { GoogleOAuthErrorCode } from '../../common/constants/messages.constants';
import { CurrentUser } from './decorators/current-user.decorator';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, ResetPasswordDto, VerifyMfaSetupDto } from './dto';
import {
  GoogleAccountInactiveException,
  GoogleAccountLockedException,
  GoogleAccountNotRegisteredException,
  GoogleEmailNotVerifiedException,
  GoogleStateInvalidException,
} from './exceptions/google-auth.exceptions';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedUser } from './interfaces/authenticated-request.interface';
import type { RequestMeta, TokenPair } from './services/token.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}


  private extractMeta(req: Request): RequestMeta {
    const rawUserAgent: unknown = req.headers['user-agent'];
    const userAgent = typeof rawUserAgent === 'string' ? rawUserAgent : undefined;

    return {
      ip_address: req.ip,
      user_agent: userAgent,
    };
  }

  //!=============================================
  // FIX #35: Nhận diện ĐÚNG loại lỗi Google OAuth (nhờ instanceof, không đoán
  // qua nội dung message) -> trả về mã lỗi NGẮN GỌN, RIÊNG BIỆT cho từng
  // trường hợp qua query param cho FE - thay vì gộp chung 1 mã lỗi cho mọi
  // tình huống như trước đây.
  //!=============================================
  private mapGoogleErrorToCode(err: unknown): GoogleOAuthErrorCode {
    if (err instanceof GoogleStateInvalidException) return GoogleOAuthErrorCode.INVALID_STATE;
    if (err instanceof GoogleEmailNotVerifiedException) return GoogleOAuthErrorCode.EMAIL_NOT_VERIFIED;
    if (err instanceof GoogleAccountNotRegisteredException)
      return GoogleOAuthErrorCode.ACCOUNT_NOT_REGISTERED;
    if (err instanceof GoogleAccountInactiveException) return GoogleOAuthErrorCode.ACCOUNT_INACTIVE;
    if (err instanceof GoogleAccountLockedException) return GoogleOAuthErrorCode.ACCOUNT_LOCKED;
    return GoogleOAuthErrorCode.SERVER_ERROR;
  }

  //!=============================================
  // 1. ĐĂNG NHẬP
  //!=============================================
  @ApiOperation({ summary: 'Đăng nhập vào hệ thống (tài khoản do Admin tạo sẵn)' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
  ): Promise<LoginResult | MfaRequiredResult> {
    return this.authService.login({
      email: loginDto.email,
      password: loginDto.password,
      mfaToken: loginDto.mfa_token,
      backupCode: loginDto.backup_code,
      deviceToken: loginDto.device_token,
      meta: this.extractMeta(req),
    });
  }

  //!=============================================
  // 2. QUÊN MẬT KHẨU (tự động qua email — FIX #2)
  //!=============================================
  @ApiOperation({ summary: 'Gửi email hướng dẫn đặt lại mật khẩu' })
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    return this.authService.forgotPassword(dto.email);
  }

  @ApiOperation({ summary: 'Đặt lại mật khẩu bằng token nhận được qua email' })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    return this.authService.resetPassword(dto.token, dto.new_password);
  }

  //!=============================================
  // 3. ĐỔI MẬT KHẨU
  //!=============================================
  @ApiOperation({ summary: 'Đổi mật khẩu (bắt buộc nếu must_change_password = true)' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  async changePassword(
    @Body() changePasswordDto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    await this.authService.changePassword(
      user.userId,
      changePasswordDto.current_password,
      changePasswordDto.new_password,
    );
    return { message: 'Đổi mật khẩu thành công. Mọi phiên đăng nhập khác đã bị đăng xuất.' };
  }

  //!=============================================
  // MFA
  //!=============================================
  @ApiOperation({ summary: 'Bước 1: Sinh QR code MFA cho tài khoản hiện tại' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('mfa/setup')
  async setupMfa(@CurrentUser() user: AuthenticatedUser): Promise<{ otpauthUrl: string }> {
    return this.authService.setupMfa(user.userId, user.email);
  }

  @ApiOperation({ summary: 'Bước 2: Xác thực mã TOTP để kích hoạt MFA' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('mfa/verify')
  async verifyMfaSetup(
    @Body() verifyDto: VerifyMfaSetupDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ message: string; backup_codes: string[] }> {
    return this.authService.verifyMfaSetup(user.userId, verifyDto.token);
  }

  //!=============================================
  // 4. REFRESH TOKEN
  //!=============================================
  @ApiOperation({ summary: 'Làm mới access token bằng refresh token' })
  @ApiBody({ schema: { properties: { refresh_token: { type: 'string' } } } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Body('refresh_token') refreshToken: string,
    @Req() req: Request,
  ): Promise<TokenPair> {
    return this.authService.refreshAccessToken(refreshToken, this.extractMeta(req));
  }

  //!=============================================
  // 5. ĐĂNG XUẤT
  //!=============================================
  @ApiOperation({ summary: 'Đăng xuất khỏi hệ thống (thu hồi refresh token)' })
  @ApiBearerAuth('JWT-auth')
  @ApiBody({ schema: { properties: { refresh_token: { type: 'string' } } } })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Body('refresh_token') refreshToken: string): Promise<{ message: string }> {
    return this.authService.logout(refreshToken);
  }

  //!=============================================
  // GOOGLE OAUTH
  //!=============================================
  @ApiOperation({ summary: 'Khởi tạo đăng nhập Google OAuth' })
  @ApiQuery({ name: 'code_challenge', required: false, description: 'PKCE — bắt buộc với Mobile' })
  @Get('google')
  @Redirect()
  googleAuth(@Query('code_challenge') codeChallenge?: string): { url: string } {
    const state = this.authService.generateOAuthState();
    return { url: this.authService.getGoogleAuthorizationUrl(state, codeChallenge) };
  }

  @ApiOperation({ summary: 'Google OAuth Callback (được Google tự động gọi)' })
  @Get('google/callback')
  @Redirect()
  async googleAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('code_verifier') codeVerifier: string | undefined,
    @Req() req: Request,
  ): Promise<{ url: string }> {
    const frontendUrl = this.configService.get<string>(
      'CLIENT_REDIRECT_CALLBACK',
      'http://localhost:5173/oauth-success',
    );

    if (!code) {
      return { url: `${frontendUrl}?error=${GoogleOAuthErrorCode.MISSING_CODE}` };
    }

    try {
      const result = await this.authService.googleLogin(
        code,
        state,
        this.extractMeta(req),
        codeVerifier,
      );
      const params = new URLSearchParams({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        role: String(result.role),
        must_change_password: String(result.must_change_password),
      });
      return { url: `${frontendUrl}?${params.toString()}` };
    } catch (err: unknown) {
      //!=============================================
      // FIX #35: trước đây "catch {}" mù, gộp MỌI lỗi thành 1 mã
      // "account_not_found" - giờ phân loại rõ ràng qua mapGoogleErrorToCode().
      //!=============================================
      const errorCode = this.mapGoogleErrorToCode(err);
      return { url: `${frontendUrl}?error=${errorCode}` };
    }
  }
}
