import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MarketplacePlatform } from '../../marketplace-integration/enums/platform.enum';

/**
 * K4a — nối SKU của từng sàn/shop về SKU nội bộ. 1 SKU sàn chỉ nối được 1 SKU nội bộ;
 * nhiều SKU sàn (Lazada, Tiki, shop khác) có thể cùng nối về 1 SKU nội bộ.
 * Khóa tra cứu dùng bản CHUẨN HÓA (trim + chữ hoa) — sàn phân biệt hoa/thường,
 * người gõ thì hay lệch; giữ bản gốc để hiển thị/đối chiếu.
 */
@Schema({ collection: 'marketplace_sku_mappings', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class MarketplaceSkuMapping {
  @Prop({ type: String, enum: MarketplacePlatform, required: true }) platform!: MarketplacePlatform;
  @Prop({ required: true }) shop_id!: string;
  @Prop({ required: true }) seller_sku!: string;
  @Prop({ required: true }) seller_sku_normalized!: string;
  @Prop({ required: true, index: true }) master_sku!: string;
  @Prop({ required: true }) created_by!: string;
  created_at?: Date;
}
export type MarketplaceSkuMappingDocument = HydratedDocument<MarketplaceSkuMapping>;
export const MarketplaceSkuMappingSchema = SchemaFactory.createForClass(MarketplaceSkuMapping);
MarketplaceSkuMappingSchema.index({ platform: 1, shop_id: 1, seller_sku_normalized: 1 }, { unique: true });
