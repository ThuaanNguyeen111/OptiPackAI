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
import { CurrentUser } from './decorators/current-user.decorator';
import { ChangePasswordDto, LoginDto, VerifyMfaSetupDto } from './dto';
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

  //!=============================================
  // STRICT FIX: ép `req.headers['user-agent']` qua `unknown` trước rồi mới
  // narrow bằng `typeof` — không tin thẳng kiểu suy ra từ @types/express nữa
  // (từng bị resolve nhầm thành `any` sau khi cài lại node_modules, khiến
  // ESLint no-unsafe-assignment báo lỗi). Cách này an toàn tuyệt đối bất kể
  // @types/express có đang bị lệch version hay không.
  //!=============================================
  private extractMeta(req: Request): RequestMeta {
    const rawUserAgent: unknown = req.headers['user-agent'];
    const userAgent = typeof rawUserAgent === 'string' ? rawUserAgent : undefined;

    return {
      ip_address: req.ip,
      user_agent: userAgent,
    };
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
    return this.authService.login(
      loginDto.email,
      loginDto.password,
      loginDto.mfa_token,
      this.extractMeta(req),
    );
  }

  //!=============================================
  // 2. ĐỔI MẬT KHẨU
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
  ): Promise<{ message: string }> {
    return this.authService.verifyMfaSetup(user.userId, verifyDto.token);
  }

  //!=============================================
  // 3. REFRESH TOKEN
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
  // 4. ĐĂNG XUẤT
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
      return { url: `${frontendUrl}?error=missing_code` };
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
        role: result.role,
        must_change_password: String(result.must_change_password),
      });
      return { url: `${frontendUrl}?${params.toString()}` };
    } catch {
      return { url: `${frontendUrl}?error=account_not_found` };
    }
  }
}
