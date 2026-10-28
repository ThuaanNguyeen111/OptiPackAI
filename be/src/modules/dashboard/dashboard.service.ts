import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { OrderGroup, OrderGroupDocument } from '../order-groups/schemas/order-group.schema';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import { Shipment, ShipmentDocument } from '../shipments/schemas/shipment.schema';
import { ShipmentStatus } from '../shipments/enums/shipment-status.enum';
import { ReturnRequest, ReturnRequestDocument } from '../shipments/schemas/return-request.schema';
import { ReturnStatus, ReturnType } from '../shipments/enums/return.enums';
import { PackingPlan, PackingPlanDocument } from '../packing/schemas/packing-plan.schema';
import { PackingReportService } from '../packing/packing-report.service';
import {
  MarketplaceStatusOutbox,
  MarketplaceStatusOutboxDocument,
} from '../marketplace-writeback/schemas/status-outbox.schema';
import { SkuBinAssignment, SkuBinAssignmentDocument } from '../warehouse/schemas/sku-bin-assignment.schema';
import {
  PackagingMaterial,
  PackagingMaterialDocument,
  usableStock,
} from '../packaging-materials/schemas/packaging-material.schema';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { DASHBOARD_ERROR_CODES } from './dashboard.errors';
import {
  average,
  changeRate,
  ratio,
  resolveRange,
  shippingCostOf,
  vnDayKey,
  vnDaysBetween,
  type DashboardRange,
} from './utils/dashboard-metrics.util';

const HOUR_MS = 60 * 60 * 1000;
/** Đơn hỏa tốc "sắp quá hạn" khi còn ≤ chừng này (cùng mốc cảnh báo của cron SLA). */
const EXPRESS_DUE_SOON_MS = HOUR_MS;
/** Danh sách "top" trong khối kho (SKU thiếu, SKU hết, vật tư dưới mức đặt lại). */
const TOP_LIMIT = 10;

/** Nhóm chưa đóng xong — hạn đóng gói của đơn hỏa tốc còn tính. */
const PRE_PACK_STATUSES: GroupFulfillmentStatus[] = [
  GroupFulfillmentStatus.AWAITING_PACKAGING,
  GroupFulfillmentStatus.PENDING_APPROVAL,
  GroupFulfillmentStatus.APPROVED_FOR_PACKING,
  GroupFulfillmentStatus.PICKING,
  GroupFulfillmentStatus.PICKED,
  GroupFulfillmentStatus.PARTIAL_NEEDS_REVIEW,
];
const IN_FLIGHT_SHIPMENT_STATUSES: ShipmentStatus[] = [
  ShipmentStatus.AWAITING_PICKUP,
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.OUT_FOR_DELIVERY,
];
/** Phiếu trả do khách yêu cầu (không gồm phiếu hệ thống tự tạo khi giao thất bại). */
const CUSTOMER_RETURN_TYPES: ReturnType[] = [ReturnType.RETURN_REFUND, ReturnType.REFUND_ONLY, ReturnType.EXCHANGE];

export interface SalesTotals {
  /** Đơn OptiPack nhận trong kỳ (theo thời điểm đồng bộ về), không gồm đơn thay thế khi đổi hàng. */
  ordersReceived: number;
  ordersCanceled: number;
  /** Tổng `total_amount` của đơn nhận trong kỳ, trừ đơn đã hủy ("doanh thu đặt hàng"). */
  revenuePlacedVnd: number;
  /** Đơn thuộc vận đơn giao thành công trong kỳ (theo `delivered_at`). */
  ordersDelivered: number;
  /** Tổng `total_amount` của các đơn đó ("doanh thu đã giao"). */
  revenueDeliveredVnd: number;
  /** revenuePlaced / (ordersReceived − ordersCanceled). */
  avgOrderValueVnd: number | null;
  cancelRate: number | null;
}

export interface DashboardSummary {
  range: { from: Date; to: Date; previousFrom: Date; previousTo: Date; platform: MarketplacePlatform | null; generatedAt: Date };
  /** Việc đang chờ xử lý NGAY LÚC GỌI (không theo khoảng ngày). */
  actionQueue: {
    expressDueSoon: number;
    expressOverdue: number;
    awaitingPick: number;
    picking: number;
    partialNeedsReview: number;
    stockShortageGroups: number;
    plansAwaitingApproval: number;
    plansAwaitingPacking: number;
    plansWithHeldParcels: number;
    readyToShip: number;
    shipmentsInFlight: number;
    deliveryFailed: number;
    returningToWarehouse: number;
    carrierBookingErrors: number;
    ordersAwaitingCancelConfirm: number;
    returnsToReview: number;
    returnsToReceive: number;
    returnsToInspect: number;
    marketplaceWritebackFailed: number;
  };
  sales: {
    current: SalesTotals;
    previous: SalesTotals;
    change: { ordersReceived: number | null; revenuePlacedVnd: number | null; revenueDeliveredVnd: number | null; avgOrderValueVnd: number | null };
    byPlatform: { platform: string; ordersReceived: number; ordersCanceled: number; revenuePlacedVnd: number; ordersDelivered: number; revenueDeliveredVnd: number }[];
    /** Mỗi ngày (giờ Việt Nam) trong kỳ, kể cả ngày bằng 0. */
    daily: { date: string; ordersReceived: number; revenuePlacedVnd: number; ordersDelivered: number; revenueDeliveredVnd: number }[];
  };
  delivery: {
    /** Vận đơn tạo trong kỳ (không gồm vận đơn đã huỷ ở hãng). */
    shipmentsCreated: number;
    shipmentsDelivered: number;
    /** Giao thành công ngay lần 1 / vận đơn đã giao trong kỳ. */
    firstAttemptSuccessRate: number | null;
    /** Từ lúc tạo vận đơn → giao thành công (giờ, trung bình). */
    avgDeliveryHours: number | null;
    /** Vận đơn kho đã nhận lại trong kỳ (giao thất bại / hoàn). */
    returnedToWarehouse: number;
  };
  costs: {
    /** Phí ship các vận đơn tạo trong kỳ: phí thật từng kiện GHN, không có thì báo giá lúc tạo. */
    shippingCostVnd: number;
    /** Số đơn trong các vận đơn đó (để tính phí ship / đơn). */
    ordersShipped: number;
    shippingCostPerOrderVnd: number | null;
    /** Chi phí thùng + vật tư của kế hoạch đóng xong trong kỳ (cùng số của `/packing/reports/summary`). */
    packagingCostVnd: number;
    /** Số đơn của các kế hoạch đó. */
    ordersPacked: number;
    packagingCostPerOrderVnd: number | null;
    /** (ship + bao bì) / doanh thu đặt hàng của kỳ. */
    fulfillmentCostRate: number | null;
  };
  returns: {
    /** Phiếu khách yêu cầu trong kỳ (trả hoàn tiền / chỉ hoàn tiền / đổi hàng). */
    customerRequests: number;
    byType: { type: string; count: number }[];
    /** customerRequests / ordersDelivered của kỳ (xấp xỉ: phiếu có thể thuộc đơn giao kỳ trước). */
    returnRate: number | null;
  };
  express: {
    /** Đơn hỏa tốc có hạn đóng gói rơi vào kỳ. */
    total: number;
    onTime: number;
    late: number;
    /** Hạn chưa tới, chưa đóng xong. */
    pending: number;
    onTimeRate: number | null;
  };
  warehouse: {
    /** SKU đang thiếu so với đơn chờ lấy (cộng từ `stock_shortage_items` các nhóm chưa lấy xong). */
    shortageSkus: { sku: string; shortage: number; groups: number }[];
    shortageSkuCount: number;
    /** SKU có vị trí kệ nhưng tổng tồn mọi ô = 0. */
    outOfStockSkus: string[];
    outOfStockSkuCount: number;
    /** Thùng / vật tư đang dùng được (mới + tái sử dụng) ≤ mức đặt lại. */
    materialsBelowReorder: { code: string; name: string; kind: string; usable: number; reorderLevel: number }[];
  };
}

interface OrderRow {
  _id: Types.ObjectId;
  platform: string;
  status: OrderStatus;
  total_amount: number;
  created_at?: Date;
  consolidated_group_id?: Types.ObjectId | null;
}

/**
 * 28/10/2026 — Số liệu cho Bảng điều khiển (Store Owner, Admin). CHỈ ĐỌC.
 * Tính trong bộ nhớ từ các collection sẵn có — đủ cho quy mô đồ án (giới hạn khoảng ngày
 * MAX_RANGE_DAYS); khi dữ liệu lớn nên chuyển sang bảng tổng hợp chạy định kỳ.
 * Hiệu suất đóng gói, theo nhân viên, AI đóng gói: dùng `/packing/reports/summary`,
 * `/packing/reports/feedback`, `/packaging-materials/savings` (không lặp lại ở đây).
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(OrderGroup.name) private readonly groupModel: Model<OrderGroupDocument>,
    @InjectModel(Shipment.name) private readonly shipmentModel: Model<ShipmentDocument>,
    @InjectModel(ReturnRequest.name) private readonly returnModel: Model<ReturnRequestDocument>,
    @InjectModel(PackingPlan.name) private readonly planModel: Model<PackingPlanDocument>,
    @InjectModel(MarketplaceStatusOutbox.name) private readonly outboxModel: Model<MarketplaceStatusOutboxDocument>,
    @InjectModel(SkuBinAssignment.name) private readonly stockModel: Model<SkuBinAssignmentDocument>,
    @InjectModel(PackagingMaterial.name) private readonly materialModel: Model<PackagingMaterialDocument>,
    private readonly packingReport: PackingReportService,
  ) {}

  async summary(fromIso?: string, toIso?: string, platformRaw?: string, now: Date = new Date()): Promise<DashboardSummary> {
    const range = resolveRange(fromIso, toIso, now);
    if (!range) {
      throw new AppException(
        DASHBOARD_ERROR_CODES.INVALID_DATE_RANGE,
        'Khoảng ngày không hợp lệ: from phải trước to, định dạng ISO, dài tối đa 366 ngày.',
        HttpStatus.BAD_REQUEST,
        { from: fromIso ?? null, to: toIso ?? null },
      );
    }
    const platform = this.parsePlatform(platformRaw);
    // Lọc theo sàn: vận đơn / kế hoạch / phiếu trả không có field sàn → lọc qua id nhóm của sàn đó.
    const groupIds = platform ? await this.groupModel.distinct('_id', { platform }) : null;

    const [actionQueue, sales, deliveryAndCosts, returnsBlock, express, warehouse] = await Promise.all([
      this.actionQueue(now, platform, groupIds),
      this.sales(range, platform),
      this.deliveryAndCosts(range, groupIds),
      this.returnsInRange(range, groupIds),
      this.express(range, now, platform),
      this.warehouse(platform, groupIds),
    ]);
    // Bao bì: cùng số của `/packing/reports/summary`, lọc sàn thì chỉ nhóm của sàn đó.
    const packaging = await this.packingReport.summary(range.from.toISOString(), range.to.toISOString(), undefined, groupIds ?? undefined);
    const { delivery, shipping } = deliveryAndCosts;
    const packagingCostVnd = packaging.packagingCostVnd;

    return {
      range: { ...range, platform, generatedAt: now },
      actionQueue,
      sales,
      delivery,
      costs: {
        shippingCostVnd: shipping.costVnd,
        ordersShipped: shipping.orders,
        shippingCostPerOrderVnd: shipping.orders === 0 ? null : Math.round(shipping.costVnd / shipping.orders),
        packagingCostVnd,
        ordersPacked: packaging.orders,
        packagingCostPerOrderVnd: packaging.orders === 0 ? null : Math.round(packagingCostVnd / packaging.orders),
        fulfillmentCostRate: ratio(shipping.costVnd + packagingCostVnd, sales.current.revenuePlacedVnd),
      },
      returns: { ...returnsBlock, returnRate: ratio(returnsBlock.customerRequests, sales.current.ordersDelivered) },
      express,
      warehouse,
    };
  }

  private parsePlatform(raw?: string): MarketplacePlatform | null {
    if (!raw) return null;
    const values = Object.values(MarketplacePlatform) as string[];
    if (!values.includes(raw)) {
      throw new AppException(
        DASHBOARD_ERROR_CODES.INVALID_PLATFORM,
        `Sàn "${raw}" không hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { platform: raw, allowed: values },
      );
    }
    return raw as MarketplacePlatform;
  }

  /** `{ order_group_id: { $in } }` khi lọc sàn, `{}` khi không lọc. */
  private byGroups(groupIds: Types.ObjectId[] | null, field = 'order_group_id'): Record<string, unknown> {
    return groupIds ? { [field]: { $in: groupIds } } : {};
  }

  // ------------------------------------------------------------------ việc cần xử lý

  private async actionQueue(now: Date, platform: MarketplacePlatform | null, groupIds: Types.ObjectId[] | null): Promise<DashboardSummary['actionQueue']> {
    const g = platform ? { platform } : {};
    const byGroup = this.byGroups(groupIds);
    const groups = (filter: Record<string, unknown>): Promise<number> => this.groupModel.countDocuments(filter).exec();
    const plans = (filter: Record<string, unknown>): Promise<number> => this.planModel.countDocuments(filter).exec();
    const shipments = (filter: Record<string, unknown>): Promise<number> => this.shipmentModel.countDocuments(filter).exec();
    const returns = (filter: Record<string, unknown>): Promise<number> => this.returnModel.countDocuments(filter).exec();
    const [
      expressDueSoon, expressOverdue, awaitingPick, picking, partialNeedsReview, stockShortageGroups,
      plansAwaitingApproval, plansAwaitingPacking, plansWithHeldParcels, readyToShip,
      shipmentsInFlight, deliveryFailed, returningToWarehouse, carrierBookingErrors,
      ordersAwaitingCancelConfirm, returnsToReview, returnsToReceive, returnsToInspect, marketplaceWritebackFailed,
    ] = await Promise.all([
      groups({ ...g, order_priority: 'express', fulfillment_status: { $in: PRE_PACK_STATUSES }, packaging_deadline: { $gte: now, $lte: new Date(now.getTime() + EXPRESS_DUE_SOON_MS) } }),
      groups({ ...g, order_priority: 'express', fulfillment_status: { $in: PRE_PACK_STATUSES }, packaging_deadline: { $lt: now } }),
      groups({ ...g, fulfillment_status: GroupFulfillmentStatus.AWAITING_PACKAGING }),
      groups({ ...g, fulfillment_status: GroupFulfillmentStatus.PICKING }),
      groups({ ...g, fulfillment_status: GroupFulfillmentStatus.PARTIAL_NEEDS_REVIEW }),
      groups({ ...g, fulfillment_status: { $in: [GroupFulfillmentStatus.AWAITING_PACKAGING, GroupFulfillmentStatus.PICKING] }, 'stock_shortage_items.0': { $exists: true } }),
      plans({ ...byGroup, is_active: true, status: 'ready' }),
      plans({ ...byGroup, is_active: true, status: { $in: ['approved', 'packing'] } }),
      plans({ ...byGroup, is_active: true, 'parcels.status': 'held' }),
      groups({ ...g, fulfillment_status: GroupFulfillmentStatus.PACKED }),
      shipments({ ...byGroup, status: { $in: IN_FLIGHT_SHIPMENT_STATUSES } }),
      shipments({ ...byGroup, status: ShipmentStatus.DELIVERY_FAILED }),
      shipments({ ...byGroup, status: ShipmentStatus.RETURNING_TO_WAREHOUSE }),
      shipments({ ...byGroup, status: ShipmentStatus.AWAITING_PICKUP, carrier_booking_error: { $type: 'string' } }),
      this.orderModel.countDocuments({ ...g, need_cancel_confirm: true }).exec(),
      returns({ ...byGroup, status: ReturnStatus.REQUESTED }),
      returns({ ...byGroup, status: ReturnStatus.AWAITING_RECEIPT }),
      returns({ ...byGroup, status: ReturnStatus.RECEIVED }),
      this.outboxModel.countDocuments({ ...byGroup, state: 'failed' }).exec(),
    ]);
    return {
      expressDueSoon, expressOverdue, awaitingPick, picking, partialNeedsReview, stockShortageGroups,
      plansAwaitingApproval, plansAwaitingPacking, plansWithHeldParcels, readyToShip,
      shipmentsInFlight, deliveryFailed, returningToWarehouse, carrierBookingErrors,
      ordersAwaitingCancelConfirm, returnsToReview, returnsToReceive, returnsToInspect, marketplaceWritebackFailed,
    };
  }

  // ------------------------------------------------------------------ kinh doanh

  private async sales(range: DashboardRange, platform: MarketplacePlatform | null): Promise<DashboardSummary['sales']> {
    const [received, previousReceived, delivered, previousDelivered] = await Promise.all([
      this.ordersReceived(range.from, range.to, platform),
      this.ordersReceived(range.previousFrom, range.previousTo, platform),
      this.ordersDelivered(range.from, range.to, platform),
      this.ordersDelivered(range.previousFrom, range.previousTo, platform),
    ]);
    const current = totals(received, delivered.map((d) => d.order));
    const previous = totals(previousReceived, previousDelivered.map((d) => d.order));

    const platforms = new Map<string, DashboardSummary['sales']['byPlatform'][number]>();
    const platformRow = (p: string): DashboardSummary['sales']['byPlatform'][number] => {
      let row = platforms.get(p);
      if (!row) {
        row = { platform: p, ordersReceived: 0, ordersCanceled: 0, revenuePlacedVnd: 0, ordersDelivered: 0, revenueDeliveredVnd: 0 };
        platforms.set(p, row);
      }
      return row;
    };
    const days = new Map(vnDaysBetween(range.from, range.to).map((d) => [d, { date: d, ordersReceived: 0, revenuePlacedVnd: 0, ordersDelivered: 0, revenueDeliveredVnd: 0 }]));
    for (const o of received) {
      const row = platformRow(o.platform);
      row.ordersReceived += 1;
      const day = o.created_at ? days.get(vnDayKey(o.created_at)) : undefined;
      if (day) day.ordersReceived += 1;
      if (o.status === OrderStatus.CANCELED) {
        row.ordersCanceled += 1;
        continue;
      }
      row.revenuePlacedVnd += o.total_amount;
      if (day) day.revenuePlacedVnd += o.total_amount;
    }
    for (const { order, deliveredAt } of delivered) {
      const row = platformRow(order.platform);
      row.ordersDelivered += 1;
      row.revenueDeliveredVnd += order.total_amount;
      const day = days.get(vnDayKey(deliveredAt));
      if (day) {
        day.ordersDelivered += 1;
        day.revenueDeliveredVnd += order.total_amount;
      }
    }
    return {
      current,
      previous,
      change: {
        ordersReceived: changeRate(current.ordersReceived, previous.ordersReceived),
        revenuePlacedVnd: changeRate(current.revenuePlacedVnd, previous.revenuePlacedVnd),
        revenueDeliveredVnd: changeRate(current.revenueDeliveredVnd, previous.revenueDeliveredVnd),
        avgOrderValueVnd: current.avgOrderValueVnd !== null && previous.avgOrderValueVnd !== null
          ? changeRate(current.avgOrderValueVnd, previous.avgOrderValueVnd)
          : null,
      },
      byPlatform: [...platforms.values()].sort((a, b) => b.revenuePlacedVnd - a.revenuePlacedVnd),
      daily: [...days.values()],
    };
  }

  private async ordersReceived(from: Date, to: Date, platform: MarketplacePlatform | null): Promise<OrderRow[]> {
    return this.orderModel
      .find({ created_at: { $gte: from, $lt: to }, origin: { $ne: 'replacement' }, ...(platform ? { platform } : {}) })
      .select('_id platform status total_amount created_at')
      .lean<OrderRow[]>();
  }

  /**
   * Đơn "đã giao" = đơn còn hiệu lực trong nhóm có vận đơn giao thành công trong kỳ. Dựa vào
   * vận đơn OptiPack (không dựa trạng thái đơn Lazada — OptiPack không đổi trạng thái đơn trên Lazada).
   */
  private async ordersDelivered(from: Date, to: Date, platform: MarketplacePlatform | null): Promise<{ order: OrderRow; deliveredAt: Date }[]> {
    const shipments = await this.shipmentModel
      .find({ status: ShipmentStatus.DELIVERED, delivered_at: { $gte: from, $lt: to } })
      .select('order_group_id delivered_at')
      .lean<{ order_group_id: Types.ObjectId; delivered_at: Date }[]>();
    if (shipments.length === 0) return [];
    const deliveredAtByGroup = new Map(shipments.map((s) => [String(s.order_group_id), s.delivered_at]));
    const orders = await this.orderModel
      .find({
        consolidated_group_id: { $in: shipments.map((s) => s.order_group_id) },
        status: { $ne: OrderStatus.CANCELED },
        origin: { $ne: 'replacement' },
        ...(platform ? { platform } : {}),
      })
      .select('_id platform status total_amount consolidated_group_id')
      .lean<OrderRow[]>();
    return orders.flatMap((order) => {
      const deliveredAt = deliveredAtByGroup.get(String(order.consolidated_group_id));
      return deliveredAt ? [{ order, deliveredAt }] : [];
    });
  }

  // ------------------------------------------------------------------ giao hàng + phí ship

  private async deliveryAndCosts(
    range: DashboardRange,
    groupIds: Types.ObjectId[] | null,
  ): Promise<{ delivery: DashboardSummary['delivery']; shipping: { costVnd: number; orders: number } }> {
    const byGroup = this.byGroups(groupIds);
    const [created, delivered, returnedToWarehouse] = await Promise.all([
      this.shipmentModel
        .find({ ...byGroup, created_at: { $gte: range.from, $lt: range.to }, status: { $ne: ShipmentStatus.CANCELLED } })
        .select('order_group_id estimated_cost_vnd carrier_parcels')
        .lean<{ order_group_id: Types.ObjectId; estimated_cost_vnd?: number | null; carrier_parcels?: Shipment['carrier_parcels'] }[]>(),
      this.shipmentModel
        .find({ ...byGroup, status: ShipmentStatus.DELIVERED, delivered_at: { $gte: range.from, $lt: range.to } })
        .select('attempt_count created_at delivered_at')
        .lean<{ attempt_count: number; created_at?: Date; delivered_at: Date }[]>(),
      this.shipmentModel.countDocuments({ ...byGroup, status: ShipmentStatus.RETURNED_TO_WAREHOUSE, returned_at: { $gte: range.from, $lt: range.to } }).exec(),
    ]);
    const costVnd = created.reduce((sum, s) => sum + shippingCostOf(s), 0);
    const orders = created.length === 0
      ? 0
      : await this.orderModel.countDocuments({
        consolidated_group_id: { $in: created.map((s) => s.order_group_id) },
        status: { $ne: OrderStatus.CANCELED },
      }).exec();
    const hours = delivered.flatMap((s) => (s.created_at ? [(s.delivered_at.getTime() - s.created_at.getTime()) / HOUR_MS] : []));
    return {
      delivery: {
        shipmentsCreated: created.length,
        shipmentsDelivered: delivered.length,
        firstAttemptSuccessRate: ratio(delivered.filter((s) => s.attempt_count <= 1).length, delivered.length),
        avgDeliveryHours: average(hours),
        returnedToWarehouse,
      },
      shipping: { costVnd: Math.round(costVnd), orders },
    };
  }

  // ------------------------------------------------------------------ trả hàng

  private async returnsInRange(range: DashboardRange, groupIds: Types.ObjectId[] | null): Promise<Omit<DashboardSummary['returns'], 'returnRate'>> {
    const rows = await this.returnModel
      .find({ ...this.byGroups(groupIds), type: { $in: CUSTOMER_RETURN_TYPES }, created_at: { $gte: range.from, $lt: range.to } })
      .select('type')
      .lean<{ type: string }[]>();
    const byType = new Map<string, number>();
    for (const r of rows) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
    return { customerRequests: rows.length, byType: [...byType.entries()].map(([type, count]) => ({ type, count })) };
  }

  // ------------------------------------------------------------------ đơn hỏa tốc

  private async express(range: DashboardRange, now: Date, platform: MarketplacePlatform | null): Promise<DashboardSummary['express']> {
    const groups = await this.groupModel
      .find({ ...(platform ? { platform } : {}), order_priority: 'express', packaging_deadline: { $gte: range.from, $lt: range.to } })
      .select('_id packaging_deadline fulfillment_status')
      .lean<{ _id: Types.ObjectId; packaging_deadline: Date; fulfillment_status: GroupFulfillmentStatus }[]>();
    if (groups.length === 0) return { total: 0, onTime: 0, late: 0, pending: 0, onTimeRate: null };
    const packed = await this.planModel
      .find({ order_group_id: { $in: groups.map((g) => g._id) }, status: 'packed', packed_at: { $ne: null } })
      .select('order_group_id packed_at')
      .lean<{ order_group_id: Types.ObjectId; packed_at: Date }[]>();
    const packedAt = new Map<string, Date>();
    for (const p of packed) {
      const key = String(p.order_group_id);
      const prev = packedAt.get(key);
      if (!prev || p.packed_at < prev) packedAt.set(key, p.packed_at);
    }
    let onTime = 0;
    let late = 0;
    let pending = 0;
    for (const g of groups) {
      if (g.fulfillment_status === GroupFulfillmentStatus.CANCELED) continue;
      const at = packedAt.get(String(g._id));
      if (at) {
        if (at <= g.packaging_deadline) onTime += 1;
        else late += 1;
      } else if (g.packaging_deadline < now) late += 1;
      else pending += 1;
    }
    return { total: onTime + late + pending, onTime, late, pending, onTimeRate: ratio(onTime, onTime + late) };
  }

  // ------------------------------------------------------------------ kho

  private async warehouse(platform: MarketplacePlatform | null, groupIds: Types.ObjectId[] | null): Promise<DashboardSummary['warehouse']> {
    const [shortGroups, stockRows, materials] = await Promise.all([
      this.groupModel
        .find({
          ...(groupIds ? { _id: { $in: groupIds } } : {}),
          fulfillment_status: { $in: [GroupFulfillmentStatus.AWAITING_PACKAGING, GroupFulfillmentStatus.PICKING] },
          'stock_shortage_items.0': { $exists: true },
        })
        .select('stock_shortage_items')
        .lean<{ stock_shortage_items?: { sku: string; shortage: number }[] }[]>(),
      this.stockModel
        .find(platform ? { platform } : {})
        .select('seller_sku quantity_on_hand')
        .lean<{ seller_sku: string; quantity_on_hand: number }[]>(),
      this.materialModel
        .find({ is_active: true })
        .select('code name kind qty_new qty_reused reorder_level')
        .lean<{ code: string; name: string; kind: string; qty_new: number; qty_reused: number; reorder_level: number }[]>(),
    ]);

    const shortage = new Map<string, { sku: string; shortage: number; groups: number }>();
    for (const g of shortGroups) {
      for (const item of g.stock_shortage_items ?? []) {
        if (item.shortage <= 0) continue;
        const row = shortage.get(item.sku) ?? { sku: item.sku, shortage: 0, groups: 0 };
        row.shortage += item.shortage;
        row.groups += 1;
        shortage.set(item.sku, row);
      }
    }
    const onHand = new Map<string, number>();
    for (const s of stockRows) onHand.set(s.seller_sku, (onHand.get(s.seller_sku) ?? 0) + (s.quantity_on_hand || 0));
    const outOfStock = [...onHand.entries()].filter(([, qty]) => qty <= 0).map(([sku]) => sku).sort();
    return {
      shortageSkus: [...shortage.values()].sort((a, b) => b.shortage - a.shortage).slice(0, TOP_LIMIT),
      shortageSkuCount: shortage.size,
      outOfStockSkus: outOfStock.slice(0, TOP_LIMIT),
      outOfStockSkuCount: outOfStock.length,
      materialsBelowReorder: materials
        .map((m) => ({ code: m.code, name: m.name, kind: m.kind, usable: usableStock(m), reorderLevel: m.reorder_level }))
        .filter((m) => m.usable <= m.reorderLevel)
        .sort((a, b) => a.usable - a.reorderLevel - (b.usable - b.reorderLevel))
        .slice(0, TOP_LIMIT),
    };
  }
}

function totals(received: readonly OrderRow[], delivered: readonly OrderRow[]): SalesTotals {
  const canceled = received.filter((o) => o.status === OrderStatus.CANCELED).length;
  const revenuePlacedVnd = received.reduce((sum, o) => (o.status === OrderStatus.CANCELED ? sum : sum + o.total_amount), 0);
  const kept = received.length - canceled;
  return {
    ordersReceived: received.length,
    ordersCanceled: canceled,
    revenuePlacedVnd,
    ordersDelivered: delivered.length,
    revenueDeliveredVnd: delivered.reduce((sum, o) => sum + o.total_amount, 0),
    avgOrderValueVnd: kept === 0 ? null : Math.round(revenuePlacedVnd / kept),
    cancelRate: ratio(canceled, received.length),
  };
}
