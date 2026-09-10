import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { OrderGroupsService } from './order-groups.service';

/**
 * ===================================================================
 * BACKFILL order_groups CHO ĐƠN CHƯA CÓ GROUP — chạy mỗi 15 phút,
 * SAU cron order-sync Lazada (10 phút) để luôn có đơn mới nhất kịp xử lý.
 * ===================================================================
 * KHÔNG hook trực tiếp vào cuối syncLazadaOrders() (orders.service.ts,
 * KHÔNG được sửa) — tách thành cron RIÊNG, độc lập hoàn toàn, quét
 * đơn có consolidated_group_id = null rồi gọi getOrCreateGroupForOrder()
 * cho từng đơn. Độ trễ tối đa ~15 phút giữa lúc đơn về và lúc có group
 * là CHẤP NHẬN ĐƯỢC cho quy mô demo/capstone hiện tại — Packaging Staff
 * không thao tác tức thời ngay giây đơn vừa sync xong.
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

  @Cron('*/15 * * * *', { name: 'order-group-backfill' }) // mỗi 15 phút — package @nestjs/schedule pin bản ^6.1.3 (lý do đã ghi ở LazadaOrderSyncScheduler) không có hằng số CronExpression.EVERY_15_MINUTES, dùng raw cron string
  async backfillMissingGroups(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Lượt backfill order_groups trước chưa xong, bỏ qua lượt này.');
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
          this.logger.error(`Backfill group cho đơn ${String(order._id)} thất bại, bỏ qua, tiếp tục đơn khác.`, error);
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
