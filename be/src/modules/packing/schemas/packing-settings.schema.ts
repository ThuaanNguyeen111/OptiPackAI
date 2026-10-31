import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

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

  // ---- AOFP-224 (31/10/2026) túi niêm phong — docs/PACKAGING_STANDARD.md §4.3, §6.
  // Có default: bản cài đặt lưu trước AOFP-224 vẫn đọc được (service tự bù khi đọc lean).
  /** Bật phương án túi niêm phong cho hàng mềm. Mặc định TẮT tới khi xác nhận GHN nhận túi làm lớp ngoài. */
  @Prop({ type: Boolean, default: false }) mailer_enabled!: boolean;
  @Prop({ type: Number, default: 20, min: 0, max: 100 }) mailer_margin_width_mm!: number;
  @Prop({ type: Number, default: 30, min: 0, max: 150 }) mailer_margin_length_mm!: number;
  @Prop({ type: Number, default: 80, min: 5, max: 300 }) mailer_max_thickness_mm!: number;
  /** Đơn trộn mềm + cứng: chỉ tách túi + thùng khi rẻ hơn ít nhất số này (VND). */
  @Prop({ type: Number, default: 5000, min: 0 }) split_min_saving_vnd!: number;
  /** Cước ước tính để so tách/gộp: bậc đầu + mỗi bậc thêm (giả định — không thay báo giá GHN). */
  @Prop({ type: Number, default: 22000, min: 0 }) est_fee_first_step_vnd!: number;
  @Prop({ type: Number, default: 2500, min: 0 }) est_fee_per_extra_step_vnd!: number;

  @Prop({ type: SchemaTypes.ObjectId, default: null }) updated_by!: Types.ObjectId | null;
  @Prop({ type: Boolean, default: true }) is_active!: boolean;

  created_at?: Date;
}

export type PackingSettingsDocument = HydratedDocument<PackingSettings>;
export const PackingSettingsSchema = SchemaFactory.createForClass(PackingSettings);

// Mỗi version chỉ 1 lần (2 người lưu đồng thời → 1 người nhận lỗi, tải lại).
PackingSettingsSchema.index({ version: 1 }, { unique: true });
