import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PackagingApprovalStatus, PACKAGING_APPROVAL_STATUS_VALUES } from '../enums/packaging-approval-status.enum';

/**
 * Rule #1 (Database Design Standards) — sub-schema riêng, KHÔNG dùng
 * type: Object.
 */
@Schema({ _id: false })
export class BoxSize {
  @Prop({ required: true }) length_cm!: number;
  @Prop({ required: true }) width_cm!: number;
  @Prop({ required: true }) height_cm!: number;
}
export const BoxSizeSchema = SchemaFactory.createForClass(BoxSize);

/**
 * ===================================================================
 * packaging_recommendations — MỚI (2026-09-09), UC-03/UC-04 (Report 1)
 * ===================================================================
 * Chuẩn DB đã CHỐT SẴN từ trước (CLAUDE.md, mục "ĐÃ TRIỂN KHAI" phần
 * order_groups/product_master) — implement ĐÚNG như đã thiết kế, không
 * đổi ý giữa chừng:
 *  - Index { order_group_id: 1 } unique — 1 group chỉ có 1 recommendation
 *    is_active:true tại 1 thời điểm.
 *  - Reject (UC-04 Alt Flow) KHÔNG xóa cứng bản cũ — đánh is_active:false,
 *    tạo bản mới is_active:true — giữ lịch sử phục vụ audit BR-08.
 *  - Rule #22 (Canonical schema) — CHỈ chứa field chuẩn hóa chung, không
 *    field đặc thù sàn nào.
 * ===================================================================
 */
@Schema({
  collection: 'packaging_recommendations',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class PackagingRecommendationDoc {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  order_group_id!: Types.ObjectId;

  @Prop({ type: BoxSizeSchema, required: true })
  box_size!: BoxSize;

  @Prop({ required: true })
  material_type!: string;

  @Prop({ required: true })
  material_quantity!: number;

  @Prop({ required: true })
  estimated_shipping_cost_vnd!: number;

  @Prop({ required: true })
  computation_time_ms!: number;

  @Prop({ default: false })
  fallback_used!: boolean;

  @Prop({
    type: String,
    enum: PACKAGING_APPROVAL_STATUS_VALUES,
    default: PackagingApprovalStatus.PENDING,
  })
  approval_status!: PackagingApprovalStatus;

  // BR-07 (Report 1) — mọi hành động Approve/Adjust/Reject PHẢI gắn với
  // tài khoản đã login, không có chế độ ẩn danh.
  @Prop({ type: Types.ObjectId, default: null })
  approved_by!: Types.ObjectId | null;

  // BUG ĐÃ VÁ (2026-09-09, phát hiện lúc chạy Jest thật, KHÔNG lộ ra
  // qua tsc/eslint): @Prop() không khai `type:` tường minh khi field
  // là union `X | null` khiến @nestjs/mongoose không tự suy luận được
  // qua reflect-metadata lúc runtime — throw ngay lúc load module
  // ("Cannot determine a type for ... field"). PHẢI khai type tường
  // minh cho MỌI field union `| null`, không chỉ trường hợp Date.
  @Prop({ type: Date, default: null })
  approved_at!: Date | null;

  // Packaging Staff "Measure package weight" (đề bài) — cân THẬT, khác
  // estimated (AI/fallback tính lý thuyết). Dùng để tự phát hiện
  // "abnormal package" — xem mục is_abnormal bên dưới.
  @Prop({ type: Number, default: null })
  actual_measured_weight_kg!: number | null;

  @Prop({ default: false })
  is_abnormal!: boolean;

  // Rule #5 (unique constraint ở tầng DB, không chỉ ở service) — nhưng
  // KHÔNG unique tuyệt đối trên order_group_id (vì Reject tạo bản MỚI,
  // giữ bản cũ is_active:false) — unique CÓ ĐIỀU KIỆN qua partial index
  // bên dưới, chỉ áp cho bản đang active.
  @Prop({ default: true })
  is_active!: boolean;

  created_at?: Date;
  updated_at?: Date;
}

export type PackagingRecommendationDocument = HydratedDocument<PackagingRecommendationDoc>;
export const PackagingRecommendationSchema = SchemaFactory.createForClass(PackagingRecommendationDoc);

// Partial unique index — CHỈ áp ràng buộc "1 group = 1 bản active" cho
// document có is_active:true, cho phép nhiều bản is_active:false (lịch
// sử Reject) tồn tại song song mà không vi phạm unique.
PackagingRecommendationSchema.index(
  { order_group_id: 1 },
  { unique: true, partialFilterExpression: { is_active: true } },
);
// Rule #3 (ESR) — phục vụ màn hình Packaging Staff xem hàng đợi chờ duyệt.
PackagingRecommendationSchema.index({ approval_status: 1, created_at: -1 });
