import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RefreshToken } from '../schemas/refresh-token.schema';
import { User } from '../../users/schemas/user.schema';
import { RedisCacheService } from '../../../common/redis/redis-cache.service';
import { REFRESH_GRACE_MS, TokenService } from './token.service';

describe('TokenService.rotateRefreshToken', () => {
  let service: TokenService;
  let refreshTokenModel: {
    findOne: jest.Mock;
    deleteOne: jest.Mock;
    deleteMany: jest.Mock;
    updateOne: jest.Mock;
  };
  let userModel: { updateOne: jest.Mock };
  let redisCache: { invalidateUserAuthState: jest.Mock };
 
  let generateTokenPairSpy: jest.SpyInstance;

  const userId = new Types.ObjectId().toString();
  const rawToken = 'raw-refresh-token';
  const meta = { ip_address: '127.0.0.1', user_agent: 'jest' };

  const activeSubject = {
    id: userId,
    email: 'staff@optipackai.com',
    role: UserRole.WAREHOUSE_STAFF,
    isActive: true,
  };

  //!=============================================
  // Đại diện 1 RefreshToken document còn hợp lệ (chưa revoke, chưa hết hạn).
  // save() là mock riêng để verify được gọi đúng khi rotate thành công.
  //!=============================================
  function makeStoredToken(
    overrides: Partial<{ is_revoked: boolean; exp: Date; revoked_at: Date }> = {},
  ): {
    _id: Types.ObjectId;
    user_id: Types.ObjectId;
    is_revoked: boolean;
    revoked_at?: Date;
    exp: Date;
    save: jest.Mock;
  } {
    return {
      _id: new Types.ObjectId(),
      user_id: new Types.ObjectId(userId),
      is_revoked: overrides.is_revoked ?? false,
      revoked_at: overrides.revoked_at,
      exp: overrides.exp ?? new Date(Date.now() + 60_000), // hạn 1 phút nữa
      save: jest.fn().mockResolvedValue(undefined),
    };
  }

  beforeEach(async () => {
    refreshTokenModel = {
      findOne: jest.fn(),
      deleteOne: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue(undefined),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    userModel = { updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }) };
    redisCache = { invalidateUserAuthState: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn(), decode: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: getModelToken(RefreshToken.name),
          useValue: refreshTokenModel,
        },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: RedisCacheService, useValue: redisCache },
      ],
    }).compile();

    service = module.get(TokenService);

    //!=============================================
    // Cô lập rotateRefreshToken() khỏi generateTokenPair() (đã có test riêng
    // ở phần khác) — chỉ cần verify rotate GỌI ĐÚNG nó với đúng subject.
    //!=============================================
    generateTokenPairSpy = jest
      .spyOn(service, 'generateTokenPair')
      .mockResolvedValue({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      });
  });

  it('token không tồn tại trong DB -> 401', async () => {
    refreshTokenModel.findOne.mockResolvedValue(null);

    await expect(
      service.rotateRefreshToken(
        rawToken,
        meta,
        jest.fn().mockResolvedValue(activeSubject),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('REUSE DETECTION: token đã bị revoke mà vẫn bị dùng lại -> 401 + thu hồi TOÀN BỘ token của user', async () => {
    const stored = makeStoredToken({ is_revoked: true });
    refreshTokenModel.findOne.mockResolvedValue(stored);

    await expect(
      service.rotateRefreshToken(
        rawToken,
        meta,
        jest.fn().mockResolvedValue(activeSubject),
      ),
    ).rejects.toThrow(UnauthorizedException);

    // Đây là phần quan trọng nhất cần test: không chỉ từ chối token này,
    // mà phải revoke TẤT CẢ token khác của user (khả năng bị đánh cắp).
    // STRICT FIX: revokeAllForUser() giờ nhận thêm tham số session (tùy
    // chọn, cho phép gộp vào 1 Mongoose transaction ở nơi khác gọi nó) -
    // nhánh reuse-detection này gọi KHÔNG kèm session, nên deleteMany() thật
    // sự nhận đúng 2 tham số, tham số thứ 2 là { session: undefined }.
    expect(refreshTokenModel.deleteMany).toHaveBeenCalledWith(
      { user_id: new Types.ObjectId(userId) },
      { session: undefined },
    );
    // Không được sinh token mới trong tình huống này
    expect(generateTokenPairSpy).not.toHaveBeenCalled();
    // AOFP-334 — access token cũ cũng hết hiệu lực
    expect(userModel.updateOne).toHaveBeenCalledWith({ _id: new Types.ObjectId(userId) }, { $inc: { token_version: 1 } }, { session: undefined });
    expect(redisCache.invalidateUserAuthState).toHaveBeenCalledWith(userId);
  });

  it('AOFP-334 AC1: token vừa bị tab khác xoay (trong ân hạn) → cấp cặp mới, KHÔNG thu hồi mọi phiên', async () => {
    const stored = makeStoredToken({ is_revoked: true, revoked_at: new Date(Date.now() - 2_000) });
    refreshTokenModel.findOne.mockResolvedValue(stored);

    const result = await service.rotateRefreshToken(rawToken, meta, jest.fn().mockResolvedValue(activeSubject));

    expect(result.access_token).toBe('new-access-token');
    expect(refreshTokenModel.deleteMany).not.toHaveBeenCalled();
    expect(refreshTokenModel.updateOne).not.toHaveBeenCalled();
  });

  it('AOFP-334: dùng lại token đã xoay QUÁ thời gian ân hạn → vẫn là REUSE, thu hồi mọi phiên', async () => {
    const stored = makeStoredToken({ is_revoked: true, revoked_at: new Date(Date.now() - REFRESH_GRACE_MS - 1_000) });
    refreshTokenModel.findOne.mockResolvedValue(stored);

    await expect(
      service.rotateRefreshToken(rawToken, meta, jest.fn().mockResolvedValue(activeSubject)),
    ).rejects.toThrow(UnauthorizedException);
    expect(refreshTokenModel.deleteMany).toHaveBeenCalled();
  });

  it('token đã hết hạn -> 401, xóa document đó khỏi DB', async () => {
    const stored = makeStoredToken({ exp: new Date(Date.now() - 1000) }); // hết hạn 1s trước
    refreshTokenModel.findOne.mockResolvedValue(stored);

    await expect(
      service.rotateRefreshToken(
        rawToken,
        meta,
        jest.fn().mockResolvedValue(activeSubject),
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(refreshTokenModel.deleteOne).toHaveBeenCalledWith({
      _id: stored._id,
    });
    // Hết hạn thông thường KHÔNG phải reuse-attack -> không cần revoke toàn bộ
    expect(refreshTokenModel.deleteMany).not.toHaveBeenCalled();
  });

  it('token hợp lệ nhưng tài khoản đã bị vô hiệu hóa (isActive=false) -> 401', async () => {
    const stored = makeStoredToken();
    refreshTokenModel.findOne.mockResolvedValue(stored);
    const inactiveSubject = { ...activeSubject, isActive: false };

    await expect(
      service.rotateRefreshToken(
        rawToken,
        meta,
        jest.fn().mockResolvedValue(inactiveSubject),
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(refreshTokenModel.updateOne).not.toHaveBeenCalled();
  });

  it('token hợp lệ, tài khoản active -> đánh dấu revoked, lưu lại, sinh token pair MỚI', async () => {
    const stored = makeStoredToken();
    refreshTokenModel.findOne.mockResolvedValue(stored);
    const getSubject = jest.fn().mockResolvedValue(activeSubject);

    const result = await service.rotateRefreshToken(rawToken, meta, getSubject);

    // AOFP-334 — đánh dấu xoay bằng ghi có điều kiện (không đọc-rồi-save).
    expect(refreshTokenModel.updateOne).toHaveBeenCalledWith(
      { _id: stored._id, is_revoked: false },
      { $set: { is_revoked: true, revoked_at: expect.any(Date) as unknown } },
    );
    expect(getSubject).toHaveBeenCalledWith(userId);
    expect(generateTokenPairSpy).toHaveBeenCalledWith(activeSubject, meta);
    expect(result).toEqual({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
    });
  });
});
