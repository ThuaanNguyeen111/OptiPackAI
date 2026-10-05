import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * ===================================================================
 * packing_settings — luật đóng gói Store Owner/Admin chỉnh được (05/10/2026)
 * ===================================================================
 * Trước đây các ngưỡng nằm cứng trong code (lệch cân 20%, đệm dễ vỡ 5 mm...).
 * Mỗi lần lưu = 1 document MỚI (version tăng), bản cũ tắt `is_active` — giữ
 * lịch sử (cùng cách packaging_material_rules). Chưa có document nào → dùng
 * DEFAULT_PACKING_SETTINGS.
 * ===================================================================
 */
@Schema({
  collection: 'packing_settings',
  timestamps: { createdAt: 'created_at', updatedAt: false },
})
export class PackingSettings {
  @Prop({ type: Number, required: true, min: 1 }) version!: number;

  /** Lệch cân thật so với ước tính (tỷ lệ, 0.2 = 20%) vượt mức này → kiện bị giữ chờ xem lại. */
  @Prop({ type: Number, required: true, min: 0.01, max: 1 }) abnormal_weight_threshold!: number;

  /** Đệm quanh món dễ vỡ (mm mỗi phía) khi tính phương án. */
  @Prop({ type: Number, required: true, min: 0, max: 50 }) fragile_cushion_mm!: number;

  /** Mục tiêu mặc định khi tự tính (người dùng vẫn chọn khác được lúc tính lại). */
  @Prop({ type: String, required: true, enum: ['fewest_parcels', 'cheapest'] })
  default_prefer!: 'fewest_parcels' | 'cheapest';

  /** Số kiện tối đa mỗi đơn; vượt → duyệt phải ghi lý do. null = không giới hạn. */
  @Prop({ type: Number, default: null, min: 1 }) max_parcels_per_order!: number | null;

  /** Kiện có hàng dễ vỡ được dùng thùng tái sử dụng không (mặc định KHÔNG). */
  @Prop({ type: Boolean, required: true }) allow_reused_box_for_fragile!: boolean;

  /** true = bắt buộc quét từng món; lối tắt POST pack bị chặn. */
  @Prop({ type: Boolean, required: true }) require_scan!: boolean;

  @Prop({ type: Types.ObjectId, default: null }) updated_by!: Types.ObjectId | null;
  @Prop({ type: Boolean, default: true }) is_active!: boolean;

  created_at?: Date;
}

export type PackingSettingsDocument = HydratedDocument<PackingSettings>;
export const PackingSettingsSchema = SchemaFactory.createForClass(PackingSettings);

// Mỗi version chỉ 1 lần (2 người lưu đồng thời → 1 người nhận lỗi, tải lại).
PackingSettingsSchema.index({ version: 1 }, { unique: true });
