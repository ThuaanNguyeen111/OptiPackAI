import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * raw_payloads — AOFP-324 (19/11/2026): payload gốc của webhook bên ngoài (quy tắc DB 4.17),
 * tách khỏi sổ chống trùng nghiệp vụ. Chỉ để tra cứu khi đối soát; tự xoá sau 30 ngày.
 * `payload` là chuỗi JSON (không dùng Mixed).
 */
@Schema({ collection: 'raw_payloads', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class RawPayload {
  @Prop({ type: String, required: true })
  source!: string; // 'ghn_webhook'

  /** Khoá nối sang sổ nghiệp vụ (với GHN: dedupe_key của carrier_webhook_events). */
  @Prop({ type: String, required: true, index: true })
  ref_key!: string;

  @Prop({ type: String, required: true })
  payload!: string;

  created_at?: Date;
}

export type RawPayloadDocument = HydratedDocument<RawPayload>;
export const RawPayloadSchema = SchemaFactory.createForClass(RawPayload);
export const RAW_PAYLOAD_TTL_SECONDS = 30 * 24 * 60 * 60;
RawPayloadSchema.index({ created_at: 1 }, { expireAfterSeconds: RAW_PAYLOAD_TTL_SECONDS });
