import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { UserRole, USER_ROLE_VALUES } from '../../../common/enums/user-role.enum';

@Schema({
  collection: 'refresh_tokens',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class RefreshToken {

  @Prop({ required: true })
  token_hash!: string;

  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  user_id!: Types.ObjectId;

  @Prop({ required: true })
  iat!: Date;

  @Prop({ required: true })
  exp!: Date;

  @Prop({ type: Number, enum: USER_ROLE_VALUES, required: true })
  user_role!: UserRole;

  //!=============================================
  // Đánh dấu "đã rotate" thay vì xóa  — nếu token bị dùng lại
  // sau khi đã revoked (reuse detection).
  //!=============================================
  @Prop({ default: false })
  is_revoked!: boolean;

  //!=============================================
  // Metadata thiết bị — phục vụ phát hiện truy cập bất thường,
  // sau này có thể hiển thị "các phiên đăng nhập đang hoạt động" cho user.
  //!=============================================
  @Prop()
  ip_address?: string;

  @Prop()
  user_agent?: string;
}

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;
export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

// Phục vụ: TokenService.rotateRefreshToken / revokeToken tìm theo hash
RefreshTokenSchema.index({ token_hash: 1 }, { unique: true });
// Phục vụ: TokenService.revokeAllForUser xóa toàn bộ token của 1 user
RefreshTokenSchema.index({ user_id: 1 });

//!=============================================
//  TTL index — MongoDB TỰ ĐỘNG xóa document khi tới thời điểm `exp`,
// không cần đợi có request nào đó chủ động dùng token hết hạn mới bị dọn dẹp.
//!=============================================
RefreshTokenSchema.index({ exp: 1 }, { expireAfterSeconds: 0 });
