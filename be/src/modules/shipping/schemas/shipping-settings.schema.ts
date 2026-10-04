import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * ===================================================================
 * shipping_settings — MỚI (30/09/2026): tùy chọn vận chuyển của Store Owner
 * ===================================================================
 * Đề bài: Store Owner "configure shipping preferences". 1 tài liệu duy nhất
 * (`key: 'default'`, unique) — hệ thống nội bộ 1 cửa hàng, không multi-tenant.
 *  - `cheapest`: đề xuất dịch vụ rẻ nhất; `fastest`: nhanh nhất;
 *  - `fixed`: luôn đề xuất dịch vụ mặc định (nếu còn hợp lệ, không thì rẻ nhất).
 * ===================================================================
 */
@Schema({
  collection: 'shipping_settings',
  timestamps: { createdAt: false, updatedAt: 'updated_at' },
})
export class ShippingSettings {
  @Prop({ type: String, required: true, default: 'default' })
  key!: string;

  @Prop({
    type: String,
    enum: ['cheapest', 'fastest', 'fixed'],
    default: 'cheapest',
  })
  strategy!: 'cheapest' | 'fastest' | 'fixed';

  @Prop({ type: String, default: null })
  default_carrier_code!: string | null;

  @Prop({ type: String, default: null })
  default_service_code!: string | null;

  @Prop({ type: Types.ObjectId, default: null })
  updated_by!: Types.ObjectId | null;

  updated_at?: Date;
}

export type ShippingSettingsDocument = HydratedDocument<ShippingSettings>;
export const ShippingSettingsSchema =
  SchemaFactory.createForClass(ShippingSettings);

ShippingSettingsSchema.index({ key: 1 }, { unique: true });
