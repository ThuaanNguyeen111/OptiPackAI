import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { MarketplacePlatform } from '../../marketplace-integration/enums/platform.enum';
import { normalizeSellerSku } from '../../master-skus/seller-sku.util';

/**
 * sku_bin_assignments — tầng 4/4, nối SKU (đã có trong product_master,
 * KHÔNG sửa schema đó) vào 1 bin_location cụ thể. TÁI SỬ DỤNG đúng
 * khóa {platform, shop_id, seller_sku} đã có ở product_master — không
 * tạo khóa lạ, dễ join khi cần.
 */
@Schema({ collection: 'sku_bin_assignments', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class SkuBinAssignment {
  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'Warehouse', index: true })
  warehouse_id!: Types.ObjectId;

  @Prop({ type: String, enum: MarketplacePlatform, required: true })
  platform!: MarketplacePlatform;

  @Prop({ required: true })
  shop_id!: string;

  @Prop({ required: true })
  seller_sku!: string;

  /**
   * 10/11/2026 (BE-5) — `seller_sku` đã chuẩn hoá (trim + viết hoa) để so khớp có index.
   * Trước đây so bằng regex `^sku$/i` (không dùng được index, quét bảng). Tự ghi bằng
   * hook bên dưới mỗi khi `seller_sku` được ghi; dòng cũ được bổ sung lúc khởi động
   * (`SkuNormalizedBackfillService`).
   */
  @Prop({ type: String, default: null })
  seller_sku_normalized?: string | null;

  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'BinLocation' })
  bin_location_id!: Types.ObjectId;

  // BỔ SUNG (2026-09-10) — Điểm yếu #10 mục 1 (CLAUDE.md): CORE, không
  // phải tính năng WMS nâng cao — biết còn/hết hàng là thông tin cơ
  // bản nhất của hệ thống kho. Trừ bằng atomic $inc lúc pick-item
  // (order-groups/order-groups.service.ts), KHÔNG đọc-rồi-ghi.
  @Prop({ type: Number, required: true, default: 0, min: 0 })
  quantity_on_hand!: number;

  // K4b (27/09/2026) — nhãn SKU nội bộ. Có giá trị khi SKU sàn của dòng này đã
  // được NỐI -> tồn tính chung theo SKU nội bộ (mọi sàn/shop cùng dùng dòng này).
  // null/không có = chưa nối, tính theo SKU sàn như trước (đường lùi).
  @Prop({ type: String, default: null })
  master_sku?: string | null;

  created_at?: Date;
  updated_at?: Date;
}

export type SkuBinAssignmentDocument = HydratedDocument<SkuBinAssignment>;
export const SkuBinAssignmentSchema = SchemaFactory.createForClass(SkuBinAssignment);

// 🔄 K3 (27/09/2026) — ĐỔI KHÓA: thêm bin_location_id -> 1 SKU nằm được NHIỀU Ô
// (hàng về 200 cái mà 1 ô chỉ chứa 50). Index cũ trên DB phải xóa bằng
// scripts/migrate-sku-bin-assignment-multibin.ts (Mongoose không tự xóa).
SkuBinAssignmentSchema.index(
  { warehouse_id: 1, platform: 1, shop_id: 1, seller_sku: 1, bin_location_id: 1 },
  { unique: true },
);
SkuBinAssignmentSchema.index({ warehouse_id: 1, seller_sku: 1 }); // pick-item / Picking List tra theo SKU
SkuBinAssignmentSchema.index({ warehouse_id: 1, bin_location_id: 1 }); // 09/11/2026 — tra tồn theo ô vừa quét (app mobile)
// K4b — 1 SKU nội bộ chỉ có 1 dòng tồn trên 1 ô (gộp tồn các sàn). Partial: chỉ áp
// cho dòng đã gắn master_sku, dòng chưa nối không bị ảnh hưởng.
SkuBinAssignmentSchema.index(
  { warehouse_id: 1, master_sku: 1, bin_location_id: 1 },
  { unique: true, partialFilterExpression: { master_sku: { $type: 'string' } } },
);
// 10/10/2026 — kiểm tra "SKU nội bộ còn nằm trên ô nào không" trước khi xoá hẳn
// SKU nội bộ: lọc chỉ theo master_sku (index unique ở trên bắt đầu bằng warehouse_id
// nên không dùng được). Partial: dòng chưa nối (master_sku null) không vào index.
SkuBinAssignmentSchema.index(
  { master_sku: 1 },
  { partialFilterExpression: { master_sku: { $type: 'string' } } },
);
// 10/11/2026 (BE-5) — tra tồn theo SKU sàn chưa nối (stockFilterFor / Picking List / gắn nhãn).
SkuBinAssignmentSchema.index({ platform: 1, shop_id: 1, seller_sku_normalized: 1 });

// 10/11/2026 (BE-5) — luôn ghi seller_sku_normalized cùng seller_sku.
SkuBinAssignmentSchema.pre('validate', function () {
  if (typeof this.seller_sku === 'string') this.seller_sku_normalized = normalizeSellerSku(this.seller_sku);
});
SkuBinAssignmentSchema.pre('insertMany', function (next: (err?: Error) => void, docs: unknown) {
  if (Array.isArray(docs)) {
    for (const d of docs as { seller_sku?: unknown; seller_sku_normalized?: unknown }[]) {
      if (typeof d.seller_sku === 'string') d.seller_sku_normalized = normalizeSellerSku(d.seller_sku);
    }
  }
  next();
});
SkuBinAssignmentSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function () {
  const update = this.getUpdate();
  if (!update || Array.isArray(update)) return;
  const u = update as Record<string, unknown> & { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown> };
  const direct = u.seller_sku;
  if (typeof direct === 'string') u.seller_sku_normalized = normalizeSellerSku(direct);
  if (u.$set && typeof u.$set.seller_sku === 'string') u.$set.seller_sku_normalized = normalizeSellerSku(u.$set.seller_sku);
  if (u.$setOnInsert && typeof u.$setOnInsert.seller_sku === 'string') {
    u.$setOnInsert.seller_sku_normalized = normalizeSellerSku(u.$setOnInsert.seller_sku);
  }
  // Upsert lấy seller_sku từ bộ lọc (stockUpsertFilterFor) → dòng mới phải có cả bản chuẩn hoá.
  const filterSku = (this.getFilter() as { seller_sku?: unknown }).seller_sku;
  const hasNormalized = u.seller_sku_normalized !== undefined || u.$set?.seller_sku_normalized !== undefined || u.$setOnInsert?.seller_sku_normalized !== undefined;
  if (this.getOptions().upsert && typeof filterSku === 'string' && !hasNormalized) {
    u.$setOnInsert = { ...(u.$setOnInsert ?? {}), seller_sku_normalized: normalizeSellerSku(filterSku) };
  }
});
