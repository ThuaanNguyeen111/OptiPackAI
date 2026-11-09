import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/**
 * ===================================================================
 * Bộ nhớ của AI viết hướng dẫn đóng gói (05/11/2026)
 * ===================================================================
 * - `packing_guide_logs`: mỗi lần viết hướng dẫn 1 bản ghi — đúng system
 *   prompt, JSON dữ kiện đã gửi, phản hồi thô, model, lý do dùng câu mẫu.
 *   Trả lời "dữ liệu nào đã đưa cho AI". TTL 30 ngày (nhật ký, không phải
 *   dữ liệu nghiệp vụ — CLAUDE.md §4.2).
 * - `packing_guide_examples`: hướng dẫn AI được nhân viên đóng gói chấm
 *   "dễ làm theo" — "dataset" few-shot do chính kho tạo ra (không fine-tune).
 *   Chấm lại "khó hiểu" thì xoá khỏi bộ ví dụ. Số lượng gửi kèm có trần.
 * Payload lưu dạng CHUỖI JSON đúng như gửi đi (không lưu Object vô định hình).
 * ===================================================================
 */

export const GUIDE_LOG_TTL_SECONDS = 30 * 24 * 60 * 60;

@Schema({ collection: 'packing_guide_logs', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class PackingGuideLog {
  @Prop({ type: SchemaTypes.ObjectId, required: true }) plan_id!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) order_group_id!: Types.ObjectId;
  @Prop({ type: Number, required: true }) parcel_no!: number;
  @Prop({ type: String, required: true, enum: ['ai', 'template'] }) source!: 'ai' | 'template';
  @Prop({ type: String, default: null }) ai_model!: string | null;
  @Prop({ type: String, default: null }) fallback_reason!: string | null;
  @Prop({ required: true }) system_prompt!: string;
  @Prop({ required: true }) user_payload!: string;
  @Prop({ type: String, default: null }) raw_response!: string | null;
  @Prop({ type: Number, default: 0 }) examples_used!: number;
  /** Mã kiện (plan_id:parcel_no) của các ví dụ mẫu đã gửi kèm. */
  @Prop({ type: [String], default: [] }) example_refs!: string[];
  @Prop({ type: Number, default: 0 }) latency_ms!: number;
  created_at?: Date;
}
export type PackingGuideLogDocument = HydratedDocument<PackingGuideLog>;
export const PackingGuideLogSchema = SchemaFactory.createForClass(PackingGuideLog);
PackingGuideLogSchema.index({ plan_id: 1, parcel_no: 1, created_at: -1 });
PackingGuideLogSchema.index({ created_at: 1 }, { expireAfterSeconds: GUIDE_LOG_TTL_SECONDS });

@Schema({ _id: false })
export class GuideExampleStep {
  @Prop({ type: Number, required: true }) step!: number;
  @Prop({ required: true }) instruction!: string;
  @Prop({ type: String, default: '' }) tip!: string;
}
export const GuideExampleStepSchema = SchemaFactory.createForClass(GuideExampleStep);

@Schema({ collection: 'packing_guide_examples', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class PackingGuideExample {
  @Prop({ type: SchemaTypes.ObjectId, required: true }) plan_id!: Types.ObjectId;
  @Prop({ type: Number, required: true }) parcel_no!: number;
  @Prop({ required: true }) box_code!: string;
  /** Loại sản phẩm trong kiện — chọn ví dụ gần giống kiện cần viết. */
  @Prop({ type: [String], default: [] }) product_types!: string[];
  @Prop({ type: Number, required: true }) step_count!: number;
  /** JSON {box, fill_ratio, materials, steps} đúng như đã gửi cho AI lúc viết. */
  @Prop({ required: true }) user_payload!: string;
  @Prop({ required: true }) summary!: string;
  @Prop({ type: [GuideExampleStepSchema], default: [] }) steps!: GuideExampleStep[];
  @Prop({ type: SchemaTypes.ObjectId, required: true }) rated_by!: Types.ObjectId;
  created_at?: Date;
}
export type PackingGuideExampleDocument = HydratedDocument<PackingGuideExample>;
export const PackingGuideExampleSchema = SchemaFactory.createForClass(PackingGuideExample);
PackingGuideExampleSchema.index({ plan_id: 1, parcel_no: 1 }, { unique: true });
PackingGuideExampleSchema.index({ step_count: 1, created_at: -1 });
