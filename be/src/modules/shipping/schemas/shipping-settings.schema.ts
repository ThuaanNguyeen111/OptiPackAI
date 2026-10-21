import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

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

  /**
   * (21/10/2026) Người gửi in trên nhãn vận đơn tự in (tên, SĐT, địa chỉ kho gửi) — để
   * kiện không giao được biết hoàn về đâu. Bỏ trống → lấy tên + địa chỉ kho đang hoạt động.
   */
  @Prop({ type: String, default: null })
  sender_name!: string | null;

  @Prop({ type: String, default: null })
  sender_phone!: string | null;

  @Prop({ type: String, default: null })
  sender_address!: string | null;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  updated_by!: Types.ObjectId | null;

  updated_at?: Date;
}

export type ShippingSettingsDocument = HydratedDocument<ShippingSettings>;
export const ShippingSettingsSchema =
  SchemaFactory.createForClass(ShippingSettings);

ShippingSettingsSchema.index({ key: 1 }, { unique: true });
