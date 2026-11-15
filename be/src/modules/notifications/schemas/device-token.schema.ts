import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export const DEVICE_PLATFORMS = ['android', 'ios'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

/**
 * 10/11/2026 — Thiết bị nhận push (BE_MOBILE_CHECKLIST mục 3). Một người dùng nhiều máy;
 * một token chỉ thuộc 1 người (đăng nhập tài khoản khác trên cùng máy → token chuyển chủ).
 */
@Schema({ collection: 'device_tokens', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class DeviceToken {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  user_id!: Types.ObjectId;

  @Prop({ type: String, required: true, unique: true })
  token!: string;

  @Prop({ type: String, enum: DEVICE_PLATFORMS, required: true })
  platform!: DevicePlatform;

  @Prop({ type: String, default: null })
  app_version!: string | null;

  @Prop({ type: Date, required: true })
  last_seen_at!: Date;

  created_at?: Date;
  updated_at?: Date;
}

export type DeviceTokenDocument = HydratedDocument<DeviceToken>;
export const DeviceTokenSchema = SchemaFactory.createForClass(DeviceToken);
