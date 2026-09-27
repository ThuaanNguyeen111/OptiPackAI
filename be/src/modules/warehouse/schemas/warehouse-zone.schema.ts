import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * warehouse_zones — tầng 2/4 ("khu", VD "Khu A - Phụ kiện điện tử").
 */
@Schema({ collection: 'warehouse_zones', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class WarehouseZone {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Warehouse', index: true })
  warehouse_id!: Types.ObjectId;

  @Prop({ required: true })
  zone_code!: string; // VD "A"

  @Prop({ required: true })
  zone_name!: string; // VD "Phụ kiện điện tử"

  @Prop({ default: '' })
  description!: string;

  // BỔ SUNG (26/09/2026, K1) — xóa mềm. Document CŨ (tạo trước K1) KHÔNG có
  // field này: mọi truy vấn lọc bằng `is_active: { $ne: false }` để coi
  // document cũ là đang hoạt động — KHÔNG cần script migration.
  @Prop({ default: true })
  is_active?: boolean; // optional ở tầng TYPE: document cũ thật sự không có field

  created_at?: Date;
  updated_at?: Date;
}

export type WarehouseZoneDocument = HydratedDocument<WarehouseZone>;
export const WarehouseZoneSchema = SchemaFactory.createForClass(WarehouseZone);

// Rule #5 (unique constraint tầng DB) — zone_code duy nhất TRONG 1 kho,
// không phải duy nhất toàn hệ thống (2 kho khác nhau có thể cùng đặt "A").
WarehouseZoneSchema.index({ warehouse_id: 1, zone_code: 1 }, { unique: true });
