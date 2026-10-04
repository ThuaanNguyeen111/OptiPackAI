import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ProductMasterService } from './product-master.service';

// Danh sách sàn đồng bộ nằm ở ProductMasterService (PRODUCT_SYNC_PLATFORMS) —
// syncCatalogAllShops() tự lặp Lazada + AURELLE.

/**
 * 04/10/2026 — ĐỔI từ "đồng bộ SKU có trong đơn, 1 lần/ngày" sang ĐỒNG BỘ THEO CATALOG:
 * - Mỗi giờ (phút 0): tăng dần — chỉ sản phẩm thay đổi sau lần đồng bộ trước. SKU mới /
 *   SKU vừa đổi mã trên Seller Center có trong hệ thống tối đa sau ~1 giờ.
 * - 3:00 sáng: toàn bộ catalog — tự sửa nếu lượt tăng dần nào đó bị lỡ.
 * Muốn có ngay: Admin gọi POST /product-master/sync.
 */
@Injectable()
export class ProductMasterSyncScheduler {
  private readonly logger = new Logger(ProductMasterSyncScheduler.name);
  private isRunning = false;

  constructor(private readonly productMasterService: ProductMasterService) {}

  @Cron('0 * * * *', { name: 'product-master-hourly-catalog-sync' })
  async hourlyIncrementalSync(): Promise<void> {
    await this.run(false);
  }

  // 3:00 sáng mỗi ngày, GIỜ VIỆT NAM — thiếu `timeZone` từng gây lệch 7
  // tiếng khi deploy lên cloud mặc định UTC (đã sửa 19/09/2026, giữ lại).
  @Cron('0 3 * * *', { name: 'product-master-daily-sync', timeZone: 'Asia/Ho_Chi_Minh' })
  async dailySyncAllShops(): Promise<void> {
    await this.run(true);
  }

  private async run(full: boolean): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(
        'Lượt đồng bộ Product Master trước chưa xong, bỏ qua lượt này.',
      );
      return;
    }
    this.isRunning = true;
    const startedAt = Date.now();
    try {
      const results = await this.productMasterService.syncCatalogAllShops({
        full,
      });
      if (results.length === 0) {
        this.logger.log(
          'Đồng bộ Product Master: chưa có shop nào kết nối, bỏ qua.',
        );
        return;
      }
      const ok = results.filter((r) => r.ok).length;
      this.logger.log(
        `Đồng bộ Product Master (${full ? 'toàn bộ' : 'tăng dần'}) hoàn tất: ${String(results.length)} shop (${String(ok)} thành công, ${String(results.length - ok)} lỗi), mất ${String(Date.now() - startedAt)}ms.`,
      );
    } finally {
      this.isRunning = false;
    }
  }
}
