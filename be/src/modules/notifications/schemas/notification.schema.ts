import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { UserRole } from '../../../common/enums/user-role.enum';
import { NotificationType } from '../enums/notification-type.enum';

/**
 * ===================================================================
 * notifications — MỚI (2026-09-10)
 * ===================================================================
 * recipient_user_id HOẶC recipient_role — CHỈ 1 trong 2 có giá trị:
 * gửi đích danh 1 người, hoặc broadcast cho cả 1 role (VD mọi
 * Packaging Staff đều thấy thông báo group nào đang chờ duyệt).
 * ===================================================================
 */
@Schema({ collection: 'notifications', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class Notification {
  @Prop({ type: Types.ObjectId, default: null, index: true })
  recipient_user_id!: Types.ObjectId | null;

  @Prop({ type: String, enum: UserRole, default: null })
  recipient_role!: UserRole | null;

  @Prop({ type: String, enum: NotificationType, required: true })
  type!: NotificationType;

  @Prop({ type: String, enum: ['info', 'warning', 'critical'], required: true })
  severity!: 'info' | 'warning' | 'critical';

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  message!: string;

  @Prop({ type: String, default: null })
  related_entity_type!: string | null;

  @Prop({ type: Types.ObjectId, default: null })
  related_entity_id!: Types.ObjectId | null;

  @Prop({ default: false, index: true })
  is_read!: boolean;

  // Audit đã gửi qua kênh nào — user yêu cầu TẤT CẢ kênh (in-app +
  // Dashboard + email). 'in_app' luôn có (chính document này); 'email'
  // chỉ thêm khi gửi mail thành công thật.
  @Prop({ type: [String], default: ['in_app'] })
  channels_sent!: string[];

  created_at?: Date;
}

export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ recipient_user_id: 1, is_read: 1, created_at: -1 });
NotificationSchema.index({ recipient_role: 1, is_read: 1, created_at: -1 });
