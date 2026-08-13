import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { RedisCacheService } from '../../../common/redis/redis-cache.service';
import { UserRole } from '../../../common/enums/user-role.enum';
import { TokenService } from '../../auth/services/token.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { User, UserDocument } from '../schemas/user.schema';

export interface CreatedUserResult {
  user: UserDocument;
  temporaryPassword: string;
}

export interface PaginatedUsers {
  data: UserDocument[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class UsersService {
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCK_DURATION_MS = 15 * 60 * 1000; // 15 phút

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly tokenService: TokenService,
    private readonly redisCache: RedisCacheService,
  ) {}

  //!=============================================
  // 1. ADMIN TẠO TÀI KHOẢN NHÂN VIÊN
  //!=============================================
  async createByAdmin(createDto: CreateUserDto, adminId: string): Promise<CreatedUserResult> {
    const existing = await this.userModel.findOne({
      email: createDto.email,
      is_active: true, // FIX #10: chỉ chặn trùng với tài khoản CÒN hoạt động
    });
    if (existing) {
      throw new ConflictException('Email này đã được sử dụng cho tài khoản khác');
    }

    const temporaryPassword = this.generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

    const user = await this.userModel.create({
      name: createDto.name,
      email: createDto.email,
      role: createDto.role,
      password: hashedPassword,
      must_change_password: true,
      created_by: new Types.ObjectId(adminId),
    });

    return { user, temporaryPassword };
  }

  //!=============================================
  // 2. TRUY VẤN
  //!=============================================
  //!=============================================
  // FIX: bỏ `async` — hàm chỉ return thẳng Promise, không await gì bên trong
  // -> @typescript-eslint/require-await coi async ở đây là thừa.
  //!=============================================
  findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase().trim() });
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }

  //!=============================================
  // FIX #11: Thêm phân trang — trước đây trả về TOÀN BỘ danh sách không giới hạn
  //!=============================================
  //!=============================================
  // FIX: filter role đổi từ `string` sang `UserRole` — Mongoose (v9) kiểm
  // tra kiểu filter rất chặt, field `role` trong schema là enum UserRole,
  // không chấp nhận string chung chung. Validate ở Controller trước khi
  // gọi xuống đây (xem users.controller.ts).
  //!=============================================
  async findAll(
    filters: { role?: UserRole; is_active?: boolean } = {},
    page = 1,
    limit = 20,
  ): Promise<PaginatedUsers> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.userModel
        .find(filters)
        .select('-password -mfa_secret')
        .skip(skip)
        .limit(limit),
      this.userModel.countDocuments(filters),
    ]);
    return { data, total, page, limit };
  }

  //!=============================================
  // 3. ĐỔI MẬT KHẨU (bắt buộc lần đầu, tự nguyện, hoặc Admin reset hộ)
  //!=============================================
  async changePassword(userId: string, newPassword: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await this.userModel.findByIdAndUpdate(userId, {
      password: hashedPassword,
      must_change_password: false,
    });
  }

  //!=============================================
  // FIX #15: Admin reset mật khẩu hộ nhân viên (trước đây KHÔNG có endpoint này —
  // nhân viên quên mật khẩu và không dùng Google sẽ bị kẹt hoàn toàn).
  // Đồng thời thu hồi mọi session cũ của user đó (FIX #4).
  //!=============================================
  async adminResetPassword(userId: string): Promise<{ temporaryPassword: string }> {
    const temporaryPassword = this.generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

    const user = await this.userModel.findByIdAndUpdate(userId, {
      password: hashedPassword,
      must_change_password: true,
      failed_login_attempts: 0,
      locked_until: null,
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    await this.tokenService.revokeAllForUser(userId);
    await this.redisCache.invalidateUserAuthState(userId);

    return { temporaryPassword };
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { last_login_at: new Date() });
  }

  async syncGoogleAvatar(user: UserDocument, googlePicture: string): Promise<void> {
    if (!user.avatar) {
      user.avatar = googlePicture;
      await user.save();
    }
  }

  //!=============================================
  // FIX #16: Account lockout — đếm login sai liên tiếp, khóa 15 phút sau 5 lần sai.
  // Dùng $inc atomic thay vì đọc-rồi-cộng để tránh race condition (Database
  // Design Standards #7).
  //!=============================================
  async incrementFailedLoginAttempts(userId: string): Promise<void> {
    const updated = await this.userModel.findByIdAndUpdate(
      userId,
      { $inc: { failed_login_attempts: 1 } },
      { new: true },
    );

    if (updated && updated.failed_login_attempts >= this.MAX_FAILED_ATTEMPTS) {
      await this.userModel.findByIdAndUpdate(userId, {
        locked_until: new Date(Date.now() + this.LOCK_DURATION_MS),
        failed_login_attempts: 0,
      });
    }
  }

  async resetFailedLoginAttempts(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      failed_login_attempts: 0,
      locked_until: null,
    });
  }

  isLocked(user: UserDocument): boolean {
    return !!(user.locked_until && user.locked_until.getTime() > Date.now());
  }

  //!=============================================
  // FIX #17: Quản lý MFA secret — dùng bởi AuthService khi setup/verify/login
  //!=============================================
  async setPendingMfaSecret(userId: string, secret: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { mfa_secret: secret, mfa_enabled: false });
  }

  async enableMfa(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { mfa_enabled: true });
  }

  //!=============================================
  // 4. XÓA MỀM
  //!=============================================
  async deactivate(userId: string): Promise<void> {
    const user = await this.userModel.findByIdAndUpdate(userId, { is_active: false });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    //!=============================================
    // FIX #4: Thu hồi toàn bộ session hiện có NGAY khi vô hiệu hóa tài khoản
    // FIX #7: Xóa cache auth state để lệnh khóa có hiệu lực tức thời, không đợi TTL
    //!=============================================
    await this.tokenService.revokeAllForUser(userId);
    await this.redisCache.invalidateUserAuthState(userId);
  }

  private generateTemporaryPassword(): string {
    return randomBytes(9).toString('hex');
  }
}
