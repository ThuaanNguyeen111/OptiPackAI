import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { UserRole } from '../../common/enums/user-role.enum';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/services/users.service';
import { AuthService } from './auth.service';
import { LoginAuditLog } from './schemas/login-audit-log.schema';
import { TrustedDevice } from './schemas/trusted-device.schema';
import { MfaService } from './services/mfa.service';
import { TokenService } from './services/token.service';


jest.mock('bcrypt');

describe('AuthService.login', () => {
  let service: AuthService;
  let usersService: jest.Mocked<
    Pick<
      UsersService,
      | 'findByEmail'
      | 'isLocked'
      | 'isPastPasswordDeadline'
      | 'incrementFailedLoginAttempts'
      | 'resetFailedLoginAttempts'
      | 'updateLastLogin'
      | 'consumeBackupCode'
    >
  >;
  let tokenService: jest.Mocked<Pick<TokenService, 'generateTokenPair'>>;
  let mfaService: jest.Mocked<Pick<MfaService, 'verifyToken' | 'verifyBackupCode'>>;
  let mailService: jest.Mocked<Pick<MailService, 'sendAccountLocked'>>;
  let auditLogModel: { create: jest.Mock };
  let trustedDeviceModel: { findOne: jest.Mock; create: jest.Mock };

  const meta = { ip_address: '127.0.0.1', user_agent: 'jest' };


  const baseUser = {
    id: new Types.ObjectId().toHexString(),
    email: 'staff@optipackai.com',
    password: 'hashed-password',
    role: UserRole.WAREHOUSE_STAFF,
    is_active: true,
    must_change_password: false,
    must_change_password_by: undefined as Date | undefined,
    mfa_enabled: false,
    mfa_secret: undefined as string | undefined,
    mfa_backup_codes: [] as string[],
  };

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      isLocked: jest.fn().mockReturnValue(false),
      isPastPasswordDeadline: jest.fn().mockReturnValue(false),
      incrementFailedLoginAttempts: jest.fn().mockResolvedValue(undefined),
      resetFailedLoginAttempts: jest.fn().mockResolvedValue(undefined),
      updateLastLogin: jest.fn().mockResolvedValue(undefined),
      consumeBackupCode: jest.fn().mockResolvedValue(undefined),
    };
    tokenService = {
      generateTokenPair: jest.fn().mockResolvedValue({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
      }),
    };
    mfaService = {
      verifyToken: jest.fn(),
      verifyBackupCode: jest.fn().mockResolvedValue(-1),
    };
    mailService = { sendAccountLocked: jest.fn().mockResolvedValue(undefined) };
    auditLogModel = { create: jest.fn().mockResolvedValue(undefined) };
    trustedDeviceModel = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: TokenService, useValue: tokenService },
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: MfaService, useValue: mfaService },
        { provide: MailService, useValue: mailService },
        { provide: getModelToken(LoginAuditLog.name), useValue: auditLogModel },
        { provide: getModelToken(TrustedDevice.name), useValue: trustedDeviceModel },
      ],
    }).compile();

    service = module.get(AuthService);
    jest.clearAllMocks();
    // clearAllMocks ở trên xóa luôn implementation mặc định đã set lúc khởi tạo -> set lại
    usersService.isLocked.mockReturnValue(false);
    usersService.isPastPasswordDeadline.mockReturnValue(false);
    tokenService.generateTokenPair.mockResolvedValue({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    });
    trustedDeviceModel.findOne.mockResolvedValue(null);
  });

  it('đăng nhập thành công, không bật MFA -> trả về token pair', async () => {
    usersService.findByEmail.mockResolvedValue({ ...baseUser } as never);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await service.login({
      email: baseUser.email,
      password: 'correct-password',
      meta,
    });

    expect(result).toEqual({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      must_change_password: false,
      role: UserRole.WAREHOUSE_STAFF,
    });
    expect(usersService.resetFailedLoginAttempts).toHaveBeenCalledWith(baseUser.id);
    expect(usersService.updateLastLogin).toHaveBeenCalledWith(baseUser.id);
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, user_id: baseUser.id }),
    );
  });

  it('email không tồn tại -> 401, KHÔNG tăng failed_login_attempts (không có user để tăng)', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({ email: 'unknown@x.com', password: 'whatever', meta }),
    ).rejects.toThrow(UnauthorizedException);

    expect(usersService.incrementFailedLoginAttempts).not.toHaveBeenCalled();

    expect(bcrypt.compare).toHaveBeenCalled();
  });

  it('sai mật khẩu (user tồn tại) -> 401, CÓ tăng failed_login_attempts', async () => {
    usersService.findByEmail.mockResolvedValue({ ...baseUser } as never);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({ email: baseUser.email, password: 'wrong-password', meta }),
    ).rejects.toThrow(UnauthorizedException);

    expect(usersService.incrementFailedLoginAttempts).toHaveBeenCalledWith(baseUser.id);
  });

  it('tài khoản đang bị khóa (isLocked true) -> 403, dừng trước cả bước check password', async () => {
    usersService.findByEmail.mockResolvedValue({ ...baseUser } as never);
    usersService.isLocked.mockReturnValue(true);

    await expect(
      service.login({ email: baseUser.email, password: 'anything', meta }),
    ).rejects.toThrow(ForbiddenException);

    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('tài khoản is_active=false -> 401', async () => {
    usersService.findByEmail.mockResolvedValue({ ...baseUser, is_active: false } as never);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await expect(
      service.login({ email: baseUser.email, password: 'correct-password', meta }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('quá hạn 72h chưa đổi mật khẩu -> 403, không cho đăng nhập dù đúng password', async () => {
    usersService.findByEmail.mockResolvedValue({ ...baseUser, must_change_password: true } as never);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    usersService.isPastPasswordDeadline.mockReturnValue(true);

    await expect(
      service.login({ email: baseUser.email, password: 'correct-password', meta }),
    ).rejects.toThrow(ForbiddenException);

    expect(mailService.sendAccountLocked).toHaveBeenCalled();
    expect(tokenService.generateTokenPair).not.toHaveBeenCalled();
  });

  it('mfa_enabled=true nhưng thiếu mfa_token trong request -> trả về { mfa_required: true }, KHÔNG sinh JWT', async () => {
    usersService.findByEmail.mockResolvedValue({
      ...baseUser,
      mfa_enabled: true,
      mfa_secret: 'SECRET123',
    } as never);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await service.login({
      email: baseUser.email,
      password: 'correct-password',
      meta,
    });

    expect(result).toEqual({ mfa_required: true });
    expect(tokenService.generateTokenPair).not.toHaveBeenCalled();
  });

  it('mfa_enabled=true, mfa_token sai -> 401', async () => {
    usersService.findByEmail.mockResolvedValue({
      ...baseUser,
      mfa_enabled: true,
      mfa_secret: 'SECRET123',
    } as never);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    mfaService.verifyToken.mockReturnValue(false);

    await expect(
      service.login({
        email: baseUser.email,
        password: 'correct-password',
        mfaToken: '000000',
        meta,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('mfa_enabled=true, mfa_token đúng -> đăng nhập thành công, sinh trusted_device_token mới', async () => {
    usersService.findByEmail.mockResolvedValue({
      ...baseUser,
      mfa_enabled: true,
      mfa_secret: 'SECRET123',
    } as never);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    mfaService.verifyToken.mockReturnValue(true);

    const result = await service.login({
      email: baseUser.email,
      password: 'correct-password',
      mfaToken: '123456',
      meta,
    });

    expect(mfaService.verifyToken).toHaveBeenCalledWith('123456', 'SECRET123');
    expect(result).toHaveProperty('access_token', 'access-token');
    expect(result).toHaveProperty('trusted_device_token');
    expect(trustedDeviceModel.create).toHaveBeenCalledTimes(1);
  });

  it('mfa_enabled=true nhưng mfa_secret rỗng (dữ liệu bất thường) -> 401, không cho lọt qua', async () => {
    usersService.findByEmail.mockResolvedValue({
      ...baseUser,
      mfa_enabled: true,
      mfa_secret: undefined,
    } as never);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await expect(
      service.login({
        email: baseUser.email,
        password: 'correct-password',
        mfaToken: '123456',
        meta,
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(mfaService.verifyToken).not.toHaveBeenCalled();
  });

  it('mfa_enabled=true, có device_token hợp lệ (thiết bị tin cậy) -> bỏ qua MFA, KHÔNG sinh trusted_device_token mới', async () => {
    usersService.findByEmail.mockResolvedValue({
      ...baseUser,
      mfa_enabled: true,
      mfa_secret: 'SECRET123',
    } as never);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    trustedDeviceModel.findOne.mockResolvedValue({ _id: 'trusted-1' });

    const result = await service.login({
      email: baseUser.email,
      password: 'correct-password',
      deviceToken: 'raw-device-token',
      meta,
    });

    expect(mfaService.verifyToken).not.toHaveBeenCalled();
    expect(result).toHaveProperty('access_token', 'access-token');
    expect(result).not.toHaveProperty('trusted_device_token');
    expect(trustedDeviceModel.create).not.toHaveBeenCalled();
  });

  it('mfa_enabled=true, login bằng mã dự phòng (backup code) hợp lệ -> đăng nhập thành công, xóa mã đã dùng', async () => {
    usersService.findByEmail.mockResolvedValue({
      ...baseUser,
      mfa_enabled: true,
      mfa_secret: 'SECRET123',
      mfa_backup_codes: ['hashed-1', 'hashed-2'],
    } as never);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    mfaService.verifyBackupCode.mockResolvedValue(1);

    const result = await service.login({
      email: baseUser.email,
      password: 'correct-password',
      backupCode: '48213096',
      meta,
    });

    expect(usersService.consumeBackupCode).toHaveBeenCalledWith(baseUser.id, 1);
    expect(result).toHaveProperty('access_token', 'access-token');
  });

  it('mfa_enabled=true, mã dự phòng sai/đã dùng -> 401', async () => {
    usersService.findByEmail.mockResolvedValue({
      ...baseUser,
      mfa_enabled: true,
      mfa_secret: 'SECRET123',
      mfa_backup_codes: ['hashed-1'],
    } as never);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    mfaService.verifyBackupCode.mockResolvedValue(-1);

    await expect(
      service.login({
        email: baseUser.email,
        password: 'correct-password',
        backupCode: 'wrong-code',
        meta,
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(usersService.consumeBackupCode).not.toHaveBeenCalled();
  });
});

//!=============================================
// FIX #38: describe RIÊNG cho googleLogin() - trước đây HOÀN TOÀN chưa có
// test nào cho luồng này (đã nêu rõ trong đánh giá tổng thể BE). Mock
// `global.fetch` vì getGoogleUserInfo() gọi thẳng fetch() (không inject qua
// HttpService), và mock jwtService.verify() cho bước xác thực state.
//!=============================================
describe('AuthService.googleLogin', () => {
  let service: AuthService;
  let usersService: jest.Mocked<
    Pick<UsersService, 'findByEmail' | 'isPastPasswordDeadline' | 'syncGoogleAvatar' | 'updateLastLogin'>
  >;
  let tokenService: jest.Mocked<Pick<TokenService, 'generateTokenPair'>>;
  let jwtService: jest.Mocked<Pick<JwtService, 'verify'>>;
  let configService: { get: jest.Mock };
  let auditLogModel: { create: jest.Mock };
  let fetchMock: jest.Mock;

  const meta = { ip_address: '127.0.0.1', user_agent: 'jest' };
  const googleConfig: Record<string, string> = {
    'google.clientId': 'client-id',
    'google.clientSecret': 'client-secret',
    'google.redirectUri': 'http://localhost:3000/auth/google/callback',
  };

  const activeUser = {
    id: 'user-1',
    email: 'staff@optipackai.com',
    role: UserRole.WAREHOUSE_STAFF,
    is_active: true,
    must_change_password: false,
  };

  function mockFetchSequence(tokenOk: boolean, userInfoOk = true): void {
    fetchMock
      .mockResolvedValueOnce({
        ok: tokenOk,
        json: () => Promise.resolve({ access_token: 'google-access-token' }),
      })
      .mockResolvedValueOnce({
        ok: userInfoOk,
        json: () => Promise.resolve({
          email: 'staff@optipackai.com',
          email_verified: true,
          name: 'Nguyễn Văn A',
          picture: 'https://google.com/avatar.png',
        }),
      });
  }

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      isPastPasswordDeadline: jest.fn().mockReturnValue(false),
      syncGoogleAvatar: jest.fn().mockResolvedValue(undefined),
      updateLastLogin: jest.fn().mockResolvedValue(undefined),
    };
    tokenService = {
      generateTokenPair: jest.fn().mockResolvedValue({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
      }),
    };
    jwtService = { verify: jest.fn() };
    configService = { get: jest.fn((key: string) => googleConfig[key]) };
    auditLogModel = { create: jest.fn().mockResolvedValue(undefined) };

    fetchMock = jest.fn();
    global.fetch = fetchMock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: TokenService, useValue: tokenService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: MfaService, useValue: { verifyToken: jest.fn(), verifyBackupCode: jest.fn() } },
        { provide: MailService, useValue: { sendAccountLocked: jest.fn() } },
        { provide: getModelToken(LoginAuditLog.name), useValue: auditLogModel },
        {
          provide: getModelToken(TrustedDevice.name),
          useValue: { findOne: jest.fn(), create: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('state rỗng/thiếu -> UnauthorizedException, KHÔNG gọi Google API', async () => {
    await expect(service.googleLogin('code', '', meta)).rejects.toThrow(UnauthorizedException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('state không hợp lệ (jwtService.verify ném lỗi) -> GoogleStateInvalidException', async () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });

    await expect(service.googleLogin('code', 'bad-state', meta)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('Google trả lỗi ở bước đổi code lấy token -> UnauthorizedException', async () => {
    jwtService.verify.mockReturnValue({});
    mockFetchSequence(false);

    await expect(service.googleLogin('code', 'state', meta)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('email Google chưa xác thực -> GoogleEmailNotVerifiedException', async () => {
    jwtService.verify.mockReturnValue({});
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: 'x' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          email: 'staff@optipackai.com',
          email_verified: false,
          name: 'A',
          picture: 'x',
        }),
      });

    await expect(service.googleLogin('code', 'state', meta)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('email chưa được Admin tạo tài khoản -> GoogleAccountNotRegisteredException, có ghi audit log', async () => {
    jwtService.verify.mockReturnValue({});
    mockFetchSequence(true);
    usersService.findByEmail.mockResolvedValue(null);

    await expect(service.googleLogin('code', 'state', meta)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, failure_reason: 'google_account_not_registered' }),
    );
  });

  it('tài khoản đã bị vô hiệu hóa -> GoogleAccountInactiveException', async () => {
    jwtService.verify.mockReturnValue({});
    mockFetchSequence(true);
    usersService.findByEmail.mockResolvedValue({ ...activeUser, is_active: false } as never);

    await expect(service.googleLogin('code', 'state', meta)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('tài khoản đã quá hạn 72h (khóa cứng) -> GoogleAccountLockedException (403, không phải 401)', async () => {
    jwtService.verify.mockReturnValue({});
    mockFetchSequence(true);
    usersService.findByEmail.mockResolvedValue({ ...activeUser } as never);
    usersService.isPastPasswordDeadline.mockReturnValue(true);

    await expect(service.googleLogin('code', 'state', meta)).rejects.toThrow(ForbiddenException);
  });

  it('mọi điều kiện hợp lệ -> đăng nhập thành công, đồng bộ avatar, sinh token', async () => {
    jwtService.verify.mockReturnValue({});
    mockFetchSequence(true);
    usersService.findByEmail.mockResolvedValue({ ...activeUser } as never);

    const result = await service.googleLogin('code', 'state', meta);

    expect(usersService.syncGoogleAvatar).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ access_token: 'access-token', refresh_token: 'refresh-token' }),
    );
  });
});
