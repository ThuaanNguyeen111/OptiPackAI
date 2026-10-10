import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/**
 * bin_locations — tầng 3/4 ("kệ/vị trí", VD "A-03-02" = Khu A, Kệ 3,
 * Tầng/Ngăn 2). Mô hình "fixed-slot" — mỗi kệ là 1 vị trí vật lý cố
 * định, KHÔNG lưu tồn kho theo thời gian thực (out of scope, đã note
 * trong CLAUDE.md — đó là phạm vi 1 đồ án WMS riêng).
 */
@Schema({ collection: 'bin_locations', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class BinLocation {
  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'Warehouse', index: true })
  warehouse_id!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'WarehouseZone', index: true })
  zone_id!: Types.ObjectId;

  @Prop({ required: true })
  bin_code!: string; // mã đầy đủ, dễ đọc — VD "A-03-02"

  @Prop({ required: true })
  aisle!: string; // dãy

  @Prop({ required: true })
  rack!: number; // kệ số

  @Prop({ required: true })
  level!: number; // tầng/ngăn (layout v2: = số tầng)

  // BỔ SUNG (26/09/2026, K1) — xóa mềm; document cũ không có field này được
  // coi là đang hoạt động (lọc bằng `is_active: { $ne: false }`).
  @Prop({ default: true })
  is_active?: boolean; // optional ở tầng TYPE: document cũ thật sự không có field


  // ===== K2 (26/09/2026) — layout v2. Tất cả OPTIONAL: kệ cũ (v1, dạng
  // "A-03-01-01") không có các field này và vẫn chạy bình thường. Kệ v2 vẫn
  // ghi rack = số kệ, level = số tầng để code cũ đọc rack/level không vỡ.
  @Prop({ type: Number, default: undefined })
  layout_version?: 2; // không có field = v1

  @Prop({ type: String, default: undefined })
  side?: 'T' | 'P';

  @Prop({ type: Number, default: undefined })
  cell?: number;

  @Prop({ type: Number, default: null })
  capacity?: number | null; // đơn vị sản phẩm; null/không có = không giới hạn

  @Prop({
    type: { category_code: String, size: String, color_code: String },
    default: undefined,
    _id: false,
  })
  designated?: { category_code?: string; size?: string; color_code?: string | null };

  @Prop({ type: Number, default: undefined })
  pick_sequence?: number; // lộ trình hình rắn, tính lúc tạo kệ
  created_at?: Date;
  updated_at?: Date;
}

export type BinLocationDocument = HydratedDocument<BinLocation>;
export const BinLocationSchema = SchemaFactory.createForClass(BinLocation);

BinLocationSchema.index({ warehouse_id: 1, bin_code: 1 }, { unique: true });
// Rule #3 (ESR) — phục vụ Picking List SẮP XẾP theo lộ trình vật lý
// (zone -> aisle -> rack -> level), đã thiết kế từ trước trong CLAUDE.md.
BinLocationSchema.index({ zone_id: 1, aisle: 1, rack: 1, level: 1 });

// K2 — gợi ý ô theo thuộc tính đăng ký + Picking List theo lộ trình hình rắn.
BinLocationSchema.index({ warehouse_id: 1, 'designated.category_code': 1, 'designated.size': 1, 'designated.color_code': 1 });
BinLocationSchema.index({ warehouse_id: 1, pick_sequence: 1 });
