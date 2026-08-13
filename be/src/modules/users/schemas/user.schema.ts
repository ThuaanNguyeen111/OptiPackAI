import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { LoginType, UserRole } from '../../../common/enums/user-role.enum';

@Schema({
  collection: 'users',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class User {
  @Prop({ required: true, trim: true })
  name!: string;

  //!=============================================
  // FIX #10: Bỏ unique: true đơn thuần — chuyển sang PARTIAL unique index bên dưới
  // để có thể tái sử dụng email của tài khoản đã bị vô hiệu hóa (is_active: false).
  //!=============================================
  @Prop({ required: true, lowercase: true, trim: true })
  email!: string;

  @Prop()
  password?: string;

  @Prop({ type: String, enum: Object.values(UserRole), required: true })
  role!: UserRole;

  @Prop({ default: '' })
  avatar!: string;

  @Prop({ type: String, enum: Object.values(LoginType), default: LoginType.LOCAL })
  login_type!: LoginType;

  @Prop({ default: true })
  must_change_password!: boolean;

  @Prop({ default: true })
  is_active!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  created_by?: Types.ObjectId;

  @Prop({ type: Date })
  last_login_at?: Date;

  //!=============================================
  // FIX #16: Account lockout — đếm số lần login sai liên tiếp, khóa tạm khi vượt ngưỡng
  //!=============================================
  @Prop({ default: 0 })
  failed_login_attempts!: number;

  @Prop({ type: Date })
  locked_until?: Date;

  //!=============================================
  // FIX #17: MFA (TOTP) — bắt buộc cho role Admin
  //!=============================================
  @Prop()
  mfa_secret?: string;

  @Prop({ default: false })
  mfa_enabled!: boolean;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

//!=============================================
// FIX #10: Partial unique index — chỉ enforce unique email trong phạm vi
// tài khoản CÒN HOẠT ĐỘNG (is_active: true). Cho phép tạo tài khoản mới với
// email đã từng thuộc về 1 tài khoản đã bị vô hiệu hóa trước đó.
//!=============================================
UserSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { is_active: true } },
);

// Phục vụ: UsersController.findAll?role=xxx&is_active=xxx
UserSchema.index({ role: 1, is_active: 1 });
