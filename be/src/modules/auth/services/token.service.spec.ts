import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RefreshToken } from '../schemas/refresh-token.schema';
import { TokenService } from './token.service';

describe('TokenService.rotateRefreshToken', () => {
  let service: TokenService;
  let refreshTokenModel: {
    findOne: jest.Mock;
    deleteOne: jest.Mock;
    deleteMany: jest.Mock;
  };
 
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
    overrides: Partial<{ is_revoked: boolean; exp: Date }> = {},
  ): {
    _id: Types.ObjectId;
    user_id: Types.ObjectId;
    is_revoked: boolean;
    exp: Date;
    save: jest.Mock;
  } {
    return {
      _id: new Types.ObjectId(),
      user_id: new Types.ObjectId(userId),
      is_revoked: overrides.is_revoked ?? false,
      exp: overrides.exp ?? new Date(Date.now() + 60_000), // hạn 1 phút nữa
      save: jest.fn().mockResolvedValue(undefined),
    };
  }

  beforeEach(async () => {
    refreshTokenModel = {
      findOne: jest.fn(),
      deleteOne: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue(undefined),
    };

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
    expect(refreshTokenModel.deleteMany).toHaveBeenCalledWith({
      user_id: new Types.ObjectId(userId),
    });
    // Không được sinh token mới trong tình huống này
    expect(generateTokenPairSpy).not.toHaveBeenCalled();
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

    expect(stored.save).not.toHaveBeenCalled();
  });

  it('token hợp lệ, tài khoản active -> đánh dấu revoked, lưu lại, sinh token pair MỚI', async () => {
    const stored = makeStoredToken();
    refreshTokenModel.findOne.mockResolvedValue(stored);
    const getSubject = jest.fn().mockResolvedValue(activeSubject);

    const result = await service.rotateRefreshToken(rawToken, meta, getSubject);

    expect(stored.is_revoked).toBe(true);
    expect(stored.save).toHaveBeenCalledTimes(1);
    expect(getSubject).toHaveBeenCalledWith(userId);
    expect(generateTokenPairSpy).toHaveBeenCalledWith(activeSubject, meta);
    expect(result).toEqual({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
    });
  });
});
