import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { PackingPlan, PackingPlanDocument } from './schemas/packing-plan.schema';
import { PACKING_ERROR_CODES } from './packing.errors';

/**
 * ===================================================================
 * Vòng phản hồi cho Admin (08/10/2026)
 * ===================================================================
 * Gợi ý đóng gói chỉ là gợi ý — nhân viên có thể đổi thùng, chuyển món, từ
 * chối. Mỗi lần như vậy đã có MÃ LÝ DO. Báo cáo này gom lại theo lý do ×
 * SKU × thùng và chỉ ra Admin nên sửa dữ liệu đầu vào nào (hồ sơ SKU, danh
 * mục thùng, cài đặt). Hệ thống CHỈ ĐỀ XUẤT, không tự sửa. "AI" tốt lên nhờ
 * dữ liệu đầu vào đúng hơn — không phải nhờ tự học máy.
 * ===================================================================
 */

export type SuggestionTarget = 'sku' | 'box' | 'settings';

export interface FeedbackSuggestion {
  target: { type: SuggestionTarget; code: string | null };
  reason: string;
  count: number;
  message: string;
  action: { label: string; method: string; route: string };
}

export interface FeedbackReport {
  from: Date;
  to: Date;
  minCount: number;
  /** Kế hoạch tạo trong khoảng ngày. */
  plans: number;
  /** Kế hoạch KHÔNG bị chỉnh tay và không bị từ chối / kế hoạch. */
  followedRate: number | null;
  adjustedPlans: number;
  rejectedPlans: number;
  byReason: { reason: string; count: number }[];
  bySku: { sku: string; reason: string; count: number }[];
  byBox: { boxCode: string; reason: string; count: number }[];
  rejections: {
    total: number;
    open: number;
    overdue: number;
    byReason: { reason: string; count: number }[];
    resolvedBy: { recompute: number; manual: number; backToPicking: number };
  };
  /** Thùng hỏng khi đang đóng (đổi thùng, thùng cũ damaged) — hao hụt thật đã trừ tồn. */
  waste: { events: number; costVnd: number; byBox: { boxCode: string; count: number; costVnd: number }[] };
  suggestions: FeedbackSuggestion[];
}

type FeedbackPlan = Pick<
  PackingPlan,
  | 'adjustments'
  | 'parcels'
  | 'status'
  | 'rejected_at'
  | 'rejection_reason_code'
  | 'rejection_due_at'
  | 'rejection_resolution'
> & { created_at?: Date };

/** Lý do gắn với SKU (đo lại / sửa hồ sơ SKU). */
const SKU_REASONS: Record<string, { label: string; message: (sku: string, n: number) => string }> = {
  ITEM_DIMENSION_WRONG: {
    label: 'Đo lại hồ sơ SKU',
    message: (sku, n) => `SKU ${sku} bị báo sai kích thước ${String(n)} lần — đo lại sau khi gấp/bọc.`,
  },
  BOX_TOO_TIGHT: {
    label: 'Đo lại hồ sơ SKU',
    message: (sku, n) => `Thùng chật với SKU ${sku} ${String(n)} lần — số đo trong hồ sơ có thể thấp hơn thực tế.`,
  },
  BOX_TOO_LOOSE: {
    label: 'Đo lại hồ sơ SKU',
    message: (sku, n) => `Thùng quá rộng với SKU ${sku} ${String(n)} lần — số đo trong hồ sơ có thể cao hơn thực tế.`,
  },
  ITEM_WEIGHT_WRONG: {
    label: 'Sửa cân nặng SKU',
    message: (sku, n) => `SKU ${sku} bị báo sai cân nặng ${String(n)} lần.`,
  },
  PRODUCT_WEIGHT_WRONG: {
    label: 'Sửa cân nặng SKU',
    message: (sku, n) => `Kiện chứa SKU ${sku} lệch cân vì cân nặng hồ sơ sai ${String(n)} lần.`,
  },
  PRODUCT_MORE_FRAGILE_THAN_EXPECTED: {
    label: 'Bật dễ vỡ / giảm tải chồng của SKU, hoặc tăng đệm trong cài đặt',
    message: (sku, n) => `SKU ${sku} dễ vỡ hơn dự kiến ${String(n)} lần.`,
  },
  ITEM_DAMAGED: {
    label: 'Kiểm tra hồ sơ và cách bọc SKU',
    message: (sku, n) => `SKU ${sku} bị hỏng khi đóng ${String(n)} lần.`,
  },
};

/** Lý do gắn với THÙNG. */
const BOX_REASONS: Record<string, { label: string; route: string; message: (box: string, n: number) => string }> = {
  RECOMMENDED_BOX_NOT_IN_STOCK: {
    label: 'Nhập thùng / tăng mức cảnh báo',
    route: '/packaging/boxes',
    message: (box, n) => `Thùng ${box} được gợi ý nhưng hết hàng ${String(n)} lần — nhập thêm hoặc tăng reorder_level.`,
  },
  BOX_SPEC_WRONG: {
    label: 'Sửa số đo thùng trong danh mục',
    route: '/packaging/boxes',
    message: (box, n) => `Số đo thùng ${box} bị báo sai ${String(n)} lần.`,
  },
};

/** Lý do chung — chỉnh cài đặt / danh mục. */
const SETTINGS_REASONS: Record<string, { label: string; message: (n: number) => string }> = {
  TOO_MANY_PARCELS: {
    label: 'Xem cài đặt đóng gói / thêm cỡ thùng lớn',
    message: (n) => `${String(n)} lần kế hoạch bị cho là chia quá nhiều kiện.`,
  },
  SPECIAL_PACKING_NEEDED: {
    label: 'Xem cài đặt đóng gói',
    message: (n) => `${String(n)} lần đơn cần cách đóng đặc biệt mà hệ thống chưa hỗ trợ.`,
  },
  PLAN_UNREALISTIC: {
    label: 'Xem cài đặt đóng gói / đệm hàng dễ vỡ',
    message: (n) => `${String(n)} lần kế hoạch bị cho là không thực tế.`,
  },
};

const ratio = (part: number, whole: number): number | null =>
  whole === 0 ? null : Math.round((part / whole) * 1000) / 1000;

function bump<K>(map: Map<string, { key: K; count: number }>, id: string, key: K): void {
  const entry = map.get(id) ?? { key, count: 0 };
  entry.count += 1;
  map.set(id, entry);
}

/**
 * Hàm thuần: gom lệch gợi ý theo lý do × SKU × thùng và sinh đề xuất. Tách khỏi
 * truy vấn DB để test không cần Mongo.
 */
export function buildFeedback(
  plans: FeedbackPlan[],
  range: { from: Date; to: Date },
  minCount: number,
  now: Date = new Date(),
): FeedbackReport {
  const inRange = (d: Date | null | undefined): boolean => !!d && d >= range.from && d < range.to;
  const reasonTotals = new Map<string, number>();
  const skuMap = new Map<string, { key: { sku: string; reason: string }; count: number }>();
  const boxMap = new Map<string, { key: { boxCode: string; reason: string }; count: number }>();
  const settingsMap = new Map<string, number>();
  const rejectionReasons = new Map<string, number>();
  const wasteByBox = new Map<string, { count: number; costVnd: number }>();
  let adjustedPlans = 0;
  let rejectedPlans = 0;
  let planCount = 0;
  let followedPlans = 0;
  const rejections = { total: 0, open: 0, overdue: 0, recompute: 0, manual: 0, backToPicking: 0 };

  const count = (reason: string): void => {
    reasonTotals.set(reason, (reasonTotals.get(reason) ?? 0) + 1);
  };

  for (const plan of plans) {
    if (inRange(plan.created_at)) {
      planCount += 1;
      if (plan.adjustments.length === 0 && !plan.rejected_at) followedPlans += 1;
    }
    // back_to_picking là cách xử lý từ chối (đã đếm ở rejections) — không đếm lại như chỉnh tay.
    const adjustments = plan.adjustments.filter((a) => a.kind !== 'back_to_picking' && inRange(a.at));
    if (adjustments.length > 0) adjustedPlans += 1;
    for (const a of adjustments) {
      count(a.reason);
      if ((a.kind === 'change_box_in_session' || a.kind === 'unseal') && a.old_box_outcome === 'damaged') {
        const code = a.box_codes[0] ?? 'unknown';
        const w = wasteByBox.get(code) ?? { count: 0, costVnd: 0 };
        w.count += 1;
        w.costVnd += a.waste_cost_vnd ?? 0;
        wasteByBox.set(code, w);
      }
      if (SKU_REASONS[a.reason]) for (const sku of a.skus) bump(skuMap, `${sku}|${a.reason}`, { sku, reason: a.reason });
      const boxCode = a.box_codes[0];
      if (BOX_REASONS[a.reason] && boxCode) bump(boxMap, `${boxCode}|${a.reason}`, { boxCode, reason: a.reason });
      if (SETTINGS_REASONS[a.reason]) settingsMap.set(a.reason, (settingsMap.get(a.reason) ?? 0) + 1);
    }

    if (inRange(plan.rejected_at)) {
      rejectedPlans += 1;
      rejections.total += 1;
      const code = plan.rejection_reason_code ?? 'OTHER';
      rejectionReasons.set(code, (rejectionReasons.get(code) ?? 0) + 1);
      count(code);
      if (SETTINGS_REASONS[code]) settingsMap.set(code, (settingsMap.get(code) ?? 0) + 1);
      if (plan.rejection_resolution === 'recompute') rejections.recompute += 1;
      else if (plan.rejection_resolution === 'manual') rejections.manual += 1;
      else if (plan.rejection_resolution === 'back_to_picking') rejections.backToPicking += 1;
      else if (plan.status === 'rejected') {
        rejections.open += 1;
        if (plan.rejection_due_at && plan.rejection_due_at < now) rejections.overdue += 1;
      }
    }

    // Lệch cân bị xem lại: gom lý do theo kiện (SKU lấy từ món trong kiện).
    for (const parcel of plan.parcels) {
      for (const review of parcel.reviews) {
        if (!inRange(review.at) || review.action === 'accept') continue;
        count(review.reason);
        if (SKU_REASONS[review.reason]) {
          for (const sku of new Set(parcel.placements.map((p) => p.sku)))
            bump(skuMap, `${sku}|${review.reason}`, { sku, reason: review.reason });
        }
      }
    }
  }

  const suggestions: FeedbackSuggestion[] = [];
  for (const { key, count: n } of skuMap.values()) {
    const def = SKU_REASONS[key.reason];
    if (!def || n < minCount) continue;
    suggestions.push({
      target: { type: 'sku', code: key.sku },
      reason: key.reason,
      count: n,
      message: def.message(key.sku, n),
      action: { label: def.label, method: 'PUT', route: '/product-master/:id/packaging-profile' },
    });
  }
  for (const { key, count: n } of boxMap.values()) {
    const def = BOX_REASONS[key.reason];
    if (!def || n < minCount) continue;
    suggestions.push({
      target: { type: 'box', code: key.boxCode },
      reason: key.reason,
      count: n,
      message: def.message(key.boxCode, n),
      action: { label: def.label, method: 'PATCH', route: `${def.route}/:id` },
    });
  }
  for (const [reason, n] of settingsMap) {
    const def = SETTINGS_REASONS[reason];
    if (!def || n < minCount) continue;
    suggestions.push({
      target: { type: 'settings', code: null },
      reason,
      count: n,
      message: def.message(n),
      action: { label: def.label, method: 'PUT', route: '/packing/settings' },
    });
  }
  suggestions.sort((a, b) => b.count - a.count);

  const sortDesc = <T extends { count: number }>(rows: T[]): T[] => rows.sort((a, b) => b.count - a.count);
  return {
    from: range.from,
    to: range.to,
    minCount,
    plans: planCount,
    followedRate: ratio(followedPlans, planCount),
    adjustedPlans,
    rejectedPlans,
    byReason: sortDesc([...reasonTotals].map(([reason, n]) => ({ reason, count: n }))),
    bySku: sortDesc([...skuMap.values()].map((e) => ({ ...e.key, count: e.count }))),
    byBox: sortDesc([...boxMap.values()].map((e) => ({ ...e.key, count: e.count }))),
    rejections: {
      total: rejections.total,
      open: rejections.open,
      overdue: rejections.overdue,
      byReason: sortDesc([...rejectionReasons].map(([reason, n]) => ({ reason, count: n }))),
      resolvedBy: { recompute: rejections.recompute, manual: rejections.manual, backToPicking: rejections.backToPicking },
    },
    waste: {
      events: [...wasteByBox.values()].reduce((s, w) => s + w.count, 0),
      costVnd: [...wasteByBox.values()].reduce((s, w) => s + w.costVnd, 0),
      byBox: sortDesc([...wasteByBox].map(([boxCode, w]) => ({ boxCode, ...w }))),
    },
    suggestions,
  };
}

const DAY = 24 * 60 * 60_000;
/** Báo cáo đọc tối đa ngần này kế hoạch (quy mô đồ án); vượt thì thu hẹp khoảng ngày. */
const MAX_PLANS = 5_000;

@Injectable()
export class PackingFeedbackService {
  constructor(@InjectModel(PackingPlan.name) private readonly planModel: Model<PackingPlanDocument>) {}

  async report(fromIso?: string, toIso?: string, minCount = 3): Promise<FeedbackReport> {
    const to = toIso ? new Date(toIso) : new Date();
    const from = fromIso ? new Date(fromIso) : new Date(to.getTime() - 30 * DAY);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      throw new AppException(
        PACKING_ERROR_CODES.INVALID_DATE_RANGE,
        'Khoảng ngày không hợp lệ (from phải trước to, định dạng ISO).',
        HttpStatus.BAD_REQUEST,
        { from: fromIso ?? null, to: toIso ?? null },
      );
    }
    const plans = await this.planModel
      .find({
        $or: [
          { created_at: { $gte: from, $lt: to } },
          { 'adjustments.at': { $gte: from, $lt: to } },
          { rejected_at: { $gte: from, $lt: to } },
          { 'parcels.reviews.at': { $gte: from, $lt: to } },
        ],
      })
      .select(
        'adjustments parcels.reviews parcels.placements.sku status created_at rejected_at rejection_reason_code rejection_due_at rejection_resolution',
      )
      .limit(MAX_PLANS)
      .lean();
    return buildFeedback(plans, { from, to }, Math.max(1, Math.floor(minCount)));
  }
}
