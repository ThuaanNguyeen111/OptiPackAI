import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MATERIAL_TYPES, type MaterialType } from '../../packaging/engine/types';
import { BoxDimensionsMm, BoxDimensionsMmSchema } from './box-dimensions.schema';

/**
 * G4 (27/09/2026) — danh mục + tồn vật liệu đóng gói. Tồn tách 2 loại: MỚI và
 * TÁI SỬ DỤNG (thu hồi từ hàng hoàn, đã kiểm hạng A) + ngăn nội bộ (hạng B).
 *
 * 🔄 GỘP main + thi_dev (04/10/2026): đây là KHO VẬT TƯ DUY NHẤT. Bỏ 2 danh
 * mục riêng của engine đóng gói (`packaging_boxes`, kho vật tư chèn cũ) — dữ
 * liệu chuyển sang đây bằng `scripts/migrate-unify-packaging-materials.ts`.
 * - Thùng (`kind: box`): engine chỉ dùng thùng có đủ `inner`/`outer`/`tare_g`/
 *   `max_load_g`. Tồn dùng được = `qty_new + qty_reused`; khi đóng gói ưu tiên
 *   thùng tái sử dụng (ghi tiết kiệm).
 * - Vật tư chèn (`kind: cushioning`): engine chỉ dùng loại có `material_type`
 *   (xốp góc, giấy chèn...) kèm `weight_g_per_unit`.
 */
@Schema({ collection: 'packaging_materials', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class PackagingMaterial {
  @Prop({ required: true, unique: true }) code!: string; // VD BOX-M — KHÓA sau khi tạo
  @Prop({ required: true }) name!: string;
  @Prop({ type: String, enum: ['box', 'cushioning'], required: true }) kind!: 'box' | 'cushioning';

  @Prop({ type: Number, default: null }) length_cm!: number | null;
  @Prop({ type: Number, default: null }) width_cm!: number | null;
  @Prop({ type: Number, default: null }) height_cm!: number | null;
  @Prop({ type: String, default: null }) match_material_type!: string | null;

  @Prop({ type: Number, required: true, min: 0 }) unit_cost_vnd!: number;
  @Prop({ type: Boolean, default: true }) reusable!: boolean;
  @Prop({ type: Number, default: 3, min: 1 }) max_reuse_cycles!: number; // thùng sóng đơn ~2-4 lần -> mặc định 3

  @Prop({ type: Number, default: 0, min: 0 }) qty_new!: number;
  @Prop({ type: Number, default: 0, min: 0 }) qty_reused!: number;
  @Prop({ type: Number, default: 0, min: 0 }) qty_internal!: number;

  // ---- Dữ liệu cho engine đóng gói (gộp thi_dev 04/10/2026) ----
  // Thùng: số đo theo mm, bì và tải tối đa theo g.
  @Prop({ type: BoxDimensionsMmSchema, default: null }) inner!: BoxDimensionsMm | null;
  @Prop({ type: BoxDimensionsMmSchema, default: null }) outer!: BoxDimensionsMm | null;
  @Prop({ type: Number, default: null, min: 0 }) tare_g!: number | null;
  @Prop({ type: Number, default: null, min: 1 }) max_load_g!: number | null;
  // Vật tư chèn: loại theo luật chọn vật tư + khối lượng mỗi đơn vị.
  @Prop({ type: String, enum: [...MATERIAL_TYPES, null], default: null }) material_type!: MaterialType | null;
  @Prop({ type: String, default: null }) unit!: string | null; // VD "cái", "tấm"
  @Prop({ type: Number, default: null, min: 0 }) weight_g_per_unit!: number | null;
  // Chung
  @Prop({ type: Number, default: 10, min: 0 }) reorder_level!: number; // tồn dùng được ≤ mức này → cảnh báo
  @Prop({ type: String, default: null }) storage_location!: string | null;
  @Prop({ type: Boolean, default: false }) is_sample!: boolean; // số đo/giá mẫu, chưa phải số thật

  @Prop({ type: Boolean, default: true }) is_active!: boolean;
  created_at?: Date;
  updated_at?: Date;
}
export type PackagingMaterialDocument = HydratedDocument<PackagingMaterial>;
export const PackagingMaterialSchema = SchemaFactory.createForClass(PackagingMaterial);
PackagingMaterialSchema.index({ kind: 1, length_cm: 1, width_cm: 1, height_cm: 1 });
// Engine đọc danh mục đang dùng theo loại.
PackagingMaterialSchema.index({ kind: 1, is_active: 1, code: 1 });

/** Tồn dùng được để đóng gói (mới + tái sử dụng; ngăn nội bộ hạng B không tính). */
export function usableStock(m: Pick<PackagingMaterial, 'qty_new' | 'qty_reused'>): number {
  const n = Number.isFinite(m.qty_new) ? m.qty_new : 0;
  const r = Number.isFinite(m.qty_reused) ? m.qty_reused : 0;
  return n + r;
}
