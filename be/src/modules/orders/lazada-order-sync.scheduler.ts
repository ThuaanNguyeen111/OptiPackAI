import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersService } from './orders.service';
import { MarketplaceIntegrationService } from '../marketplace-integration';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { orderSyncPolicy } from './order-sync-policy';

// BỔ SUNG (AOFP-XX, 2026-09-16) — chống spam Notification khi sync lỗi LIÊN TỤC.
// 🔄 15/10/2026: khoảng cách (mặc định 20 phút), chu kỳ đồng bộ (mặc định 5 phút)
// và bật/tắt theo sàn đọc từ order_sync_settings do Admin cấu hình.
const MINUTE_MS = 60 * 1000;
// Cron chạy mỗi phút; shop được coi là "đến hạn" sớm hơn chu kỳ tối đa 30 giây
// để lệch nhịp cron không làm trễ thêm 1 phút.
const DUE_SLACK_MS = 30 * 1000;

// 🔄 ĐÃ ĐỔI (29/09/2026, AURELLE_MARKETPLACE_DESIGN.md Mục 9.3 #6) —
// quét MỌI sàn polling-based đã bật (Lazada + AURELLE). Sàn nào KHÔNG
// implement getOrders (TikTok/Tiki hiện tại) sẽ tự loại ở
// OrdersService.syncShopOrders() (ném ORD_UNSUPPORTED_PLATFORM) — không
// cần lọc trước ở đây, catch per-shop bên dưới xử lý đều.
const POLLING_PLATFORMS: readonly MarketplacePlatform[] = [
  MarketplacePlatform.LAZADA,
  MarketplacePlatform.AURELLE,
];

/**
 * ===================================================================
 * TỰ ĐỘNG ĐỒNG BỘ ĐƠN THEO LỊCH — "Mainflow 1" bản KHÔNG cần bấm tay
 * ===================================================================
 * TÁCH RIÊNG khỏi OrdersService (không thêm @Cron() thẳng vào 1 method
 * của OrdersService) — 2 lý do:
 *   (a) OrdersService.syncShopOrders() vẫn phải giữ NGUYÊN là 1 method
 *       "sync 1 shop cụ thể", gọi được độc lập từ controller (nút bấm
 *       tay demo) LẪN từ scheduler này.
 *   (b) Vòng lặp "quét TẤT CẢ shop rồi gọi sync từng shop" là 1 TRÁCH
 *       NHIỆM RIÊNG (orchestration), tách file giúp test/đọc độc lập.
 *
 * VẪN LÀ POLLING cho Lazada (chưa xác nhận webhook chính thức) — AURELLE
 * CÓ webhook thật (Mục 8 AURELLE_MARKETPLACE_DESIGN.md) nên với AURELLE,
 * cron này chỉ còn vai trò LƯỚI AN TOÀN (bù đơn webhook lỡ mất), không
 * phải kênh chính. Tên file/class giữ nguyên `LazadaOrderSyncScheduler`
 * (đổi tên sẽ phải sửa lại DI ở orders.module.ts + mọi import — không
 * đáng, tên chỉ còn ý nghĩa lịch sử).
 * ===================================================================
 */
@Injectable()
export class LazadaOrderSyncScheduler {
  private readonly logger = new Logger(LazadaOrderSyncScheduler.name);

  // Chặn 2 lượt cron chạy CHỒNG NHAU nếu 1 lượt trước đó chưa xong (VD
  // shop có quá nhiều đơn, 1 lượt sync mất >10 phút) — KHÔNG dùng
  // @Cron() đơn thuần vì NestJS mặc định vẫn cho phép lượt sau bắt đầu
  // dù lượt trước chưa kết thúc, dễ gây 2 job cùng ghi đè 1 shop.
  private isRunning = false;

  // "platform:shop_id" -> thời điểm (epoch ms) đã bắn Notification lỗi
  // sync gần nhất — KHÔNG persist xuống DB (chỉ cần tồn tại trong 1 vòng
  // đời process là đủ để chống spam; restart app coi như "quên", chấp
  // nhận được vì restart cũng đồng nghĩa 1 khởi đầu mới đáng để báo lại).
  private readonly lastSyncFailureNotifiedAt = new Map<string, number>();

  constructor(
    private readonly ordersService: OrdersService,
    private readonly marketplaceIntegrationService: MarketplaceIntegrationService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Cứ mỗi 5 phút — đủ nhanh để demo/vận hành thực tế thấy đơn "gần như
   * tức thời", vẫn đủ thưa để không phí quota API (Lazada 10.000
   * request/ngày/app).
   */
  // 🔄 15/10/2026 — tick mỗi phút, từng shop chỉ đồng bộ khi đã qua `interval_minutes`
  // kể từ lần đồng bộ trước (last_polled_at) và sàn đó đang bật tự đồng bộ.
  @Cron(CronExpression.EVERY_MINUTE, { name: 'lazada-order-auto-sync' })
  async autoSyncAllConnectedShops(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(
        'Lượt auto-sync trước chưa xong, bỏ qua lượt này — tránh chạy chồng.',
      );
      return;
    }

    this.isRunning = true;
    const startedAt = Date.now();

    try {
      let totalShops = 0;
      let succeeded = 0;
      let failed = 0;

      // Tuần tự CẢ theo sàn LẪN theo shop — cùng lý do đã giải thích ở
      // OrdersService.syncShopOrders(): tránh dồn dập request.
      const policy = orderSyncPolicy();
      const intervalMs = policy.sync.intervalMinutes * MINUTE_MS;
      for (const platform of POLLING_PLATFORMS) {
        if (policy.sync.autoSyncEnabled[platform] === false) continue;
        const shops = (
          await this.marketplaceIntegrationService.listConnectedShops(platform)
        ).filter(
          (shop) =>
            !shop.last_polled_at ||
            startedAt - shop.last_polled_at.getTime() >= intervalMs - DUE_SLACK_MS,
        );
        if (shops.length === 0) continue;
        totalShops += shops.length;

        for (const shop of shops) {
          try {
            const result = await this.ordersService.syncShopOrders(
              platform,
              shop.shop_id,
            );
            succeeded += 1;
            this.logger.log(
              `Auto-sync ${platform} shop ${shop.shop_id}: fetched=${String(result.fetched)}, upserted=${String(result.upserted)}, newlyConsolidated=${String(result.newlyConsolidated)}.`,
            );
          } catch (error) {
            // 1 shop lỗi (vd token hết hạn, sàn tạm downtime) KHÔNG được
            // làm hỏng lượt sync của các shop khác.
            failed += 1;
            this.logger.error(
              `Auto-sync ${platform} shop ${shop.shop_id} thất bại, bỏ qua, tiếp tục shop khác.`,
              error,
            );

            const cooldownKey = `${platform}:${shop.shop_id}`;
            const lastNotified =
              this.lastSyncFailureNotifiedAt.get(cooldownKey) ?? 0;
            const now = Date.now();
            if (now - lastNotified >= policy.sync.syncFailedCooldownMinutes * MINUTE_MS) {
              this.lastSyncFailureNotifiedAt.set(cooldownKey, now);
              const message =
                error instanceof Error ? error.message : String(error);
              await this.notificationsService.notify({
                recipientRole: UserRole.STORE_OWNER,
                type: NotificationType.SYNC_FAILED,
                severity: 'warning',
                title: `Đồng bộ đơn ${platform} (shop ${shop.shop_id}) đang thất bại`,
                message: `Tự động đồng bộ đơn hàng từ ${platform} đang gặp lỗi liên tục: ${message}. Vui lòng kiểm tra kết nối shop (token có thể đã hết hạn).`,
                relatedEntityType: 'marketplace_shop',
                // 🔄 07/10/2026 (main) — id document marketplace_shops (ObjectId); mã shop vẫn nằm trong title.
                relatedEntityId: String(shop._id),
              });
            }
          }
        }
      }

      if (totalShops === 0) return; // không shop nào đến hạn (cron chạy mỗi phút — không log để khỏi rác)

      this.logger.log(
        `Auto-sync hoàn tất: ${String(totalShops)} shop (${String(succeeded)} thành công, ${String(failed)} lỗi), mất ${String(Date.now() - startedAt)}ms.`,
      );
    } finally {
      this.isRunning = false;
    }
  }
}
