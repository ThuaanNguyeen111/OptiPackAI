import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MarketplaceWritebackService } from './marketplace-writeback.service';
import { MarketplaceStockPushService } from './marketplace-stock-push.service';

/**
 * 20/10/2026 — gửi hàng đợi ghi ngược mỗi 15 giây để khách thấy trạng thái
 * đơn gần như ngay (lượt trống chỉ tốn 1 truy vấn có index). Có khóa chống
 * 2 lượt chạy chồng nhau.
 */
@Injectable()
export class MarketplaceWritebackScheduler {
  private readonly logger = new Logger(MarketplaceWritebackScheduler.name);
  private isRunning = false;
  private isPushingStock = false;

  constructor(
    private readonly writebackService: MarketplaceWritebackService,
    @Optional() private readonly stockPushService?: MarketplaceStockPushService,
  ) {}

  /** (21/10/2026) Đẩy tồn bán được sang AURELLE mỗi phút — chỉ gửi SKU có số đổi. */
  @Cron('30 * * * * *', { name: 'marketplace-stock-push' })
  async pushStock(): Promise<void> {
    if (this.isPushingStock || !this.stockPushService) return;
    this.isPushingStock = true;
    try {
      await this.stockPushService.pushAurelle();
    } catch (error: unknown) {
      this.logger.error(`Lượt đẩy tồn lỗi: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.isPushingStock = false;
    }
  }

  @Cron('*/15 * * * * *', { name: 'marketplace-status-writeback' })
  async run(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const result = await this.writebackService.processPending();
      if (result.processed > 0) {
        this.logger.log(
          `Ghi ngược trạng thái: ${String(result.sent)} đã gửi, ${String(result.skipped)} bỏ qua, ${String(result.retrying)} chờ thử lại, ${String(result.failed)} thất bại.`,
        );
      }
    } catch (error: unknown) {
      this.logger.error(`Lượt ghi ngược lỗi: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.isRunning = false;
    }
  }
}
