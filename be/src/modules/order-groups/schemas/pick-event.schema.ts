import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * ===================================================================
 * pick_events — MỚI (2026-09-10), Điểm yếu #10 mục 4
 * ===================================================================
 * Ghi lại MỖI lần quét/nhập tay 1 SKU khi pick — 2 mục đích:
 *  1. Audit: scan_method ('barcode'|'manual') — biết lần nào quét
 *     thật, lần nào nhập tay dự phòng (BR-07, ghi log mọi hành động).
 *  2. Idempotency: client_event_id (sinh trên điện thoại LÚC quét) —
 *     nếu Mobile App gửi lại do mất mạng (offline-first, xem CLAUDE.md
 *     mục "Nghiên cứu dự phòng quét mã"), server nhận diện ĐÚNG là
 *     cùng 1 lần quét qua field này, KHÔNG trừ tồn kho 2 lần.
 * ===================================================================
 */
@Schema({ collection: 'pick_events', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class PickEvent {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  order_group_id!: Types.ObjectId;

  @Prop({ required: true })
  seller_sku!: string;

  @Prop({ required: true })
  scanned_quantity!: number;

  @Prop({ type: String, enum: ['barcode', 'manual'], required: true })
  scan_method!: 'barcode' | 'manual';

  // Nullable — chỉ Mobile App mới gửi (offline-sync retry cần), gọi
  // trực tiếp qua Swagger/web admin không bắt buộc có field này.
  // KHÔNG dùng index:true ở đây — index thật đã khai riêng bên dưới
  // (partialFilterExpression, cần cấu hình chi tiết hơn) — khai cả 2
  // chỗ gây warning trùng lặp Mongoose.
  @Prop({ type: String, default: null })
  client_event_id!: string | null;

  @Prop({ required: true })
  remaining_stock_after!: number;

  created_at?: Date;
}

export type PickEventDocument = HydratedDocument<PickEvent>;
export const PickEventSchema = SchemaFactory.createForClass(PickEvent);

// Unique CÓ ĐIỀU KIỆN — chỉ áp cho document có client_event_id (không
// null), cho phép nhiều lần quét KHÔNG có client_event_id (gọi trực
// tiếp từ Swagger/web) tồn tại song song không bị chặn nhầm.
PickEventSchema.index(
  { client_event_id: 1 },
  { unique: true, partialFilterExpression: { client_event_id: { $type: 'string' } } },
);
