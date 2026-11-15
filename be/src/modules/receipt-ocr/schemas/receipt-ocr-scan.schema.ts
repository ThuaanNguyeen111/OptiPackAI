import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** 1 dòng AI đọc được trên phiếu NCC. */
@Schema({ _id: false })
export class ReceiptOcrLine {
  @Prop({ type: String, required: true }) text!: string; // tên hàng như in trên phiếu
  @Prop({ type: String, default: null }) code!: string | null; // mã hàng / SKU in trên phiếu (nếu có)
  @Prop({ type: Number, required: true, min: 0 }) quantity!: number;
  @Prop({ type: String, default: null }) unit!: string | null;
}
export const ReceiptOcrLineSchema = SchemaFactory.createForClass(ReceiptOcrLine);

/** Bản sao kết quả OCR lưu kèm phiếu (scan gốc có TTL). */
@Schema({ _id: false })
export class ReceiptOcrSnapshot {
  @Prop({ type: String, required: true }) ai_model!: string; // `model` trùng method của Mongoose Document
  @Prop({ type: Date, required: true }) read_at!: Date;
  @Prop({ type: String, default: null }) supplier!: string | null;
  @Prop({ type: String, default: null }) document_date!: string | null;
  @Prop({ type: [ReceiptOcrLineSchema], default: [] }) lines!: ReceiptOcrLine[];
}
export const ReceiptOcrSnapshotSchema = SchemaFactory.createForClass(ReceiptOcrSnapshot);

/** Đối chiếu 1 dòng đã nhập với 1 dòng trên phiếu. */
@Schema({ _id: false })
export class ReceiptOcrCheck {
  @Prop({ type: Number, required: true }) line_index!: number; // vị trí dòng trong body gửi lên
  @Prop({ type: String, required: true }) label!: string; // SKU sàn / mã vật liệu
  @Prop({ type: Number, required: true }) ocr_line_index!: number;
  @Prop({ type: String, required: true }) ocr_text!: string;
  @Prop({ type: Number, required: true }) ocr_quantity!: number;
  @Prop({ type: Number, required: true }) quantity!: number; // số đã nhập (nhân viên đếm)
  @Prop({ type: String, default: null }) mismatch_reason!: string | null;
}
export const ReceiptOcrCheckSchema = SchemaFactory.createForClass(ReceiptOcrCheck);

export const OCR_STATUSES = ['matched', 'mismatch', 'not_checked'] as const;
export type OcrStatus = (typeof OCR_STATUSES)[number];

/**
 * ===================================================================
 * receipt_ocr_scans — kết quả AI đọc ảnh phiếu NCC (11/11/2026)
 * ===================================================================
 * Phiếu nhập / lần mua vật liệu gửi `ocr_scan_id` → BE tự lấy số trên phiếu từ đây
 * (client không tự khai được số OCR). Chỉ là nháp: TTL 7 ngày, phiếu đã lưu giữ bản sao.
 * ===================================================================
 */
@Schema({ collection: 'receipt_ocr_scans', timestamps: false })
export class ReceiptOcrScan {
  @Prop({ type: [String], required: true }) photo_urls!: string[];
  @Prop({ type: String, required: true }) ai_model!: string; // `model` trùng method của Mongoose Document
  @Prop({ type: String, default: null }) supplier!: string | null;
  @Prop({ type: String, default: null }) document_date!: string | null;
  @Prop({ type: [ReceiptOcrLineSchema], default: [] }) lines!: ReceiptOcrLine[];
  @Prop({ type: String, required: true }) created_by!: string;
  @Prop({ type: Date, required: true }) created_at!: Date;
}
export type ReceiptOcrScanDocument = HydratedDocument<ReceiptOcrScan>;
export const ReceiptOcrScanSchema = SchemaFactory.createForClass(ReceiptOcrScan);
export const RECEIPT_OCR_SCAN_TTL_SECONDS = 7 * 24 * 3600;
ReceiptOcrScanSchema.index({ created_at: 1 }, { expireAfterSeconds: RECEIPT_OCR_SCAN_TTL_SECONDS });
