import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * G4 (27/09/2026) — danh mục + tồn vật liệu đóng gói. Trước G4, thùng/xốp
 * CHƯA được quản lý như tồn kho (thuật toán chỉ chọn 1 trong 3 cỡ hardcode,
 * không đơn giá, không trừ khi đóng gói) -> không chứng minh được tiết kiệm.
 * Tồn tách 2 loại: MỚI và TÁI SỬ DỤNG (thu hồi từ hàng hoàn, đã kiểm hạng A).
 * Bản gọn: 1 tồn chung cho shop (demo 1 kho) — xem điểm yếu trong guide.
 */
@Schema({ collection: 'packaging_materials', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class PackagingMaterial {
  @Prop({ required: true, unique: true }) code!: string; // VD BOX-M — KHÓA sau khi tạo
  @Prop({ required: true }) name!: string;
  @Prop({ type: String, enum: ['box', 'cushioning'], required: true }) kind!: 'box' | 'cushioning';

  // Thùng: khớp với box_size của gợi ý đóng gói theo đúng 3 cạnh.
  @Prop({ type: Number, default: null }) length_cm!: number | null;
  @Prop({ type: Number, default: null }) width_cm!: number | null;
  @Prop({ type: Number, default: null }) height_cm!: number | null;
  // Vật liệu đệm: khớp với material_type của gợi ý (VD "Bubble Wrap").
  @Prop({ type: String, default: null }) match_material_type!: string | null;

  @Prop({ type: Number, required: true, min: 0 }) unit_cost_vnd!: number;
  @Prop({ type: Boolean, default: true }) reusable!: boolean;
  @Prop({ type: Number, default: 3, min: 1 }) max_reuse_cycles!: number; // thùng sóng đơn ~2-4 lần -> mặc định 3

  @Prop({ type: Number, default: 0, min: 0 }) qty_new!: number;
  @Prop({ type: Number, default: 0, min: 0 }) qty_reused!: number;

  @Prop({ type: Boolean, default: true }) is_active!: boolean;
  created_at?: Date;
  updated_at?: Date;
}
export type PackagingMaterialDocument = HydratedDocument<PackagingMaterial>;
export const PackagingMaterialSchema = SchemaFactory.createForClass(PackagingMaterial);
PackagingMaterialSchema.index({ kind: 1, length_cm: 1, width_cm: 1, height_cm: 1 });
