import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** Phiếu / dòng sổ đã dùng ảnh này làm minh chứng. */
@Schema({ _id: false })
export class ReceiptPhotoUsage {
  @Prop({ type: String, enum: ['stock_receipt', 'material_intake'], required: true }) kind!: 'stock_receipt' | 'material_intake';
  @Prop({ type: String, required: true }) ref!: string; // _id phiếu nhập hoặc mã vật tư
  @Prop({ type: Date, required: true }) at!: Date;
}
export const ReceiptPhotoUsageSchema = SchemaFactory.createForClass(ReceiptPhotoUsage);

/**
 * (19/11/2026, AOFP-311) Dấu vân tay ảnh phiếu NCC để chặn dùng lại một phiếu cho nhiều lần nhập.
 * Ghi lúc tải ảnh (`md5` file gốc + `phash` Cloudinary); `used_by` gắn khi phiếu được lưu.
 * Ảnh tải trước 19/11 không có bản ghi: lúc lưu phiếu tạo bản ghi `md5 = null`, chỉ chặn trùng URL.
 */
@Schema({ collection: 'receipt_photos', versionKey: false })
export class ReceiptPhoto {
  @Prop({ type: String, required: true }) url!: string;
  @Prop({ type: String, default: null }) md5!: string | null;
  @Prop({ type: String, default: null }) phash!: string | null; // 16 ký tự hex (64 bit)
  @Prop({ type: ReceiptPhotoUsageSchema, default: null }) used_by!: ReceiptPhotoUsage | null;
  @Prop({ type: Date, required: true }) created_at!: Date;
}
export type ReceiptPhotoDocument = HydratedDocument<ReceiptPhoto>;
export const ReceiptPhotoSchema = SchemaFactory.createForClass(ReceiptPhoto);

ReceiptPhotoSchema.index({ url: 1 }, { unique: true });
// Tìm ảnh đã dùng có cùng md5 (file tải lại).
ReceiptPhotoSchema.index({ md5: 1 }, { partialFilterExpression: { md5: { $type: 'string' } } });
// Quét pHash của ảnh đã dùng để gắn cờ nghi trùng.
ReceiptPhotoSchema.index({ 'used_by.at': -1 }, { partialFilterExpression: { phash: { $type: 'string' } } });
