import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { User, UserDocument } from '../users/schemas/user.schema';
import { PackingPlan, PackingPlanDocument } from './schemas/packing-plan.schema';
import { PACKING_ERROR_CODES } from './packing.errors';
import { isLiveParcel } from './utils/parcels.util';

export interface PackingStaffStats {
  staffId: string;
  name: string | null;
  groups: number;
  parcels: number;
  avgPackMinutes: number | null;
  heldParcels: number;
  quickPackGroups: number;
}

export interface PackingReport {
  from: Date;
  to: Date;
  groups: number;
  orders: number;
  parcels: number;
  /** Duyệt xong → bắt đầu đóng (phút, trung bình; chỉ nhóm có bấm bắt đầu/quét). */
  avgWaitMinutes: number | null;
  /** Bắt đầu đóng → đóng xong (phút, trung bình). */
  avgPackMinutes: number | null;
  /** Kiện từng bị giữ vì lệch cân / kiện đã niêm phong. */
  heldRate: number | null;
  /** Kiện được chấp nhận dù lệch (người khác xem lại). */
  acceptedDespiteDeviation: number;
  /** Kế hoạch duyệt nguyên vẹn (không chỉnh tay) / kế hoạch đã đóng. */
  approvedIntactRate: number | null;
  /** Đơn có số kiện đúng bằng cận dưới (tối thiểu chứng minh được) / đơn. */
  minimalParcelRate: number | null;
  /** Nhóm đóng bằng quét kiểm từng món / nhóm có ghi chế độ đóng. */
  scanRate: number | null;
  packagingCostVnd: number;
  issues: { damaged: number; missing: number; wrongItem: number };
  byStaff: PackingStaffStats[];
}

const MINUTE = 60_000;
/** Báo cáo đọc tối đa ngần này kế hoạch (quy mô đồ án); vượt thì thu hẹp khoảng ngày. */
const MAX_PLANS = 5_000;

const average = (values: number[]): number | null =>
  values.length === 0 ? null : Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
const ratio = (part: number, whole: number): number | null =>
  whole === 0 ? null : Math.round((part / whole) * 1000) / 1000;

/**
 * Báo cáo hiệu suất đóng gói (05/10/2026). Đọc kế hoạch `packed` trong khoảng
 * ngày (chỉ mục {status, packed_at}) rồi tính trong bộ nhớ — đủ cho quy mô
 * hiện tại; khi dữ liệu lớn nên chuyển sang bảng tổng hợp chạy định kỳ (Rule #10).
 */
@Injectable()
export class PackingReportService {
  constructor(
    @InjectModel(PackingPlan.name) private readonly planModel: Model<PackingPlanDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async summary(fromIso?: string, toIso?: string, staffId?: string): Promise<PackingReport> {
    const to = toIso ? new Date(toIso) : new Date();
    const from = fromIso ? new Date(fromIso) : new Date(to.getTime() - 30 * 24 * 60 * MINUTE);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      throw new AppException(
        PACKING_ERROR_CODES.INVALID_DATE_RANGE,
        'Khoảng ngày không hợp lệ (from phải trước to, định dạng ISO).',
        HttpStatus.BAD_REQUEST,
        { from: fromIso ?? null, to: toIso ?? null },
      );
    }
    const filter: Record<string, unknown> = { status: 'packed', packed_at: { $gte: from, $lt: to } };
    if (staffId) {
      if (!Types.ObjectId.isValid(staffId)) {
        throw new AppException(PACKING_ERROR_CODES.INVALID_ID, `"${staffId}" không đúng định dạng ObjectId.`, HttpStatus.BAD_REQUEST);
      }
      filter.packed_by = new Types.ObjectId(staffId);
    }
    const plans = await this.planModel
      .find(filter)
      .select('orders parcels adjustments approved_at packing_started_at packed_at packed_by pack_mode')
      .sort({ packed_at: -1 })
      .limit(MAX_PLANS)
      .lean();

    const waits: number[] = [];
    const durations: number[] = [];
    let parcels = 0;
    let sealedCount = 0;
    let heldEver = 0;
    let accepted = 0;
    let intact = 0;
    let orders = 0;
    let minimal = 0;
    let scanGroups = 0;
    let modeGroups = 0;
    let cost = 0;
    const issues = { damaged: 0, missing: 0, wrongItem: 0 };
    const staff = new Map<string, { groups: number; parcels: number; durations: number[]; held: number; quick: number }>();

    for (const plan of plans) {
      const live = plan.parcels.filter(isLiveParcel);
      parcels += live.length;
      if (plan.approved_at && plan.packing_started_at)
        waits.push((plan.packing_started_at.getTime() - plan.approved_at.getTime()) / MINUTE);
      const duration =
        plan.packing_started_at && plan.packed_at
          ? (plan.packed_at.getTime() - plan.packing_started_at.getTime()) / MINUTE
          : null;
      if (duration !== null) durations.push(duration);
      let held = 0;
      for (const p of live) {
        sealedCount += 1;
        if (p.weighings.some((w) => w.is_abnormal) || p.is_abnormal) held += 1;
        if (p.reviews.some((r) => r.action === 'accept')) accepted += 1;
        cost += (p.box.price_vnd ?? 0) + p.materials_cost_vnd;
      }
      heldEver += held;
      if (plan.adjustments.length === 0) intact += 1;
      for (const o of plan.orders) {
        if (o.status === 'canceled') continue;
        orders += 1;
        const count = live.filter((p) => p.order_id.equals(o.order_id)).length;
        if (o.lower_bound_parcels > 0 && count === o.lower_bound_parcels) minimal += 1;
      }
      if (plan.pack_mode) {
        modeGroups += 1;
        if (plan.pack_mode === 'scan') scanGroups += 1;
      }
      if (plan.packed_by) {
        const key = plan.packed_by.toString();
        const s = staff.get(key) ?? { groups: 0, parcels: 0, durations: [], held: 0, quick: 0 };
        s.groups += 1;
        s.parcels += live.length;
        if (duration !== null) s.durations.push(duration);
        s.held += held;
        if (plan.pack_mode === 'quick') s.quick += 1;
        staff.set(key, s);
      }
    }

    // Sự cố đếm theo THỜI ĐIỂM BÁO trên mọi kế hoạch — "trả về lấy hàng" làm kế
    // hoạch bị thay (superseded) nên không nằm trong các kế hoạch packed ở trên.
    const issueFilter: Record<string, unknown> = { 'issues.at': { $gte: from, $lt: to } };
    const issuePlans = await this.planModel.find(issueFilter).select('issues').lean();
    for (const plan of issuePlans) {
      for (const i of plan.issues) {
        if (i.at < from || i.at >= to) continue;
        if (staffId && i.by.toString() !== staffId) continue;
        if (i.issue === 'damaged') issues.damaged += 1;
        else if (i.issue === 'missing') issues.missing += 1;
        else issues.wrongItem += 1;
      }
    }

    const users = await this.userModel
      .find({ _id: { $in: [...staff.keys()].map((id) => new Types.ObjectId(id)) } })
      .select('name')
      .lean();
    const names = new Map(users.map((u) => [u._id.toString(), u.name]));

    return {
      from,
      to,
      groups: plans.length,
      orders,
      parcels,
      avgWaitMinutes: average(waits),
      avgPackMinutes: average(durations),
      heldRate: ratio(heldEver, sealedCount),
      acceptedDespiteDeviation: accepted,
      approvedIntactRate: ratio(intact, plans.length),
      minimalParcelRate: ratio(minimal, orders),
      scanRate: ratio(scanGroups, modeGroups),
      packagingCostVnd: Math.round(cost),
      issues,
      byStaff: [...staff.entries()]
        .map(([id, s]) => ({
          staffId: id,
          name: names.get(id) ?? null,
          groups: s.groups,
          parcels: s.parcels,
          avgPackMinutes: average(s.durations),
          heldParcels: s.held,
          quickPackGroups: s.quick,
        }))
        .sort((a, b) => b.parcels - a.parcels),
    };
  }
}
