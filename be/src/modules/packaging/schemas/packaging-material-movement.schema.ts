import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const MATERIAL_MOVEMENT_REASONS = ['stock_in', 'pack'] as const;
export type MaterialMovementReason = (typeof MATERIAL_MOVEMENT_REASONS)[number];

/**
 * ===================================================================
 * packaging_material_movements — MỚI (28/09/2026, P1) — sổ xuất/nhập vật tư
 * ===================================================================
 * Mỗi lần tồn vật tư đổi (nhập hàng, đóng gói xong) ghi đúng 1 dòng, cùng
 * transaction với lệnh $inc trên packaging_materials. Tách khỏi sổ thùng
 * (packaging_stock_movements) để không phải đổi enum/khóa của sổ đó.
 * ===================================================================
 */
@Schema({
  collection: 'packaging_material_movements',
  timestamps: { createdAt: 'created_at', updatedAt: false },
})
export class PackagingMaterialMovement {
  @Prop({ type: Types.ObjectId, required: true })
  material_id!: Types.ObjectId;

  @Prop({ type: String, required: true })
  material_code!: string;

  /** + nhập, − xuất */
  @Prop({ type: Number, required: true })
  delta!: number;

  @Prop({ type: String, enum: MATERIAL_MOVEMENT_REASONS, required: true })
  reason!: MaterialMovementReason;

  @Prop({ type: Number, required: true, min: 0 })
  balance_after!: number;

  @Prop({ type: Types.ObjectId, default: null })
  order_group_id!: Types.ObjectId | null;

  /** Bản ghi cũ (trước 04/10/2026): phương án trong `packaging_recommendations`. */
  @Prop({ type: Types.ObjectId, default: null })
  recommendation_id!: Types.ObjectId | null;

  /** (04/10/2026) Kế hoạch `packing_plans` + số kiện đã dùng thùng/vật tư này. */
  @Prop({ type: Types.ObjectId, default: null })
  packing_plan_id!: Types.ObjectId | null;

  @Prop({ type: Number, default: null })
  parcel_no!: number | null;

  @Prop({ type: Types.ObjectId, default: null })
  user_id!: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  note!: string | null;

  created_at?: Date;
}

export type PackagingMaterialMovementDocument = HydratedDocument<PackagingMaterialMovement>;
export const PackagingMaterialMovementSchema = SchemaFactory.createForClass(PackagingMaterialMovement);

// Phục vụ: GET /packaging/materials/:id/movements (mới nhất trước).
PackagingMaterialMovementSchema.index({ material_id: 1, created_at: -1 });
