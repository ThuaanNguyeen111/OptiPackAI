import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { UserRole } from '../../common/enums/user-role.enum';
import { RedisCacheService } from '../../common/redis/redis-cache.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/services/users.service';
import { AuthService } from './auth.service';
import { LoginAuditLog } from './schemas/login-audit-log.schema';
import { TrustedDevice } from './schemas/trusted-device.schema';
import { MfaService } from './services/mfa.service';
import { TokenService } from './services/token.service';

jest.mock('bcrypt', () => ({ compare: jest.fn() }));

// AOFP-333 — cài lại MFA không làm mất MFA cũ, Google phải qua MFA, URL không chứa token.
describe('AuthService — MFA + Google (AOFP-333)', () => {
  const userId = new Types.ObjectId().toString();
  const meta = { ip_address: '1.1.1.1', user_agent: 'jest' };
  let service: AuthService;
  let store: Map<string, string>;
  let user: Record<string, unknown>;
  let usersService: Record<string, jest.Mock>;
  let mfaService: { generateSecret: jest.Mock; verifyToken: jest.Mock; claimToken: jest.Mock; verifyBackupCode: jest.Mock; generateBackupCodes: jest.Mock };
  let fetchMock: jest.SpyInstance;

  beforeEach(async () => {
    store = new Map();
    user = {
      id: userId,
      email: 'staff@optipack.vn',
      password: 'hash',
      role: UserRole.WAREHOUSE_STAFF,
      is_active: true,
      must_change_password: false,
      mfa_enabled: true,
      mfa_secret: 'OLD',
      mfa_backup_codes: [],
    };
    usersService = {
      findById: jest.fn(() => Promise.resolve(user)),
      findByEmail: jest.fn(() => Promise.resolve(user)),
      isPastPasswordDeadline: jest.fn().mockReturnValue(false),
      syncGoogleAvatar: jest.fn().mockResolvedValue(undefined),
      updateLastLogin: jest.fn().mockResolvedValue(undefined),
      setPendingMfaSecret: jest.fn((_id: string, secret: string) => {
        user.mfa_pending_secret = secret;
        return Promise.resolve();
      }),
      enableMfa: jest.fn().mockResolvedValue(undefined),
    };
    mfaService = {
      generateSecret: jest.fn().mockReturnValue({ secret: 'NEW', otpauthUrl: 'otpauth://totp/OptiPack:staff?secret=NEW' }),
      verifyToken: jest.fn((token: string, secret: string) => token === `ok-${secret}`),
      claimToken: jest.fn().mockResolvedValue(true), // AOFP-338: chống dùng lại mã TOTP
      verifyBackupCode: jest.fn().mockResolvedValue(-1),
      generateBackupCodes: jest.fn().mockResolvedValue({ plainCodes: ['a'], hashedCodes: ['h'] }),
    };
    const redis = {
      setTemp: jest.fn((k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve();
      }),
      getTemp: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
      takeTemp: jest.fn((k: string) => {
        const v = store.get(k) ?? null;
        store.delete(k);
        return Promise.resolve(v);
      }),
    };
    const config = { get: jest.fn((key: string) => (key === 'google.clientId' ? 'web' : undefined)) };
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: RedisCacheService, useValue: redis },
        { provide: UsersService, useValue: usersService },
        { provide: TokenService, useValue: { generateTokenPair: jest.fn().mockResolvedValue({ access_token: 'a', refresh_token: 'r' }) } },
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        { provide: ConfigService, useValue: config },
        { provide: MfaService, useValue: mfaService },
        { provide: MailService, useValue: { sendMfaEnabled: jest.fn() } },
        { provide: getModelToken(LoginAuditLog.name), useValue: { create: jest.fn().mockResolvedValue(undefined) } },
        { provide: getModelToken(TrustedDevice.name), useValue: { create: jest.fn().mockResolvedValue(undefined), findOne: jest.fn() } },
      ],
    }).compile();
    service = module.get(AuthService);
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          aud: 'web',
          iss: 'accounts.google.com',
          exp: String(Math.floor(Date.now() / 1000) + 600),
          email: 'staff@optipack.vn',
          email_verified: 'true',
        }),
    } as unknown as Response);
  });
  afterEach(() => {
    fetchMock.mockRestore();
  });

  const errorCode = async (p: Promise<unknown>): Promise<string> => {
    try {
      await p;
      return 'no-error';
    } catch (e: unknown) {
      return e instanceof UnauthorizedException ? String((e.getResponse() as { error_code?: string }).error_code) : String(e);
    }
  };

  describe('AC1 — cài lại MFA rồi bỏ dở', () => {
    it('MFA đang bật mà không gửi mã/mật khẩu → 401, secret không đổi', async () => {
      expect(await errorCode(service.setupMfa(userId, 'staff@optipack.vn'))).toBe('AUTH_MFA_REAUTH_REQUIRED');
      expect(usersService.setPendingMfaSecret).not.toHaveBeenCalled();
    });

    it('mật khẩu sai → 401', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      expect(await errorCode(service.setupMfa(userId, 'x', { password: 'sai' }))).toBe('AUTH_MFA_REAUTH_REQUIRED');
    });

    it('mã hiện tại đúng → chỉ lưu secret chờ, MFA cũ vẫn bật; trả QR data-URL', async () => {
      const res = await service.setupMfa(userId, 'staff@optipack.vn', { currentToken: 'ok-OLD' });
      expect(res.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
      expect(usersService.setPendingMfaSecret).toHaveBeenCalledWith(userId, 'NEW');
      expect(user.mfa_enabled).toBe(true);
      expect(user.mfa_secret).toBe('OLD');
      // Bỏ dở: đăng nhập vẫn hỏi mã theo secret CŨ.
      const login = await service.googleMobileLogin('id', meta);
      expect(login).toEqual(expect.objectContaining({ mfa_required: true }));
    });

    it('verify mã của secret mới → bật với secret mới', async () => {
      user.mfa_pending_secret = 'NEW';
      await service.verifyMfaSetup(userId, 'ok-NEW');
      expect(usersService.enableMfa).toHaveBeenCalledWith(userId, 'NEW', ['h']);
    });

    it('verify khi chưa có secret chờ → AUTH_MFA_SETUP_NOT_STARTED (không dùng secret cũ)', async () => {
      expect(await errorCode(service.verifyMfaSetup(userId, 'ok-OLD'))).toBe('AUTH_MFA_SETUP_NOT_STARTED');
    });
  });

  describe('AC3 — Google phải qua MFA', () => {
    it('Google trả mfa_required + challenge, không có token', async () => {
      const res = await service.googleMobileLogin('id', meta);
      expect(res).not.toHaveProperty('access_token');
      expect(res).toEqual({ mfa_required: true, mfa_challenge: expect.any(String) as string });
    });

    it('challenge + mã đúng → token; dùng lại challenge → 401', async () => {
      const { mfa_challenge } = (await service.googleMobileLogin('id', meta)) as { mfa_challenge: string };
      const ok = await service.googleMfaLogin(mfa_challenge, { mfaToken: 'ok-OLD' }, meta);
      expect(ok.access_token).toBe('a');
      expect(await errorCode(service.googleMfaLogin(mfa_challenge, { mfaToken: 'ok-OLD' }, meta))).toBe(
        'AUTH_GOOGLE_MFA_CHALLENGE_INVALID',
      );
    });

    it('mã sai → 401, challenge vẫn dùng tiếp được; thiếu mã → 401', async () => {
      const { mfa_challenge } = (await service.googleMobileLogin('id', meta)) as { mfa_challenge: string };
      expect(await errorCode(service.googleMfaLogin(mfa_challenge, { mfaToken: 'sai' }, meta))).toBe('AUTH_MFA_TOKEN_INVALID');
      expect(await errorCode(service.googleMfaLogin(mfa_challenge, {}, meta))).toBe('AUTH_MFA_TOKEN_INVALID');
      expect((await service.googleMfaLogin(mfa_challenge, { mfaToken: 'ok-OLD' }, meta)).access_token).toBe('a');
    });

    it('không bật MFA → Google trả token ngay', async () => {
      user.mfa_enabled = false;
      expect(await service.googleMobileLogin('id', meta)).toEqual(expect.objectContaining({ access_token: 'a' }));
    });
  });

  describe('AC4 — mã đổi token dùng 1 lần', () => {
    it('đổi được 1 lần, lần 2 → 401', async () => {
      const code = await service.stashGoogleResult({ access_token: 'a', refresh_token: 'r', role: UserRole.ADMIN, must_change_password: false });
      expect(code).toMatch(/^[0-9a-f]{64}$/);
      expect(await service.exchangeGoogleLoginCode(code)).toEqual(expect.objectContaining({ access_token: 'a' }));
      expect(await errorCode(service.exchangeGoogleLoginCode(code))).toBe('AUTH_GOOGLE_LOGIN_CODE_INVALID');
    });
  });
});
