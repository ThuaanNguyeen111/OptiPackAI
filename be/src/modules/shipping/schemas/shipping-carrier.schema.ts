import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class ShippingRateBand {
  @Prop({ type: Number, required: true, min: 1 }) up_to_g!: number;
  @Prop({ type: Number, required: true, min: 0 }) price_vnd!: number;
}
export const ShippingRateBandSchema =
  SchemaFactory.createForClass(ShippingRateBand);

/** 1 dịch vụ của hãng (VD nhanh / tiết kiệm): thời gian giao dự kiến + bảng cước theo bậc khối lượng. */
@Schema({ _id: false })
export class ShippingCarrierService {
  @Prop({ type: String, required: true }) code!: string;
  @Prop({ type: String, required: true }) name!: string;
  @Prop({ type: Number, required: true, min: 0 }) eta_min_days!: number;
  @Prop({ type: Number, required: true, min: 0 }) eta_max_days!: number;
  @Prop({ type: [ShippingRateBandSchema], default: [] })
  bands!: ShippingRateBand[];
  @Prop({ type: Number, default: 0, min: 0 }) extra_price_vnd_per_500g!: number;
}
export const ShippingCarrierServiceSchema = SchemaFactory.createForClass(
  ShippingCarrierService,
);

/**
 * ===================================================================
 * shipping_carriers — MỚI (30/09/2026): danh mục hãng vận chuyển + bảng cước
 * ===================================================================
 * Cước do Admin cấu hình. `is_sample = true` = số mẫu tự đặt để chạy được luồng
 * (chưa phải cước thật của hãng nào) — phải hiển thị rõ để không ai nhầm.
 * `volumetric_divisor` (cm³/kg) dùng tính cân quy đổi thể tích của hãng.
 * ===================================================================
 */
@Schema({
  collection: 'shipping_carriers',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class ShippingCarrier {
  @Prop({ type: String, required: true }) code!: string;
  @Prop({ type: String, required: true }) name!: string;
  @Prop({ type: Number, required: true, default: 5000, min: 1000 })
  volumetric_divisor!: number;
  @Prop({ type: [ShippingCarrierServiceSchema], default: [] })
  services!: ShippingCarrierService[];
  @Prop({ type: Boolean, default: false }) is_sample!: boolean;
  @Prop({ type: Boolean, default: true }) is_active!: boolean;

  created_at?: Date;
  updated_at?: Date;
}

export type ShippingCarrierDocument = HydratedDocument<ShippingCarrier>;
export const ShippingCarrierSchema =
  SchemaFactory.createForClass(ShippingCarrier);

ShippingCarrierSchema.index({ code: 1 }, { unique: true });
