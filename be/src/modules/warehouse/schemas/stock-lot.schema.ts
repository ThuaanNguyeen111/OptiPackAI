import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export const STOCK_LOT_SOURCES = [
  'receipt', // nhập theo phiếu nhập (lô hàng)
  'initial', // tồn ban đầu khi gán SKU vào ô
  'opening', // tồn có TRƯỚC khi có lô (dữ liệu cũ) — tự tạo khi cần
  'count_found', // kiểm kê đếm thấy nhiều hơn
  'return', // hàng hoàn/trả kệ không rõ lô gốc
  'transfer', // chuyển từ ô khác — GIỮ nguyên ngày + mã lô gốc
] as const;
export type StockLotSource = (typeof STOCK_LOT_SOURCES)[number];

/**
 * ===================================================================
 * stock_lots — LÔ HÀNG trên 1 dòng tồn (SKU × ô) — 15/10/2026
 * ===================================================================
 * Thuận chốt: lấy hàng/đóng gói trừ LÔ CŨ NHẤT trước, "cũ" = NGÀY NHẬP KHO
 * (`received_at`) — FIFO. Hệ thống tự trừ, nhân viên không quét mã lô.
 *
 * `sku_bin_assignments.quantity_on_hand` VẪN là tổng tồn của ô (giữ chỗ K5, sức
 * chứa, Picking List đọc như cũ). Bất biến: Σ quantity_remaining các lô của 1
 * dòng tồn = quantity_on_hand. Dòng tồn có từ trước khi có lô được tự bù bằng lô
 * `opening` (xem stock-lot.ledger.ts) hoặc script backfill-stock-lots.ts.
 * Lô về 0 KHÔNG bị xoá — còn dùng để truy vết lô nào đã xuất cho đơn nào.
 * ===================================================================
 */
@Schema({ collection: 'stock_lots', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class StockLot {
  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'Warehouse' })
  warehouse_id!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'SkuBinAssignment' })
  assignment_id!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'BinLocation' })
  bin_location_id!: Types.ObjectId;

  @Prop({ type: String, required: true }) platform!: string;
  @Prop({ type: String, required: true }) shop_id!: string;
  @Prop({ type: String, required: true }) seller_sku!: string;
  @Prop({ type: String, default: null }) master_sku!: string | null;

  /** Mã lô: mặc định = mã phiếu nhập; chuyển ô giữ nguyên mã. */
  @Prop({ type: String, required: true }) lot_code!: string;

  /** Ngày nhập kho — khoá FIFO. */
  @Prop({ type: Date, required: true }) received_at!: Date;

  @Prop({ type: Number, required: true, min: 0 }) quantity_received!: number;
  @Prop({ type: Number, required: true, min: 0 }) quantity_remaining!: number;

  @Prop({ type: String, enum: STOCK_LOT_SOURCES, required: true })
  source!: StockLotSource;

  @Prop({ type: SchemaTypes.ObjectId, default: null, ref: 'StockReceipt' })
  receipt_id!: Types.ObjectId | null;

  @Prop({ type: String, default: null }) note!: string | null;

  created_at?: Date;
  updated_at?: Date;
}

export type StockLotDocument = HydratedDocument<StockLot>;
export const StockLotSchema = SchemaFactory.createForClass(StockLot);
// FIFO: các lô của 1 dòng tồn theo ngày nhập tăng dần.
StockLotSchema.index({ assignment_id: 1, received_at: 1, _id: 1 });
// Tra lô theo mã trong kho (màn "Tồn theo lô").
StockLotSchema.index({ warehouse_id: 1, lot_code: 1 });
// Xem tồn theo SKU nội bộ / SKU sàn.
StockLotSchema.index({ master_sku: 1, received_at: 1 }, { partialFilterExpression: { master_sku: { $type: 'string' } } });
StockLotSchema.index({ warehouse_id: 1, seller_sku: 1, received_at: 1 });

/**
 * Lô đã trừ/cộng cho 1 thao tác — lưu trên pick_events và inventory_movements để
 * trả hàng về đúng lô và truy vết. `quantity` luôn dương.
 */
@Schema({ _id: false })
export class LotAllocation {
  @Prop({ type: SchemaTypes.ObjectId, required: true }) lot_id!: Types.ObjectId;
  @Prop({ type: String, required: true }) lot_code!: string;
  @Prop({ type: Date, required: true }) received_at!: Date;
  @Prop({ type: Number, required: true, min: 0 }) quantity!: number;
}
export const LotAllocationSchema = SchemaFactory.createForClass(LotAllocation);
