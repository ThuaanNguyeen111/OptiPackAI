import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type MaterialCondition = 'new' | 'reused' | 'internal' | 'discarded';
export type MaterialMovementType = 'purchase' | 'consume' | 'recover' | 'internal_use' | 'discard' | 'waste';

/** G4 — sổ cái vật liệu đóng gói (append-only). Nguồn cho số liệu tiết kiệm. */
@Schema({ collection: 'packaging_movements', timestamps: false })
export class PackagingMovement {
  @Prop({ required: true, index: true }) material_code!: string;
  @Prop({ type: String, enum: ['new', 'reused', 'internal', 'discarded'], required: true }) condition!: MaterialCondition;
  @Prop({ type: String, enum: ['purchase', 'consume', 'recover', 'internal_use', 'discard', 'waste'], required: true }) type!: MaterialMovementType;
  // true = nhân viên dùng đúng thùng gợi ý; false = dùng thùng khác; null = không áp dụng
  @Prop({ type: Boolean, default: null }) followed_recommendation!: boolean | null;
  @Prop({ type: Number, required: true }) delta!: number;
  @Prop({ type: Number, default: 0 }) saving_vnd!: number; // > 0 khi DÙNG hàng tái sử dụng thay hàng mới
  @Prop({ type: String, default: null }) ref_type!: string | null; // order_group | return_request
  @Prop({ type: String, default: null }) ref_id!: string | null;
  @Prop({ type: String, default: null }) note!: string | null;
  @Prop({ required: true }) actor_id!: string;
  // Gộp thi_dev (04/10/2026) — trừ tồn theo từng kiện của kế hoạch đóng gói.
  @Prop({ type: SchemaTypes.ObjectId, default: null }) packing_plan_id!: Types.ObjectId | null;
  @Prop({ type: Number, default: null }) parcel_no!: number | null;
  // Tồn dùng được (mới + tái sử dụng) sau thao tác — cho màn sổ kho.
  @Prop({ type: Number, default: null }) balance_after!: number | null;
  @Prop({ type: Date, required: true }) created_at!: Date;
}
export type PackagingMovementDocument = HydratedDocument<PackagingMovement>;
export const PackagingMovementSchema = SchemaFactory.createForClass(PackagingMovement);
PackagingMovementSchema.index({ ref_type: 1, ref_id: 1, type: 1 });
PackagingMovementSchema.index({ material_code: 1, created_at: -1 });
