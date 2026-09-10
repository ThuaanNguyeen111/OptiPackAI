import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * bin_locations — tầng 3/4 ("kệ/vị trí", VD "A-03-02" = Khu A, Kệ 3,
 * Tầng/Ngăn 2). Mô hình "fixed-slot" — mỗi kệ là 1 vị trí vật lý cố
 * định, KHÔNG lưu tồn kho theo thời gian thực (out of scope, đã note
 * trong CLAUDE.md — đó là phạm vi 1 đồ án WMS riêng).
 */
@Schema({ collection: 'bin_locations', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class BinLocation {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Warehouse', index: true })
  warehouse_id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'WarehouseZone', index: true })
  zone_id!: Types.ObjectId;

  @Prop({ required: true })
  bin_code!: string; // mã đầy đủ, dễ đọc — VD "A-03-02"

  @Prop({ required: true })
  aisle!: string; // dãy

  @Prop({ required: true })
  rack!: number; // kệ số

  @Prop({ required: true })
  level!: number; // tầng/ngăn

  created_at?: Date;
  updated_at?: Date;
}

export type BinLocationDocument = HydratedDocument<BinLocation>;
export const BinLocationSchema = SchemaFactory.createForClass(BinLocation);

BinLocationSchema.index({ warehouse_id: 1, bin_code: 1 }, { unique: true });
// Rule #3 (ESR) — phục vụ Picking List SẮP XẾP theo lộ trình vật lý
// (zone -> aisle -> rack -> level), đã thiết kế từ trước trong CLAUDE.md.
BinLocationSchema.index({ zone_id: 1, aisle: 1, rack: 1, level: 1 });
