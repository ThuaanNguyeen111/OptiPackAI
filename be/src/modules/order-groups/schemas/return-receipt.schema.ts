import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** 1 dòng nhận hoàn: số đạt chất lượng (nhập lại tồn) và số hư hỏng (không nhập). */
@Schema({ _id: false })
export class ReturnReceiptLine {
  @Prop({ type: String, required: true }) seller_sku!: string;
  @Prop({ type: Number, required: true, min: 0 }) good_quantity!: number;
  @Prop({ type: Number, required: true, min: 0 }) damaged_quantity!: number;
  @Prop({ type: String, default: null }) note!: string | null;
}
export const ReturnReceiptLineSchema = SchemaFactory.createForClass(ReturnReceiptLine);

/**
 * ===================================================================
 * return_receipts — MỚI (30/09/2026): kho nhận hàng hoàn, kiểm chất lượng
 * ===================================================================
 * `returned` trước đây chỉ là đổi trạng thái. Biên nhận này là bước còn thiếu:
 * nhân viên kho kiểm từng SKU, số ĐẠT được cộng lại tồn kho (`$inc` cùng
 * transaction), số HỎNG chỉ ghi nhận. Mỗi group chỉ có 1 biên nhận (unique) —
 * chặn nhập lại tồn 2 lần.
 * ===================================================================
 */
@Schema({ collection: 'return_receipts', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class ReturnReceipt {
  @Prop({ type: Types.ObjectId, required: true })
  order_group_id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  warehouse_id!: Types.ObjectId;

  @Prop({ type: [ReturnReceiptLineSchema], default: [] })
  lines!: ReturnReceiptLine[];

  @Prop({ type: Number, required: true, min: 0 })
  total_good!: number;

  @Prop({ type: Number, required: true, min: 0 })
  total_damaged!: number;

  @Prop({ type: Types.ObjectId, required: true })
  received_by!: Types.ObjectId;

  @Prop({ type: String, default: null })
  note!: string | null;

  created_at?: Date;
}

export type ReturnReceiptDocument = HydratedDocument<ReturnReceipt>;
export const ReturnReceiptSchema = SchemaFactory.createForClass(ReturnReceipt);

// 1 group = tối đa 1 biên nhận: chốt chặn nhập lại tồn 2 lần ở tầng DB (Rule #5).
ReturnReceiptSchema.index({ order_group_id: 1 }, { unique: true });
