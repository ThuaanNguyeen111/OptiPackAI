import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class BoxDimensionsMm {
  @Prop({ type: Number, required: true, min: 1 }) length_mm!: number;
  @Prop({ type: Number, required: true, min: 1 }) width_mm!: number;
  @Prop({ type: Number, required: true, min: 1 }) height_mm!: number;
}
export const BoxDimensionsMmSchema = SchemaFactory.createForClass(BoxDimensionsMm);

/**
 * ===================================================================
 * packaging_boxes — MỚI (21/09/2026, Bước 0 engine 3D)
 * ===================================================================
 * Danh mục thùng carton thật của kho, thay 3 thùng hard-code trong
 * fallback. Đơn vị lõi mm/g, số nguyên (khớp engine). `inner` là lòng
 * thùng dùng được để xếp; `outer` dùng tính cân quy đổi/phí ship.
 * `is_sample: true` đánh dấu số giả lập seed tạm — thay bằng số đo thật.
 * ===================================================================
 */
@Schema({
  collection: 'packaging_boxes',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class PackagingBox {
  @Prop({ type: String, required: true, trim: true })
  code!: string;

  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: BoxDimensionsMmSchema, required: true })
  inner!: BoxDimensionsMm;

  @Prop({ type: BoxDimensionsMmSchema, required: true })
  outer!: BoxDimensionsMm;

  @Prop({ type: Number, required: true, min: 0 })
  tare_g!: number;

  @Prop({ type: Number, required: true, min: 1 })
  max_load_g!: number;

  @Prop({ type: Number, default: null, min: 0 })
  price_vnd!: number | null;

  @Prop({ type: Boolean, default: false })
  is_sample!: boolean;

  @Prop({ type: Boolean, default: true })
  is_active!: boolean;

  created_at?: Date;
  updated_at?: Date;
}

export type PackagingBoxDocument = HydratedDocument<PackagingBox>;
export const PackagingBoxSchema = SchemaFactory.createForClass(PackagingBox);

// Rule #5 — mã thùng duy nhất (kể cả thùng đã ngừng dùng, tránh 2 thùng
// cùng mã trong lịch sử recommendation).
PackagingBoxSchema.index({ code: 1 }, { unique: true });
// Phục vụ: engine/GET /packaging/boxes?active=true — lọc thùng đang dùng.
PackagingBoxSchema.index({ is_active: 1, code: 1 });
