import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import {
  ProductMaster,
  ProductMasterDocument,
} from '../src/modules/product-master/schemas/product-master.schema';
import { MarketplacePlatform } from '../src/modules/marketplace-integration/enums/platform.enum';

/**
 * ===================================================================
 * MIGRATION 1 LẦN (AOFP-XX, 16/09/2026) — backfill platform thiếu
 * trong product_master
 * ===================================================================
 * Báo cáo thật từ đồng đội (qua AI assistant khác, đã xác nhận lại
 * bằng code thật): 1 phiên bản CŨ của syncProductsForShop() từng
 * upsert product_master KHÔNG có `platform` trong filter — những
 * document TỪ LÚC ĐÓ vẫn còn "mồ côi" (thiếu field platform) trong
 * DB tới giờ, dù code hiện tại đã đúng (đã có platform trong filter
 * upsert, xác nhận qua đọc trực tiếp product-master.service.ts).
 *
 * Hậu quả: findUnassignedSkus() (warehouse.service.ts) so khớp bằng
 * chuỗi ghép "platform|shop_id|seller_sku" — document thiếu platform
 * ra chuỗi "undefined|..." KHÔNG BAO GIỜ khớp với assignment (luôn
 * có platform: "lazada" tường minh) — SKU hiện "chưa gán kệ" MÃI MÃI
 * dù đã gán thật.
 *
 * Vì dữ liệu hiện tại 100% là Lazada (giống lý do đã áp dụng ở
 * migrate-consolidation-key.ts), backfill thẳng platform='lazada'
 * cho mọi document ĐANG THIẾU field này — không cần gọi lại Lazada.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/migrate-product-master-platform.ts
 * ===================================================================
 */
async function migrateProductMasterPlatform(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const productMasterModel = app.get<Model<ProductMasterDocument>>(
    getModelToken(ProductMaster.name),
  );

  const result = await productMasterModel.updateMany(
    { platform: { $exists: false } },
    { $set: { platform: MarketplacePlatform.LAZADA } },
  );

  console.log(
    `✅ Xong — tìm thấy ${String(result.matchedCount)} document thiếu platform, đã backfill ${String(result.modifiedCount)} document thành platform="lazada".`,
  );
  if (result.matchedCount === 0) {
    console.log(
      '   (Không có document nào thiếu platform — có thể đã chạy migration này trước đó, hoặc chưa từng gặp bug này.)',
    );
  }

  await app.close();
}

migrateProductMasterPlatform().catch((err: unknown) => {
  console.error('❌ Migration thất bại:', err);
  process.exit(1);
});
