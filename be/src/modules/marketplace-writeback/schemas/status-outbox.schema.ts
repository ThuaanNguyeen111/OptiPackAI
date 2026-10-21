import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/**
 * 20/10/2026 — Hàng đợi ghi ngược trạng thái đơn lên sàn (hiện chỉ AURELLE).
 *
 * Một dòng = một sự kiện của NHÓM ĐƠN (đóng gói xong, bắt đầu giao, giao xong,
 * giao thất bại, hoàn về, kho nhận hàng hoàn). Lúc gửi mới tách ra từng đơn
 * của sàn trong nhóm, nên nhóm gộp nhiều đơn vẫn gửi đúng cho từng đơn.
 *
 * Ghi CÙNG transaction với thay đổi trạng thái gốc → không bao giờ có trạng
 * thái đã đổi mà thiếu dòng gửi; gửi lỗi không làm hỏng nghiệp vụ chính.
 */
export type StatusOutboxState = 'pending' | 'sent' | 'failed' | 'skipped';

@Schema({
  collection: 'marketplace_status_outbox',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class MarketplaceStatusOutbox {
  /** `order_status` (mặc định, cả dòng cũ) hoặc `return_status` (kết quả xử lý phiếu trả hàng của khách). */
  @Prop({ type: String, enum: ['order_status', 'return_status'], default: 'order_status' })
  kind!: 'order_status' | 'return_status';

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  order_group_id!: Types.ObjectId;

  /** Phiếu trả hàng gây ra sự kiện (chỉ `kind = return_status`). */
  @Prop({ type: SchemaTypes.ObjectId, default: null })
  return_request_id!: Types.ObjectId | null;

  /** Ghi chú kèm theo (lý do từ chối/hủy phiếu trả hàng). */
  @Prop({ type: String, default: null })
  note!: string | null;

  /** Vận đơn gây ra sự kiện (null với sự kiện chỉ ở mức nhóm, VD đóng gói xong). */
  @Prop({ type: SchemaTypes.ObjectId, default: null })
  shipment_id!: Types.ObjectId | null;

  /** order_status: packed|shipped|delivered|failed_delivery|shipped_back|returned. return_status: approved|rejected|received|closed|canceled. */
  @Prop({ type: String, required: true })
  status!: string;

  @Prop({ type: String, default: null })
  reason!: string | null;

  @Prop({ type: Date, required: true })
  event_time!: Date;

  /** Khóa chống ghi trùng khi enqueue lại; lúc gửi ghép thêm mã đơn sàn. */
  @Prop({ type: String, required: true })
  idempotency_key!: string;

  @Prop({ type: String, enum: ['pending', 'sent', 'failed', 'skipped'], default: 'pending' })
  state!: StatusOutboxState;

  @Prop({ type: Number, default: 0 })
  attempts!: number;

  @Prop({ type: Date, default: () => new Date() })
  next_attempt_at!: Date;

  @Prop({ type: String, default: null })
  last_error!: string | null;

  @Prop({ type: Date, default: null })
  sent_at!: Date | null;

  created_at?: Date;
  updated_at?: Date;
}

export type MarketplaceStatusOutboxDocument = HydratedDocument<MarketplaceStatusOutbox>;
export const MarketplaceStatusOutboxSchema = SchemaFactory.createForClass(MarketplaceStatusOutbox);

// Phục vụ: cron lấy lô cần gửi (state=pending, tới hạn thử lại), sắp theo thời điểm sự kiện.
MarketplaceStatusOutboxSchema.index({ state: 1, next_attempt_at: 1, event_time: 1 });
// Chống trùng: cùng sự kiện enqueue 2 lần chỉ còn 1 dòng.
MarketplaceStatusOutboxSchema.index({ idempotency_key: 1 }, { unique: true });
// Tra theo nhóm khi cần xem lịch sử gửi.
MarketplaceStatusOutboxSchema.index({ order_group_id: 1, event_time: 1 });
