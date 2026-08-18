import { ConflictException, NotFoundException } from '@nestjs/common';
import { Connection, Types } from 'mongoose';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RedisCacheService } from '../../../common/redis/redis-cache.service';
import { TokenService } from '../../auth/services/token.service';
import { MailService } from '../../mail/mail.service';
import { UsersService } from './users.service';

//!=============================================
// FIX #38: Mock Model<UserDocument> KHÔNG dùng NestJS TestingModule (không
// cần dựng cả DI container chỉ để test 1 service) - tự new UsersService(...)
// trực tiếp với mock tay, đơn giản và nhanh hơn cho service không có logic
// decorator phức tạp cần Nest xử lý hộ.
//!=============================================
describe('UsersService', () => {
  let service: UsersService;
  let userModel: {
    findOne: jest.Mock;
    findById: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    create: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
  };
  let connection: { startSession: jest.Mock };
  let session: { withTransaction: jest.Mock; endSession: jest.Mock };
  let tokenService: jest.Mocked<Pick<TokenService, 'revokeAllForUser'>>;
  let redisCache: jest.Mocked<Pick<RedisCacheService, 'invalidateUserAuthState'>>;
  let mailService: jest.Mocked<Pick<MailService, 'sendWelcomeTempPassword'>>;

  const adminId = new Types.ObjectId().toHexString();
  const userId = new Types.ObjectId().toHexString();

  beforeEach(() => {
    userModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      create: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
    };

    // Mô phỏng session Mongoose: withTransaction chạy THẬT callback truyền
    // vào (giống hành vi thật) - nếu callback throw, mock cũng throw lại
    // đúng như session.withTransaction() thật sự làm sau khi rollback.
    session = {
      withTransaction: jest.fn(async (cb: () => Promise<void>) => cb()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection = { startSession: jest.fn().mockResolvedValue(session) };

    tokenService = { revokeAllForUser: jest.fn().mockResolvedValue(undefined) };
    redisCache = { invalidateUserAuthState: jest.fn().mockResolvedValue(undefined) };
    mailService = { sendWelcomeTempPassword: jest.fn().mockResolvedValue(undefined) };

    service = new UsersService(
      userModel as never,
      connection as unknown as Connection,
      tokenService as unknown as TokenService,
      redisCache as unknown as RedisCacheService,
      mailService as unknown as MailService,
    );
  });

  describe('createByAdmin', () => {
    it('email đã có tài khoản ĐANG hoạt động -> 409 Conflict, KHÔNG tạo user', async () => {
      userModel.findOne.mockResolvedValue({ _id: 'existing' });

      await expect(
        service.createByAdmin(
          { name: 'A', email: 'a@optipackai.com', role: UserRole.WAREHOUSE_STAFF },
          adminId,
        ),
      ).rejects.toThrow(ConflictException);

      expect(userModel.create).not.toHaveBeenCalled();
    });

    it('email chưa tồn tại -> tạo user, hash password, gửi mail chào mừng', async () => {
      userModel.findOne.mockResolvedValue(null);
      userModel.create.mockResolvedValue({
        id: userId,
        email: 'a@optipackai.com',
        name: 'A',
      });

      const result = await service.createByAdmin(
        { name: 'A', email: 'a@optipackai.com', role: UserRole.WAREHOUSE_STAFF },
        adminId,
      );

      expect(result.temporaryPassword).toBeTruthy();
      expect(userModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ must_change_password: true, role: UserRole.WAREHOUSE_STAFF }),
      );
      expect(mailService.sendWelcomeTempPassword).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@optipackai.com' }),
      );
    });
  });

  describe('adminResetPassword', () => {
    it('user tồn tại -> đổi password trong transaction, revoke token, xóa cache, gửi mail', async () => {
      userModel.findByIdAndUpdate.mockResolvedValue({
        id: userId,
        email: 'a@optipackai.com',
        name: 'A',
      });

      const result = await service.adminResetPassword(userId);

      expect(result.temporaryPassword).toBeTruthy();
      expect(session.withTransaction).toHaveBeenCalledTimes(1);
      expect(tokenService.revokeAllForUser).toHaveBeenCalledWith(userId, session);
      expect(redisCache.invalidateUserAuthState).toHaveBeenCalledWith(userId);
      expect(session.endSession).toHaveBeenCalledTimes(1);
    });

    it('user KHÔNG tồn tại -> 404, vẫn phải endSession (không rò rỉ session)', async () => {
      userModel.findByIdAndUpdate.mockResolvedValue(null);

      await expect(service.adminResetPassword(userId)).rejects.toThrow(NotFoundException);

      expect(session.endSession).toHaveBeenCalledTimes(1);
      expect(redisCache.invalidateUserAuthState).not.toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    it('user tồn tại -> is_active=false, revoke token trong transaction, xóa cache', async () => {
      userModel.findByIdAndUpdate.mockResolvedValue({ id: userId });

      await service.deactivate(userId);

      expect(session.withTransaction).toHaveBeenCalledTimes(1);
      expect(tokenService.revokeAllForUser).toHaveBeenCalledWith(userId, session);
      expect(redisCache.invalidateUserAuthState).toHaveBeenCalledWith(userId);
    });

    it('user KHÔNG tồn tại -> 404, transaction tự rollback (không gọi revoke)', async () => {
      userModel.findByIdAndUpdate.mockResolvedValue(null);

      await expect(service.deactivate(userId)).rejects.toThrow(NotFoundException);

      expect(tokenService.revokeAllForUser).not.toHaveBeenCalled();
      expect(session.endSession).toHaveBeenCalledTimes(1);
    });
  });

  describe('reactivate / adminDisableMfa / adminUpdateUser', () => {
    it('reactivate: user tồn tại -> is_active=true, xóa cache', async () => {
      userModel.findByIdAndUpdate.mockResolvedValue({ id: userId });
      await service.reactivate(userId);
      expect(redisCache.invalidateUserAuthState).toHaveBeenCalledWith(userId);
    });

    it('reactivate: user không tồn tại -> 404', async () => {
      userModel.findByIdAndUpdate.mockResolvedValue(null);
      await expect(service.reactivate(userId)).rejects.toThrow(NotFoundException);
    });

    it('adminDisableMfa: xóa sạch secret + backup codes, xóa cache', async () => {
      userModel.findByIdAndUpdate.mockResolvedValue({ id: userId });
      await service.adminDisableMfa(userId);

      expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ mfa_enabled: false, mfa_secret: null, mfa_backup_codes: [] }),
      );
      expect(redisCache.invalidateUserAuthState).toHaveBeenCalledWith(userId);
    });

    it('adminUpdateUser: cập nhật xong -> xóa cache Redis (vì role có thể đã đổi)', async () => {
      userModel.findByIdAndUpdate.mockResolvedValue({ id: userId, name: 'Tên mới' });

      await service.adminUpdateUser(userId, { name: 'Tên mới' });

      expect(redisCache.invalidateUserAuthState).toHaveBeenCalledWith(userId);
    });
  });

  describe('updateProfile', () => {
    it('user tồn tại -> cập nhật phone/address, KHÔNG đụng cache (role không đổi qua route này)', async () => {
      userModel.findByIdAndUpdate.mockResolvedValue({ id: userId, phone: '0900000000' });

      const result = await service.updateProfile(userId, { phone: '0900000000' });

      expect(result.phone).toBe('0900000000');
      expect(redisCache.invalidateUserAuthState).not.toHaveBeenCalled();
    });

    it('user không tồn tại -> 404', async () => {
      userModel.findByIdAndUpdate.mockResolvedValue(null);
      await expect(service.updateProfile(userId, { phone: '0900000000' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('consumeBackupCode', () => {
    it('xóa đúng 1 mã tại đúng vị trí index, lưu lại document', async () => {
      const saveMock = jest.fn().mockResolvedValue(undefined);
      //!=============================================
      // STRICT FIX: giữ tham chiếu TỪ ĐẦU bằng 1 biến đã khai kiểu rõ ràng,
      // KHÔNG gọi lại `await userModel.findById(...)` để "lấy user ra xem" -
      // vì userModel.findById là jest.Mock KHÔNG có generic, gọi await vào
      // nó luôn trả về `any` (unsafe assignment/member access). Test trước
      // đây còn SAI LUÔN CẢ assertion (so sánh với mảng CHƯA bị xóa phần tử
      // nào) - đã sửa lại đúng: sau khi consumeBackupCode(userId, 1), phần
      // tử ở index 1 ("hash-1") phải biến mất khỏi mảng.
      //!=============================================
      const mockUserDoc = {
        mfa_backup_codes: ['hash-0', 'hash-1', 'hash-2'],
        save: saveMock,
      };
      userModel.findById.mockResolvedValue(mockUserDoc);

      await service.consumeBackupCode(userId, 1);

      expect(mockUserDoc.mfa_backup_codes).toEqual(['hash-0', 'hash-2']);
      expect(saveMock).toHaveBeenCalled();
    });
  });

  describe('isPastPasswordDeadline', () => {
    it('must_change_password=false -> luôn false dù deadline đã qua', () => {
      const result = service.isPastPasswordDeadline({
        must_change_password: false,
        must_change_password_by: new Date(Date.now() - 1000),
      } as never);
      expect(result).toBe(false);
    });

    it('must_change_password=true, deadline CHƯA qua -> false', () => {
      const result = service.isPastPasswordDeadline({
        must_change_password: true,
        must_change_password_by: new Date(Date.now() + 60_000),
      } as never);
      expect(result).toBe(false);
    });

    it('must_change_password=true, deadline ĐÃ qua -> true', () => {
      const result = service.isPastPasswordDeadline({
        must_change_password: true,
        must_change_password_by: new Date(Date.now() - 60_000),
      } as never);
      expect(result).toBe(true);
    });
  });
});
