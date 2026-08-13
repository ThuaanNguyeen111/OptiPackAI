import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../../common/enums/user-role.enum';
import { UsersService } from '../users/services/users.service';
import { AuthService } from './auth.service';
import { LoginAuditLog } from './schemas/login-audit-log.schema';
import { MfaService } from './services/mfa.service';
import { TokenService } from './services/token.service';

//!=============================================
// STRICT FIX: `bcrypt.compare` gọi hàm crypto thật rất chậm (cost 12 ~vài trăm
// ms/lần) và không cần thiết cho unit test — mock hẳn module để test chạy
// nhanh và kiểm soát được kết quả true/false theo từng case.
//!=============================================
jest.mock('bcrypt');

describe('AuthService.login', () => {
  let service: AuthService;
  let usersService: jest.Mocked<
    Pick<
      UsersService,
      | 'findByEmail'
      | 'isLocked'
      | 'incrementFailedLoginAttempts'
      | 'resetFailedLoginAttempts'
      | 'updateLastLogin'
    >
  >;
  let tokenService: jest.Mocked<Pick<TokenService, 'generateTokenPair'>>;
  let mfaService: jest.Mocked<Pick<MfaService, 'verifyToken'>>;
  let auditLogModel: { create: jest.Mock };

  const meta = { ip_address: '127.0.0.1', user_agent: 'jest' };

  // Đại diện 1 UserDocument tối thiểu — chỉ field AuthService.login() thực sự đọc tới
  const baseUser = {
    id: 'user-1',
    email: 'staff@optipackai.com',
    password: 'hashed-password',
    role: UserRole.WAREHOUSE_STAFF,
    is_active: true,
    must_change_password: false,
    mfa_enabled: false,
    mfa_secret: undefined as string | undefined,
  };

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      isLocked: jest.fn().mockReturnValue(false),
      incrementFailedLoginAttempts: jest.fn().mockResolvedValue(undefined),
      resetFailedLoginAttempts: jest.fn().mockResolvedValue(undefined),
      updateLastLogin: jest.fn().mockResolvedValue(undefined),
    };
    tokenService = {
      generateTokenPair: jest.fn().mockResolvedValue({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
      }),
    };
    mfaService = { verifyToken: jest.fn() };
    auditLogModel = { create: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: TokenService, useValue: tokenService },
        { provide: JwtService, useValue: { sign: jest.fn(), verify: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: MfaService, useValue: mfaService },
        { provide: getModelToken(LoginAuditLog.name), useValue: auditLogModel },
      ],
    }).compile();

    service = module.get(AuthService);
    jest.clearAllMocks();
    // clearAllMocks ở trên xóa luôn implementation mặc định đã set lúc khởi tạo -> set lại
    usersService.isLocked.mockReturnValue(false);
    tokenService.generateTokenPair.mockResolvedValue({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    });
  });

  it('đăng nhập thành công, không bật MFA -> trả về token pair', async () => {
    usersService.findByEmail.mockResolvedValue({ ...baseUser } as never);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await service.login(baseUser.email, 'correct-password', undefined, meta);

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

    await expect(service.login('unknown@x.com', 'whatever', undefined, meta)).rejects.toThrow(
      UnauthorizedException,
    );

    expect(usersService.incrementFailedLoginAttempts).not.toHaveBeenCalled();
    // STRICT FIX liên quan bảo mật: vẫn phải gọi bcrypt.compare với DUMMY_PASSWORD_HASH
    // để thời gian phản hồi giống hệt case sai password -> chống timing attack dò email.
    expect(bcrypt.compare).toHaveBeenCalled();
  });

  it('sai mật khẩu (user tồn tại) -> 401, CÓ tăng failed_login_attempts', async () => {
    usersService.findByEmail.mockResolvedValue({ ...baseUser } as never);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login(baseUser.email, 'wrong-password', undefined, meta),
    ).rejects.toThrow(UnauthorizedException);

    expect(usersService.incrementFailedLoginAttempts).toHaveBeenCalledWith(baseUser.id);
  });

  it('tài khoản đang bị khóa (isLocked true) -> 403, dừng trước cả bước check password', async () => {
    usersService.findByEmail.mockResolvedValue({ ...baseUser } as never);
    usersService.isLocked.mockReturnValue(true);

    await expect(service.login(baseUser.email, 'anything', undefined, meta)).rejects.toThrow(
      ForbiddenException,
    );

    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('tài khoản is_active=false -> 401', async () => {
    usersService.findByEmail.mockResolvedValue({ ...baseUser, is_active: false } as never);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await expect(service.login(baseUser.email, 'correct-password', undefined, meta)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('mfa_enabled=true nhưng thiếu mfa_token trong request -> trả về { mfa_required: true }, KHÔNG sinh JWT', async () => {
    usersService.findByEmail.mockResolvedValue({
      ...baseUser,
      mfa_enabled: true,
      mfa_secret: 'SECRET123',
    } as never);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await service.login(baseUser.email, 'correct-password', undefined, meta);

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
      service.login(baseUser.email, 'correct-password', '000000', meta),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('mfa_enabled=true, mfa_token đúng -> đăng nhập thành công', async () => {
    usersService.findByEmail.mockResolvedValue({
      ...baseUser,
      mfa_enabled: true,
      mfa_secret: 'SECRET123',
    } as never);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    mfaService.verifyToken.mockReturnValue(true);

    const result = await service.login(baseUser.email, 'correct-password', '123456', meta);

    expect(mfaService.verifyToken).toHaveBeenCalledWith('123456', 'SECRET123');
    expect(result).toHaveProperty('access_token', 'access-token');
  });

  it('mfa_enabled=true nhưng mfa_secret rỗng (dữ liệu bất thường) -> 401, không cho lọt qua', async () => {
    usersService.findByEmail.mockResolvedValue({
      ...baseUser,
      mfa_enabled: true,
      mfa_secret: undefined,
    } as never);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await expect(
      service.login(baseUser.email, 'correct-password', '123456', meta),
    ).rejects.toThrow(UnauthorizedException);
    expect(mfaService.verifyToken).not.toHaveBeenCalled();
  });
});
