import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OrderGroup, OrderGroupDocument } from './schemas/order-group.schema';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';
import { PackingPlan, PackingPlanDocument } from '../packing/schemas/packing-plan.schema';
import { Shipment, ShipmentDocument } from '../shipments/schemas/shipment.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';

const MINUTE_MS = 60 * 1000;
/** Đơn hỏa tốc AURELLE (có hạn giao): báo trước mỗi mốc 15 phút (Thuận chốt 29/10/2026). */
const EXPRESS_WARN_BEFORE_MS = 15 * MINUTE_MS;
/** Đơn Lazada đánh dấu hỏa tốc tay (chỉ có hạn đóng gói 4 giờ làm việc): giữ báo trước 1 giờ như cũ. */
const MANUAL_WARN_BEFORE_MS = 60 * MINUTE_MS;

/** Chưa đóng gói xong — hạn đóng gói còn tính. */
export const PRE_PACK_STATUSES: GroupFulfillmentStatus[] = [
  GroupFulfillmentStatus.AWAITING_PACKAGING,
  GroupFulfillmentStatus.PENDING_APPROVAL,
  GroupFulfillmentStatus.APPROVED_FOR_PACKING,
  GroupFulfillmentStatus.PICKING,
  GroupFulfillmentStatus.PICKED,
  GroupFulfillmentStatus.PARTIAL_NEEDS_REVIEW,
];
/** Đã kết thúc với khách — hạn giao không còn tính. */
const DELIVERY_DONE_STATUSES: GroupFulfillmentStatus[] = [
  GroupFulfillmentStatus.DELIVERED,
  GroupFulfillmentStatus.RETURNING,
  GroupFulfillmentStatus.RETURNED,
  GroupFulfillmentStatus.CANCELED,
];

type Stamp = 'sla_pack_warned_at' | 'sla_pack_breached_at' | 'sla_delivery_warned_at' | 'sla_delivery_breached_at';

interface SlaGroup {
  _id: Types.ObjectId;
  assigned_staff_id?: Types.ObjectId | null;
  packaging_deadline?: Date | null;
  delivery_deadline?: Date | null;
  requires_self_delivery?: boolean;
}

const timeVn = (d: Date | null | undefined): string =>
  d ? d.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }) : '';
const code = (g: SlaGroup): string => `…${String(g._id).slice(-8)}`;

/**
 * ===================================================================
 * SLA đơn HỎA TỐC — 🔄 ĐÃ THAY ĐỔI 29/10/2026 (trước: 10 phút/lần, 2 mốc đóng gói, dùng
 * `is_overdue` kiêm cờ "đã báo" và KHÔNG xét trạng thái nhóm → nhóm đã đóng/giao xong vẫn bị
 * báo "QUÁ HẠN"). Giờ chạy MỖI PHÚT, 4 mốc, mỗi mốc báo đúng 1 lần (ghi `sla_*_at` có điều kiện):
 *   1. Sắp hết hạn đóng gói (còn ≤ 15 phút; đơn Lazada đánh dấu tay ≤ 1 giờ) — chỉ nhóm CHƯA đóng
 *      xong → nhân viên lấy hàng + người đóng gói đang phụ trách (chưa giao ai → cả 2 vai trò).
 *   2. Quá hạn đóng gói, chưa đóng xong → Store Owner + Shipping Coordinator; `is_overdue = true`.
 *   3. Sắp hết hạn giao tới khách (≤ 15 phút, chỉ nhóm có `delivery_deadline`), chưa giao xong
 *      → shipper của vận đơn + Shipping Coordinator.
 *   4. Quá giờ hẹn giao, chưa giao xong → Store Owner + Admin + shipper; `is_overdue = true`.
 *      Website AURELLE tự hiện "Trễ" theo giờ hẹn đã lưu trên đơn (không cần OptiPack báo).
 * ===================================================================
 */
@Injectable()
export class ExpressOrderSlaScheduler {
  private readonly logger = new Logger(ExpressOrderSlaScheduler.name);
  private isRunning = false;

  constructor(
    @InjectModel(OrderGroup.name) private readonly orderGroupModel: Model<OrderGroupDocument>,
    private readonly notificationsService: NotificationsService,
    @Optional() @InjectModel(PackingPlan.name) private readonly planModel?: Model<PackingPlanDocument>,
    @Optional() @InjectModel(Shipment.name) private readonly shipmentModel?: Model<ShipmentDocument>,
  ) {}

  @Cron('* * * * *', { name: 'express-order-sla-check' })
  async checkSlaDeadlines(now: Date = new Date()): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Lượt kiểm tra SLA trước chưa xong, bỏ qua lượt này.');
      return;
    }
    this.isRunning = true;
    try {
      const counts = [
        await this.packWarnings(now),
        await this.packBreaches(now),
        await this.deliveryWarnings(now),
        await this.deliveryBreaches(now),
      ];
      if (counts.some((n) => n > 0)) {
        this.logger.log(`SLA hỏa tốc: ${counts.map(String).join(' / ')} (sắp hết hạn đóng / quá hạn đóng / sắp hết hạn giao / trễ giao).`);
      }
    } finally {
      this.isRunning = false;
    }
  }

  private async find(filter: Record<string, unknown>): Promise<SlaGroup[]> {
    return this.orderGroupModel
      .find({ order_priority: 'express', ...filter })
      .select('_id assigned_staff_id packaging_deadline delivery_deadline requires_self_delivery')
      .lean<SlaGroup[]>();
  }

  /** Ghi mốc chỉ khi chưa ghi — true = lượt này là lượt đầu (được báo). */
  private async stamp(groupId: Types.ObjectId, field: Stamp, now: Date, overdue = false): Promise<boolean> {
    const res = await this.orderGroupModel.updateOne(
      { _id: groupId, [field]: null },
      { $set: { [field]: now, ...(overdue ? { is_overdue: true } : {}) } },
    );
    return res.modifiedCount === 1;
  }

  private async notify(
    recipients: { users?: string[]; roles?: UserRole[] },
    n: { type: NotificationType; severity: 'warning' | 'critical'; title: string; message: string },
    groupId: Types.ObjectId,
  ): Promise<void> {
    const base = { ...n, relatedEntityType: 'order_group', relatedEntityId: String(groupId) };
    for (const userId of new Set(recipients.users ?? [])) {
      await this.notificationsService.notify({ ...base, recipientUserId: userId }).catch((e: unknown) => { this.logger.warn('Gửi thông báo SLA thất bại', e); });
    }
    for (const role of recipients.roles ?? []) {
      await this.notificationsService.notify({ ...base, recipientRole: role }).catch((e: unknown) => { this.logger.warn('Gửi thông báo SLA thất bại', e); });
    }
  }

  private async packWarnings(now: Date): Promise<number> {
    const groups = await this.find({
      fulfillment_status: { $in: PRE_PACK_STATUSES },
      sla_pack_warned_at: null,
      sla_pack_breached_at: null,
      packaging_deadline: { $gt: now, $lte: new Date(now.getTime() + MANUAL_WARN_BEFORE_MS) },
    });
    let sent = 0;
    for (const g of groups) {
      const lead = g.delivery_deadline ? EXPRESS_WARN_BEFORE_MS : MANUAL_WARN_BEFORE_MS;
      if (!g.packaging_deadline || g.packaging_deadline.getTime() - now.getTime() > lead) continue;
      if (!(await this.stamp(g._id, 'sla_pack_warned_at', now))) continue;
      const users = [g.assigned_staff_id ? String(g.assigned_staff_id) : null, await this.packerOf(g._id)].filter((u): u is string => u !== null);
      await this.notify(
        users.length > 0 ? { users } : { roles: [UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF] },
        {
          type: NotificationType.SLA_WARNING,
          severity: 'warning',
          title: `Sắp hết hạn đóng gói đơn hỏa tốc ${code(g)}`,
          message: `Nhóm ${code(g)} phải đóng gói xong trước ${timeVn(g.packaging_deadline)}. Ưu tiên lấy hàng và đóng gói ngay.`,
        },
        g._id,
      );
      sent += 1;
    }
    return sent;
  }

  private async packBreaches(now: Date): Promise<number> {
    const groups = await this.find({
      fulfillment_status: { $in: PRE_PACK_STATUSES },
      sla_pack_breached_at: null,
      packaging_deadline: { $lte: now },
    });
    let sent = 0;
    for (const g of groups) {
      if (!(await this.stamp(g._id, 'sla_pack_breached_at', now, true))) continue;
      await this.notify(
        { roles: [UserRole.STORE_OWNER, UserRole.SHIPPING_COORDINATOR] },
        {
          type: NotificationType.SLA_BREACH,
          severity: 'critical',
          title: `QUÁ HẠN đóng gói đơn hỏa tốc ${code(g)}`,
          message: g.delivery_deadline
            ? `Nhóm ${code(g)} chưa đóng gói xong (hạn ${timeVn(g.packaging_deadline)}); khách được hẹn giao trước ${timeVn(g.delivery_deadline)}.`
            : `Nhóm ${code(g)} thuộc diện hỏa tốc đã quá hạn đóng gói (${timeVn(g.packaging_deadline)}).`,
        },
        g._id,
      );
      sent += 1;
    }
    return sent;
  }

  private async deliveryWarnings(now: Date): Promise<number> {
    const groups = await this.find({
      fulfillment_status: { $nin: DELIVERY_DONE_STATUSES },
      sla_delivery_warned_at: null,
      sla_delivery_breached_at: null,
      delivery_deadline: { $gt: now, $lte: new Date(now.getTime() + EXPRESS_WARN_BEFORE_MS) },
    });
    let sent = 0;
    for (const g of groups) {
      if (!(await this.stamp(g._id, 'sla_delivery_warned_at', now))) continue;
      const shipper = await this.shipperOf(g._id);
      await this.notify(
        { users: shipper ? [shipper] : [], roles: [UserRole.SHIPPING_COORDINATOR] },
        {
          type: NotificationType.SLA_WARNING,
          severity: 'warning',
          title: `Sắp tới giờ hẹn giao đơn hỏa tốc ${code(g)}`,
          message: `Khách được hẹn nhận hàng trước ${timeVn(g.delivery_deadline)}. Kiểm tra shipper đang giao.`,
        },
        g._id,
      );
      sent += 1;
    }
    return sent;
  }

  private async deliveryBreaches(now: Date): Promise<number> {
    const groups = await this.find({
      fulfillment_status: { $nin: DELIVERY_DONE_STATUSES },
      sla_delivery_breached_at: null,
      delivery_deadline: { $lte: now },
    });
    let sent = 0;
    for (const g of groups) {
      if (!(await this.stamp(g._id, 'sla_delivery_breached_at', now, true))) continue;
      const shipper = await this.shipperOf(g._id);
      await this.notify(
        { users: shipper ? [shipper] : [], roles: [UserRole.STORE_OWNER, UserRole.ADMIN] },
        {
          type: NotificationType.SLA_BREACH,
          severity: 'critical',
          title: `TRỄ HẸN giao đơn hỏa tốc ${code(g)}`,
          message: `Đã quá giờ hẹn giao ${timeVn(g.delivery_deadline)} mà đơn chưa tới tay khách. Website AURELLE đang hiện "Giao chậm hơn dự kiến" cho khách.`,
        },
        g._id,
      );
      sent += 1;
    }
    return sent;
  }

  private async packerOf(groupId: Types.ObjectId): Promise<string | null> {
    if (!this.planModel) return null;
    const plan = await this.planModel.findOne({ order_group_id: groupId, is_active: true }).select('assigned_packer_id').lean();
    return plan?.assigned_packer_id ? String(plan.assigned_packer_id) : null;
  }

  private async shipperOf(groupId: Types.ObjectId): Promise<string | null> {
    if (!this.shipmentModel) return null;
    const shipment = await this.shipmentModel.findOne({ order_group_id: groupId, direction: 'forward' }).select('shipper_id').lean();
    return shipment?.shipper_id ? String(shipment.shipper_id) : null;
  }
}
