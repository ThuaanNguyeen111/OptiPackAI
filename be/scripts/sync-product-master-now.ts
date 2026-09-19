import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ProductMasterService } from '../src/modules/product-master/product-master.service';

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
 *   npx ts-node -r tsconfig-paths/register scripts/sync-product-master-now.ts <shop_id>
 *   VD: npx ts-node -r tsconfig-paths/register scripts/sync-product-master-now.ts 201171264532
 * ===================================================================
 */
async function syncProductMasterNow(): Promise<void> {
  const shopId = process.argv[2];
  if (!shopId) {
    console.error(
      '❌ Thiếu shop_id. Cách dùng: npx ts-node ... scripts/sync-product-master-now.ts <shop_id>',
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const productMasterService = app.get(ProductMasterService);

  console.log(
    `Đang đồng bộ Product Master cho shop ${shopId} — lấy SKU từ đơn hàng đã sync, gọi Lazada GetProducts...`,
  );

  try {
    const result =
      await productMasterService.syncProductsForShopFromOrders(shopId);
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
