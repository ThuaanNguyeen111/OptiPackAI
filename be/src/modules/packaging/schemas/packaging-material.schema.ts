import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MATERIAL_TYPES, type MaterialType } from '../engine/types';

/**
 * ===================================================================
 * packaging_materials — MỚI (28/09/2026, P1) — danh mục + tồn kho vật tư chèn
 * ===================================================================
 * Góc xốp, tấm ngăn, gối hơi, bọc xốp, tem cảnh báo... Đơn vị lõi g/VND,
 * số nguyên. `is_sample: true` = số giả lập seed tạm, thay bằng số thật.
 * Tồn CHỈ đổi qua stock-in hoặc pack (luôn kèm 1 dòng
 * packaging_material_movements). Khác thùng carton: KHÔNG giữ chỗ mềm —
 * thiếu vật tư lúc pack không chặn đóng gói (xem PackagingMaterialService).
 * ===================================================================
 */
@Schema({
  collection: 'packaging_materials',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class PackagingMaterial {
  @Prop({ type: String, required: true, trim: true })
  code!: string;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, enum: MATERIAL_TYPES, required: true })
  type!: MaterialType;

  /** Đơn vị đếm, VD "cái", "tấm". */
  @Prop({ type: String, required: true, trim: true })
  unit!: string;

  @Prop({ type: Number, required: true, min: 0 })
  weight_g_per_unit!: number;

  @Prop({ type: Number, required: true, min: 0 })
  price_vnd_per_unit!: number;

  @Prop({ type: Number, default: 0, min: 0 })
  quantity_on_hand!: number;

  @Prop({ type: Number, default: 20, min: 0 })
  reorder_level!: number;

  @Prop({ type: String, default: null })
  storage_location!: string | null;

  @Prop({ type: Boolean, default: false })
  is_sample!: boolean;

  @Prop({ type: Boolean, default: true })
  is_active!: boolean;

  created_at?: Date;
  updated_at?: Date;
}

export type PackagingMaterialDocument = HydratedDocument<PackagingMaterial>;
export const PackagingMaterialSchema = SchemaFactory.createForClass(PackagingMaterial);

// Rule #5 — mã vật tư duy nhất.
PackagingMaterialSchema.index({ code: 1 }, { unique: true });
// Phục vụ: engine đọc danh mục đang dùng / GET /packaging/materials?active=true.
PackagingMaterialSchema.index({ is_active: 1, code: 1 });
