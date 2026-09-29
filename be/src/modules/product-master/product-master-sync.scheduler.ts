import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ProductMasterService } from './product-master.service';
import { MarketplaceIntegrationService } from '../marketplace-integration';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';

// 🔄 ĐÃ ĐỔI (29/09/2026, AURELLE_MARKETPLACE_DESIGN.md Mục 9.3 #7) —
// quét MỌI sàn tương thích thay vì chỉ Lazada. Sàn chưa implement
// getProducts tự loại ở ProductMasterService.syncProductsForShop() (ném
// PM_UNSUPPORTED_PLATFORM) — không cần lọc trước ở đây.
const PRODUCT_SYNC_PLATFORMS: readonly MarketplacePlatform[] = [
  MarketplacePlatform.LAZADA,
  MarketplacePlatform.AURELLE,
];

/**
 * ===================================================================
 * TỰ ĐỘNG ĐỒNG BỘ PRODUCT MASTER — 1 LẦN/NGÀY, TÁCH BIỆT HOÀN TOÀN
 * với LazadaOrderSyncScheduler (5 phút/lần)
 * ===================================================================
 * Kích thước/cân nặng sản phẩm hiếm khi đổi — không cần tần suất dày
 * như order sync. Chạy vào 3h sáng (giờ thấp điểm) để không cạnh
 * tranh quota API với giờ hoạt động thật trong ngày.
 *
 * Cùng convention isRunning chống chạy chồng đã áp dụng ở
 * LazadaOrderSyncScheduler — KHÔNG import lại ScheduleModule ở đây
 * (đã bật 1 lần duy nhất ở app.module.ts, xem comment gốc ở đó).
 * ===================================================================
 */
@Injectable()
export class ProductMasterSyncScheduler {
  private readonly logger = new Logger(ProductMasterSyncScheduler.name);
  private isRunning = false;

  constructor(
    private readonly productMasterService: ProductMasterService,
    private readonly marketplaceIntegrationService: MarketplaceIntegrationService,
  ) {}

  // 3:00 sáng mỗi ngày, GIỜ VIỆT NAM — thiếu `timeZone` từng gây lệch 7
  // tiếng khi deploy lên cloud mặc định UTC (đã sửa 19/09/2026, giữ lại).
  @Cron('0 3 * * *', { name: 'product-master-daily-sync', timeZone: 'Asia/Ho_Chi_Minh' })
  async dailySyncAllShops(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Lượt đồng bộ Product Master trước chưa xong, bỏ qua lượt này.');
      return;
    }

    this.isRunning = true;
    const startedAt = Date.now();

    try {
      let totalShops = 0;
      let succeeded = 0;
      let failed = 0;

      for (const platform of PRODUCT_SYNC_PLATFORMS) {
        const shops = await this.marketplaceIntegrationService.listConnectedShops(
          platform,
        );
        if (shops.length === 0) continue;
        totalShops += shops.length;

        for (const shop of shops) {
          try {
            const result = await this.productMasterService.syncProductsForShopFromOrders(
              platform,
              shop.shop_id,
            );
            succeeded += 1;
            this.logger.log(`Đồng bộ Product Master ${platform} shop ${shop.shop_id}: ${String(result.synced)} SKU.`);
          } catch (error) {
            failed += 1;
            this.logger.error(`Đồng bộ Product Master ${platform} shop ${shop.shop_id} thất bại, bỏ qua, tiếp tục shop khác.`, error);
          }
        }
      }

      if (totalShops === 0) {
        this.logger.log('Đồng bộ Product Master: chưa có shop nào kết nối, bỏ qua.');
        return;
      }

      this.logger.log(
        `Đồng bộ Product Master hoàn tất: ${String(totalShops)} shop (${String(succeeded)} thành công, ${String(failed)} lỗi), mất ${String(Date.now() - startedAt)}ms.`,
      );
    } finally {
      this.isRunning = false;
    }
  }
}
