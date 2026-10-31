import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { UserRole } from '../../common/enums/user-role.enum';
import { User, UserDocument } from '../users/schemas/user.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { PackingPlan, PackingPlanDocument, type PackingPlanStatus } from './schemas/packing-plan.schema';
import { PACKING_ERROR_CODES } from './packing.errors';
import { isOnLeave, notOnLeaveFilter } from '../users/utils/on-leave.util';

/** Kế hoạch còn là "việc đang làm" của người đóng. */
const OPEN_PLAN_STATUSES = ['ready', 'approved', 'packing'];
/**
 * 31/10/2026 — Kế hoạch CHƯA bắt đầu đóng (đang `packing` thì đã có người cầm hàng trên bàn,
 * đổi người giữa chừng gây nhầm) được giao lại khi mồ côi.
 */
const REASSIGNABLE_PLAN_STATUSES: PackingPlanStatus[] = ['ready', 'approved'];
/** Số kế hoạch tối đa xét mỗi lượt quét giao lại. */
const REASSIGN_BATCH = 200;

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
 * - 31/10/2026 — quét mỗi phút (`reassignOrphans`): kế hoạch chưa bắt đầu đóng mà
 *   chưa có người, hoặc người được giao đã nghỉ phép / bị khoá / không còn role
 *   Packaging Staff → giao lại cho người ít việc nhất. Trước đây chỉ giao 1 lần lúc
 *   `ready` nên các kế hoạch đó nằm mồ côi mãi.
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

  /**
   * 31/10/2026 — Giao lại kế hoạch mồ côi (xem đầu file). Chỉ ghi khi người giữ kế hoạch
   * vẫn đúng như lúc đọc (không đè người vừa bấm "Giao cho tôi" / Admin vừa giao tay).
   * Trả số kế hoạch đã giao lại.
   */
  @Cron('45 * * * * *', { name: 'packing-packer-reassign' })
  async reassignOrphans(): Promise<number> {
    try {
      const plans = await this.planModel
        .find({ is_active: true, status: { $in: REASSIGNABLE_PLAN_STATUSES } })
        .select('_id assigned_packer_id')
        .sort({ created_at: 1 })
        .limit(REASSIGN_BATCH)
        .lean();
      if (plans.length === 0) return 0;
      const available = await this.userModel
        .find({ role: UserRole.PACKAGING_STAFF, is_active: true, $and: [notOnLeaveFilter()] })
        .select('_id')
        .lean();
      if (available.length === 0) return 0;
      const ok = new Set(available.map((u) => u._id.toString()));
      let reassigned = 0;
      for (const plan of plans) {
        const current = plan.assigned_packer_id ?? null;
        if (current && ok.has(current.toString())) continue;
        const packerId = await this.pickLeastBusy(plan._id);
        if (!packerId) break;
        const updated = await this.apply(plan._id, packerId, current);
        if (updated) reassigned += 1;
      }
      if (reassigned > 0) this.logger.log(`Giao lại ${String(reassigned)} kế hoạch đóng gói chưa có người / người cũ không còn nhận việc.`);
      return reassigned;
    } catch (error: unknown) {
      this.logger.warn(`Quét giao lại người đóng thất bại: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }

  async assign(plan: PackingPlanDocument, mode: 'auto' | 'manual', staffId?: string): Promise<PackingPlanDocument> {
    let packerId: Types.ObjectId | null;
    if (mode === 'manual') {
      if (!staffId || !Types.ObjectId.isValid(staffId)) throw this.invalid(staffId ?? '');
      packerId = new Types.ObjectId(staffId);
      if (!(await this.isActivePacker(packerId))) {
        await this.assertNotOnLeave(packerId); // 22/10/2026 — lý do là nghỉ phép → báo đúng lý do
        throw this.invalid(staffId);
      }
    } else {
      packerId = await this.pickLeastBusy(plan._id);
      if (!packerId) {
        throw new AppException(
          PACKING_ERROR_CODES.NO_PACKER_AVAILABLE,
          'Không có Packaging Staff nào đang hoạt động (không nghỉ phép) để giao việc.',
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

  /**
   * (09/10/2026) Danh sách Packaging Staff đang hoạt động + số kế hoạch đang mở
   * (ready/approved/packing) — FE dùng cho dropdown giao người đóng (`assign`
   * với staff_id) và chọn người xử lý khi từ chối (`reject.owner_id`).
   */
  async listPackers(
    search?: string,
  ): Promise<{ staffId: string; fullName: string; email: string; activeWorkload: number; onLeave: boolean; onLeaveUntil: Date | null }[]> {
    const filter: Record<string, unknown> = { role: UserRole.PACKAGING_STAFF, is_active: true };
    const q = search?.trim();
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }
    const staff = await this.userModel.find(filter).select('_id name email on_leave on_leave_until').sort({ name: 1 }).lean();
    if (staff.length === 0) return [];
    const rows = await this.planModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      {
        $match: {
          assigned_packer_id: { $in: staff.map((s) => s._id) },
          is_active: true,
          status: { $in: OPEN_PLAN_STATUSES },
        },
      },
      { $group: { _id: '$assigned_packer_id', count: { $sum: 1 } } },
    ]);
    const load = new Map(rows.map((r) => [r._id.toString(), r.count]));
    return staff.map((s) => ({
      staffId: s._id.toString(),
      fullName: s.name,
      email: s.email,
      activeWorkload: load.get(s._id.toString()) ?? 0,
      // 22/10/2026 — người đang nghỉ vẫn hiện (thấy việc đang giữ) nhưng FE khoá chọn.
      onLeave: isOnLeave(s),
      onLeaveUntil: isOnLeave(s) ? (s.on_leave_until ?? null) : null,
    }));
  }

  /** `expectedPrevious` (khi có) = chỉ ghi nếu người đang giữ kế hoạch chưa đổi (null = chưa có ai). */
  private async apply(
    planId: Types.ObjectId,
    packerId: Types.ObjectId,
    expectedPrevious?: Types.ObjectId | null,
  ): Promise<PackingPlanDocument | null> {
    // Không tăng version: giao việc không đổi phương án, không làm hỏng màn người khác đang xem.
    // 22/10/2026 — lưu sẵn tên người đóng để màn hình hiện tên (không chỉ đuôi mã).
    const packerName = await this.packerName(packerId);
    const updated = await this.planModel.findOneAndUpdate(
      {
        _id: planId,
        is_active: true,
        ...(expectedPrevious !== undefined ? { assigned_packer_id: expectedPrevious } : {}),
      },
      { $set: { assigned_packer_id: packerId, assigned_packer_at: new Date(), assigned_packer_name: packerName } },
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

  /** Tên hiển thị của người đóng; lỗi tra cứu → null (không chặn giao việc). */
  private async packerName(id: Types.ObjectId): Promise<string | null> {
    try {
      const user = await this.userModel.findById(id).select('name').lean();
      return user?.name ?? null;
    } catch {
      return null;
    }
  }

  /** 22/10/2026 — đang nghỉ phép thì không nhận việc mới (cả giữ người cũ khi tính lại). */
  private async isActivePacker(id: Types.ObjectId): Promise<boolean> {
    return (
      (await this.userModel.exists({
        _id: id,
        role: UserRole.PACKAGING_STAFF,
        is_active: true,
        $and: [notOnLeaveFilter()],
      })) !== null
    );
  }

  /** 22/10/2026 — giao tay cho người đang nghỉ phép → lỗi rõ ràng (không gộp vào "không hợp lệ"). */
  private async assertNotOnLeave(id: Types.ObjectId): Promise<void> {
    let user: { name: string; on_leave?: boolean; on_leave_until?: Date | null } | null = null;
    try {
      user = await this.userModel.findById(id).select('name on_leave on_leave_until').lean();
    } catch {
      return; // tra cứu lỗi → để lỗi "không hợp lệ" chung xử lý
    }
    if (user && isOnLeave(user)) {
      throw new AppException(
        PACKING_ERROR_CODES.PACKER_ON_LEAVE,
        `Nhân viên "${user.name}" đang nghỉ phép${user.on_leave_until ? ` đến ${user.on_leave_until.toISOString()}` : ''} — chọn người khác.`,
        HttpStatus.CONFLICT,
        { staffId: id.toString(), onLeaveUntil: user.on_leave_until ?? null },
      );
    }
  }

  private async pickLeastBusy(excludePlanId?: Types.ObjectId): Promise<Types.ObjectId | null> {
    const staff = await this.userModel
      .find({ role: UserRole.PACKAGING_STAFF, is_active: true, $and: [notOnLeaveFilter()] })
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
