import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  BoxDimensionsMm,
  BoxDimensionsMmSchema,
} from '../../packaging-materials/schemas/box-dimensions.schema';

/**
 * ===================================================================
 * packing_plans — kế hoạch đóng gói của MỘT nhóm đơn (04/10/2026, đợt 3)
 * ===================================================================
 * Thay `packaging_recommendations` (1 bản ghi/đơn, field cấp trên phản chiếu
 * kiện 0). Giờ 1 kế hoạch/nhóm chứa mọi đơn và mọi kiện (`parcel_no` 1..N
 * trong cả nhóm). Mỗi đơn có nhãn chứng minh riêng (optimal_global /
 * optimal_in_model / heuristic). Khóa lạc quan dùng `version` TƯỜNG MINH
 * (tăng ở mọi thay đổi người dùng thấy được), không dùng `__v`.
 * Collection cũ được giữ nguyên làm lịch sử, không ai đọc nữa.
 * ===================================================================
 */

export const PACKING_PLAN_STATUSES = [
  'computing',
  'ready',
  'approved',
  // MỚI (05/10/2026) — đang đóng: đã bấm "Bắt đầu" hoặc đã quét/niêm phong ít nhất 1 kiện.
  'packing',
  'packed',
  'rejected',
  'failed',
  'superseded',
] as const;
export type PackingPlanStatus = (typeof PACKING_PLAN_STATUSES)[number];

/** Trạng thái còn GIỮ CHỖ thùng (soft reservation) — chưa đóng, chưa bỏ. */
export const RESERVING_PLAN_STATUSES: PackingPlanStatus[] = ['ready', 'approved', 'packing'];

/**
 * Trạng thái TỪNG KIỆN (05/10/2026):
 * - pending: chưa niêm phong (đang quét món).
 * - sealed: đã niêm phong + cân trong ngưỡng (hoặc đã được chấp nhận dù lệch).
 * - held: đã niêm phong nhưng cân lệch quá ngưỡng — chờ người KHÁC xem lại.
 * - to_unpack: đơn của kiện bị hủy sau khi bắt đầu đóng — phải tháo, trả hàng về kệ.
 * - voided: đã tháo xong — không còn là kiện để giao.
 * Bản ghi trước 05/10 không có trường này: kế hoạch `packed` coi mọi kiện là sealed.
 */
export const PARCEL_STATUSES = ['pending', 'sealed', 'held', 'to_unpack', 'voided'] as const;
export type ParcelStatus = (typeof PARCEL_STATUSES)[number];
/** Kiện KHÔNG còn đi giao (đã/đang tháo). */
export const INACTIVE_PARCEL_STATUSES: readonly ParcelStatus[] = ['to_unpack', 'voided'];

export const SCAN_METHODS = ['barcode', 'manual', 'bypass'] as const;
export type ScanMethod = (typeof SCAN_METHODS)[number];

export const PROOF_LABELS = ['optimal_global', 'optimal_in_model', 'heuristic'] as const;
export type PlanProofLabel = (typeof PROOF_LABELS)[number];

export const CP_SAT_STATES = ['pending', 'done', 'skipped', 'unavailable'] as const;
export type CpSatState = (typeof CP_SAT_STATES)[number];

@Schema({ _id: false })
export class PlanBox {
  @Prop({ required: true }) code!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ type: BoxDimensionsMmSchema, required: true }) inner_mm!: BoxDimensionsMm;
  @Prop({ type: BoxDimensionsMmSchema, required: true }) outer_mm!: BoxDimensionsMm;
  @Prop({ type: Number, required: true }) tare_g!: number;
  @Prop({ type: Number, required: true }) max_load_g!: number;
  @Prop({ type: Number, default: null }) price_vnd!: number | null;
}
export const PlanBoxSchema = SchemaFactory.createForClass(PlanBox);

@Schema({ _id: false })
export class PlanPlacement {
  @Prop({ required: true }) item_key!: string;
  @Prop({ required: true }) sku!: string;
  @Prop({ type: Number, required: true }) step!: number;
  @Prop({ type: Number, required: true }) x!: number;
  @Prop({ type: Number, required: true }) y!: number;
  @Prop({ type: Number, required: true }) z!: number;
  @Prop({ type: Number, required: true }) dx!: number;
  @Prop({ type: Number, required: true }) dy!: number;
  @Prop({ type: Number, required: true }) dz!: number;
  @Prop({ required: true }) orientation!: string;
  @Prop({ type: Boolean, default: false }) folded!: boolean;
}
export const PlanPlacementSchema = SchemaFactory.createForClass(PlanPlacement);

@Schema({ _id: false })
export class PlanMaterial {
  @Prop({ required: true }) type!: string;
  @Prop({ type: String, default: null }) code!: string | null;
  @Prop({ required: true }) name!: string;
  @Prop({ required: true }) unit!: string;
  @Prop({ type: Number, required: true }) quantity!: number;
  @Prop({ type: Number, required: true }) weight_g!: number;
  @Prop({ type: Number, required: true }) cost_vnd!: number;
}
export const PlanMaterialSchema = SchemaFactory.createForClass(PlanMaterial);

@Schema({ _id: false })
export class PlanShortfall {
  @Prop({ required: true }) code!: string;
  @Prop({ type: Number, required: true }) missing!: number;
}
export const PlanShortfallSchema = SchemaFactory.createForClass(PlanShortfall);

@Schema({ _id: false })
export class PlanGuideStep {
  @Prop({ type: Number, required: true }) step!: number;
  @Prop({ required: true }) instruction!: string;
  @Prop({ type: String, default: null }) tip!: string | null;
}
export const PlanGuideStepSchema = SchemaFactory.createForClass(PlanGuideStep);

@Schema({ _id: false })
export class PlanGuide {
  @Prop({ type: String, required: true, enum: ['ai', 'template'] }) source!: 'ai' | 'template';
  @Prop({ type: String, default: null }) model!: string | null;
  @Prop({ type: String, default: null }) fallback_reason!: string | null;
  @Prop({ required: true }) summary!: string;
  @Prop({ type: [PlanGuideStepSchema], default: [] }) steps!: PlanGuideStep[];
  @Prop({ type: Date, required: true }) generated_at!: Date;
}
export const PlanGuideSchema = SchemaFactory.createForClass(PlanGuide);

/** 1 lần quét món vào kiện. `bypass` = lối tắt POST pack (không quét thật). */
@Schema({ _id: false })
export class PlanScan {
  @Prop({ required: true }) item_key!: string;
  @Prop({ required: true }) sku!: string;
  @Prop({ type: String, required: true, enum: SCAN_METHODS }) method!: ScanMethod;
  @Prop({ type: Types.ObjectId, default: null }) by!: Types.ObjectId | null;
  @Prop({ type: Date, required: true }) at!: Date;
  @Prop({ type: String, default: null }) client_event_id!: string | null;
}
export const PlanScanSchema = SchemaFactory.createForClass(PlanScan);

@Schema({ _id: false })
export class PlanWeighing {
  @Prop({ type: Number, required: true }) weight_kg!: number;
  @Prop({ type: String, required: true, enum: ['seal', 'reweigh'] }) kind!: 'seal' | 'reweigh';
  @Prop({ type: Boolean, required: true }) is_abnormal!: boolean;
  @Prop({ type: Types.ObjectId, default: null }) by!: Types.ObjectId | null;
  @Prop({ type: Date, required: true }) at!: Date;
}
export const PlanWeighingSchema = SchemaFactory.createForClass(PlanWeighing);

@Schema({ _id: false })
export class PlanParcelReview {
  @Prop({ type: String, required: true, enum: ['accept', 'reweigh', 'reopen'] })
  action!: 'accept' | 'reweigh' | 'reopen';
  @Prop({ required: true }) reason!: string;
  @Prop({ type: String, default: null }) note!: string | null;
  @Prop({ type: Types.ObjectId, required: true }) by!: Types.ObjectId;
  @Prop({ type: Date, required: true }) at!: Date;
}
export const PlanParcelReviewSchema = SchemaFactory.createForClass(PlanParcelReview);

@Schema({ _id: false })
export class PlanRecoveredMaterial {
  @Prop({ required: true }) code!: string;
  @Prop({ type: Number, required: true }) quantity!: number;
  @Prop({ type: String, required: true, enum: ['reused', 'discarded', 'unknown'] })
  outcome!: 'reused' | 'discarded' | 'unknown';
}
export const PlanRecoveredMaterialSchema = SchemaFactory.createForClass(PlanRecoveredMaterial);

@Schema({ _id: false })
export class PlanUnpack {
  /** Lý do phải tháo (đơn hủy...) — ghi lúc chuyển to_unpack. */
  @Prop({ required: true }) reason!: string;
  @Prop({ type: Date, required: true }) requested_at!: Date;
  @Prop({ type: String, default: null, enum: ['reusable', 'damaged', null] })
  box_condition!: 'reusable' | 'damaged' | null;
  @Prop({ type: Number, default: 0 }) units_restocked!: number;
  /** (05/10/2026) Thùng + vật tư chèn đã thu hồi/bỏ khi tháo. */
  @Prop({ type: [PlanRecoveredMaterialSchema], default: [] }) recovered_materials!: PlanRecoveredMaterial[];
  @Prop({ type: String, default: null }) note!: string | null;
  @Prop({ type: Types.ObjectId, default: null }) by!: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) done_at!: Date | null;
}
export const PlanUnpackSchema = SchemaFactory.createForClass(PlanUnpack);

@Schema({ _id: false })
export class PlanParcel {
  /** Số kiện 1..N trong cả nhóm (đánh lại sau mỗi lần chỉnh tay). */
  @Prop({ type: Number, required: true }) parcel_no!: number;
  @Prop({ type: Types.ObjectId, required: true }) order_id!: Types.ObjectId;
  @Prop({ type: String, default: null }) platform_order_id!: string | null;
  @Prop({ type: PlanBoxSchema, required: true }) box!: PlanBox;
  @Prop({ type: [PlanPlacementSchema], default: [] }) placements!: PlanPlacement[];
  @Prop({ type: Number, required: true }) fill_ratio!: number;
  /** true = kiện nhập tay, không có tọa độ xếp thật (placements chỉ liệt kê món). */
  @Prop({ type: Boolean, default: false }) manual_layout!: boolean;
  @Prop({ type: Number, required: true }) items_weight_g!: number;
  /** Hàng + bì thùng + vật tư. */
  @Prop({ type: Number, required: true }) estimated_weight_g!: number;
  @Prop({ type: Number, required: true }) volumetric_weight_g!: number;
  @Prop({ type: [PlanMaterialSchema], default: [] }) materials!: PlanMaterial[];
  @Prop({ type: Number, default: 0 }) materials_weight_g!: number;
  @Prop({ type: Number, default: 0 }) materials_cost_vnd!: number;
  /** Cước ước tính khi đã báo giá vận chuyển (module shipping). */
  @Prop({ type: Number, default: null }) shipping_cost_vnd!: number | null;
  @Prop({ type: PlanGuideSchema, default: null }) guide!: PlanGuide | null;
  @Prop({ type: Number, default: null }) actual_weight_kg!: number | null;
  @Prop({ type: Boolean, default: false }) is_abnormal!: boolean;
  @Prop({ type: [PlanShortfallSchema], default: [] }) materials_shortfall!: PlanShortfall[];
  // ---- phiên đóng gói (05/10/2026) — mọi trường có mặc định, bản ghi cũ đọc được.
  @Prop({ type: String, default: 'pending', enum: PARCEL_STATUSES }) status!: ParcelStatus;
  /** Kiện có món dễ vỡ — luật "dễ vỡ chỉ dùng thùng mới" (packing_settings). */
  @Prop({ type: Boolean, default: false }) has_fragile!: boolean;
  @Prop({ type: [PlanScanSchema], default: [] }) scans!: PlanScan[];
  /** Thùng + vật tư của kiện ĐÃ trừ tồn (lúc niêm phong lần đầu) — mở ra đóng lại không trừ lần 2. */
  @Prop({ type: Boolean, default: false }) box_consumed!: boolean;
  @Prop({ type: Types.ObjectId, default: null }) sealed_by!: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) sealed_at!: Date | null;
  @Prop({ type: [PlanWeighingSchema], default: [] }) weighings!: PlanWeighing[];
  @Prop({ type: [PlanParcelReviewSchema], default: [] }) reviews!: PlanParcelReview[];
  @Prop({ type: PlanUnpackSchema, default: null }) unpack!: PlanUnpack | null;
}
export const PlanParcelSchema = SchemaFactory.createForClass(PlanParcel);

@Schema({ _id: false })
export class PlanUnplaced {
  @Prop({ required: true }) item_key!: string;
  @Prop({ required: true }) code!: string;
  @Prop({ required: true }) reason!: string;
}
export const PlanUnplacedSchema = SchemaFactory.createForClass(PlanUnplaced);

/** Thùng kho đang thiếu so với phương án "giả định đủ tồn" (04/10/2026). */
@Schema({ _id: false })
export class PlanMissingBox {
  @Prop({ required: true }) box_code!: string;
  @Prop({ required: true }) box_name!: string;
  /** Số kiện dùng thùng này trong phương án giả định. */
  @Prop({ type: Number, required: true }) needed!: number;
  /** Số thùng còn trống lúc tính (đã trừ giữ chỗ của nhóm khác). */
  @Prop({ type: Number, required: true }) available!: number;
}
export const PlanMissingBoxSchema = SchemaFactory.createForClass(PlanMissingBox);

/**
 * Gợi ý kho thùng (04/10/2026): nếu kho đủ các thùng ở `missing` thì đơn sẽ
 * đóng được như dưới đây. Chụp LÚC TÍNH — đổi thùng/chuyển món không tính lại.
 */
@Schema({ _id: false })
export class PlanStockSuggestion {
  @Prop({ type: Number, required: true }) parcels!: number;
  @Prop({ type: Number, required: true }) packaging_cost_vnd!: number;
  @Prop({ type: Number, required: true }) avg_fill!: number;
  @Prop({ type: Number, required: true }) current_parcels!: number;
  @Prop({ type: Number, required: true }) current_avg_fill!: number;
  /** Tiền thùng + vật tư rẻ hơn so với phương án hiện tại (âm = đắt hơn nhưng ít kiện hơn). */
  @Prop({ type: Number, required: true }) saving_vnd!: number;
  @Prop({ type: [PlanMissingBoxSchema], default: [] }) missing!: PlanMissingBox[];
}
export const PlanStockSuggestionSchema = SchemaFactory.createForClass(PlanStockSuggestion);

@Schema({ _id: false })
export class PlanOrder {
  @Prop({ type: Types.ObjectId, required: true }) order_id!: Types.ObjectId;
  @Prop({ type: String, default: null }) platform_order_id!: string | null;
  /** ok = mọi món có kiện; partial/no_fit = còn món chưa xếp (phải xử lý trước khi duyệt). */
  /** canceled (05/10/2026) = đơn bị hủy sau khi đã bắt đầu đóng — kiện của đơn phải tháo. */
  @Prop({ type: String, required: true, enum: ['ok', 'partial', 'no_fit', 'canceled'] })
  status!: 'ok' | 'partial' | 'no_fit' | 'canceled';
  @Prop({ type: [PlanUnplacedSchema], default: [] }) unplaced!: PlanUnplaced[];
  @Prop({ type: String, required: true, enum: PROOF_LABELS }) proof!: PlanProofLabel;
  @Prop({ type: Number, default: 0 }) lower_bound_parcels!: number;
  @Prop({ type: [String], default: [] }) explanation!: string[];
  @Prop({ required: true }) strategy!: string;
  @Prop({ type: String, required: true, enum: CP_SAT_STATES }) cp_sat!: CpSatState;
  @Prop({ type: PlanStockSuggestionSchema, default: null }) stock_suggestion!: PlanStockSuggestion | null;
  /** Số kiện vượt `max_parcels_per_order` trong packing_settings — duyệt phải ghi lý do. */
  @Prop({ type: Boolean, default: false }) over_parcel_limit!: boolean;
}
export const PlanOrderSchema = SchemaFactory.createForClass(PlanOrder);

@Schema({ _id: false })
export class PlanItemProfile {
  @Prop({ required: true }) sku!: string;
  @Prop({ type: String, default: null }) product_category!: string | null;
  @Prop({ type: String, default: null }) zip_bag_code!: string | null;
  @Prop({ type: Boolean, default: false }) zip_bag_folded!: boolean;
}
export const PlanItemProfileSchema = SchemaFactory.createForClass(PlanItemProfile);

@Schema({ _id: false })
export class PlanAdjustment {
  @Prop({ type: String, required: true, enum: ['change_box', 'move_item', 'manual_pack', 'change_box_in_session', 'unseal'] })
  kind!: 'change_box' | 'move_item' | 'manual_pack' | 'change_box_in_session' | 'unseal';
  /** (08/10/2026) Chỉ có ở change_box_in_session: thùng cũ chưa dùng hay đã hỏng (ghi hao hụt). */
  @Prop({ type: String, default: null, enum: ['unused', 'damaged', null] }) old_box_outcome?: 'unused' | 'damaged' | null;
  @Prop({ type: Number, default: 0 }) waste_cost_vnd?: number;
  @Prop({ required: true }) detail!: string;
  @Prop({ required: true }) reason!: string;
  /** (08/10/2026) SKU và thùng bị chạm — để báo cáo feedback gom theo SKU/thùng. */
  @Prop({ type: [String], default: [] }) skus!: string[];
  @Prop({ type: [String], default: [] }) box_codes!: string[];
  @Prop({ type: String, default: null }) note!: string | null;
  @Prop({ type: Types.ObjectId, required: true }) by!: Types.ObjectId;
  @Prop({ type: Date, required: true }) at!: Date;
}
export const PlanAdjustmentSchema = SchemaFactory.createForClass(PlanAdjustment);

/** Sự cố báo lúc đóng (05/10/2026). */
@Schema({ _id: false })
export class PlanIssue {
  @Prop({ type: Number, required: true }) parcel_no!: number;
  @Prop({ required: true }) item_key!: string;
  @Prop({ required: true }) sku!: string;
  @Prop({ type: String, required: true, enum: ['damaged', 'missing', 'wrong_item'] })
  issue!: 'damaged' | 'missing' | 'wrong_item';
  @Prop({ type: String, required: true, enum: ['replaced', 'back_to_picking'] })
  resolution!: 'replaced' | 'back_to_picking';
  @Prop({ type: String, default: null }) note!: string | null;
  @Prop({ type: Types.ObjectId, required: true }) by!: Types.ObjectId;
  @Prop({ type: Date, required: true }) at!: Date;
}
export const PlanIssueSchema = SchemaFactory.createForClass(PlanIssue);

/** Nhật ký thao tác phiên đóng gói không thuộc kiện/sự cố riêng (05/10/2026). */
@Schema({ _id: false })
export class PlanActivity {
  @Prop({ type: String, required: true, enum: ['start', 'unscan', 'assign', 'finish', 'unseal'] })
  kind!: 'start' | 'unscan' | 'assign' | 'finish' | 'unseal';
  @Prop({ type: Number, default: null }) parcel_no!: number | null;
  @Prop({ required: true }) detail!: string;
  @Prop({ type: String, default: null }) reason!: string | null;
  @Prop({ type: Types.ObjectId, default: null }) by!: Types.ObjectId | null;
  @Prop({ type: Date, required: true }) at!: Date;
}
export const PlanActivitySchema = SchemaFactory.createForClass(PlanActivity);

@Schema({ _id: false })
export class PlanSolverOptions {
  @Prop({ type: [String], default: [] }) exclude_box_codes!: string[];
  @Prop({ type: String, required: true, enum: ['fewest_parcels', 'cheapest'] })
  prefer!: 'fewest_parcels' | 'cheapest';
  /** Đệm hàng dễ vỡ (mm) dùng lúc tính — mọi lần dựng lại món của kế hoạch PHẢI dùng đúng số này. */
  @Prop({ type: Number, default: 5 }) fragile_cushion_mm!: number;
}
export const PlanSolverOptionsSchema = SchemaFactory.createForClass(PlanSolverOptions);

@Schema({ _id: false })
export class PlanSolver {
  @Prop({ required: true }) engine_version!: string;
  @Prop({ type: Number, default: 0 }) computation_ms!: number;
  @Prop({ type: PlanSolverOptionsSchema, required: true }) options!: PlanSolverOptions;
}
export const PlanSolverSchema = SchemaFactory.createForClass(PlanSolver);

@Schema({
  collection: 'packing_plans',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class PackingPlan {
  @Prop({ type: Types.ObjectId, required: true, ref: 'OrderGroup' })
  order_group_id!: Types.ObjectId;

  /** Lần tính thứ mấy của nhóm này (1, 2, …) — để đối chiếu lịch sử. */
  @Prop({ type: Number, required: true, min: 1 }) revision!: number;

  /** Khóa lạc quan: tăng ở mọi thay đổi người dùng thấy được. */
  @Prop({ type: Number, default: 1 }) version!: number;

  @Prop({ type: Boolean, default: true }) is_active!: boolean;

  @Prop({ type: String, required: true, enum: PACKING_PLAN_STATUSES }) status!: PackingPlanStatus;

  @Prop({ type: String, default: null }) failure_reason!: string | null;

  @Prop({ type: [PlanOrderSchema], default: [] }) orders!: PlanOrder[];

  @Prop({ type: [PlanParcelSchema], default: [] }) parcels!: PlanParcel[];

  @Prop({ type: [PlanItemProfileSchema], default: [] }) item_profiles!: PlanItemProfile[];

  @Prop({ type: [PlanAdjustmentSchema], default: [] }) adjustments!: PlanAdjustment[];

  @Prop({ type: PlanSolverSchema, required: true }) solver!: PlanSolver;

  @Prop({ type: Types.ObjectId, default: null }) approved_by!: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) approved_at!: Date | null;
  @Prop({ type: Types.ObjectId, default: null }) rejected_by!: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) rejected_at!: Date | null;
  @Prop({ type: String, default: null }) rejection_reason!: string | null;
  // ---- từ chối có kiểm soát (08/10/2026)
  @Prop({ type: String, default: null }) rejection_reason_code!: string | null;
  @Prop({ type: Types.ObjectId, default: null }) rejection_owner_id!: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) rejection_due_at!: Date | null;
  /** Cách đã xử lý: tính lại / đóng thủ công. null = chưa xử lý. */
  @Prop({ type: String, default: null, enum: ['recompute', 'manual', null] })
  rejection_resolution!: 'recompute' | 'manual' | null;
  @Prop({ type: Date, default: null }) rejection_resolved_at!: Date | null;
  /** Đã nhắc quá hạn xử lý (chỉ nhắc 1 lần). */
  @Prop({ type: Date, default: null }) rejection_overdue_notified_at!: Date | null;
  /** solver = bộ giải tính ra; manual = người xử lý nhập kiện thật sau khi từ chối. */
  @Prop({ type: String, default: 'solver', enum: ['solver', 'manual'] }) source!: 'solver' | 'manual';
  @Prop({ type: Types.ObjectId, default: null }) packed_by!: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) packed_at!: Date | null;

  // ---- phiên đóng gói, phân công, sự cố (05/10/2026)
  @Prop({ type: String, default: null }) approve_override_reason!: string | null;
  @Prop({ type: Types.ObjectId, default: null }) assigned_packer_id!: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) assigned_packer_at!: Date | null;
  @Prop({ type: Types.ObjectId, default: null }) packing_started_by!: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) packing_started_at!: Date | null;
  /** scan = mọi kiện quét kiểm; quick = có kiện đi lối tắt POST pack (không quét). */
  @Prop({ type: String, default: null, enum: ['scan', 'quick', null] }) pack_mode!: 'scan' | 'quick' | null;
  @Prop({ type: [PlanIssueSchema], default: [] }) issues!: PlanIssue[];
  @Prop({ type: [PlanActivitySchema], default: [] }) activity!: PlanActivity[];

  created_at?: Date;
  updated_at?: Date;
}

export type PackingPlanDocument = HydratedDocument<PackingPlan>;
export const PackingPlanSchema = SchemaFactory.createForClass(PackingPlan);

// Mỗi nhóm chỉ 1 kế hoạch đang hoạt động — cũng là "khóa" chống 2 job cùng tính 1 nhóm.
PackingPlanSchema.index(
  { order_group_id: 1 },
  { unique: true, partialFilterExpression: { is_active: true }, name: 'uniq_active_plan_per_group' },
);
// Giữ chỗ thùng: GET /packaging/boxes, mọi lần tính phương án (listAvailability).
PackingPlanSchema.index({ is_active: 1, status: 1 });
// Lịch sử các lần tính của 1 nhóm.
PackingPlanSchema.index({ order_group_id: 1, revision: -1 });
// Báo cáo hiệu suất đóng gói: GET /packing/reports/summary (lọc packed theo packed_at).
PackingPlanSchema.index({ status: 1, packed_at: -1 });
// Tự giao người đóng: đếm kế hoạch đang mở của từng Packaging Staff.
PackingPlanSchema.index({ assigned_packer_id: 1, is_active: 1, status: 1 });
// Nhắc kế hoạch bị từ chối quá hạn + báo cáo feedback (cần xử lý trước hạn).
PackingPlanSchema.index({ status: 1, rejection_due_at: 1 });
// Báo cáo feedback: kế hoạch từng bị từ chối theo thời điểm.
PackingPlanSchema.index({ rejected_at: -1 });
