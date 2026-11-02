import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { OrderStatus } from '../enums/order-status.enum';
import {
  CONSOLIDATION_KEY_FIELDS,
  CONSOLIDATION_RULE_FIELDS,
  CONSOLIDATION_RULE_MATCHES,
  OPEN_GROUP_STATUS_CHOICES,
  SYNC_PLATFORMS,
} from '../order-sync-policy';

@Schema({ _id: false })
export class PlatformSyncToggle {
  @Prop({ type: String, required: true }) platform!: string;
  @Prop({ type: Boolean, required: true }) auto_sync_enabled!: boolean;
}
export const PlatformSyncToggleSchema = SchemaFactory.createForClass(PlatformSyncToggle);

/** 31/10/2026 — 1 trường của quy tắc gộp bổ sung. */
@Schema({ _id: false })
export class ConsolidationRuleFieldEntry {
  @Prop({ type: String, enum: CONSOLIDATION_RULE_FIELDS, required: true }) field!: string;
  @Prop({ type: String, enum: CONSOLIDATION_RULE_MATCHES, required: true }) match!: string;
}
export const ConsolidationRuleFieldEntrySchema = SchemaFactory.createForClass(ConsolidationRuleFieldEntry);

/**
 * 31/10/2026 — quy tắc gộp bổ sung (GUIDE_DOC/CONSOLIDATION_RULES_DESIGN.md). `rule_id` giữ nguyên
 * qua các phiên bản cấu hình (là 1 phần của khoá trong orders.consolidation_keys).
 */
@Schema({ _id: false })
export class ConsolidationRuleEntry {
  @Prop({ type: String, required: true }) rule_id!: string;
  @Prop({ type: String, required: true, trim: true, maxlength: 80 }) name!: string;
  @Prop({ type: String, default: null, maxlength: 500 }) source_text!: string | null;
  @Prop({ type: [ConsolidationRuleFieldEntrySchema], required: true }) fields!: ConsolidationRuleFieldEntry[];
  @Prop({ type: [String], enum: SYNC_PLATFORMS, default: [] }) platforms!: string[];
  @Prop({ type: Number, default: null, min: 1, max: 720 }) max_window_hours!: number | null;
  @Prop({ type: Boolean, required: true }) enabled!: boolean;
}
export const ConsolidationRuleEntrySchema = SchemaFactory.createForClass(ConsolidationRuleEntry);

/**
 * ===================================================================
 * order_sync_settings — tiêu chí đồng bộ & gom đơn Admin chỉnh được (15/10/2026)
 * ===================================================================
 * Mỗi lần lưu = 1 document MỚI (version tăng), bản cũ tắt `is_active` — giữ lịch
 * sử ai đổi gì lúc nào (cùng cách packing_settings). Chưa có document → dùng
 * DEFAULT_ORDER_SYNC_POLICY (order-sync-policy.ts) = giá trị cũ trong code.
 * ===================================================================
 */
@Schema({ collection: 'order_sync_settings', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class OrderSyncSettings {
  @Prop({ type: Number, required: true, min: 1 }) version!: number;

  // ---- Đồng bộ
  @Prop({ type: [PlatformSyncToggleSchema], default: [] }) platforms!: PlatformSyncToggle[];
  @Prop({ type: Number, required: true, min: 5, max: 1440 }) interval_minutes!: number;
  @Prop({ type: Number, required: true, min: 1, max: 90 }) first_sync_lookback_days!: number;
  @Prop({ type: Number, required: true, min: 5, max: 1440 }) sync_failed_cooldown_minutes!: number;

  // ---- Gom đơn
  @Prop({ type: Boolean, required: true }) consolidation_enabled!: boolean;
  @Prop({ type: [String], enum: CONSOLIDATION_KEY_FIELDS, required: true }) consolidation_key_fields!: string[];
  @Prop({ type: Number, default: null, min: 1, max: 720 }) consolidation_time_window_hours!: number | null;
  @Prop({ type: [String], enum: OPEN_GROUP_STATUS_CHOICES, required: true }) open_group_statuses!: string[];
  // 31/10/2026 — bản cũ không có trường này → coi như [] (chạy y như trước).
  @Prop({ type: [ConsolidationRuleEntrySchema], default: [] }) consolidation_rules?: ConsolidationRuleEntry[];

  // ---- Trạng thái đơn
  @Prop({ type: [String], enum: OrderStatus, required: true }) consolidatable_statuses!: OrderStatus[];
  @Prop({ type: [String], enum: OrderStatus, required: true }) not_packable_statuses!: OrderStatus[];

  @Prop({ type: String, default: null }) note!: string | null;
  @Prop({ type: SchemaTypes.ObjectId, default: null }) updated_by!: Types.ObjectId | null;
  @Prop({ type: Boolean, default: true }) is_active!: boolean;

  created_at?: Date;
}

export type OrderSyncSettingsDocument = HydratedDocument<OrderSyncSettings>;
export const OrderSyncSettingsSchema = SchemaFactory.createForClass(OrderSyncSettings);
// Mỗi version chỉ 1 lần (2 người lưu đồng thời → 1 người nhận lỗi, tải lại).
OrderSyncSettingsSchema.index({ version: 1 }, { unique: true });
