import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import {
  LoginType,
  USER_ROLE_VALUES,
  UserRole,
} from '../../../common/enums/user-role.enum';

@Schema({
  collection: 'users',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class User {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, lowercase: true, trim: true })
  email!: string;

  @Prop()
  password?: string;

  @Prop({ type: Number, enum: USER_ROLE_VALUES, required: true })
  role!: UserRole;

  @Prop({ default: '' })
  avatar!: string;

  @Prop({
    type: String,
    enum: Object.values(LoginType),
    default: LoginType.LOCAL,
  })
  login_type!: LoginType;

  @Prop({ default: true })
  must_change_password!: boolean;

  @Prop({ default: true })
  is_active!: boolean;

  // 22/10/2026 — nghỉ phép: vẫn đăng nhập được, nhưng không được giao việc lấy hàng/đóng gói.
  // on_leave_until (tùy chọn) qua hạn thì tự tính là đi làm lại — xem users/utils/on-leave.util.ts.
  @Prop({ type: Boolean, default: false })
  on_leave!: boolean;

  @Prop({ type: Date, default: null })
  on_leave_until!: Date | null;

  @Prop({ type: String, default: null })
  on_leave_note!: string | null;

  @Prop({ type: Date, default: null })
  on_leave_since!: Date | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  created_by?: Types.ObjectId;

  @Prop({ type: Date })
  last_login_at?: Date;

  @Prop({ default: 0 })
  failed_login_attempts!: number;

  @Prop({ type: Date })
  locked_until?: Date;

  @Prop()
  mfa_secret?: string;

  @Prop({ default: false })
  mfa_enabled!: boolean;

  @Prop({ type: [String], default: [] })
  mfa_backup_codes!: string[];

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ trim: true })
  employee_code?: string;

  @Prop({ trim: true })
  department?: string;

  @Prop()
  reset_password_token_hash?: string;

  @Prop({ type: Date })
  reset_password_expires?: Date;

  @Prop({ type: Date })
  must_change_password_by?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

// ĐÃ THAY ĐỔI 2026-09-14 so với unique partial `{ is_active: true }`:
// trước đây cho phép tạo user MỚI trùng email tài khoản đã vô hiệu hóa.
// User yêu cầu chặn tuyệt đối — email là định danh, kể cả khi deactivate.
// Nếu Mongo báo IndexOptionsConflict lúc start: drop index cũ `email_1`
// trên collection `users` (Atlas) rồi restart app.
UserSchema.index({ email: 1 }, { unique: true });

UserSchema.index({ role: 1, is_active: 1 });
UserSchema.index(
  { employee_code: 1 },
  {
    unique: true,
    partialFilterExpression: { employee_code: { $type: 'string' } },
  },
);
