import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrderGroupsService } from './order-groups.service';

/**
 * 27/11/2026 — Giao thiếu đơn AURELLE chờ khách xác nhận tối đa 24 giờ. Khách trả lời thì lượt
 * đồng bộ đơn mở khóa ngay; cron này chỉ lo nhóm QUÁ HẠN (khách không trả lời → tự giao phần có sẵn).
 */
@Injectable()
export class CustomerConfirmationScheduler {
  private readonly logger = new Logger(CustomerConfirmationScheduler.name);
  private running = false;

  constructor(private readonly orderGroupsService: OrderGroupsService) {}

  @Cron('30 */5 * * * *', { name: 'short-ship-customer-confirmation-expiry' })
  async resolveExpired(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const resolved = await this.orderGroupsService.resolveExpiredCustomerConfirmations();
      if (resolved > 0) this.logger.log(`Quá hạn khách xác nhận giao thiếu: ${String(resolved)} nhóm tự chuyển sang đóng gói.`);
    } catch (error: unknown) {
      this.logger.error(`Xử lý hạn xác nhận giao thiếu lỗi: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
