import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Connection, Model, Types } from 'mongoose';
import { RedisCacheService } from '../../../common/redis/redis-cache.service';
import { UserRole } from '../../../common/enums/user-role.enum';
import { MailService } from '../../mail/mail.service';
import { TokenService } from '../../auth/services/token.service';
import { AdminUpdateUserDto } from '../dto/admin-update-user.dto';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
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

// hạn đổi mật khẩu — 72 giờ kể từ lúc must_change_password bật lên
const MUST_CHANGE_PASSWORD_WINDOW_MS = 72 * 60 * 60 * 1000;

@Injectable()
export class UsersService {
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCK_DURATION_MS = 15 * 60 * 1000; // 15 phút

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    // FIX #33: cần Connection để mở Mongoose transaction (session) khi 1 thao
    // tác nghiệp vụ ghi nhiều hơn 1 collection (User + RefreshToken) - đảm
    // bảo tất cả cùng thành công hoặc cùng bị hủy, không để nửa vời.
    @InjectConnection()
    private readonly connection: Connection,
    private readonly tokenService: TokenService,
    private readonly redisCache: RedisCacheService,
    private readonly mailService: MailService,
  ) {}

  //!=============================================
  // 1. ADMIN TẠO TÀI KHOẢN NHÂN VIÊN
  //!=============================================
  async createByAdmin(createDto: CreateUserDto, adminId: string): Promise<CreatedUserResult> {
    const existing = await this.userModel.findOne({
      email: createDto.email,
      is_active: true, //  chỉ chặn trùng với tài khoản CÒN hoạt động
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
      //bắt đầu đếm 72h ngay từ lúc tạo tài khoản
      must_change_password_by: new Date(Date.now() + MUST_CHANGE_PASSWORD_WINDOW_MS),
      created_by: new Types.ObjectId(adminId),
    });

    void this.mailService.sendWelcomeTempPassword({
      to: user.email,
      name: user.name,
      temporaryPassword,
    });

    return { user, temporaryPassword };
  }

  //!=============================================
  // 2. TRUY VẤN
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
  // phân trang
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
        .select('-password -mfa_secret -mfa_backup_codes -reset_password_token_hash')
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
      must_change_password_by: null,
    });
  }

  //!=============================================
  // FIX #15: Admin reset mật khẩu hộ nhân viên. Đồng thời thu hồi mọi session
  // cũ của user đó. Cũng chính là cách Admin "mở khóa" 1 tài khoản
  // đã bị khóa cứng do quá hạn 72h — vì hàm này set lại
  // must_change_password_by mới, xóa trạng thái khóa cũ.
  //!=============================================
  async adminResetPassword(userId: string): Promise<{ temporaryPassword: string }> {
    const temporaryPassword = this.generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

    //!=============================================
    // FIX #33: bọc 2 thao tác ghi (User + RefreshToken) trong 1 Mongoose
    // transaction - hoặc cả 2 cùng thành công, hoặc MongoDB tự rollback hết,
    // không để xảy ra tình huống đổi password xong nhưng chưa kịp revoke
    // token cũ (xem giải thích transaction trong CLAUDE.md, mục Database
    // Design Standards).
    //
    // STRICT FIX: KHÔNG dùng biến `let user: UserDocument | null` khai NGOÀI
    // rồi gán bên TRONG closure của withTransaction() như bản cũ - TypeScript
    // không narrow được kiểu chính xác qua ranh giới closure (dù logic đúng
    // lúc runtime, compiler vẫn coi `user` có thể là `null`/`never` sau đó,
    // gây lỗi "unsafe assignment"/"unnecessary conditional" dây chuyền).
    // Cách đúng: để callback TRẢ VỀ document qua return - withTransaction()
    // của Mongoose forward đúng giá trị return đó ra ngoài với kiểu chính
    // xác, không cần biến trung gian nào cả.
    //!=============================================
    const session = await this.connection.startSession();
    let user: UserDocument;

    try {
      user = await session.withTransaction(async () => {
        const updated = await this.userModel.findByIdAndUpdate(
          userId,
          {
            password: hashedPassword,
            must_change_password: true,
            must_change_password_by: new Date(Date.now() + MUST_CHANGE_PASSWORD_WINDOW_MS),
            failed_login_attempts: 0,
            locked_until: null,
          },
          { new: true, session },
        );
        if (!updated) throw new NotFoundException('Không tìm thấy người dùng');

        await this.tokenService.revokeAllForUser(userId, session);
        return updated;
      });
    } finally {
      await session.endSession();
    }

    //!=============================================
    // Redis KHÔNG nằm trong Mongoose transaction (khác hệ CSDL) - chỉ nên
    // xóa cache SAU KHI transaction Mongo đã commit thành công, tránh xóa
    // cache rồi lại phải rollback Mongo (thứ tự này an toàn hơn ngược lại).
    //!=============================================
    await this.redisCache.invalidateUserAuthState(userId);

    void this.mailService.sendWelcomeTempPassword({
      to: user.email,
      name: user.name,
      temporaryPassword,
    });

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
  // Account lockout — đếm login sai liên tiếp, khóa 15 phút sau 5 lần sai.
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
  // Kiểm tra xem user có đang quá hạn 72h chưa đổi mật khẩu không —
  // dùng ở AuthService.login() để chặn NGAY LÚC ĐANG login (JwtStrategy chỉ
  // chặn được các request SAU KHI đã có token, còn login() phải tự kiểm tra
  // vì lúc đó CHƯA CÓ token để JwtStrategy chạy).
  //!=============================================
  isPastPasswordDeadline(user: UserDocument): boolean {
    return !!(
      user.must_change_password &&
      user.must_change_password_by &&
      user.must_change_password_by.getTime() < Date.now()
    );
  }

  //!=============================================
  // Quản lý MFA secret — dùng bởi AuthService khi setup/verify/login
  //!=============================================
  async setPendingMfaSecret(userId: string, secret: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { mfa_secret: secret, mfa_enabled: false });
  }

  async enableMfa(userId: string, hashedBackupCodes: string[]): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      mfa_enabled: true,
      mfa_backup_codes: hashedBackupCodes,
    });
  }

  //!=============================================
  //Xóa đúng 1 mã backup vừa dùng khỏi mảng (chống dùng lại) —
  // truyền vào index đã xác định bởi MfaService.verifyBackupCode().
  //!=============================================
  async consumeBackupCode(userId: string, usedIndex: number): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) return;
    user.mfa_backup_codes.splice(usedIndex, 1);
    await user.save();
  }

  //!=============================================
  // Admin tắt MFA hộ user bị khóa (mất điện thoại, dùng hết mã dự
  // phòng). Xóa sạch secret + backup codes cũ — nếu user muốn bật lại, phải
  // setup MFA từ đầu 
  //!=============================================
  async adminDisableMfa(userId: string): Promise<void> {
    const user = await this.userModel.findByIdAndUpdate(userId, {
      mfa_enabled: false,
      mfa_secret: null,
      mfa_backup_codes: [],
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    await this.redisCache.invalidateUserAuthState(userId);
  }

  //!=============================================
  // User tự sửa hồ sơ (phone/address/avatar) — DÙNG DTO riêng, không
  // cho phép sửa email/role/is_active
  //!=============================================
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserDocument> {
    const user = await this.userModel.findByIdAndUpdate(userId, dto, { new: true });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }

  //!=============================================
  //Admin sửa thông tin user khác (tên, role, phone, address,
  // employee_code, department) — KHÔNG sửa được email/password qua đây.
  //!=============================================
  async adminUpdateUser(userId: string, dto: AdminUpdateUserDto): Promise<UserDocument> {
    const user = await this.userModel.findByIdAndUpdate(userId, dto, { new: true });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    await this.redisCache.invalidateUserAuthState(userId);
    return user;
  }


  async setPasswordResetToken(userId: string, tokenHash: string, expiresInMinutes: number): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      reset_password_token_hash: tokenHash,
      reset_password_expires: new Date(Date.now() + expiresInMinutes * 60 * 1000),
    });
  }

  async findByValidResetToken(tokenHash: string): Promise<UserDocument | null> {
    return this.userModel.findOne({
      reset_password_token_hash: tokenHash,
      reset_password_expires: { $gt: new Date() },
    });
  }

  async clearPasswordResetToken(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      reset_password_token_hash: null,
      reset_password_expires: null,
    });
  }

  async deactivate(userId: string): Promise<void> {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const user = await this.userModel.findByIdAndUpdate(
          userId,
          { is_active: false },
          { session },
        );
        if (!user) throw new NotFoundException('Không tìm thấy người dùng');

        await this.tokenService.revokeAllForUser(userId, session);
      });
    } finally {
      await session.endSession();
    }

    await this.redisCache.invalidateUserAuthState(userId);
  }

  async reactivate(userId: string): Promise<void> {
    const user = await this.userModel.findByIdAndUpdate(userId, { is_active: true });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    await this.redisCache.invalidateUserAuthState(userId);
  }

  private generateTemporaryPassword(): string {
    return randomBytes(9).toString('hex');
  }
}
