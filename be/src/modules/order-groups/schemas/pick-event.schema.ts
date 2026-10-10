import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

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
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
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

  // BỔ SUNG (21/09/2026, BE-4a) — lượt lấy hàng của group lúc quét.
  // Event cũ không có field → mặc định 0, khớp group cũ (pick_round 0).
  @Prop({ type: Number, default: 0, min: 0 })
  pick_round!: number;

  /**
   * BỔ SUNG (30/09/2026) — kho đã trừ tồn lúc quét. Cần để restock đúng kho khi
   * lượt lấy hàng bị hủy. Event cũ (trước 30/09) không có = null → không thể
   * tự nhập lại tồn (cần kho đối soát tay).
   */
  @Prop({ type: SchemaTypes.ObjectId, default: null })
  warehouse_id!: Types.ObjectId | null;

  /** BỔ SUNG (30/09/2026) — đã nhập lại tồn khi hủy lượt; chặn nhập lại 2 lần. */
  @Prop({ type: Date, default: null })
  restocked_at!: Date | null;
  /**
   * (05/10/2026) Loại sự kiện. `scan` = quét lấy hàng thật. Các loại còn lại do
   * khâu đóng gói ghi để số "đã lấy" của lượt luôn khớp hàng THẬT đang giữ:
   * - pack_issue (số ÂM): món hỏng/thiếu/sai bị loại lúc đóng.
   * - pack_replace (số DƯƠNG): món thay lấy từ kệ lúc đóng.
   * - unpack (số ÂM): món trả về kệ khi tháo kiện của đơn bị hủy.
   * - cancel_return (số ÂM): hàng đã lấy của đơn bị hủy TRƯỚC khi bắt đầu đóng, tự trả kệ.
   * Event điều chỉnh mang kho + ô của dòng tồn bị ảnh hưởng nên restockPickRound
   * cộng ròng đúng theo ô. Event cũ không có field → `scan`.
   */
  @Prop({ type: String, enum: ['scan', 'pack_issue', 'pack_replace', 'unpack', 'cancel_return', 'reject_return'], default: 'scan' })
  kind!: 'scan' | 'pack_issue' | 'pack_replace' | 'unpack' | 'cancel_return' | 'reject_return';

  // K3 (27/09/2026) — ô đã trừ tồn. Event cũ (trước K3) không có field này.
  @Prop({ type: SchemaTypes.ObjectId, default: null })
  bin_location_id?: Types.ObjectId | null;

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

// Phục vụ: cộng số đã lấy theo (group, lượt, SKU) — getActuallyPickedItemsForGroup/confirmPicked/pickItem.
PickEventSchema.index({ order_group_id: 1, pick_round: 1, seller_sku: 1 });
