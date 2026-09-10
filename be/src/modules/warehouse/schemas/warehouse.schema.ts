import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * ===================================================================
 * warehouse — tầng 1/4, MỚI (2026-09-09). Thiết kế đã CHỐT SẴN từ
 * trước trong CLAUDE.md, mục "Nghiên cứu Actor & Hệ thống Kho vị trí"
 * — implement ĐÚNG như đã thiết kế.
 * ===================================================================
 * Căn cứ đề bài (Phieu_FA26SE036.docx): "Group orders by warehouse"
 * (Order Consolidation) xác nhận hệ thống PHẢI hỗ trợ nhiều kho, không
 * chỉ 1 — System Administrator có trách nhiệm "Manage warehouse
 * configuration".
 * ===================================================================
 */
@Schema({ collection: 'warehouses', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class Warehouse {
  @Prop({ required: true, unique: true })
  warehouse_code!: string;

  @Prop({ required: true })
  warehouse_name!: string;

  @Prop({ required: true })
  address!: string;

  @Prop({ default: true })
  is_active!: boolean;

  created_at?: Date;
  updated_at?: Date;
}

export type WarehouseDocument = HydratedDocument<Warehouse>;
export const WarehouseSchema = SchemaFactory.createForClass(Warehouse);
