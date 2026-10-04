import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * K4a (27/09/2026) — SKU NỘI BỘ: 1 sản phẩm thật = 1 mã, không phụ thuộc cách
 * mỗi sàn đặt mã. Mã do HỆ THỐNG ghép: {danh mục cấp 2}-{mẫu 3 số}-{màu}-{size},
 * VD ATHUN-005-DEN-M. Mã + 4 thành phần tạo mã KHÓA vĩnh viễn; đặt sai thì dùng
 * thao tác "Thay thế SKU" (giữ lịch sử, trỏ replaced_by).
 * K4a: tồn kho VẪN tính theo SKU sàn — chuyển sang tính theo SKU nội bộ là K4b.
 */
@Schema({ collection: 'master_skus', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class MasterSku {
  @Prop({ required: true, unique: true }) master_sku!: string;
  @Prop({ required: true, index: true }) category_code!: string; // danh mục CẤP 2
  @Prop({ required: true }) model_no!: number; // mẫu 1..999
  @Prop({ required: true }) color_code!: string;
  @Prop({ required: true }) size!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ type: String, enum: ['nam', 'nu', 'unisex'], default: 'unisex' }) gender!: 'nam' | 'nu' | 'unisex'; // thuộc tính, KHÔNG phải cấp danh mục
  @Prop({ type: Number, default: null }) length_cm!: number | null;
  @Prop({ type: Number, default: null }) width_cm!: number | null;
  @Prop({ type: Number, default: null }) height_cm!: number | null;
  @Prop({ type: Number, default: null }) weight_kg!: number | null;
  @Prop({ type: Boolean, default: false }) is_fragile!: boolean;
  @Prop({ type: Boolean, default: true }) is_active!: boolean;
  @Prop({ type: String, default: null }) replaced_by!: string | null;
  @Prop({ required: true }) created_by!: string;
  created_at?: Date;
  updated_at?: Date;
}
export type MasterSkuDocument = HydratedDocument<MasterSku>;
export const MasterSkuSchema = SchemaFactory.createForClass(MasterSku);
