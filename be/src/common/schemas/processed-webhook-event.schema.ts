import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MarketplacePlatform } from '../../modules/marketplace-integration/enums/platform.enum';

/**
 * ===================================================================
 * processed_webhook_events — CHUẨN BỊ SẴN cho TikTok/Tiki, Lazada
 * KHÔNG dùng bảng này (polling tự chống trùng qua upsert theo
 * platform_order_id, xem orders.service.ts — KHÔNG đụng).
 * ===================================================================
 * LÝ DO cần: Webhook (TikTok) và Event Queue (Tiki) chỉ đảm bảo
 * "at-least-once delivery" theo chuẩn ngành — CÙNG 1 sự kiện có thể
 * tới 2 lần (network retry phía sàn). Không chống trùng tường minh có
 * thể tạo 2 order_group cho cùng 1 đơn do race condition.
 *
 * Chưa có consumer nào GỌI tới collection này ở lượt code này (vì
 * TikTok/Tiki webhook receiver chưa tồn tại) — đây là hạ tầng ĐI
 * TRƯỚC, sẵn sàng dùng ngay khi viết TikTokWebhookController, không
 * cần thiết kế lại DB lúc đó.
 * ===================================================================
 */
@Schema({ collection: 'processed_webhook_events', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class ProcessedWebhookEvent {
  @Prop({ type: String, enum: MarketplacePlatform, required: true })
  platform!: MarketplacePlatform;

  @Prop({ required: true })
  event_id!: string;

  created_at?: Date;
}

export type ProcessedWebhookEventDocument = HydratedDocument<ProcessedWebhookEvent>;
export const ProcessedWebhookEventSchema = SchemaFactory.createForClass(ProcessedWebhookEvent);

ProcessedWebhookEventSchema.index({ platform: 1, event_id: 1 }, { unique: true });
// TTL 7 ngày — chỉ cần chống trùng ngắn hạn, tự dọn, không cần cron riêng.
ProcessedWebhookEventSchema.index({ created_at: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });
