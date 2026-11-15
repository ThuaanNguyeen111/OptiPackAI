import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import {
  OCR_STATUSES,
  ReceiptOcrCheckSchema,
  ReceiptOcrSnapshotSchema,
  type OcrStatus,
  type ReceiptOcrCheck,
  type ReceiptOcrSnapshot,
} from '../../receipt-ocr/schemas/receipt-ocr-scan.schema';

@Schema({ _id: false })
export class StockReceiptLine {
  @Prop({ type: SchemaTypes.ObjectId, required: true }) assignment_id!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) bin_location_id!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) lot_id!: Types.ObjectId;
  @Prop({ type: String, required: true }) platform!: string;
  @Prop({ type: String, required: true }) shop_id!: string;
  @Prop({ type: String, required: true }) seller_sku!: string;
  @Prop({ type: String, default: null }) master_sku!: string | null;
  @Prop({ type: Number, required: true, min: 1 }) quantity!: number;
}
export const StockReceiptLineSchema = SchemaFactory.createForClass(StockReceiptLine);

/**
 * ===================================================================
 * stock_receipts — PHIẾU NHẬP KHO (1 phiếu = 1 lô hàng, nhiều SKU) — 15/10/2026
 * ===================================================================
 * Append-only: không có route sửa/xoá phiếu. Nhập sai thì kiểm kê điều chỉnh.
 * Mỗi dòng sinh 1 lô (`stock_lots`) cùng `lot_code` + `received_at` của phiếu.
 * ===================================================================
 */
@Schema({ collection: 'stock_receipts', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class StockReceipt {
  @Prop({ type: String, required: true, unique: true }) receipt_code!: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'Warehouse' }) warehouse_id!: Types.ObjectId;
  @Prop({ type: String, required: true }) lot_code!: string;
  @Prop({ type: Date, required: true }) received_at!: Date;
  @Prop({ type: String, default: null }) supplier!: string | null;
  @Prop({ type: String, default: null }) note!: string | null;
  @Prop({ type: [StockReceiptLineSchema], default: [] }) lines!: StockReceiptLine[];
  @Prop({ type: Number, required: true, min: 1 }) total_quantity!: number;
  @Prop({ type: String, required: true }) created_by!: string;
  // 11/11/2026 — ảnh phiếu NCC (minh chứng) + đối chiếu OCR. Phiếu cũ / nhập nhanh: [] + not_checked.
  @Prop({ type: [String], default: [] }) document_photo_urls!: string[];
  @Prop({ type: String, enum: OCR_STATUSES, default: 'not_checked' }) ocr_status!: OcrStatus;
  @Prop({ type: SchemaTypes.ObjectId, default: null }) ocr_scan_id!: Types.ObjectId | null;
  @Prop({ type: ReceiptOcrSnapshotSchema, default: null }) ocr!: ReceiptOcrSnapshot | null;
  @Prop({ type: [ReceiptOcrCheckSchema], default: [] }) ocr_checks!: ReceiptOcrCheck[];
  created_at?: Date;
}

export type StockReceiptDocument = HydratedDocument<StockReceipt>;
export const StockReceiptSchema = SchemaFactory.createForClass(StockReceipt);
// GET .../receipts — danh sách phiếu của kho, mới nhất trước.
StockReceiptSchema.index({ warehouse_id: 1, received_at: -1 });
// 11/11/2026 — GET .../receipts?ocr_status=mismatch (danh sách phiếu lệch).
StockReceiptSchema.index({ warehouse_id: 1, ocr_status: 1, received_at: -1 });
// 13/11/2026 — GET /history: cửa sổ created_at mọi kho, sắp mới → cũ + đếm tổng.
StockReceiptSchema.index({ created_at: -1 });
