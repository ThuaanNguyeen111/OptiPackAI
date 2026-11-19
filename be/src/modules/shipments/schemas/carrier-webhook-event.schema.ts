import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/**
 * ===================================================================
 * carrier_webhook_events — C5 (14/10/2026): sổ chống xử lý trùng sự kiện hãng
 * ===================================================================
 * GHN có thể gửi lại cùng 1 sự kiện (gửi lại khi timeout/5xx). Khoá chống trùng
 * theo tài liệu GHN: `OrderCode + Type + Time` (+ Status cho chắc). Ghi TRƯỚC khi
 * xử lý; xử lý lỗi tạm thời thì xoá bản ghi để lần gửi lại của GHN được xử lý.
 * Nút mô phỏng và đồng bộ đi CÙNG đường này (nguồn khác nhau ở `source`).
 * AOFP-324: payload gốc tách sang `raw_payloads`; sổ tự xoá sau 30 ngày (TTL) — GHN chỉ
 * gửi lại trong 12 giờ nên 30 ngày đủ chống trùng.
 * ===================================================================
 */
@Schema({ collection: 'carrier_webhook_events', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class CarrierWebhookEvent {
  @Prop({ type: String, required: true, unique: true })
  dedupe_key!: string;

  @Prop({ type: String, required: true })
  carrier!: string; // 'ghn'

  @Prop({ type: String, required: true })
  source!: string; // carrier_webhook | carrier_sync | carrier_simulated | manual

  @Prop({ type: String, required: true, index: true })
  order_code!: string;

  @Prop({ type: String, default: null })
  type!: string | null;

  @Prop({ type: String, default: null })
  status!: string | null;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  shipment_id!: Types.ObjectId | null;

  @Prop({ type: String, required: true, default: 'processing' })
  result!: string; // processing | applied | ignored:<lý do>

  created_at?: Date;
  updated_at?: Date;
}

export type CarrierWebhookEventDocument = HydratedDocument<CarrierWebhookEvent>;
export const CarrierWebhookEventSchema = SchemaFactory.createForClass(CarrierWebhookEvent);
export const CARRIER_WEBHOOK_EVENT_TTL_SECONDS = 30 * 24 * 60 * 60;
CarrierWebhookEventSchema.index({ created_at: 1 }, { expireAfterSeconds: CARRIER_WEBHOOK_EVENT_TTL_SECONDS });
