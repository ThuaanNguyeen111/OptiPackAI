import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TikiOrderSyncService } from './tiki-order-sync.service';
import { MarketplaceIntegrationService } from '../marketplace-integration';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { orderSyncPolicy } from './order-sync-policy';

const MINUTE_MS = 60 * 1000;
const DUE_SLACK_MS = 30 * 1000;

/**
 * 31/10/2026 — Tự đồng bộ đơn Tiki MỖI PHÚT (kéo event queue, rẻ) + quét dự phòng theo đúng chu
 * kỳ đồng bộ Admin cấu hình (`interval_minutes`, như Lazada). Tắt/bật theo sàn ở cài đặt đồng bộ.
 * Lỗi liên tục → báo Store Owner, cách nhau ít nhất `sync_failed_cooldown_minutes`.
 */
@Injectable()
export class TikiOrderSyncScheduler {
  private readonly logger = new Logger(TikiOrderSyncScheduler.name);
  private isRunning = false;
  private readonly lastFailureNotifiedAt = new Map<string, number>();

  constructor(
    private readonly tikiSync: TikiOrderSyncService,
    private readonly marketplaceIntegrationService: MarketplaceIntegrationService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'tiki-order-auto-sync' })
  async run(now: Date = new Date()): Promise<void> {
    if (this.isRunning) return;
    const policy = orderSyncPolicy();
    if (policy.sync.autoSyncEnabled[MarketplacePlatform.TIKI] === false) return;
    this.isRunning = true;
    try {
      const shops = await this.marketplaceIntegrationService.listConnectedShops(MarketplacePlatform.TIKI);
      const intervalMs = policy.sync.intervalMinutes * MINUTE_MS;
      for (const shop of shops) {
        const sweep = !shop.last_polled_at || now.getTime() - shop.last_polled_at.getTime() >= intervalMs - DUE_SLACK_MS;
        try {
          await this.tikiSync.syncShop(shop.shop_id, { sweep });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Tự đồng bộ Tiki shop ${shop.shop_id} thất bại: ${message}`);
          const last = this.lastFailureNotifiedAt.get(shop.shop_id) ?? 0;
          if (now.getTime() - last >= policy.sync.syncFailedCooldownMinutes * MINUTE_MS) {
            this.lastFailureNotifiedAt.set(shop.shop_id, now.getTime());
            await this.notificationsService
              .notify({
                recipientRole: UserRole.STORE_OWNER,
                type: NotificationType.SYNC_FAILED,
                severity: 'warning',
                title: `Đồng bộ đơn Tiki (shop ${shop.shop_id}) đang thất bại`,
                message: `Tự động đồng bộ đơn hàng từ Tiki đang gặp lỗi: ${message}. Kiểm tra kết nối shop (App ID/Secret, nhà bán còn đồng ý kết nối app).`,
                relatedEntityType: 'marketplace_shop',
                relatedEntityId: String(shop._id),
              })
              .catch((e: unknown) => {
                this.logger.warn('Gửi thông báo lỗi đồng bộ Tiki thất bại', e);
              });
          }
        }
      }
    } finally {
      this.isRunning = false;
    }
  }
}
