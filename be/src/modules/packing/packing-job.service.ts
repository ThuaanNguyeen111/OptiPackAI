import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import {
  OrderGroup,
  OrderGroupDocument,
} from '../order-groups/schemas/order-group.schema';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import { PackingPlan, PackingPlanDocument } from './schemas/packing-plan.schema';
import { PackingPlanService } from './packing-plan.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';

/** Số nhóm tối đa xử lý mỗi lượt quét (giữ mỗi lượt ngắn). */
const BATCH = 10;

/**
 * ===================================================================
 * Tự tính kế hoạch khi lấy hàng xong (04/10/2026, đợt 3)
 * ===================================================================
 * Mỗi 10 giây: tìm nhóm `picked` CHƯA có kế hoạch đang hoạt động → tính
 * (BRKGA) → CP-SAT chạy nền. Dùng quét định kỳ thay vì gọi trực tiếp từ
 * order-groups để (1) không tạo vòng phụ thuộc module, (2) tự chữa khi app
 * khởi động lại giữa chừng (job không bao giờ bị mất). Nhóm có kế hoạch
 * `failed`/`rejected` KHÔNG bị tính lại tự động — người dùng bấm "Tính lại".
 * ===================================================================
 */
@Injectable()
export class PackingJobService {
  private readonly logger = new Logger(PackingJobService.name);
  private running = false;

  constructor(
    @InjectModel(OrderGroup.name) private readonly groupModel: Model<OrderGroupDocument>,
    @InjectModel(PackingPlan.name) private readonly planModel: Model<PackingPlanDocument>,
    private readonly planService: PackingPlanService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('*/10 * * * * *', { name: 'packing-plan-auto-compute' })
  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.computePending();
    } catch (error: unknown) {
      this.logger.error(`Quét tự tính kế hoạch lỗi: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Nhắc kế hoạch bị từ chối QUÁ HẠN xử lý (08/10/2026). Mỗi kế hoạch nhắc đúng
   * 1 lần: người xử lý được giao (nếu có) + Admin + Store Owner.
   */
  @Cron('0 */15 * * * *', { name: 'packing-rejection-overdue' })
  async remindOverdueRejections(): Promise<number> {
    const overdue = await this.planModel
      .find({
        is_active: true,
        status: 'rejected',
        rejection_due_at: { $lt: new Date() },
        rejection_overdue_notified_at: null,
      })
      .select('order_group_id rejection_owner_id rejection_reason')
      .limit(50)
      .lean();
    let notified = 0;
    for (const plan of overdue) {
      const claimed = await this.planModel.updateOne(
        { _id: plan._id, rejection_overdue_notified_at: null },
        { $set: { rejection_overdue_notified_at: new Date() } },
      );
      if (claimed.matchedCount === 0) continue;
      const groupId = plan.order_group_id.toString();
      const common = {
        type: NotificationType.SLA_WARNING,
        severity: 'critical' as const,
        title: `Kế hoạch đóng gói bị từ chối quá hạn xử lý — nhóm #${groupId}`,
        message: `Kế hoạch bị từ chối (${plan.rejection_reason ?? 'không rõ lý do'}) chưa được xử lý. Hãy tính lại, đóng gói thủ công hoặc trả về lấy hàng.`,
        relatedEntityType: 'order_group',
        relatedEntityId: groupId,
      };
      const recipients: Parameters<NotificationsService['notify']>[0][] = [
        { ...common, recipientRole: UserRole.ADMIN },
        { ...common, recipientRole: UserRole.STORE_OWNER },
      ];
      if (plan.rejection_owner_id) recipients.push({ ...common, recipientUserId: plan.rejection_owner_id.toString() });
      for (const r of recipients) {
        try {
          await this.notificationsService.notify(r);
        } catch (error: unknown) {
          this.logger.error(`Nhắc quá hạn thất bại: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      notified += 1;
    }
    return notified;
  }

  /** Tính cho các nhóm đang chờ; trả số nhóm đã tính thành công (dùng cho test/script). */
  async computePending(): Promise<number> {
    const picked = await this.groupModel
      .find({ fulfillment_status: GroupFulfillmentStatus.PICKED })
      .select('_id')
      .sort({ updated_at: 1 })
      .limit(BATCH * 5)
      .lean();
    if (picked.length === 0) return 0;
    const withPlan = await this.planModel
      .find({ order_group_id: { $in: picked.map((g) => g._id) }, is_active: true })
      .select('order_group_id')
      .lean();
    const taken = new Set(withPlan.map((p) => p.order_group_id.toString()));
    const todo = picked.filter((g) => !taken.has(g._id.toString())).slice(0, BATCH);

    let done = 0;
    for (const g of todo) {
      const groupId = g._id.toString();
      try {
        const { tasks } = await this.planService.compute(groupId);
        this.planService.runCpSatInBackground(tasks);
        done += 1;
      } catch (error: unknown) {
        // compute() đã ghi kế hoạch `failed` kèm lý do (hoặc nhóm vừa đổi trạng thái) — chỉ log.
        this.logger.warn(
          `Tự tính kế hoạch nhóm ${groupId} không thành công: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return done;
  }
}
