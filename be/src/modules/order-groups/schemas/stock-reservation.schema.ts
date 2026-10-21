import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/**
 * K5 (27/09/2026) — GIỮ CHỖ TỒN KHO cho 1 nhóm đơn trên 1 khóa tồn.
 * Khóa tồn = "M:<SKU nội bộ>" nếu SKU sàn đã nối (K4b), ngược lại "S:<sàn>|<shop>|<SKU sàn>".
 * quantity_reserved giảm dần khi quét hàng (pick-item), phần còn lại được nhả khi nhóm đơn "picked".
 */
@Schema({ collection: 'stock_reservations', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class StockReservation {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) order_group_id!: Types.ObjectId;
  @Prop({ required: true, index: true }) stock_key!: string;
  @Prop({ type: String, default: null }) master_sku!: string | null;
  @Prop({ required: true }) platform!: string;
  @Prop({ required: true }) shop_id!: string;
  @Prop({ required: true }) seller_sku!: string;
  @Prop({ type: Number, required: true, min: 0 }) quantity_needed!: number;
  @Prop({ type: Number, default: 0, min: 0 }) quantity_picked!: number;
  @Prop({ type: Number, default: 0, min: 0 }) quantity_reserved!: number; // đang giữ (chưa quét)
  @Prop({ type: String, enum: ['active', 'released'], default: 'active' }) status!: 'active' | 'released';
  // 21/10/2026 — kho nhóm đơn sẽ lấy hàng. null = giữ chỗ cũ, tính trên tồn mọi kho.
  @Prop({ type: SchemaTypes.ObjectId, default: null }) warehouse_id!: Types.ObjectId | null;
  created_at?: Date;
  updated_at?: Date;
}
export type StockReservationDocument = HydratedDocument<StockReservation>;
export const StockReservationSchema = SchemaFactory.createForClass(StockReservation);
StockReservationSchema.index({ order_group_id: 1, stock_key: 1 }, { unique: true });

/**
 * K5 — TỔNG đang giữ của 1 khóa tồn. Cũng là "điểm khóa": mọi giao dịch giữ chỗ
 * trên cùng khóa đều GHI vào document này -> 2 giao dịch đồng thời đụng nhau thì
 * MongoDB báo xung đột ghi, withTransaction tự chạy lại bên thua -> bên đó đọc
 * được tổng mới -> KHÔNG BAO GIỜ giữ vượt tồn (chống "write skew").
 */
@Schema({ collection: 'stock_reservation_totals', timestamps: false })
export class StockReservationTotal {
  // = "<warehouse_id>|<stock_key>" (21/10/2026, giữ chỗ theo kho); dòng cũ = stock_key.
  @Prop({ type: String, required: true }) _id!: string;
  @Prop({ type: Number, default: 0 }) reserved!: number;
  @Prop({ type: Date, default: null }) touched_at!: Date | null;
  // 21/10/2026 — tra tổng đang giữ của 1 khóa tồn trên mọi kho (đẩy tồn sang sàn).
  @Prop({ type: String, default: null }) stock_key!: string | null;
  @Prop({ type: SchemaTypes.ObjectId, default: null }) warehouse_id!: Types.ObjectId | null;
}
export type StockReservationTotalDocument = HydratedDocument<StockReservationTotal>;
export const StockReservationTotalSchema = SchemaFactory.createForClass(StockReservationTotal);
// Phục vụ: StockReservationService.availability() cộng phần giữ chỗ của 1 khóa trên mọi kho.
StockReservationTotalSchema.index({ stock_key: 1 }, { partialFilterExpression: { stock_key: { $type: 'string' } } });
