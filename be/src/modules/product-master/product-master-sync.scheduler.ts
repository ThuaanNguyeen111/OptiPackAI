import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ProductMasterService } from './product-master.service';
import { MarketplaceIntegrationService } from '../marketplace-integration';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';

/**
 * ===================================================================
 * TỰ ĐỘNG ĐỒNG BỘ PRODUCT MASTER — 1 LẦN/NGÀY, TÁCH BIỆT HOÀN TOÀN
 * với LazadaOrderSyncScheduler (10 phút/lần)
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

  @Cron('0 3 * * *', { name: 'product-master-daily-sync' }) // 3:00 sáng mỗi ngày
  async dailySyncAllShops(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Lượt đồng bộ Product Master trước chưa xong, bỏ qua lượt này.');
      return;
    }

    this.isRunning = true;
    const startedAt = Date.now();

    try {
      const shops = await this.marketplaceIntegrationService.listConnectedShops(
        MarketplacePlatform.LAZADA,
      );

      if (shops.length === 0) {
        this.logger.log('Đồng bộ Product Master: chưa có shop nào kết nối, bỏ qua.');
        return;
      }

      let succeeded = 0;
      let failed = 0;

      for (const shop of shops) {
        try {
          const result = await this.productMasterService.syncProductsForShopFromOrders(
            shop.shop_id,
          );
          succeeded += 1;
          this.logger.log(`Đồng bộ Product Master shop ${shop.shop_id}: ${String(result.synced)} SKU.`);
        } catch (error) {
          failed += 1;
          this.logger.error(`Đồng bộ Product Master shop ${shop.shop_id} thất bại, bỏ qua, tiếp tục shop khác.`, error);
        }
      }

      this.logger.log(
        `Đồng bộ Product Master hoàn tất: ${String(shops.length)} shop (${String(succeeded)} thành công, ${String(failed)} lỗi), mất ${String(Date.now() - startedAt)}ms.`,
      );
    } finally {
      this.isRunning = false;
    }
  }
}
