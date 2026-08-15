import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

//!=============================================
//Trusted Device — sau khi verify MFA đúng 1 lần trên 1 thiết bị,
// sinh 1 token riêng (KHÁC HẲN access/refresh token) lưu ở đây, hạn 30 ngày.
// Lần login sau, nếu client gửi kèm đúng token này trong LoginDto.device_token
// -> BỎ QUA yêu cầu nhập mã MFA (nhưng vẫn phải đúng password bình thường).
//!=============================================
@Schema({
  collection: 'trusted_devices',
  timestamps: { createdAt: 'created_at', updatedAt: false },
})
export class TrustedDevice {
  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  user_id!: Types.ObjectId;

  @Prop({ required: true })
  token_hash!: string;

  @Prop()
  user_agent?: string;

  @Prop({ required: true })
  expires_at!: Date;
}

export type TrustedDeviceDocument = HydratedDocument<TrustedDevice>;
export const TrustedDeviceSchema = SchemaFactory.createForClass(TrustedDevice);

// Phục vụ: AuthService tra token_hash lúc login để quyết định có bỏ qua MFA không
TrustedDeviceSchema.index({ token_hash: 1 }, { unique: true });
// Phục vụ: thu hồi toàn bộ thiết bị tin cậy của 1 user 
TrustedDeviceSchema.index({ user_id: 1 });
// TTL — quá 30 ngày MongoDB tự xóa, không cần dọn tay
TrustedDeviceSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
