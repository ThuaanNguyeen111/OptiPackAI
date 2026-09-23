import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const STOCK_MOVEMENT_REASONS = ['stock_in', 'pack'] as const;
export type StockMovementReason = (typeof STOCK_MOVEMENT_REASONS)[number];

/**
 * ===================================================================
 * packaging_stock_movements — MỚI (22/09/2026) — sổ xuất/nhập thùng carton
 * ===================================================================
 * Mỗi lần tồn thùng đổi (nhập hàng, đóng gói xong) ghi đúng 1 dòng, cùng
 * transaction với lệnh $inc trên packaging_boxes. Log tăng dần theo thời
 * gian nên để collection riêng (Rule #2), không nhét mảng vào thùng.
 * ===================================================================
 */
@Schema({ collection: 'packaging_stock_movements', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class PackagingStockMovement {
  @Prop({ type: Types.ObjectId, required: true })
  box_id!: Types.ObjectId;

  @Prop({ type: String, required: true })
  box_code!: string;

  /** + nhập, − xuất */
  @Prop({ type: Number, required: true })
  delta!: number;

  @Prop({ type: String, enum: STOCK_MOVEMENT_REASONS, required: true })
  reason!: StockMovementReason;

  @Prop({ type: Number, required: true, min: 0 })
  balance_after!: number;

  @Prop({ type: Types.ObjectId, default: null })
  order_group_id!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null })
  recommendation_id!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null })
  user_id!: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  note!: string | null;

  created_at?: Date;
}

export type PackagingStockMovementDocument = HydratedDocument<PackagingStockMovement>;
export const PackagingStockMovementSchema = SchemaFactory.createForClass(PackagingStockMovement);

// Phục vụ: GET /packaging/boxes/:id/movements (mới nhất trước).
PackagingStockMovementSchema.index({ box_id: 1, created_at: -1 });
