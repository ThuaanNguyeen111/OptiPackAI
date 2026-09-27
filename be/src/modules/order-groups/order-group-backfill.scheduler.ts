import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { OrderGroupsService } from './order-groups.service';

/**
 * ===================================================================
 * BACKFILL order_groups CHO ĐƠN CHƯA CÓ GROUP — LƯỚI AN TOÀN
 * ===================================================================
 * 🔄 (21/09/2026, báo cáo thật từ FE) — orders.service.ts giờ ĐÃ CÓ
 * hook TRỰC TIẾP tạo group NGAY trong vòng sync (không cần đợi cron
 * này nữa cho đường chính) — cron này giờ chỉ còn là LƯỚI AN TOÀN cho
 * trường hợp hook lỗi (VD lỗi mạng/DB thoáng qua ngay lúc sync), chạy
 * mỗi 5 phút quét lại các đơn còn sót `consolidated_group_id: null`.
 * ===================================================================
 */
@Injectable()
export class OrderGroupBackfillScheduler {
  private readonly logger = new Logger(OrderGroupBackfillScheduler.name);
  private isRunning = false;

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly orderGroupsService: OrderGroupsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'order-group-backfill' }) // 🔄 (21/09/2026) đổi từ 15' xuống 5' — giờ chỉ là lưới an toàn (đường chính đã có hook trực tiếp), 5' đủ nhanh để bắt các trường hợp hook lỗi thoáng qua
  async backfillMissingGroups(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(
        'Lượt backfill order_groups trước chưa xong, bỏ qua lượt này.',
      );
      return;
    }

    this.isRunning = true;
    const startedAt = Date.now();

    try {
      // Giới hạn 200 đơn/lượt — tránh 1 lượt cron ôm quá nhiều việc nếu
      // có backlog lớn (VD lần đầu bật tính năng này, đơn cũ dồn lại).
      const orphanOrders = await this.orderModel
        .find({ consolidated_group_id: null })
        .limit(200);

      if (orphanOrders.length === 0) {
        this.logger.log('Backfill order_groups: không có đơn nào cần xử lý.');
        return;
      }

      let succeeded = 0;
      let failed = 0;

      for (const order of orphanOrders) {
        try {
          await this.orderGroupsService.getOrCreateGroupForOrder(order);
          succeeded += 1;
        } catch (error) {
          failed += 1;
          this.logger.error(
            `Backfill group cho đơn ${String(order._id)} thất bại, bỏ qua, tiếp tục đơn khác.`,
            error,
          );
        }
      }

      this.logger.log(
        `Backfill order_groups hoàn tất: ${String(orphanOrders.length)} đơn (${String(succeeded)} thành công, ${String(failed)} lỗi), mất ${String(Date.now() - startedAt)}ms.`,
      );
    } finally {
      this.isRunning = false;
    }
  }
}
