import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ProductMasterService } from '../src/modules/product-master/product-master.service';
import { MarketplacePlatform } from '../src/modules/marketplace-integration/enums/platform.enum';

/**
 * ===================================================================
 * CHẠY TAY 1 LẦN — đồng bộ Product Master NGAY, không đợi cron 3h sáng
 * ===================================================================
 * Gọi ĐÚNG hàm mà ProductMasterSyncScheduler gọi mỗi ngày
 * (syncProductsForShopFromOrders) — KHÔNG phải logic khác, chỉ là
 * cách kích hoạt thủ công để test/lấy dữ liệu ngay, không sửa gì
 * hành vi cron tự động (cron vẫn chạy bình thường 3h sáng sau này).
 *
 * Dùng khi: đã có đơn hàng thật trong DB nhưng product_master vẫn
 * trống/thiếu SKU, và không muốn đợi tới lần cron kế tiếp (VD app
 * chưa từng chạy liên tục qua đúng 3h sáng giờ VN từ lúc có đơn).
 *
 *   npx ts-node -r tsconfig-paths/register scripts/sync-product-master-now.ts <shop_id> [platform]
 *   VD: npx ts-node -r tsconfig-paths/register scripts/sync-product-master-now.ts 201171264532
 *       npx ts-node -r tsconfig-paths/register scripts/sync-product-master-now.ts 200000000101 aurelle
 *   platform mặc định 'lazada' (giữ nguyên hành vi cũ khi không truyền).
 * ===================================================================
 */
async function syncProductMasterNow(): Promise<void> {
  const shopId = process.argv[2];
  const platformArg = (process.argv[3] ?? MarketplacePlatform.LAZADA) as MarketplacePlatform;
  if (!shopId) {
    console.error(
      '❌ Thiếu shop_id. Cách dùng: npx ts-node ... scripts/sync-product-master-now.ts <shop_id> [platform]',
    );
    process.exit(1);
  }
  if (!Object.values(MarketplacePlatform).includes(platformArg)) {
    console.error(
      `❌ platform "${platformArg}" không hợp lệ — phải là 1 trong: ${Object.values(MarketplacePlatform).join(', ')}.`,
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const productMasterService = app.get(ProductMasterService);

  console.log(
    `Đang đồng bộ Product Master cho shop ${shopId} (${platformArg}) — lấy SKU từ đơn hàng đã sync, gọi GetProducts...`,
  );

  try {
    const result =
      await productMasterService.syncProductsForShopFromOrders(platformArg, shopId);
    console.log(
      `✅ Xong — đã đồng bộ ${String(result.synced)} SKU vào product_master.`,
    );
    if (result.synced === 0) {
      console.log(
        '   (0 SKU — kiểm tra lại: shop_id đúng chưa? Đơn hàng của shop này đã sync về orders chưa?)',
      );
    }
  } catch (err) {
    console.error('❌ Đồng bộ thất bại:', err);
  }

  await app.close();
}

syncProductMasterNow().catch((err: unknown) => {
  console.error('❌ Script thất bại:', err);
  process.exit(1);
});
