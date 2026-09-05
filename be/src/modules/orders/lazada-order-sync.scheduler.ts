import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersService } from './orders.service';
import { MarketplaceIntegrationService } from '../marketplace-integration';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';

/**
 * ===================================================================
 * TỰ ĐỘNG ĐỒNG BỘ ĐƠN LAZADA THEO LỊCH — "Mainflow 1" bản KHÔNG cần bấm tay
 * ===================================================================
 * TÁCH RIÊNG khỏi OrdersService (không thêm @Cron() thẳng vào 1 method
 * của OrdersService) — 2 lý do:
 *   (a) OrdersService.syncLazadaOrders() vẫn phải giữ NGUYÊN là 1 method
 *       "sync 1 shop cụ thể", gọi được độc lập từ controller (nút bấm
 *       tay demo) LẪN từ scheduler này — 1 method dùng cho CẢ 2 mục
 *       đích thì không nên tự nó biết "mình đang được gọi bởi lịch hay
 *       bởi HTTP request".
 *   (b) Vòng lặp "quét TẤT CẢ shop rồi gọi sync từng shop" là 1 TRÁCH
 *       NHIỆM RIÊNG (orchestration), tách file giúp test/đọc độc lập,
 *       không làm phình to orders.service.ts vốn đã đủ dài.
 *
 * VẪN LÀ POLLING (xem giải thích đã note trong CLAUDE.md) — @Cron() chỉ
 * tự động hoá VIỆC BẤM NÚT, không biến hệ thống thành webhook/event-driven
 * thật. Bản chất "chủ động đi hỏi Lazada" không đổi.
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

  constructor(
    private readonly ordersService: OrdersService,
    private readonly marketplaceIntegrationService: MarketplaceIntegrationService,
  ) {}

  /**
   * Cứ mỗi 10 phút — đủ nhanh để demo/vận hành thực tế thấy đơn "gần
   * như tức thời", vẫn đủ thưa để không phí quota API Lazada (10.000
   * request/ngày/app — mỗi lượt sync 1 shop tốn 1 (GetOrders) + N
   * (GetOrderItems, N = số đơn mới) request; 10 phút/lần = 144
   * lượt/ngày, dư sức cho quy mô hiện tại).
   *
   * CronExpression.EVERY_10_MINUTES là hằng số có sẵn của @nestjs/schedule
   * (tương đương biểu thức cron "mỗi 10 phút 1 lần") — dùng hằng số thay
   * vì tự gõ chuỗi cron để tránh gõ sai cú pháp không ai phát hiện ra
   * tới khi job không chạy đúng lịch.
   */
  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'lazada-order-auto-sync' })
  async autoSyncAllConnectedShops(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Lượt auto-sync trước chưa xong, bỏ qua lượt này — tránh chạy chồng.');
      return;
    }

    this.isRunning = true;
    const startedAt = Date.now();

    try {
      const shops = await this.marketplaceIntegrationService.listConnectedShops(
        MarketplacePlatform.LAZADA,
      );

      if (shops.length === 0) {
        this.logger.log('Auto-sync Lazada: chưa có shop nào được kết nối, bỏ qua lượt này.');
        return;
      }

      let succeeded = 0;
      let failed = 0;

      // Tuần tự (không Promise.all) — cùng lý do đã giải thích trong
      // OrdersService.syncLazadaOrders(): tránh dồn dập request lên
      // Lazada khi có nhiều shop cùng lúc.
      for (const shop of shops) {
        try {
          const result = await this.ordersService.syncLazadaOrders(shop.shop_id);
          succeeded += 1;
          this.logger.log(
            `Auto-sync shop ${shop.shop_id}: fetched=${String(result.fetched)}, upserted=${String(result.upserted)}, newlyConsolidated=${String(result.newlyConsolidated)}.`,
          );
        } catch (error) {
          // 1 shop lỗi (vd token hết hạn, Lazada tạm downtime) KHÔNG
          // được làm hỏng lượt sync của các shop khác — cùng nguyên
          // tắc resilience đã áp dụng ở vòng lặp xử lý từng đơn trong
          // OrdersService.syncLazadaOrders().
          failed += 1;
          this.logger.error(`Auto-sync shop ${shop.shop_id} thất bại, bỏ qua, tiếp tục shop khác.`, error);
        }
      }

      this.logger.log(
        `Auto-sync Lazada hoàn tất: ${String(shops.length)} shop (${String(succeeded)} thành công, ${String(failed)} lỗi), mất ${String(Date.now() - startedAt)}ms.`,
      );
    } finally {
      this.isRunning = false;
    }
  }
}
