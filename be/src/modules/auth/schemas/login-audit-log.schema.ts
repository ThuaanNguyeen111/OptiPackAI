import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

//!=============================================
// FIX #6: Audit log đăng nhập — ghi lại MỌI lần thử login, kể cả thất bại,
// phục vụ điều tra khi có sự cố bảo mật (ai truy cập, lúc nào, từ đâu).
//!=============================================
@Schema({
  collection: 'login_audit_logs',
  timestamps: { createdAt: 'created_at', updatedAt: false },
})
export class LoginAuditLog {
  @Prop({ type: Types.ObjectId, ref: 'User' })
  user_id?: Types.ObjectId; // null nếu email không tồn tại trong hệ thống

  @Prop({ required: true })
  email_attempted!: string;

  @Prop({ required: true })
  success!: boolean;

  @Prop()
  failure_reason?: string;

  @Prop()
  ip_address?: string;

  @Prop()
  user_agent?: string;
}

export type LoginAuditLogDocument = HydratedDocument<LoginAuditLog>;
export const LoginAuditLogSchema = SchemaFactory.createForClass(LoginAuditLog);

// Phục vụ: tra lịch sử đăng nhập của 1 user, mới nhất trước
LoginAuditLogSchema.index({ user_id: 1, created_at: -1 });
