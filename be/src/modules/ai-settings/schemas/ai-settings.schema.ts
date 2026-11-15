import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { AI_PROVIDER_VALUES, type AiProviderKey } from '../ai-settings.presets';

/**
 * 13/11/2026 — Cấu hình AI do Admin nhập trên web (thay cho biến AI_* cứng trong .env).
 * Chỉ có 1 document (`key: 'default'`). Chưa có document hoặc chưa có key → dùng .env như cũ.
 * API key lưu mã hoá AES-256-GCM (TOKEN_ENCRYPTION_KEY), không bao giờ trả ra API.
 */
@Schema({ collection: 'ai_settings', timestamps: true })
export class AiSettings {
  @Prop({ type: String, required: true, default: 'default' }) key!: string;
  @Prop({ type: String, required: true, enum: AI_PROVIDER_VALUES }) provider!: AiProviderKey;
  @Prop({ type: String, required: true }) base_url!: string;
  @Prop({ type: String, required: true }) model!: string;
  /** Model đọc ảnh phiếu NCC; null = dùng `model`. */
  @Prop({ type: String, default: null }) vision_model!: string | null;
  /** "iv:tag:cipher" (hex). null = chưa nhập key → AI tắt (câu mẫu / nhập tay). */
  @Prop({ type: String, default: null }) api_key_enc!: string | null;
  /** 4 ký tự cuối của key, để Admin nhận ra key nào đang dùng. */
  @Prop({ type: String, default: null }) api_key_last4!: string | null;
  @Prop({ type: Number, required: true }) timeout_ms!: number;
  @Prop({ type: SchemaTypes.ObjectId, default: null }) updated_by!: Types.ObjectId | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type AiSettingsDocument = HydratedDocument<AiSettings>;
export const AiSettingsSchema = SchemaFactory.createForClass(AiSettings);
AiSettingsSchema.index({ key: 1 }, { unique: true });
