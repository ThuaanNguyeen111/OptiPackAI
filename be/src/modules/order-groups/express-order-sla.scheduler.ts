import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrderGroup, OrderGroupDocument } from './schemas/order-group.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';

const SLA_WARNING_THRESHOLD_MS = 60 * 60 * 1000; // còn <1h

/**
 * ===================================================================
 * SLA cảnh báo Đơn Hỏa Tốc — mỗi 10 phút, đúng thiết kế đã nghiên cứu
 * trong CLAUDE.md ("Nghiên cứu Đơn Hỏa Tốc" + "Nghiên cứu Notification").
 * ===================================================================
 */
@Injectable()
export class ExpressOrderSlaScheduler {
  private readonly logger = new Logger(ExpressOrderSlaScheduler.name);
  private isRunning = false;

  constructor(
    @InjectModel(OrderGroup.name) private readonly orderGroupModel: Model<OrderGroupDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('*/10 * * * *', { name: 'express-order-sla-check' })
  async checkSlaDeadlines(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Lượt kiểm tra SLA trước chưa xong, bỏ qua lượt này.');
      return;
    }
    this.isRunning = true;

    try {
      const now = new Date();
      const soon = new Date(now.getTime() + SLA_WARNING_THRESHOLD_MS);

      // Nhóm 1 — sắp quá hạn (<1h), CHƯA từng cảnh báo (is_overdue vẫn
      // false — dùng field này kiêm luôn "đã xử lý cảnh báo warning
      // hay chưa", tránh thêm field mới không cần thiết).
      const warningCandidates = await this.orderGroupModel
        .find({
          order_priority: 'express',
          is_overdue: false,
          packaging_deadline: { $lte: soon, $gt: now },
        })
        .select('_id assigned_staff_id packaging_deadline')
        .lean();

      for (const group of warningCandidates) {
        if (!group.assigned_staff_id) continue; // chưa gán ai thì chưa biết báo cho ai
        await this.notificationsService.notify({
          recipientUserId: group.assigned_staff_id.toString(),
          type: NotificationType.SLA_WARNING,
          severity: 'warning',
          title: `Sắp quá hạn đóng gói — Đơn hàng #${String(group._id)}`,
          message: `Đơn hàng #${String(group._id)} thuộc diện Hỏa Tốc, còn dưới 1 giờ làm việc tới hạn đóng gói (${group.packaging_deadline?.toLocaleString('vi-VN') ?? ''}). Đề nghị ưu tiên xử lý.`,
          relatedEntityType: 'order_group',
          relatedEntityId: String(group._id),
        });
      }

      // Nhóm 2 — ĐÃ quá hạn, chưa đánh dấu is_overdue — escalate Store Owner + Admin.
      const breachedGroups = await this.orderGroupModel.find({
        order_priority: 'express',
        is_overdue: false,
        packaging_deadline: { $lte: now },
      });

      for (const group of breachedGroups) {
        await this.notificationsService.notify({
          recipientRole: UserRole.STORE_OWNER,
          type: NotificationType.SLA_BREACH,
          severity: 'critical',
          title: `QUÁ HẠN đóng gói — Đơn hàng #${String(group._id)}`,
          message: `Đơn hàng #${String(group._id)} thuộc diện Hỏa Tốc đã QUÁ HẠN đóng gói theo cam kết. Đề nghị kiểm tra và xử lý khẩn cấp.`,
          relatedEntityType: 'order_group',
          relatedEntityId: String(group._id),
        });
        group.is_overdue = true;
        await group.save();
      }

      if (warningCandidates.length > 0 || breachedGroups.length > 0) {
        this.logger.log(
          `SLA check: ${String(warningCandidates.length)} cảnh báo sắp quá hạn, ${String(breachedGroups.length)} đã quá hạn.`,
        );
      }
    } finally {
      this.isRunning = false;
    }
  }
}
