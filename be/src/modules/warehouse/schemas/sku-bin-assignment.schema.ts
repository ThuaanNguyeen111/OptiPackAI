import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { MarketplacePlatform } from '../../marketplace-integration/enums/platform.enum';

/**
 * sku_bin_assignments — tầng 4/4, nối SKU (đã có trong product_master,
 * KHÔNG sửa schema đó) vào 1 bin_location cụ thể. TÁI SỬ DỤNG đúng
 * khóa {platform, shop_id, seller_sku} đã có ở product_master — không
 * tạo khóa lạ, dễ join khi cần.
 */
@Schema({ collection: 'sku_bin_assignments', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class SkuBinAssignment {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Warehouse', index: true })
  warehouse_id!: Types.ObjectId;

  @Prop({ type: String, enum: MarketplacePlatform, required: true })
  platform!: MarketplacePlatform;

  @Prop({ required: true })
  shop_id!: string;

  @Prop({ required: true })
  seller_sku!: string;

  @Prop({ type: Types.ObjectId, required: true, ref: 'BinLocation' })
  bin_location_id!: Types.ObjectId;

  // BỔ SUNG (2026-09-10) — Điểm yếu #10 mục 1 (CLAUDE.md): CORE, không
  // phải tính năng WMS nâng cao — biết còn/hết hàng là thông tin cơ
  // bản nhất của hệ thống kho. Trừ bằng atomic $inc lúc pick-item
  // (order-groups/order-groups.service.ts), KHÔNG đọc-rồi-ghi.
  @Prop({ type: Number, required: true, default: 0, min: 0 })
  quantity_on_hand!: number;

  created_at?: Date;
  updated_at?: Date;
}

export type SkuBinAssignmentDocument = HydratedDocument<SkuBinAssignment>;
export const SkuBinAssignmentSchema = SchemaFactory.createForClass(SkuBinAssignment);

SkuBinAssignmentSchema.index(
  { warehouse_id: 1, platform: 1, shop_id: 1, seller_sku: 1 },
  { unique: true },
);
