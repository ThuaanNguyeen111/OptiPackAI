import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { SkuBinAssignment, SkuBinAssignmentDocument } from '../src/modules/warehouse/schemas/sku-bin-assignment.schema';

/**
 * ===================================================================
 * MIGRATION 1 LẦN — K3 (27/09/2026): cho phép 1 SKU nằm NHIỀU Ô
 * ===================================================================
 * Trước K3, collection sku_bin_assignments có index DUY NHẤT
 *   { warehouse_id, platform, shop_id, seller_sku }
 * -> 1 SKU chỉ nằm được đúng 1 ô / 1 kho. K3 đổi sang
 *   { warehouse_id, platform, shop_id, seller_sku, bin_location_id }.
 *
 * Mongoose TỰ TẠO index mới khi app khởi động, nhưng KHÔNG tự XÓA index cũ.
 * Nếu không chạy script này, index cũ vẫn còn trên DB và vẫn chặn -> chuyển
 * hàng sang ô mới / gán SKU vào ô thứ 2 sẽ lỗi E11000 (trùng khóa).
 *
 * An toàn chạy lại nhiều lần (index cũ không còn thì bỏ qua). Không đụng dữ liệu.
 * Chạy mỗi môi trường 1 lần, SAU khi deploy code K3:
 *   npx ts-node -r dotenv/config scripts/migrate-sku-bin-assignment-multibin.ts
 * ===================================================================
 */
const OLD_INDEX_KEY = { warehouse_id: 1, platform: 1, shop_id: 1, seller_sku: 1 };

async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const model = app.get<Model<SkuBinAssignmentDocument>>(getModelToken(SkuBinAssignment.name));
  const indexes = await model.collection.indexes();
  const old = indexes.find((ix) => JSON.stringify(ix.key) === JSON.stringify(OLD_INDEX_KEY));
  if (!old?.name) {
    console.log('Không còn index cũ (1 SKU 1 ô) — không cần làm gì.');
  } else {
    await model.collection.dropIndex(old.name);
    console.log(`✅ Đã xóa index cũ "${old.name}".`);
  }
  await model.syncIndexes();
  console.log('✅ Đã đồng bộ index theo schema mới (1 SKU nhiều ô).');
  await app.close();
}

void run();
