import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  BoxDimensionsMm,
  BoxDimensionsMmSchema,
} from '../../packaging/schemas/packaging-box.schema';

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
  'packed',
  'rejected',
  'failed',
  'superseded',
] as const;
export type PackingPlanStatus = (typeof PACKING_PLAN_STATUSES)[number];

/** Trạng thái còn GIỮ CHỖ thùng (soft reservation) — chưa đóng, chưa bỏ. */
export const RESERVING_PLAN_STATUSES: PackingPlanStatus[] = ['ready', 'approved'];

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

@Schema({ _id: false })
export class PlanParcel {
  /** Số kiện 1..N trong cả nhóm (đánh lại sau mỗi lần chỉnh tay). */
  @Prop({ type: Number, required: true }) parcel_no!: number;
  @Prop({ type: Types.ObjectId, required: true }) order_id!: Types.ObjectId;
  @Prop({ type: String, default: null }) platform_order_id!: string | null;
  @Prop({ type: PlanBoxSchema, required: true }) box!: PlanBox;
  @Prop({ type: [PlanPlacementSchema], default: [] }) placements!: PlanPlacement[];
  @Prop({ type: Number, required: true }) fill_ratio!: number;
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
}
export const PlanParcelSchema = SchemaFactory.createForClass(PlanParcel);

@Schema({ _id: false })
export class PlanUnplaced {
  @Prop({ required: true }) item_key!: string;
  @Prop({ required: true }) code!: string;
  @Prop({ required: true }) reason!: string;
}
export const PlanUnplacedSchema = SchemaFactory.createForClass(PlanUnplaced);

@Schema({ _id: false })
export class PlanOrder {
  @Prop({ type: Types.ObjectId, required: true }) order_id!: Types.ObjectId;
  @Prop({ type: String, default: null }) platform_order_id!: string | null;
  /** ok = mọi món có kiện; partial/no_fit = còn món chưa xếp (phải xử lý trước khi duyệt). */
  @Prop({ type: String, required: true, enum: ['ok', 'partial', 'no_fit'] }) status!: 'ok' | 'partial' | 'no_fit';
  @Prop({ type: [PlanUnplacedSchema], default: [] }) unplaced!: PlanUnplaced[];
  @Prop({ type: String, required: true, enum: PROOF_LABELS }) proof!: PlanProofLabel;
  @Prop({ type: Number, default: 0 }) lower_bound_parcels!: number;
  @Prop({ type: [String], default: [] }) explanation!: string[];
  @Prop({ required: true }) strategy!: string;
  @Prop({ type: String, required: true, enum: CP_SAT_STATES }) cp_sat!: CpSatState;
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
  @Prop({ type: String, required: true, enum: ['change_box', 'move_item'] }) kind!: 'change_box' | 'move_item';
  @Prop({ required: true }) detail!: string;
  @Prop({ required: true }) reason!: string;
  @Prop({ type: String, default: null }) note!: string | null;
  @Prop({ type: Types.ObjectId, required: true }) by!: Types.ObjectId;
  @Prop({ type: Date, required: true }) at!: Date;
}
export const PlanAdjustmentSchema = SchemaFactory.createForClass(PlanAdjustment);

@Schema({ _id: false })
export class PlanSolverOptions {
  @Prop({ type: [String], default: [] }) exclude_box_codes!: string[];
  @Prop({ type: String, required: true, enum: ['fewest_parcels', 'cheapest'] })
  prefer!: 'fewest_parcels' | 'cheapest';
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
  @Prop({ type: Types.ObjectId, default: null }) packed_by!: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) packed_at!: Date | null;

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
