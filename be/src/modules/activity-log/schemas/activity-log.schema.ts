import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/**
 * ===================================================================
 * SỔ HOẠT ĐỘNG CHUNG — 23/10/2026
 * ===================================================================
 * Ghi những thao tác TRƯỚC ĐÂY KHÔNG CÓ LỊCH SỬ (chỉ còn trạng thái cuối):
 * đổi trạng thái nhóm đơn, từng bước của phiếu trả hàng, người bán hủy đơn,
 * quyết định giao thiếu. Những việc đã có sổ riêng (sổ cái kho, mốc vận đơn,
 * vật liệu đóng gói, phiếu nhập, nhật ký phiên đóng gói) KHÔNG ghi lặp ở đây —
 * API lịch sử (`/history`) gộp tất cả các nguồn lại.
 *
 * Ghi CÙNG transaction với thao tác gốc khi có session → không có dòng "ma".
 * ===================================================================
 */
export const ACTIVITY_CATEGORIES = ['orders', 'picking', 'packing', 'shipping', 'returns', 'warehouse', 'packaging_materials', 'auth'] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

@Schema({ collection: 'activity_logs', timestamps: false })
export class ActivityLog {
  @Prop({ type: Date, required: true }) occurred_at!: Date;
  @Prop({ type: String, required: true, enum: ACTIVITY_CATEGORIES }) category!: ActivityCategory;
  /** Mã thao tác, VD `order_group.status_changed`, `return.approved`. */
  @Prop({ type: String, required: true }) action!: string;
  /** Câu mô tả tiếng Việt, hiển thị thẳng cho người dùng. */
  @Prop({ type: String, required: true }) summary!: string;
  /** Id người làm (ObjectId dạng chuỗi) hoặc `system` / `system:...`; null = không rõ (thao tác dây chuyền). */
  @Prop({ type: String, default: null }) actor_id!: string | null;
  @Prop({ type: SchemaTypes.ObjectId, default: null }) order_group_id!: Types.ObjectId | null;
  @Prop({ type: String, required: true }) entity_type!: string;
  @Prop({ type: SchemaTypes.ObjectId, default: null }) entity_id!: Types.ObjectId | null;
  /** Mã dễ đọc của đối tượng (mã phiếu trả RMA-…, mã đơn sàn…). */
  @Prop({ type: String, default: null }) entity_code!: string | null;
  @Prop({ type: String, default: null }) from_status!: string | null;
  @Prop({ type: String, default: null }) to_status!: string | null;
  @Prop({ type: [String], default: [] }) skus!: string[];
  @Prop({ type: Number, default: null }) quantity!: number | null;
  @Prop({ type: String, default: null }) note!: string | null;
}

export type ActivityLogDocument = HydratedDocument<ActivityLog>;
export const ActivityLogSchema = SchemaFactory.createForClass(ActivityLog);

// Trang lịch sử: theo loại + thời gian; dòng thời gian 1 đơn; lịch sử theo người làm.
ActivityLogSchema.index({ category: 1, occurred_at: -1 });
ActivityLogSchema.index({ order_group_id: 1, occurred_at: -1 });
ActivityLogSchema.index({ actor_id: 1, occurred_at: -1 });
