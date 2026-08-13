import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({
  collection: 'refresh_tokens',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class RefreshToken {
  //!=============================================
  // FIX #1: Đổi từ lưu PLAINTEXT sang lưu HASH (SHA-256, 64 ký tự cố định).
  // Xem TokenService.hashToken() — token gốc KHÔNG BAO GIỜ chạm tới DB.
  // FIX #8 (phụ): hash cố định độ dài cũng nhẹ hơn cho index so với JWT dài 200-500 ký tự.
  //!=============================================
  @Prop({ required: true })
  token_hash!: string;

  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  user_id!: Types.ObjectId;

  @Prop({ required: true })
  iat!: Date;

  @Prop({ required: true })
  exp!: Date;

  @Prop({ required: true })
  user_role!: string;

  //!=============================================
  // FIX #5: Đánh dấu "đã rotate" thay vì xóa ngay — nếu token này bị dùng lại
  // sau khi đã revoked, đó là dấu hiệu bị đánh cắp (reuse detection).
  //!=============================================
  @Prop({ default: false })
  is_revoked!: boolean;

  //!=============================================
  // FIX #20: Metadata thiết bị — phục vụ phát hiện truy cập bất thường,
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
// FIX #9: TTL index — MongoDB TỰ ĐỘNG xóa document khi tới thời điểm `exp`,
// không cần đợi có request nào đó chủ động dùng token hết hạn mới bị dọn dẹp.
//!=============================================
RefreshTokenSchema.index({ exp: 1 }, { expireAfterSeconds: 0 });
