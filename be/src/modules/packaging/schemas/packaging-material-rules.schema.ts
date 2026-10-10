import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { MATERIAL_TYPES, type MaterialType } from '../engine/types';

export const MATERIAL_RULE_SCOPES = ['fragile', 'shoes', 'fragile_or_shoes', 'any'] as const;
export const MATERIAL_RULE_BASES = ['per_unit', 'per_extra_unit', 'per_carton', 'void_band'] as const;

@Schema({ _id: false })
export class MaterialVoidBandEntry {
  @Prop({ type: Number, required: true, min: 0, max: 1 }) min_void_ratio!: number;
  @Prop({ type: Number, required: true, min: 0 }) quantity!: number;
}
export const MaterialVoidBandEntrySchema = SchemaFactory.createForClass(MaterialVoidBandEntry);

@Schema({ _id: false })
export class MaterialRuleEntry {
  @Prop({ type: String, enum: MATERIAL_TYPES, required: true }) material_type!: MaterialType;
  @Prop({ type: String, enum: MATERIAL_RULE_SCOPES, required: true }) applies_to!: (typeof MATERIAL_RULE_SCOPES)[number];
  @Prop({ type: Number, default: 1, min: 1 }) min_units!: number;
  @Prop({ type: String, enum: MATERIAL_RULE_BASES, required: true }) basis!: (typeof MATERIAL_RULE_BASES)[number];
  @Prop({ type: Number, default: 0, min: 0 }) quantity!: number;
  @Prop({ type: [MaterialVoidBandEntrySchema], default: [] }) void_bands!: MaterialVoidBandEntry[];
}
export const MaterialRuleEntrySchema = SchemaFactory.createForClass(MaterialRuleEntry);

/**
 * ===================================================================
 * packaging_material_rules — MỚI (28/09/2026, P1) — bộ luật chọn vật tư
 * ===================================================================
 * Luật là dữ liệu có version (không hard-code if/else như fallback cũ).
 * Mỗi lần Admin lưu luật = 1 document MỚI (version tăng), bản cũ tắt
 * `is_active` — giữ lịch sử phục vụ audit. Chưa có document nào → engine
 * dùng DEFAULT_MATERIAL_RULES trong code.
 * ===================================================================
 */
@Schema({
  collection: 'packaging_material_rules',
  timestamps: { createdAt: 'created_at', updatedAt: false },
})
export class PackagingMaterialRules {
  @Prop({ type: Number, required: true, min: 1 })
  version!: number;

  @Prop({ type: [MaterialRuleEntrySchema], default: [] })
  rules!: MaterialRuleEntry[];

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  updated_by!: Types.ObjectId | null;

  @Prop({ type: Boolean, default: true })
  is_active!: boolean;

  created_at?: Date;
}

export type PackagingMaterialRulesDocument = HydratedDocument<PackagingMaterialRules>;
export const PackagingMaterialRulesSchema = SchemaFactory.createForClass(PackagingMaterialRules);

// Rule #5 — mỗi version chỉ tồn tại một lần (chống 2 Admin lưu đồng thời cùng version).
PackagingMaterialRulesSchema.index({ version: 1 }, { unique: true });
// Phục vụ: đọc bộ luật đang dùng.
PackagingMaterialRulesSchema.index({ is_active: 1, version: -1 });
