import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const MOVEMENT_TYPES = [
  'assign_initial', // tồn ban đầu khi gán SKU vào ô
  'receive', // nhập thêm hàng (restock)
  'pick', // nhân viên quét lấy hàng cho đơn
  'adjust', // điều chỉnh kiểm kê (delta có thể = 0: kiểm kê khớp)
  'transfer_out', // chuyển đi ô khác
  'transfer_in', // nhận từ ô khác
  'return_restock', // G3 — hàng trả/hoàn đạt kiểm tra, nhập lại
  'pick_cancel', // (04/10/2026) hủy lượt lấy hàng (decide-partial từ chối) — trả hàng đã quét về đúng ô
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export enum StockAdjustReason {
  COUNT_CORRECTION = 'count_correction', // đếm sai lần trước
  DAMAGED = 'damaged',
  LOST = 'lost',
  FOUND = 'found', // tìm thấy hàng thừa
  OTHER = 'other', // bắt buộc ghi chú
}

/**
 * K3 (27/09/2026) — SỔ CÁI BIẾN ĐỘNG KHO. APPEND-ONLY: code không có đường
 * nào sửa/xóa dòng sổ cái. Mọi thay đổi quantity_on_hand PHẢI ghi 1 dòng ở
 * đây, cùng transaction với thay đổi đó -> luôn trả lời được "vì sao ô này
 * còn 12 cái, ai đổi, lúc nào". Trước K3: chỉ lấy hàng có nhật ký (pick_events).
 */
@Schema({ collection: 'inventory_movements', timestamps: false })
export class InventoryMovement {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Warehouse' })
  warehouse_id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'SkuBinAssignment' })
  assignment_id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'BinLocation' })
  bin_location_id!: Types.ObjectId;

  @Prop({ required: true }) platform!: string;
  @Prop({ required: true }) shop_id!: string;
  @Prop({ required: true }) seller_sku!: string;
  @Prop({ type: String, default: null }) master_sku!: string | null; // K4b

  @Prop({ type: String, enum: MOVEMENT_TYPES, required: true })
  type!: MovementType;

  @Prop({ type: Number, required: true }) delta!: number; // + nhập, - xuất
  @Prop({ type: Number, required: true }) quantity_before!: number;
  @Prop({ type: Number, required: true }) quantity_after!: number;

  @Prop({ type: String, default: null }) reason_code!: string | null;
  @Prop({ type: String, default: null }) note!: string | null;

  // Liên kết chứng từ: order_group (pick), transfer (cặp out/in), return_request (G3)
  @Prop({ type: String, default: null }) ref_type!: string | null;
  @Prop({ type: String, default: null }) ref_id!: string | null;

  @Prop({ type: String, required: true }) actor_id!: string;
  @Prop({ type: Date, required: true }) created_at!: Date;
}

export type InventoryMovementDocument = HydratedDocument<InventoryMovement>;
export const InventoryMovementSchema = SchemaFactory.createForClass(InventoryMovement);
InventoryMovementSchema.index({ assignment_id: 1, created_at: -1 });
InventoryMovementSchema.index({ warehouse_id: 1, seller_sku: 1, created_at: -1 });
