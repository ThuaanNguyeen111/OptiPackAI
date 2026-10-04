import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  PackagingApprovalStatus,
  PACKAGING_APPROVAL_STATUS_VALUES,
} from '../enums/packaging-approval-status.enum';
import { BoxDimensionsMm, BoxDimensionsMmSchema } from '../../packaging-materials/schemas/box-dimensions.schema';

/**
 * Rule #1 (Database Design Standards) — sub-schema riêng, KHÔNG dùng
 * type: Object.
 */
@Schema({ _id: false })
export class BoxSize {
  @Prop({ required: true }) length_cm!: number;
  @Prop({ required: true }) width_cm!: number;
  @Prop({ required: true }) height_cm!: number;
}
export const BoxSizeSchema = SchemaFactory.createForClass(BoxSize);

/** Vị trí 1 món trong thùng (mm, trục z hướng lên) — dữ liệu cho animation 3D. */
@Schema({ _id: false })
export class PlacementEntry {
  @Prop({ type: String, required: true }) item_key!: string;
  @Prop({ type: String, required: true }) sku!: string;
  @Prop({ type: Number, required: true }) step!: number;
  @Prop({ type: Number, required: true }) x!: number;
  @Prop({ type: Number, required: true }) y!: number;
  @Prop({ type: Number, required: true }) z!: number;
  @Prop({ type: Number, required: true }) dx!: number;
  @Prop({ type: Number, required: true }) dy!: number;
  @Prop({ type: Number, required: true }) dz!: number;
  @Prop({ type: String, required: true }) orientation!: string;
  /** (22/09/2026) Món phải gập đôi trước khi đặt (engine gập để vừa thùng nhỏ hơn). */
  @Prop({ type: Boolean, default: false }) folded!: boolean;
}
export const PlacementEntrySchema =
  SchemaFactory.createForClass(PlacementEntry);

/**
 * 🔄 ĐÃ ĐỔI (28/09/2026, P1): thêm mã/tên/đơn vị/khối lượng/giá theo danh mục
 * vật tư. Bản ghi cũ (trước P1) chỉ có `type` + `quantity` → các field mới
 * lấy default (null/0).
 */
@Schema({ _id: false })
export class MaterialEntry {
  @Prop({ type: String, required: true }) type!: string;
  @Prop({ type: Number, required: true, min: 0 }) quantity!: number;
  @Prop({ type: String, default: null }) code!: string | null;
  @Prop({ type: String, default: null }) name!: string | null;
  @Prop({ type: String, default: null }) unit!: string | null;
  @Prop({ type: Number, default: 0, min: 0 }) weight_g!: number;
  @Prop({ type: Number, default: 0, min: 0 }) cost_vnd!: number;
}
export const MaterialEntrySchema = SchemaFactory.createForClass(MaterialEntry);

/** Vật tư kho không đủ lúc đóng gói — thiếu bao nhiêu (không chặn packed). */
@Schema({ _id: false })
export class MaterialShortfallEntry {
  @Prop({ type: String, required: true }) code!: string;
  @Prop({ type: Number, required: true, min: 1 }) missing!: number;
}
export const MaterialShortfallEntrySchema = SchemaFactory.createForClass(
  MaterialShortfallEntry,
);

@Schema({ _id: false })
export class NoFitReason {
  @Prop({ type: String, required: true }) box_code!: string;
  @Prop({ type: String, required: true }) reason!: string;
  /** (30/09/2026) Mã lý do máy đọc được (NoFitCode của engine); bản ghi cũ = null. */
  @Prop({ type: String, default: null }) code!: string | null;
  /** (30/09/2026) Món liên quan (ITEM_TOO_LARGE / ITEM_TOO_HEAVY); null nếu không có. */
  @Prop({ type: String, default: null }) item_key!: string | null;
}
export const NoFitReasonSchema = SchemaFactory.createForClass(NoFitReason);

/**
 * MỚI (21/09/2026) — loại sản phẩm + túi zip của từng SKU trong đơn, chụp
 * từ hồ sơ SKU lúc tính phương án. FE dùng để chọn hình 3D đại diện và vẽ
 * túi zip; hướng dẫn dùng để thêm bước cho hàng vào túi. Engine bỏ qua.
 */
@Schema({ _id: false })
export class ItemProfileEntry {
  @Prop({ type: String, required: true }) sku!: string;
  @Prop({ type: String, default: null }) product_category!: string | null;
  @Prop({ type: String, default: null }) zip_bag_code!: string | null;
  @Prop({ type: Boolean, default: false }) zip_bag_folded!: boolean;
}
export const ItemProfileEntrySchema =
  SchemaFactory.createForClass(ItemProfileEntry);

@Schema({ _id: false })
export class PackingGuideStep {
  @Prop({ type: Number, required: true }) step!: number;
  @Prop({ type: String, required: true }) instruction!: string;
  @Prop({ type: String, default: null }) tip!: string | null;
}
export const PackingGuideStepSchema =
  SchemaFactory.createForClass(PackingGuideStep);

/**
 * MỚI (21/09/2026) — lời hướng dẫn đóng gói từng bước cho animation 3D.
 * `source`: 'ai' (OpenAI viết) hoặc 'template' (câu mẫu khi thiếu key/AI
 * trả sai). Bị xóa (null) mỗi khi phương án xếp đổi (generate/adjust).
 */
@Schema({ _id: false })
export class PackingGuide {
  @Prop({ type: String, enum: ['ai', 'template'], required: true }) source!:
    'ai' | 'template';
  @Prop({ type: String, default: null }) model!: string | null;
  @Prop({ type: String, default: null }) fallback_reason!: string | null;
  @Prop({ type: String, required: true }) summary!: string;
  @Prop({ type: [PackingGuideStepSchema], default: [] })
  steps!: PackingGuideStep[];
  @Prop({ type: Date, required: true }) generated_at!: Date;
}
export const PackingGuideSchema = SchemaFactory.createForClass(PackingGuide);

/**
 * ===================================================================
 * MỚI (30/09/2026) — MỘT KIỆN trong phương án của 1 đơn
 * ===================================================================
 * Đơn quá lớn/quá nặng cho 1 thùng được chia N kiện; mỗi kiện có thùng,
 * tọa độ xếp, cân ước tính, vật tư, cân thật và hướng dẫn riêng. Field
 * cấp recommendation (box_code, placements, ...) PHẢN CHIẾU kiện đầu
 * tiên để client/luồng cũ (mỗi đơn 1 kiện) chạy nguyên không đổi; bản ghi
 * cũ không có `cartons` được service suy ra 1 kiện từ field cấp trên.
 * ===================================================================
 */
@Schema({ _id: false })
export class CartonEntry {
  /** Thứ tự kiện trong đơn, bắt đầu từ 0. */
  @Prop({ type: Number, required: true, min: 0 }) index!: number;
  @Prop({ type: String, required: true }) box_code!: string;
  @Prop({ type: String, default: null }) box_name!: string | null;
  @Prop({ type: BoxDimensionsMmSchema, required: true })
  box_inner_mm!: BoxDimensionsMm;
  @Prop({ type: BoxDimensionsMmSchema, required: true })
  box_outer_mm!: BoxDimensionsMm;
  @Prop({ type: [PlacementEntrySchema], default: [] })
  placements!: PlacementEntry[];
  @Prop({ type: Number, required: true }) fill_ratio!: number;
  @Prop({ type: Number, required: true }) items_weight_g!: number;
  @Prop({ type: Number, required: true }) estimated_package_weight_g!: number;
  @Prop({ type: Number, required: true }) volumetric_weight_g!: number;
  @Prop({ type: [MaterialEntrySchema], default: [] })
  materials!: MaterialEntry[];
  @Prop({ type: Number, default: 0, min: 0 }) materials_weight_g!: number;
  @Prop({ type: Number, default: 0, min: 0 }) materials_cost_vnd!: number;
  /** Cân THẬT của kiện, nhập lúc pack; null nếu chưa pack. */
  @Prop({ type: Number, default: null }) actual_measured_weight_kg!:
    number | null;
  @Prop({ type: Boolean, default: false }) is_abnormal!: boolean;
  @Prop({ type: PackingGuideSchema, default: null })
  packing_guide!: PackingGuide | null;
}
export const CartonEntrySchema = SchemaFactory.createForClass(CartonEntry);

/**
 * ===================================================================
 * packaging_recommendations — MỚI (2026-09-09), UC-03/UC-04 (Report 1)
 * ===================================================================
 * 🔄 ĐÃ ĐỔI (21/09/2026, BE-3a): MỖI ĐƠN MỘT KIỆN — mỗi đơn nguồn trong
 * group có 1 recommendation active riêng (`order_id`), kèm tọa độ xếp
 * (`placements`) do engine greedy 3D tính và đã qua validator. Bản cũ
 * (trước 21/09) có `order_id: null`, 1 bản/group, không có placements.
 *  - Reject (UC-04 Alt Flow) KHÔNG xóa cứng — is_active:false, giữ lịch
 *    sử phục vụ audit BR-08.
 *  - Rule #22 (Canonical schema) — không field đặc thù sàn nào.
 * ===================================================================
 */
@Schema({
  collection: 'packaging_recommendations',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class PackagingRecommendationDoc {
  @Prop({ type: Types.ObjectId, required: true })
  order_group_id!: Types.ObjectId;

  /** Đơn nguồn của kiện này; null = bản legacy cấp group (trước 21/09). */
  @Prop({ type: Types.ObjectId, default: null })
  order_id!: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  platform_order_id!: string | null;

  /** 'no_fit' = không thùng nào trong danh mục xếp hợp lệ → cần xử lý tay. */
  @Prop({ type: String, enum: ['ok', 'no_fit'], default: 'ok' })
  solution_status!: 'ok' | 'no_fit';

  @Prop({ type: [NoFitReasonSchema], default: [] })
  no_fit_reasons!: NoFitReason[];

  @Prop({ type: String, default: null })
  box_code!: string | null;

  @Prop({ type: String, default: null })
  box_name!: string | null;

  /** Legacy (cm) — vẫn điền để client cũ đọc được; null khi no_fit. */
  @Prop({ type: BoxSizeSchema, default: null })
  box_size!: BoxSize | null;

  @Prop({ type: BoxDimensionsMmSchema, default: null })
  box_inner_mm!: BoxDimensionsMm | null;

  @Prop({ type: BoxDimensionsMmSchema, default: null })
  box_outer_mm!: BoxDimensionsMm | null;

  @Prop({ type: [PlacementEntrySchema], default: [] })
  placements!: PlacementEntry[];

  /**
   * (30/09/2026) Các kiện của đơn (đa kiện). Rỗng ở bản ghi cũ hoặc no_fit —
   * dùng cartonsOf() trong service để đọc thống nhất (suy ra 1 kiện từ field cấp trên).
   */
  @Prop({ type: [CartonEntrySchema], default: [] })
  cartons!: CartonEntry[];

  /** (30/09/2026) Số kiện của phương án; bản ghi cũ không có = 1 (nếu ok). */
  @Prop({ type: Number, default: 0, min: 0 })
  carton_count!: number;

  /**
   * (Bước 1) Cận dưới số kiện (thể tích/cân) — `carton_count - cận` = khoảng
   * cách tới tối ưu (0 = chắc chắn tối ưu số kiện). null: bản ghi cũ / no_fit.
   */
  @Prop({ type: Number, default: null })
  lower_bound_cartons!: number | null;

  /**
   * (Bước 1) no_fit: true = có BẰNG CHỨNG không xếp được (món quá cỡ/quá tải);
   * false = chỉ là "chưa tìm được" (hết ngân sách, hết tồn). null: ok/bản ghi cũ.
   */
  @Prop({ type: Boolean, default: null })
  proven_infeasible!: boolean | null;

  @Prop({ type: [ItemProfileEntrySchema], default: [] })
  item_profiles!: ItemProfileEntry[];

  @Prop({ type: [MaterialEntrySchema], default: [] })
  materials!: MaterialEntry[];

  /** (28/09/2026) Tổng khối lượng vật tư đã cộng vào cân ước tính (g). */
  @Prop({ type: Number, default: 0, min: 0 })
  materials_weight_g!: number;

  /** (28/09/2026) Tổng giá vật tư theo danh mục (VND) — ước lượng theo luật. */
  @Prop({ type: Number, default: 0, min: 0 })
  materials_cost_vnd!: number;

  /** (28/09/2026) Vật tư thiếu lúc pack (đóng gói vẫn tiếp tục) — rỗng nếu đủ. */
  @Prop({ type: [MaterialShortfallEntrySchema], default: [] })
  materials_shortfall!: MaterialShortfallEntry[];

  // Legacy — giữ cho client cũ; bản mới suy ra từ `materials`.
  @Prop({ type: String, required: true })
  material_type!: string;

  @Prop({ type: Number, required: true })
  material_quantity!: number;

  /** null = chưa có bảng cước thật (không bịa 15.000 đ/kg như fallback cũ). */
  @Prop({ type: Number, default: null })
  estimated_shipping_cost_vnd!: number | null;

  @Prop({ type: Number, default: null })
  items_weight_g!: number | null;

  /** Hàng + bì thùng (+ vật tư khi có danh mục) — so với cân thật lúc pack. */
  @Prop({ type: Number, default: null })
  estimated_package_weight_g!: number | null;

  @Prop({ type: Number, default: null })
  volumetric_weight_g!: number | null;

  @Prop({ type: Number, default: null })
  fill_ratio!: number | null;

  @Prop({ type: Number, required: true })
  computation_time_ms!: number;

  @Prop({ type: String, default: null })
  engine_version!: string | null;

  @Prop({ type: Boolean, default: false })
  fallback_used!: boolean;

  @Prop({
    type: String,
    enum: PACKAGING_APPROVAL_STATUS_VALUES,
    default: PackagingApprovalStatus.PENDING,
  })
  approval_status!: PackagingApprovalStatus;

  // BR-07 (Report 1) — mọi hành động Approve/Adjust/Reject PHẢI gắn với
  // tài khoản đã login, không có chế độ ẩn danh.
  @Prop({ type: Types.ObjectId, default: null })
  approved_by!: Types.ObjectId | null;

  // Rule #23 — field union `| null` PHẢI khai `type:` tường minh.
  @Prop({ type: Date, default: null })
  approved_at!: Date | null;

  // Adjust (đổi thùng) — lưu lý do + người/thời điểm, để sau này học
  // từ lịch sử điều chỉnh.
  @Prop({ type: String, default: null })
  adjustment_reason!: string | null;

  @Prop({ type: String, default: null })
  adjustment_note!: string | null;

  @Prop({ type: String, default: null })
  adjusted_from_box_code!: string | null;

  @Prop({ type: Types.ObjectId, default: null })
  adjusted_by!: Types.ObjectId | null;

  // 🔄 ĐÃ ĐỔI (21/09/2026): cân THẬT của kiện, nhập lúc `pack` (sau khi
  // đóng xong), không còn nhập lúc approve.
  @Prop({ type: Number, default: null })
  actual_measured_weight_kg!: number | null;

  @Prop({ type: Date, default: null })
  packed_at!: Date | null;

  @Prop({ type: Types.ObjectId, default: null })
  packed_by!: Types.ObjectId | null;

  @Prop({ type: Boolean, default: false })
  is_abnormal!: boolean;

  @Prop({ type: PackingGuideSchema, default: null })
  packing_guide!: PackingGuide | null;

  /** (22/09/2026) Thùng nhỏ hơn xếp vừa nhưng hết hàng lúc tính — nhắc nhập thêm. */
  @Prop({ type: String, default: null })
  preferred_box_out_of_stock!: string | null;

  /**
   * (21/09/2026) Lý do Packaging Staff từ chối phương án — BẮT BUỘC nhập
   * (RejectPackagingDto). Lưu trên chính bản bị từ chối (is_active tắt ngay
   * sau đó) để giữ lịch sử, không mất khi generate() tạo bản mới.
   */
  @Prop({ type: String, default: null })
  rejection_reason!: string | null;

  @Prop({ type: Boolean, default: true })
  is_active!: boolean;

  created_at?: Date;
  updated_at?: Date;
}

export type PackagingRecommendationDocument = HydratedDocument<PackagingRecommendationDoc>;
export const PackagingRecommendationSchema = SchemaFactory.createForClass(PackagingRecommendationDoc);

// 🔄 ĐÃ ĐỔI (21/09/2026): 1 ĐƠN = 1 bản active (trước là 1 group = 1 bản).
// Index cũ `order_group_id_1` (unique) PHẢI được drop bằng
// scripts/migrate-packaging-recommendation-index.ts — nếu còn, group
// nhiều đơn sẽ bị E11000 khi generate.
PackagingRecommendationSchema.index(
  { order_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      is_active: true,
      order_id: { $type: 'objectId' },
    },
    name: 'uniq_active_per_order',
  },
);
// Phục vụ: đọc/đổi toàn bộ bản active của 1 group (GET/approve/reject/pack).
PackagingRecommendationSchema.index({ order_group_id: 1, is_active: 1 });
// Rule #3 (ESR) — phục vụ màn hình Packaging Staff xem hàng đợi chờ duyệt.
PackagingRecommendationSchema.index({ approval_status: 1, created_at: -1 });
