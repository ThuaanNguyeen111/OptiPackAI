import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RedisCacheService } from '../../../common/redis/redis-cache.service';
import { UsersService } from '../../users/services/users.service';
import { JwtStrategy, JwtPayload } from './jwt.strategy';

describe('JwtStrategy.validate', () => {
  let strategy: JwtStrategy;
  let usersService: jest.Mocked<Pick<UsersService, 'findById'>>;
  let redisCache: jest.Mocked<Pick<RedisCacheService, 'getUserAuthState' | 'setUserAuthState'>>;

  const payload: JwtPayload = {
    sub: 'user-id-1',
    email: 'staff@optipackai.com',
    role: UserRole.WAREHOUSE_STAFF,
  };

  const configService = {
    get: jest.fn().mockReturnValue('access-secret-gia-lap'),
  } as unknown as ConfigService;

  beforeEach(() => {
    usersService = { findById: jest.fn() };
    redisCache = {
      getUserAuthState: jest.fn(),
      setUserAuthState: jest.fn().mockResolvedValue(undefined),
    };
    strategy = new JwtStrategy(
      configService,
      usersService as unknown as UsersService,
      redisCache as unknown as RedisCacheService,
    );
  });

  it('cache Redis CÓ sẵn (cache hit) -> KHÔNG gọi xuống MongoDB', async () => {
    redisCache.getUserAuthState.mockResolvedValue({
      is_active: true,
      must_change_password: false,
      role: UserRole.WAREHOUSE_STAFF,
    });

    const result = await strategy.validate(payload);

    expect(usersService.findById).not.toHaveBeenCalled();
    expect(result).toEqual({
      userId: 'user-id-1',
      email: 'staff@optipackai.com',
      role: UserRole.WAREHOUSE_STAFF,
      mustChangePassword: false,
    });
  });

  it('cache Redis KHÔNG có (cache miss) -> tự tra MongoDB rồi ghi lại vào cache', async () => {
    redisCache.getUserAuthState.mockResolvedValue(null);
    usersService.findById.mockResolvedValue({
      is_active: true,
      must_change_password: false,
      role: UserRole.WAREHOUSE_STAFF,
      must_change_password_by: undefined,
    } as never);

    await strategy.validate(payload);

    expect(usersService.findById).toHaveBeenCalledWith('user-id-1');
    expect(redisCache.setUserAuthState).toHaveBeenCalledTimes(1);
  });

  it('is_active=false -> 401', async () => {
    redisCache.getUserAuthState.mockResolvedValue({
      is_active: false,
      must_change_password: false,
      role: UserRole.WAREHOUSE_STAFF,
    });

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('quá hạn 72h chưa đổi mật khẩu (must_change_password_by đã qua) -> 401, chặn CỨNG', async () => {
    const pastDate = new Date(Date.now() - 60_000).toISOString();
    redisCache.getUserAuthState.mockResolvedValue({
      is_active: true,
      must_change_password: true,
      role: UserRole.WAREHOUSE_STAFF,
      must_change_password_by: pastDate,
    });

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  it('must_change_password=true nhưng CHƯA quá hạn 72h -> vẫn cho qua (ForcePasswordChangeGuard xử lý tiếp sau)', async () => {
    const futureDate = new Date(Date.now() + 60_000).toISOString();
    redisCache.getUserAuthState.mockResolvedValue({
      is_active: true,
      must_change_password: true,
      role: UserRole.WAREHOUSE_STAFF,
      must_change_password_by: futureDate,
    });

    const result = await strategy.validate(payload);

    expect(result.mustChangePassword).toBe(true);
  });
});
