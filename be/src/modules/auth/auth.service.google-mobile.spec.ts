import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { UserRole } from '../../common/enums/user-role.enum';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/services/users.service';
import { AuthService } from './auth.service';
import { LoginAuditLog } from './schemas/login-audit-log.schema';
import { TrustedDevice } from './schemas/trusted-device.schema';
import { DeviceToken } from '../notifications/schemas/device-token.schema';
import { MfaService } from './services/mfa.service';
import { TokenService } from './services/token.service';

// 10/11/2026 — POST /auth/google/mobile (BE_MOBILE_CHECKLIST mục 12) + logout gỡ token push.
describe('AuthService — đăng nhập Google app mobile (id_token)', () => {
  const WEB_CLIENT = 'web-client.apps.googleusercontent.com';
  const userId = new Types.ObjectId().toString();
  const meta = { ip_address: '1.1.1.1', user_agent: 'app' };
  let service: AuthService;
  let usersService: { findByEmail: jest.Mock; isPastPasswordDeadline: jest.Mock; syncGoogleAvatar: jest.Mock; updateLastLogin: jest.Mock };
  let tokenService: { generateTokenPair: jest.Mock; revokeToken: jest.Mock };
  let deviceTokenModel: { deleteOne: jest.Mock };
  let fetchMock: jest.SpyInstance;

  const tokeninfo = (over: Record<string, unknown> = {}, ok = true): void => {
    fetchMock.mockResolvedValue({
      ok,
      json: () =>
        Promise.resolve({
          aud: WEB_CLIENT,
          iss: 'https://accounts.google.com',
          exp: String(Math.floor(Date.now() / 1000) + 600),
          email: 'Staff@OptiPack.vn',
          email_verified: 'true',
          name: 'Staff',
          picture: 'https://p',
          ...over,
        }),
    });
  };

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn().mockResolvedValue({ id: userId, email: 'staff@optipack.vn', role: UserRole.WAREHOUSE_STAFF, is_active: true, must_change_password: false }),
      isPastPasswordDeadline: jest.fn().mockReturnValue(false),
      syncGoogleAvatar: jest.fn().mockResolvedValue(undefined),
      updateLastLogin: jest.fn().mockResolvedValue(undefined),
    };
    tokenService = {
      generateTokenPair: jest.fn().mockResolvedValue({ access_token: 'a', refresh_token: 'r' }),
      revokeToken: jest.fn().mockResolvedValue(undefined),
    };
    deviceTokenModel = { deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }) };
    const config = { get: jest.fn((key: string) => (key === 'google.clientId' ? WEB_CLIENT : key === 'google.extraAudiences' ? 'android-extra' : undefined)) };
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: TokenService, useValue: tokenService },
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        { provide: ConfigService, useValue: config },
        { provide: MfaService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: getModelToken(LoginAuditLog.name), useValue: { create: jest.fn().mockResolvedValue(undefined) } },
        { provide: getModelToken(TrustedDevice.name), useValue: {} },
        { provide: getModelToken(DeviceToken.name), useValue: deviceTokenModel },
      ],
    }).compile();
    service = module.get(AuthService);
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => { fetchMock.mockRestore(); });

  const codeOf = async (p: Promise<unknown>): Promise<string> => {
    try {
      await p;
      return 'no-error';
    } catch (e) {
      return ((e as UnauthorizedException).getResponse() as { error_code: string }).error_code;
    }
  };

  it('id_token hợp lệ, tài khoản đã có → trả token như /auth/login (email so không phân biệt hoa thường)', async () => {
    tokeninfo();
    const res = await service.googleMobileLogin('id-token', meta);
    expect(res).toMatchObject({ access_token: 'a', refresh_token: 'r', role: UserRole.WAREHOUSE_STAFF, must_change_password: false });
    expect(usersService.findByEmail).toHaveBeenCalledWith('staff@optipack.vn');
    expect(String((fetchMock.mock.calls as unknown[][])[0]?.[0])).toContain('oauth2.googleapis.com/tokeninfo?id_token=id-token');
  });

  it('aud thêm trong GOOGLE_EXTRA_AUDIENCES cũng được nhận', async () => {
    tokeninfo({ aud: 'android-extra' });
    await expect(service.googleMobileLogin('t', meta)).resolves.toBeDefined();
  });

  it('id_token sai / hết hạn / của app khác / iss lạ → AUTH_GOOGLE_ID_TOKEN_INVALID, không tra user', async () => {
    tokeninfo({}, false);
    expect(await codeOf(service.googleMobileLogin('t', meta))).toBe('AUTH_GOOGLE_ID_TOKEN_INVALID');
    tokeninfo({ aud: 'app-khac' });
    expect(await codeOf(service.googleMobileLogin('t', meta))).toBe('AUTH_GOOGLE_ID_TOKEN_INVALID');
    tokeninfo({ iss: 'evil.com' });
    expect(await codeOf(service.googleMobileLogin('t', meta))).toBe('AUTH_GOOGLE_ID_TOKEN_INVALID');
    tokeninfo({ exp: String(Math.floor(Date.now() / 1000) - 10) });
    expect(await codeOf(service.googleMobileLogin('t', meta))).toBe('AUTH_GOOGLE_ID_TOKEN_INVALID');
    expect(usersService.findByEmail).not.toHaveBeenCalled();
  });

  it('cùng luật web: chưa có tài khoản / email chưa xác thực / vô hiệu hoá / quá hạn đổi mật khẩu → mã lỗi rõ ràng', async () => {
    tokeninfo();
    usersService.findByEmail.mockResolvedValueOnce(null);
    expect(await codeOf(service.googleMobileLogin('t', meta))).toBe('AUTH_GOOGLE_ACCOUNT_NOT_REGISTERED');
    tokeninfo({ email_verified: 'false' });
    expect(await codeOf(service.googleMobileLogin('t', meta))).toBe('AUTH_GOOGLE_EMAIL_NOT_VERIFIED');
    tokeninfo();
    usersService.findByEmail.mockResolvedValueOnce({ id: userId, email: 'x', role: 1, is_active: false });
    expect(await codeOf(service.googleMobileLogin('t', meta))).toBe('AUTH_ACCOUNT_INACTIVE');
    usersService.isPastPasswordDeadline.mockReturnValueOnce(true);
    await expect(service.googleMobileLogin('t', meta)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tokenService.generateTokenPair).not.toHaveBeenCalled();
  });

  it('đăng xuất kèm push_token → thu hồi refresh token + gỡ đúng máy của người gọi; không có push_token → không gỡ', async () => {
    await service.logout('refresh', userId, 'fcm-token');
    expect(tokenService.revokeToken).toHaveBeenCalledWith('refresh');
    const [filter] = deviceTokenModel.deleteOne.mock.calls[0] as [{ token: string; user_id: Types.ObjectId }];
    expect(filter.token).toBe('fcm-token');
    expect(String(filter.user_id)).toBe(userId);
    deviceTokenModel.deleteOne.mockClear();
    await service.logout('refresh', userId);
    expect(deviceTokenModel.deleteOne).not.toHaveBeenCalled();
  });
});
