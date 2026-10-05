import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { UserRole } from '../../common/enums/user-role.enum';
import { User, UserDocument } from '../users/schemas/user.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { PackingPlan, PackingPlanDocument } from './schemas/packing-plan.schema';
import { PACKING_ERROR_CODES } from './packing.errors';

/** Kế hoạch còn là "việc đang làm" của người đóng. */
const OPEN_PLAN_STATUSES = ['ready', 'approved', 'packing'];

/**
 * ===================================================================
 * Giao người đóng gói (05/10/2026)
 * ===================================================================
 * Trước đây chỉ có `order_groups.assigned_staff_id` (người LẤY hàng — Warehouse
 * Staff). Người đóng là Packaging Staff, giao trên KẾ HOẠCH:
 * - Kế hoạch vừa `ready`: giữ người của lần tính trước (tính lại) nếu người đó
 *   còn hoạt động, không thì chọn Packaging Staff ít kế hoạch đang mở nhất,
 *   hòa thì người được giao lâu nhất trước (cùng thuật toán Least-Busy của
 *   staff-assignment).
 * - Không có Packaging Staff nào → để trống, không chặn luồng (ai cũng nhận được).
 * ===================================================================
 */
@Injectable()
export class PackerAssignmentService {
  private readonly logger = new Logger(PackerAssignmentService.name);

  constructor(
    @InjectModel(PackingPlan.name) private readonly planModel: Model<PackingPlanDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Gọi sau khi kế hoạch thành `ready`. Best-effort: lỗi chỉ log, trả null. */
  async assignOnReady(
    planId: Types.ObjectId,
    previousPackerId: Types.ObjectId | null,
  ): Promise<PackingPlanDocument | null> {
    try {
      let packerId: Types.ObjectId | null = null;
      if (previousPackerId && (await this.isActivePacker(previousPackerId))) packerId = previousPackerId;
      packerId ??= await this.pickLeastBusy();
      if (!packerId) return null;
      return await this.apply(planId, packerId);
    } catch (error: unknown) {
      this.logger.warn(
        `Tự giao người đóng cho kế hoạch ${planId.toString()} thất bại: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async assign(plan: PackingPlanDocument, mode: 'auto' | 'manual', staffId?: string): Promise<PackingPlanDocument> {
    let packerId: Types.ObjectId | null;
    if (mode === 'manual') {
      if (!staffId || !Types.ObjectId.isValid(staffId)) throw this.invalid(staffId ?? '');
      packerId = new Types.ObjectId(staffId);
      if (!(await this.isActivePacker(packerId))) throw this.invalid(staffId);
    } else {
      packerId = await this.pickLeastBusy(plan._id);
      if (!packerId) {
        throw new AppException(
          PACKING_ERROR_CODES.NO_PACKER_AVAILABLE,
          'Không có Packaging Staff nào đang hoạt động để giao việc.',
          HttpStatus.CONFLICT,
        );
      }
    }
    const updated = await this.apply(plan._id, packerId);
    if (!updated) {
      throw new AppException(
        PACKING_ERROR_CODES.PLAN_NOT_FOUND,
        'Kế hoạch đóng gói không còn hoạt động — tải lại dữ liệu.',
        HttpStatus.NOT_FOUND,
      );
    }
    return updated;
  }

  private async apply(planId: Types.ObjectId, packerId: Types.ObjectId): Promise<PackingPlanDocument | null> {
    // Không tăng version: giao việc không đổi phương án, không làm hỏng màn người khác đang xem.
    const updated = await this.planModel.findOneAndUpdate(
      { _id: planId, is_active: true },
      { $set: { assigned_packer_id: packerId, assigned_packer_at: new Date() } },
      { returnDocument: 'after' },
    );
    if (updated) {
      try {
        await this.notificationsService.notify({
          recipientUserId: packerId.toString(),
          type: NotificationType.PACKING_ASSIGNED,
          severity: 'info',
          title: 'Bạn được giao đóng gói một nhóm đơn',
          message: `Kế hoạch đóng gói gồm ${String(updated.parcels.length)} kiện đang chờ bạn duyệt và đóng.`,
          relatedEntityType: 'order_group',
          relatedEntityId: updated.order_group_id.toString(),
        });
      } catch (error: unknown) {
        this.logger.warn(`Gửi thông báo giao việc thất bại: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return updated;
  }

  private async isActivePacker(id: Types.ObjectId): Promise<boolean> {
    return (await this.userModel.exists({ _id: id, role: UserRole.PACKAGING_STAFF, is_active: true })) !== null;
  }

  private async pickLeastBusy(excludePlanId?: Types.ObjectId): Promise<Types.ObjectId | null> {
    const staff = await this.userModel
      .find({ role: UserRole.PACKAGING_STAFF, is_active: true })
      .select('_id')
      .sort({ _id: 1 })
      .lean();
    if (staff.length === 0) return null;
    const match: Record<string, unknown> = {
      assigned_packer_id: { $in: staff.map((s) => s._id) },
      is_active: true,
      status: { $in: OPEN_PLAN_STATUSES },
    };
    if (excludePlanId) match._id = { $ne: excludePlanId };
    const rows = await this.planModel.aggregate<{ _id: Types.ObjectId; count: number; last: Date | null }>([
      { $match: match },
      { $group: { _id: '$assigned_packer_id', count: { $sum: 1 }, last: { $max: '$assigned_packer_at' } } },
    ]);
    const load = new Map(rows.map((r) => [r._id.toString(), r]));
    let best: { id: Types.ObjectId; count: number; last: number } | null = null;
    for (const s of staff) {
      const row = load.get(s._id.toString());
      const candidate = { id: s._id, count: row?.count ?? 0, last: row?.last?.getTime() ?? 0 };
      if (!best || candidate.count < best.count || (candidate.count === best.count && candidate.last < best.last))
        best = candidate;
    }
    return best?.id ?? null;
  }

  private invalid(staffId: string): AppException {
    return new AppException(
      PACKING_ERROR_CODES.PACKER_INVALID,
      `"${staffId}" không phải Packaging Staff đang hoạt động.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { staffId },
    );
  }
}
