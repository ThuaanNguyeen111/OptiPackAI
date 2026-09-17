import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StorefrontCanonicalOrderService } from './storefront-canonical-order.service';

@Injectable()
export class StorefrontOrderSyncScheduler {
  private readonly logger = new Logger(StorefrontOrderSyncScheduler.name);
  private isRunning = false;

  constructor(private readonly canonicalOrders: StorefrontCanonicalOrderService) {}

  @Cron('*/1 * * * *', { name: 'storefront-order-canonical-sync' })
  async syncPendingOrders(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const result = await this.canonicalOrders.syncPending();
      if (result.attempted > 0) {
        this.logger.log(`Storefront canonical sync: ${String(result.synced)} thành công, ${String(result.failed)} lỗi.`);
      }
    } finally {
      this.isRunning = false;
    }
  }
}
