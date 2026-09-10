import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MarketplacePlatform } from '../../marketplace-integration/enums/platform.enum';

/**
 * Rule #1 (Database Design Standards, CLAUDE.md) — sub-schema riêng
 * cho kích thước, KHÔNG dùng type: Object.
 */
@Schema({ _id: false })
export class PackageDimension {
  @Prop({ required: true }) package_length_cm!: number;
  @Prop({ required: true }) package_width_cm!: number;
  @Prop({ required: true }) package_height_cm!: number;
  @Prop({ required: true }) package_weight_kg!: number;
}
export const PackageDimensionSchema = SchemaFactory.createForClass(PackageDimension);

/**
 * ===================================================================
 * product_master — module MỚI HOÀN TOÀN, không đụng gì tới
 * marketplace-integration/ hay orders/ hiện có (chỉ ĐỌC LazadaAdapter
 * đã export sẵn, xem product-master.service.ts).
 * ===================================================================
 */
@Schema({
  collection: 'product_master',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class ProductMaster {
  @Prop({ type: String, enum: MarketplacePlatform, required: true })
  platform!: MarketplacePlatform;

  @Prop({ type: String, required: true })
  shop_id!: string; // String, khớp đúng kiểu Order.shop_id đã có (không phải ObjectId)

  @Prop({ type: String, required: true })
  seller_sku!: string;

  @Prop({ type: PackageDimensionSchema, required: true })
  dimension!: PackageDimension;

  @Prop({ default: false })
  is_fragile!: boolean; // phục vụ BR-06, PackableItem.is_fragile

  @Prop({ required: true })
  last_synced_at!: Date; // mốc cho chiến lược cache 1 lần/ngày

  created_at?: Date;
  updated_at?: Date;
}

export type ProductMasterDocument = HydratedDocument<ProductMaster>;
export const ProductMasterSchema = SchemaFactory.createForClass(ProductMaster);

/**
 * Rule #5 (unique constraint ở tầng DB) — có `platform` trong key,
 * KHÁC thiết kế nháp ban đầu (chỉ {shop_id, seller_sku}) — sửa sau khi
 * rà kiến trúc đa sàn: seller_sku là chuỗi seller TỰ ĐẶT, không đảm
 * bảo duy nhất giữa các sàn khác nhau (trùng ngẫu nhiên Lazada/TikTok
 * hoàn toàn có thể xảy ra).
 */
ProductMasterSchema.index({ platform: 1, shop_id: 1, seller_sku: 1 }, { unique: true });
