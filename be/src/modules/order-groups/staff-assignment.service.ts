import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OrderGroup, OrderGroupDocument } from './schemas/order-group.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { UserRole } from '../../common/enums/user-role.enum';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';
import { STAFF_ASSIGNMENT_ERROR_CODES } from './staff-assignment.errors';
import { AppException } from '../../common/exceptions/app-exception';
import { isOnLeave, notOnLeaveFilter } from '../users/utils/on-leave.util';

/**
 * 🔄 ĐÃ ĐỔI (21/10/2026): "việc" của người LẤY HÀNG = nhóm còn ở bước lấy hàng.
 * Trước đây đếm mọi nhóm chưa giao xong (gồm cả picked / chờ chấp nhận / đang đóng /
 * packed / shipped) → người lấy nhanh bị coi là bận nhất dù đã rảnh tay. Nhóm bị trả
 * về lấy hàng (`back-to-picking` → `picking`) tự được tính lại cho đúng người.
 */
export const PICKING_WORKLOAD_STATUSES: GroupFulfillmentStatus[] = [
  GroupFulfillmentStatus.AWAITING_PACKAGING,
  GroupFulfillmentStatus.PICKING,
  GroupFulfillmentStatus.PARTIAL_NEEDS_REVIEW,
];

/**
 * ===================================================================
 * staff-assignment.service.ts — MỚI (2026-09-10)
 * ===================================================================
 * Thuật toán AUTO = Least-Busy (ít việc nhất), có tie-break theo
 * assigned_at cũ nhất — ĐÃ NGHIÊN CỨU so sánh với round-robin/random,
 * chọn Least-Busy vì công bằng thực tế hơn (không phụ thuộc thứ tự
 * cố định, tính tới khối lượng công việc THẬT đang có).
 *
 * KHÔNG auto cứng — Admin VÀ chính Warehouse Staff đều gọi được để
 * gán tay, ghi đè kết quả auto bất kỳ lúc nào (assignment_type phân
 * biệt rõ 'auto' vs 'manual' để biết lần gán gần nhất là do ai quyết).
 * ===================================================================
 */
@Injectable()
export class StaffAssignmentService {
  private readonly logger = new Logger(StaffAssignmentService.name);

  constructor(
    @InjectModel(OrderGroup.name) private readonly orderGroupModel: Model<OrderGroupDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async listStaffWithWorkload(
    role: UserRole = UserRole.WAREHOUSE_STAFF,
    search?: string,
  ): Promise<{ staffId: string; fullName: string; email: string; activeWorkload: number; onLeave: boolean; onLeaveUntil: Date | null }[]> {
    const filter: Record<string, unknown> = { role, is_active: true };
    // Tìm theo tên/email — user yêu cầu "search staff" (2026-09-10).
    // Regex escape ký tự đặc biệt để tránh lỗi/ReDoS nếu user gõ ký tự lạ.
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    const staffList = await this.userModel
      .find(filter)
      .select('_id name email on_leave on_leave_until')
      .lean();

    if (staffList.length === 0) return [];

    const staffIds = staffList.map((s) => s._id);
    const workloads = await this.orderGroupModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { assigned_staff_id: { $in: staffIds }, fulfillment_status: { $in: PICKING_WORKLOAD_STATUSES } } },
      { $group: { _id: '$assigned_staff_id', count: { $sum: 1 } } },
    ]);
    const workloadMap = new Map(workloads.map((w) => [w._id.toString(), w.count]));

    return staffList.map((s) => ({
      staffId: s._id.toString(),
      fullName: s.name,
      email: s.email,
      activeWorkload: workloadMap.get(s._id.toString()) ?? 0,
      // 22/10/2026 — vẫn liệt kê người đang nghỉ (để thấy việc họ đang giữ) nhưng FE phải khoá chọn.
      onLeave: isOnLeave(s),
      onLeaveUntil: isOnLeave(s) ? (s.on_leave_until ?? null) : null,
    }));
  }

  async autoAssign(groupId: string, role: UserRole = UserRole.WAREHOUSE_STAFF): Promise<OrderGroupDocument> {
    // 22/10/2026 — bỏ qua người đang nghỉ phép.
    const staffList = await this.userModel
      .find({ role, is_active: true, $and: [notOnLeaveFilter()] })
      .select('_id')
      .lean();
    if (staffList.length === 0) {
      throw new AppException(
        STAFF_ASSIGNMENT_ERROR_CODES.NO_STAFF_AVAILABLE,
        `Không có nhân viên role "${String(role)}" nào đang active (không nghỉ phép) để gán việc.`,
        HttpStatus.CONFLICT,
        { role },
      );
    }

    const staffIds = staffList.map((s) => s._id);
    const workloads = await this.orderGroupModel.aggregate<{
      _id: Types.ObjectId;
      count: number;
      lastAssignedAt: Date;
    }>([
      // Đếm việc = nhóm còn ở bước lấy hàng; nhưng "lần được giao gần nhất" lấy trên MỌI
      // nhóm — để 2 người cùng 0 việc vẫn xoay vòng đúng (người vừa lấy xong không bị chọn lại ngay).
      { $match: { assigned_staff_id: { $in: staffIds } } },
      {
        $group: {
          _id: '$assigned_staff_id',
          count: { $sum: { $cond: [{ $in: ['$fulfillment_status', PICKING_WORKLOAD_STATUSES] }, 1, 0] } },
          lastAssignedAt: { $max: '$assigned_at' },
        },
      },
    ]);
    const workloadMap = new Map(workloads.map((w) => [w._id.toString(), w]));

    const firstId = staffIds[0];
    if (!firstId) {
      throw new AppException(
        STAFF_ASSIGNMENT_ERROR_CODES.NO_STAFF_AVAILABLE,
        `Không có nhân viên role "${String(role)}" nào đang active (không nghỉ phép) để gán việc.`,
        HttpStatus.CONFLICT,
        { role },
      );
    }
    let chosenId = firstId;
    let minCount = Infinity;
    let oldestAssignedAt = new Date(8640000000000000);

    for (const id of staffIds) {
      const w = workloadMap.get(id.toString());
      const count = w?.count ?? 0;
      const lastAt = w?.lastAssignedAt ?? new Date(0);
      if (count < minCount || (count === minCount && lastAt < oldestAssignedAt)) {
        chosenId = id;
        minCount = count;
        oldestAssignedAt = lastAt;
      }
    }

    return this.applyAssignment(groupId, chosenId, 'auto');
  }

  async manualAssign(groupId: string, staffId: string): Promise<OrderGroupDocument> {
    if (!Types.ObjectId.isValid(staffId)) {
      throw new AppException(
        STAFF_ASSIGNMENT_ERROR_CODES.STAFF_NOT_FOUND,
        `"${staffId}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { staffId },
      );
    }
    const staff = await this.userModel.findById(staffId);
    if (!staff) {
      throw new AppException(
        STAFF_ASSIGNMENT_ERROR_CODES.STAFF_NOT_FOUND,
        `Không tìm thấy nhân viên với id "${staffId}".`,
        HttpStatus.NOT_FOUND,
        { staffId },
      );
    }
    if (!staff.is_active) {
      throw new AppException(
        STAFF_ASSIGNMENT_ERROR_CODES.STAFF_INACTIVE,
        `Nhân viên "${staffId}" hiện không active, không thể gán việc.`,
        HttpStatus.CONFLICT,
        { staffId },
      );
    }
    // SỬA (05/10/2026): trước đây gán tay được cho BẤT KỲ ai (kể cả Admin, Shipping
    // Coordinator) — việc lấy hàng chỉ dành cho Warehouse Staff, giống auto-assign.
    if (isOnLeave(staff)) {
      throw new AppException(
        STAFF_ASSIGNMENT_ERROR_CODES.STAFF_ON_LEAVE,
        `Nhân viên "${staff.name}" đang nghỉ phép${staff.on_leave_until ? ` đến ${staff.on_leave_until.toISOString()}` : ''} — chọn người khác.`,
        HttpStatus.CONFLICT,
        { staffId, onLeaveUntil: staff.on_leave_until ?? null },
      );
    }
    if (staff.role !== UserRole.WAREHOUSE_STAFF) {
      throw new AppException(
        STAFF_ASSIGNMENT_ERROR_CODES.STAFF_WRONG_ROLE,
        `Nhân viên "${staffId}" không phải Warehouse Staff — chỉ gán lấy hàng cho Warehouse Staff.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { staffId, role: staff.role },
      );
    }
    return this.applyAssignment(groupId, staff._id, 'manual');
  }

  private async applyAssignment(
    groupId: string,
    staffId: Types.ObjectId,
    type: 'auto' | 'manual',
  ): Promise<OrderGroupDocument> {
    const updated = await this.orderGroupModel.findByIdAndUpdate(
      groupId,
      { $set: { assigned_staff_id: staffId, assigned_at: new Date(), assignment_type: type } },
      { returnDocument: 'after' },
    );
    if (!updated) {
      throw new AppException(
        STAFF_ASSIGNMENT_ERROR_CODES.STAFF_NOT_FOUND,
        `Không tìm thấy Order Group với id "${groupId}".`,
        HttpStatus.NOT_FOUND,
        { groupId },
      );
    }
    this.logger.log(`Order Group ${groupId} được gán cho nhân viên ${staffId.toString()} (${type}).`);
    return updated;
  }
}
