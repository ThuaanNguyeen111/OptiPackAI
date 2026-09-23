import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * ===================================================================
 * packaging_bags — MỚI (21/09/2026) — danh mục túi zip bọc hàng
 * ===================================================================
 * Túi zip là vật tư BỌC TỪNG MÓN (áo, quần...) trước khi xếp vào thùng,
 * khác thùng carton (bao bì ngoài). Engine KHÔNG dùng kích thước túi để
 * tính: hồ sơ SKU lưu số đo gói SAU KHI đã cho vào túi (và gập, nếu có)
 * do kho tự đo (chốt 21/09/2026). Danh mục này phục vụ hướng dẫn đóng
 * gói, cấp vật tư và chi phí. Kích thước túi đo khi trải phẳng (mm).
 * ===================================================================
 */
@Schema({
  collection: 'packaging_bags',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class PackagingBag {
  @Prop({ type: String, required: true, trim: true })
  code!: string;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: Number, required: true, min: 1 })
  width_mm!: number;

  @Prop({ type: Number, required: true, min: 1 })
  length_mm!: number;

  @Prop({ type: Number, default: null, min: 0 })
  price_vnd!: number | null;

  @Prop({ type: Boolean, default: false })
  is_sample!: boolean;

  @Prop({ type: Boolean, default: true })
  is_active!: boolean;

  created_at?: Date;
  updated_at?: Date;
}

export type PackagingBagDocument = HydratedDocument<PackagingBag>;
export const PackagingBagSchema = SchemaFactory.createForClass(PackagingBag);

// Rule #5 — mã túi duy nhất (kể cả túi đã ngừng dùng).
PackagingBagSchema.index({ code: 1 }, { unique: true });
// Phục vụ: GET /packaging/bags?active=true, kiểm tra túi khi xác nhận hồ sơ SKU.
PackagingBagSchema.index({ is_active: 1, code: 1 });
