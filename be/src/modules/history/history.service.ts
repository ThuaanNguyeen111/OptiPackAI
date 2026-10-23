import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserRole } from '../../common/enums/user-role.enum';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { ActivityLog, ActivityLogDocument, ACTIVITY_CATEGORIES, type ActivityCategory } from '../activity-log/schemas/activity-log.schema';
import { InventoryMovement, InventoryMovementDocument } from '../warehouse/schemas/inventory-movement.schema';
import { StockReceipt, StockReceiptDocument } from '../warehouse/schemas/stock-receipt.schema';
import { BinLocation, BinLocationDocument } from '../warehouse/schemas/bin-location.schema';
import { ShipmentEvent, ShipmentEventDocument } from '../shipments/schemas/shipment-event.schema';
import { Shipment, ShipmentDocument } from '../shipments/schemas/shipment.schema';
import { ReturnRequest, ReturnRequestDocument } from '../shipments/schemas/return-request.schema';
import { PackingPlan, PackingPlanDocument } from '../packing/schemas/packing-plan.schema';
import { PackagingMovement, PackagingMovementDocument } from '../packaging-materials/schemas/packaging-movement.schema';
import { LoginAuditLog, LoginAuditLogDocument } from '../auth/schemas/login-audit-log.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { HistoryQueryDto } from './dto/history-query.dto';
import {
  CATEGORY_LABELS, MOVEMENT_CATEGORY, PACKAGING_MOVE_LABELS, PLAN_ACTIVITY_LABELS, RETURN_SOURCE_LABELS,
  RETURN_TYPE_LABELS, ROLE_HISTORY_CATEGORIES, ROLE_LABELS, SHIPMENT_STATUS_LABELS,
} from './history.labels';

type Detail = string | number | boolean | null;

export interface HistoryActor { id: string; name: string; role: string | null }

export interface HistoryItem {
  id: string;
  occurredAt: Date;
  category: ActivityCategory;
  categoryLabel: string;
  action: string;
  summary: string;
  actor: HistoryActor | null;
  orderGroupId: string | null;
  entity: { type: string; id: string | null; code: string | null } | null;
  skus: string[];
  quantity: number | null;
  fromStatus: string | null;
  toStatus: string | null;
  details: Record<string, Detail>;
}

/** Dòng thô từ 1 nguồn, chưa tra tên người làm. */
interface RawItem extends Omit<HistoryItem, 'actor' | 'categoryLabel'> { actorId: string | null }

interface Ctx {
  from: Date;
  before: Date;
  limit: number;
  categories: Set<ActivityCategory>;
  actorId: string | null;
  sku: RegExp | null;
  /** null = không lọc theo đơn. */
  groupIds: Types.ObjectId[] | null;
  /** Phiếu trả hàng của các nhóm (để lọc sổ cái/vật liệu theo đơn). */
  returnIds: Types.ObjectId[];
  timeline: boolean;
}

const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 30;
const TIMELINE_CAP = 2000;
const EXPORT_CAP = 5000;

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const idStr = (v: unknown): string | null => (v === null || v === undefined ? null : (v as { toString(): string }).toString());

/**
 * ===================================================================
 * LỊCH SỬ THAO TÁC — 23/10/2026
 * ===================================================================
 * Gộp mọi nguồn lịch sử có sẵn + sổ hoạt động mới thành 1 dòng thời gian:
 *   - sổ cái kho (`inventory_movements`): lấy hàng, nhập, kiểm kê, chuyển ô, hàng hoàn nhập lại…
 *   - phiếu nhập lô (`stock_receipts`)
 *   - mốc vận đơn (`shipment_events`) + thông tin vận đơn (hãng, dịch vụ, mã, người nhận)
 *   - kế hoạch đóng gói (`packing_plans`: tính, duyệt, từ chối, phân công, bắt đầu, niêm phong từng kiện, xong, nhật ký phiên)
 *   - phiếu trả hàng (tạo phiếu, xử lý hàng cách ly) + sổ hoạt động (từng bước duyệt/nhận/kiểm/hủy)
 *   - vật liệu đóng gói (`packaging_movements`), nhật ký đăng nhập (`login_audit_logs`)
 *   - sổ hoạt động (`activity_logs`): đổi trạng thái nhóm đơn, người bán hủy đơn, giao thiếu
 * Phân trang bằng con trỏ thời gian `before`: mỗi nguồn lấy tối đa `limit` dòng mới nhất
 * trước `before` trong cửa sổ [from, before) → trộn → cắt `limit` (k-way merge, không sót).
 * ===================================================================
 */
@Injectable()
export class HistoryService {
  constructor(
    @InjectModel(ActivityLog.name) private readonly activityModel: Model<ActivityLogDocument>,
    @InjectModel(InventoryMovement.name) private readonly movementModel: Model<InventoryMovementDocument>,
    @InjectModel(StockReceipt.name) private readonly receiptModel: Model<StockReceiptDocument>,
    @InjectModel(BinLocation.name) private readonly binModel: Model<BinLocationDocument>,
    @InjectModel(ShipmentEvent.name) private readonly shipmentEventModel: Model<ShipmentEventDocument>,
    @InjectModel(Shipment.name) private readonly shipmentModel: Model<ShipmentDocument>,
    @InjectModel(ReturnRequest.name) private readonly returnModel: Model<ReturnRequestDocument>,
    @InjectModel(PackingPlan.name) private readonly planModel: Model<PackingPlanDocument>,
    @InjectModel(PackagingMovement.name) private readonly packagingModel: Model<PackagingMovementDocument>,
    @InjectModel(LoginAuditLog.name) private readonly loginModel: Model<LoginAuditLogDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
  ) {}

  /** Các loại lịch sử vai trò này được xem. */
  allowedCategories(role: UserRole): ActivityCategory[] {
    return [...ROLE_HISTORY_CATEGORIES[role]];
  }

  async list(user: AuthenticatedUser, query: HistoryQueryDto): Promise<{ items: HistoryItem[]; nextBefore: string | null; categories: { code: ActivityCategory; label: string }[] }> {
    const limit = query.limit ?? 50;
    const ctx = await this.buildCtx(user, query, limit);
    const items = await this.collect(ctx);
    return {
      items,
      nextBefore: items.length === limit ? (items.at(-1)?.occurredAt.toISOString() ?? null) : null,
      categories: this.allowedCategories(user.role).map((code) => ({ code, label: CATEGORY_LABELS[code] })),
    };
  }

  /** Dòng thời gian đầy đủ của 1 nhóm đơn (cũ → mới), mọi loại trừ đăng nhập. */
  async timeline(groupId: string): Promise<{ orderGroupId: string; items: HistoryItem[] }> {
    if (!Types.ObjectId.isValid(groupId)) throw new BadRequestException('Id nhóm đơn không hợp lệ');
    const gid = new Types.ObjectId(groupId);
    const returns = await this.returnModel.find({ order_group_id: gid }).select('_id replacement_group_id').lean();
    const groupIds = [gid, ...returns.flatMap((r) => (r.replacement_group_id ? [r.replacement_group_id] : []))];
    const ctx: Ctx = {
      from: new Date(0),
      before: new Date(Date.now() + 60_000),
      limit: TIMELINE_CAP,
      categories: new Set(ACTIVITY_CATEGORIES.filter((c) => c !== 'auth')),
      actorId: null,
      sku: null,
      groupIds,
      returnIds: returns.map((r) => r._id),
      timeline: true,
    };
    const [items, orders] = await Promise.all([this.collect(ctx), this.fromOrders(groupIds)]);
    if (items.length === 0 && orders.length === 0) throw new NotFoundException('Không có lịch sử cho nhóm đơn này');
    const all = [...items, ...(await this.resolveActors(orders))].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    return { orderGroupId: groupId, items: all };
  }

  /** Xuất CSV (mở được bằng Excel) theo cùng bộ lọc — tối đa 5.000 dòng. */
  async exportCsv(user: AuthenticatedUser, query: HistoryQueryDto): Promise<string> {
    const ctx = await this.buildCtx(user, query, EXPORT_CAP);
    const items = await this.collect(ctx);
    const header = ['Thời gian', 'Loại', 'Thao tác', 'Người làm', 'Vai trò', 'Nhóm đơn', 'SKU', 'Số lượng', 'Mô tả'];
    const cell = (v: string | number | null): string => {
      const s = v === null ? '' : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = items.map((i) => [
      i.occurredAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
      i.categoryLabel, i.action, i.actor?.name ?? '', i.actor?.role ?? '', i.orderGroupId ?? '',
      i.skus.join(' '), i.quantity, i.summary,
    ].map(cell).join(','));
    return `\uFEFF${[header.join(','), ...rows].join('\n')}`;
  }

  // ------------------------------------------------------------ dựng bộ lọc

  private async buildCtx(user: AuthenticatedUser, query: HistoryQueryDto, limit: number): Promise<Ctx> {
    const allowed = new Set(this.allowedCategories(user.role));
    let categories = allowed;
    if (query.category) {
      const wanted = query.category.split(',') as ActivityCategory[];
      const denied = wanted.filter((c) => !allowed.has(c));
      if (denied.length > 0) throw new ForbiddenException(`Vai trò của bạn không xem được lịch sử: ${denied.join(', ')}`);
      categories = new Set(wanted);
    }
    const before = query.before ? new Date(query.before) : query.to ? new Date(query.to) : new Date(Date.now() + 60_000);
    const from = query.from ? new Date(query.from) : new Date(before.getTime() - DEFAULT_WINDOW_DAYS * DAY_MS);
    let groupIds: Types.ObjectId[] | null = query.order_group_id ? [new Types.ObjectId(query.order_group_id)] : null;
    if (query.order_code) {
      const orders = await this.orderModel
        .find({ platform_order_id: query.order_code.trim() })
        .select('consolidated_group_id')
        .lean();
      const ids = orders.flatMap((o) => (o.consolidated_group_id ? [o.consolidated_group_id] : []));
      groupIds = groupIds ? groupIds.filter((g) => ids.some((i) => i.equals(g))) : ids;
    }
    const returnIds = groupIds
      ? (await this.returnModel.find({ order_group_id: { $in: groupIds } }).select('_id').lean()).map((r) => r._id)
      : [];
    return {
      from,
      before,
      limit,
      categories,
      actorId: query.mine === 'true' ? user.userId : (query.actor_id ?? null),
      sku: query.sku?.trim() ? new RegExp(`^${escapeRegex(query.sku.trim())}$`, 'i') : null,
      groupIds,
      returnIds,
      timeline: false,
    };
  }

  private async collect(ctx: Ctx): Promise<HistoryItem[]> {
    const has = (c: ActivityCategory): boolean => ctx.categories.has(c);
    const batches = await Promise.all([
      this.fromActivity(ctx),
      has('warehouse') || has('picking') || has('packing') || has('returns') ? this.fromMovements(ctx) : [],
      has('warehouse') ? this.fromReceipts(ctx) : [],
      has('shipping') ? this.fromShipments(ctx) : [],
      has('packing') ? this.fromPackingPlans(ctx) : [],
      has('returns') ? this.fromReturns(ctx) : [],
      has('packaging_materials') ? this.fromPackaging(ctx) : [],
      has('auth') ? this.fromLogins(ctx) : [],
    ]);
    const merged = batches
      .flat()
      .filter((i) => i.occurredAt >= ctx.from && i.occurredAt < ctx.before)
      .filter((i) => !ctx.actorId || i.actorId === ctx.actorId)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, ctx.limit);
    return this.resolveActors(merged);
  }

  private timeFilter(ctx: Ctx): { $gte: Date; $lt: Date } {
    return { $gte: ctx.from, $lt: ctx.before };
  }

  // ------------------------------------------------------------ các nguồn

  private async fromActivity(ctx: Ctx): Promise<RawItem[]> {
    const filter: Record<string, unknown> = { occurred_at: this.timeFilter(ctx), category: { $in: [...ctx.categories] } };
    if (ctx.actorId) filter.actor_id = ctx.actorId;
    if (ctx.groupIds) filter.order_group_id = { $in: ctx.groupIds };
    if (ctx.sku) filter.skus = ctx.sku;
    const rows = await this.activityModel.find(filter).sort({ occurred_at: -1 }).limit(ctx.limit).lean();
    return rows.map((r) => ({
      id: `act:${String(r._id)}`,
      occurredAt: r.occurred_at,
      category: r.category,
      action: r.action,
      summary: r.summary,
      actorId: r.actor_id,
      orderGroupId: idStr(r.order_group_id),
      entity: { type: r.entity_type, id: idStr(r.entity_id), code: r.entity_code },
      skus: r.skus,
      quantity: r.quantity,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      details: { note: r.note },
    }));
  }

  private async fromMovements(ctx: Ctx): Promise<RawItem[]> {
    const types = Object.entries(MOVEMENT_CATEGORY).filter(([, c]) => ctx.categories.has(c)).map(([t]) => t);
    if (types.length === 0) return [];
    const filter: Record<string, unknown> = { created_at: this.timeFilter(ctx), type: { $in: types } };
    if (!ctx.timeline) filter.ref_type = { $ne: 'stock_receipt' }; // phiếu nhập đã có dòng tổng hợp riêng
    if (ctx.actorId) filter.actor_id = ctx.actorId;
    if (ctx.sku) filter.$or = [{ seller_sku: ctx.sku }, { master_sku: ctx.sku }];
    if (ctx.groupIds) {
      const groupOr = [
        { ref_type: 'order_group', ref_id: { $in: ctx.groupIds.map(String) } },
        { ref_type: 'return_request', ref_id: { $in: ctx.returnIds.map(String) } },
      ];
      if (filter.$or) filter.$and = [{ $or: filter.$or }, { $or: groupOr }];
      else filter.$or = groupOr;
      if (filter.$and) delete filter.$or;
    }
    const rows = await this.movementModel.find(filter).sort({ created_at: -1 }).limit(ctx.limit).lean();
    const bins = await this.binCodes(rows.map((r) => r.bin_location_id));
    return rows.map((r) => {
      const sku = r.master_sku ?? r.seller_sku;
      const bin = bins.get(String(r.bin_location_id)) ?? '?';
      const n = Math.abs(r.delta);
      const group = r.ref_type === 'order_group' ? r.ref_id : null;
      const forGroup = group ? ` cho nhóm đơn …${group.slice(-10)}` : '';
      const summaries: Record<string, string> = {
        assign_initial: `Gán ${sku} vào ô ${bin} — tồn ban đầu ${String(n)}`,
        receive: `Nhập thêm ${String(n)} ${sku} vào ô ${bin} (tồn ${String(r.quantity_before)} → ${String(r.quantity_after)})`,
        adjust: `Kiểm kê ${sku} ở ô ${bin}: ${String(r.quantity_before)} → ${String(r.quantity_after)}${r.reason_code ? ` (${r.reason_code})` : ''}`,
        transfer_out: `Chuyển ${String(n)} ${sku} ra khỏi ô ${bin}`,
        transfer_in: `Nhận ${String(n)} ${sku} vào ô ${bin} (chuyển ô)`,
        pick: `Lấy ${String(n)} ${sku} từ ô ${bin}${forGroup}`,
        pick_cancel: `Hủy lượt lấy — trả ${String(n)} ${sku} về ô ${bin}${forGroup}`,
        cancel_return: `Đơn hủy — trả ${String(n)} ${sku} đã lấy về ô ${bin}${forGroup}`,
        reject_return: `Kế hoạch bị từ chối — trả ${String(n)} ${sku} về ô ${bin}${forGroup}`,
        pack_replace: `Lấy ${String(n)} ${sku} thay món lỗi lúc đóng gói, từ ô ${bin}${forGroup}`,
        cancel_unpack: `Tháo kiện đơn hủy — trả ${String(n)} ${sku} về ô ${bin}${forGroup}`,
        return_restock: `Nhập lại ${String(n)} ${sku} (hàng hoàn đạt kiểm) vào ô ${bin}`,
      };
      return {
        id: `mv:${String(r._id)}`,
        occurredAt: r.created_at,
        category: MOVEMENT_CATEGORY[r.type] ?? 'warehouse',
        action: `stock.${r.type}`,
        summary: summaries[r.type] ?? `${r.type} ${sku} ô ${bin}`,
        actorId: r.actor_id,
        orderGroupId: group,
        entity: { type: 'sku_bin_assignment', id: idStr(r.assignment_id), code: bin },
        skus: [sku],
        quantity: r.delta,
        fromStatus: null,
        toStatus: null,
        details: { bin, quantityBefore: r.quantity_before, quantityAfter: r.quantity_after, reason: r.reason_code, note: r.note, refType: r.ref_type, refId: r.ref_id },
      };
    });
  }

  private async fromReceipts(ctx: Ctx): Promise<RawItem[]> {
    if (ctx.groupIds) return []; // phiếu nhập không thuộc đơn nào
    const filter: Record<string, unknown> = { created_at: this.timeFilter(ctx) };
    if (ctx.actorId) filter.created_by = ctx.actorId;
    if (ctx.sku) filter.$or = [{ 'lines.seller_sku': ctx.sku }, { 'lines.master_sku': ctx.sku }];
    const rows = await this.receiptModel.find(filter).sort({ created_at: -1 }).limit(ctx.limit).lean();
    return rows.map((r) => {
      const skus = [...new Set(r.lines.map((l) => l.master_sku ?? l.seller_sku))];
      return {
        id: `rc:${String(r._id)}`,
        occurredAt: r.created_at ?? r.received_at,
        category: 'warehouse' as const,
        action: 'stock.receipt',
        summary: `Nhập lô ${r.lot_code} (phiếu ${r.receipt_code}): ${String(r.total_quantity)} sản phẩm, ${String(skus.length)} mã${r.supplier ? ` — nhà cung cấp ${r.supplier}` : ''}`,
        actorId: r.created_by,
        orderGroupId: null,
        entity: { type: 'stock_receipt', id: String(r._id), code: r.receipt_code },
        skus,
        quantity: r.total_quantity,
        fromStatus: null,
        toStatus: null,
        details: {
          lotCode: r.lot_code,
          receivedAt: r.received_at.toISOString(),
          supplier: r.supplier,
          note: r.note,
          lines: r.lines.map((l) => `${l.master_sku ?? l.seller_sku}×${String(l.quantity)}`).join(', '),
        },
      };
    });
  }

  private async fromShipments(ctx: Ctx): Promise<RawItem[]> {
    if (ctx.sku) return []; // mốc vận đơn không gắn SKU
    const filter: Record<string, unknown> = { occurred_at: this.timeFilter(ctx) };
    if (ctx.actorId) filter.actor_id = ctx.actorId;
    if (ctx.groupIds) filter.order_group_id = { $in: ctx.groupIds };
    const events = await this.shipmentEventModel.find(filter).sort({ occurred_at: -1 }).limit(ctx.limit).lean();
    if (events.length === 0) return [];
    const shipments = await this.shipmentModel
      .find({ _id: { $in: [...new Set(events.map((e) => String(e.shipment_id)))].map((id) => new Types.ObjectId(id)) } })
      .select('shipment_code carrier_name service_name tracking_code trip_code parcel_count estimated_cost_vnd to_location carrier_parcels')
      .lean();
    const byId = new Map(shipments.map((s) => [String(s._id), s]));
    const recipients = await this.recipientsByGroup(events.map((e) => e.order_group_id));
    return events.map((e) => {
      const s = byId.get(String(e.shipment_id));
      const to = recipients.get(String(e.order_group_id));
      const who = to ? `${to.name} (${to.address})` : 'khách';
      const how = [s?.carrier_name, s?.service_name].filter(Boolean).join(' · ') || 'chưa chọn hãng';
      const track = s?.tracking_code ? ` — mã ${s.tracking_code}` : '';
      const status = SHIPMENT_STATUS_LABELS[e.status_to] ?? e.status_to;
      const summaries: Record<string, string> = {
        start_delivery: `Bắt đầu giao ${s?.shipment_code ?? ''} qua ${how} → ${who}${track}`,
        carrier_booked: `Đặt vận đơn ${how}${track}`,
        carrier_status: `Hãng báo: ${status}${e.carrier_status ? ` (${e.carrier_status})` : ''}`,
        delivered: `Giao thành công lần ${String(e.attempt_no)} cho ${who}`,
        delivery_failed: `Giao thất bại lần ${String(e.attempt_no)}${e.reason_code ? ` — ${e.reason_code}` : ''}`,
        retry: `Giao lại lần ${String(e.attempt_no)}`,
        auto_return: 'Hệ thống chuyển hoàn kiện về kho',
        return_received: 'Kho đã nhận lại kiện hoàn',
        carrier_cancelled: 'Đã hủy vận đơn ở hãng',
        carrier_incident: `Hãng báo sự cố${e.note ? `: ${e.note}` : ''}`,
      };
      return {
        id: `se:${String(e._id)}`,
        occurredAt: e.occurred_at,
        category: 'shipping' as const,
        action: `shipment.${e.event_type}`,
        summary: summaries[e.event_type] ?? `Vận đơn: ${status}`,
        actorId: e.actor_id,
        orderGroupId: String(e.order_group_id),
        entity: { type: 'shipment', id: String(e.shipment_id), code: s?.shipment_code ?? null },
        skus: [],
        quantity: null,
        fromStatus: e.status_from,
        toStatus: e.status_to,
        details: {
          carrier: s?.carrier_name ?? null,
          service: s?.service_name ?? null,
          trackingCode: s?.tracking_code ?? null,
          tripCode: s?.trip_code ?? null,
          parcelCount: s?.parcel_count ?? null,
          costVnd: s?.estimated_cost_vnd ?? null,
          recipientName: to?.name ?? null,
          recipientPhone: to?.phone ?? null,
          recipientAddress: to?.address ?? null,
          attempt: e.attempt_no,
          reason: e.reason_code,
          note: e.note,
          source: e.source ?? null,
        },
      };
    });
  }

  private async fromPackingPlans(ctx: Ctx): Promise<RawItem[]> {
    const filter: Record<string, unknown> = { updated_at: { $gte: ctx.from }, created_at: { $lt: ctx.before } };
    if (ctx.groupIds) filter.order_group_id = { $in: ctx.groupIds };
    if (ctx.sku) filter['item_profiles.sku'] = ctx.sku;
    const plans = await this.planModel
      .find(filter)
      .select('order_group_id revision status source parcels.parcel_no parcels.platform_order_id parcels.box parcels.sealed_by parcels.sealed_at parcels.actual_weight_kg parcels.estimated_weight_g approved_by approved_at approve_override_reason rejected_by rejected_at rejection_reason assigned_packer_id assigned_packer_at assigned_packer_name packing_started_by packing_started_at pack_mode packed_by packed_at activity created_at item_profiles.sku')
      .sort({ updated_at: -1 })
      .limit(Math.min(ctx.limit, 300))
      .lean();
    const out: RawItem[] = [];
    for (const p of plans) {
      const gid = String(p.order_group_id);
      const skus = p.item_profiles.map((i) => i.sku);
      const base = (key: string, at: Date, action: string, summary: string, actor: unknown, details: Record<string, Detail> = {}): RawItem => ({
        id: `pp:${String(p._id)}:${key}`,
        occurredAt: at,
        category: 'packing',
        action,
        summary,
        actorId: idStr(actor),
        orderGroupId: gid,
        entity: { type: 'packing_plan', id: String(p._id), code: `rev ${String(p.revision)}` },
        skus,
        quantity: null,
        fromStatus: null,
        toStatus: null,
        details: { revision: p.revision, ...details },
      });
      if (p.created_at) {
        out.push(base('gen', p.created_at, 'packing.plan_generated', `${p.source === 'manual' ? 'Lập tay' : 'Hệ thống tính'} kế hoạch đóng gói lần ${String(p.revision)}: ${String(p.parcels.length)} kiện`, p.source === 'manual' ? null : 'system'));
      }
      if (p.approved_at) out.push(base('approve', p.approved_at, 'packing.plan_approved', `Duyệt kế hoạch đóng gói${p.approve_override_reason ? ` (bỏ qua cảnh báo: ${p.approve_override_reason})` : ''}`, p.approved_by));
      if (p.rejected_at) out.push(base('reject', p.rejected_at, 'packing.plan_rejected', `Từ chối kế hoạch — ${p.rejection_reason ?? 'không ghi lý do'}`, p.rejected_by));
      if (p.assigned_packer_at) out.push(base('assign', p.assigned_packer_at, 'packing.packer_assigned', `Giao cho ${p.assigned_packer_name ?? 'nhân viên'} đóng gói`, null, { packerId: idStr(p.assigned_packer_id) }));
      if (p.packing_started_at) out.push(base('start', p.packing_started_at, 'packing.started', `Bắt đầu đóng gói${p.pack_mode ? ` (chế độ ${p.pack_mode === 'scan' ? 'quét từng món' : 'nhanh'})` : ''}`, p.packing_started_by));
      for (const parcel of p.parcels) {
        if (!parcel.sealed_at) continue;
        const kg = parcel.actual_weight_kg ?? Math.round(parcel.estimated_weight_g / 10) / 100;
        out.push(base(`seal:${String(parcel.parcel_no)}`, parcel.sealed_at, 'packing.parcel_sealed',
          `Niêm phong kiện ${String(parcel.parcel_no)}: thùng ${parcel.box.code}, ${String(kg)} kg${parcel.platform_order_id ? ` — đơn ${parcel.platform_order_id}` : ''}`,
          parcel.sealed_by, { parcelNo: parcel.parcel_no, box: parcel.box.code, weightKg: kg }));
      }
      if (p.packed_at) out.push(base('packed', p.packed_at, 'packing.packed', `Đóng gói xong ${String(p.parcels.length)} kiện`, p.packed_by));
      p.activity.forEach((a, index) => {
        if (a.kind === 'start' || a.kind === 'finish') return; // đã có mốc bắt đầu / xong ở trên
        out.push(base(`act:${String(index)}`, a.at, `packing.${a.kind}`, `${PLAN_ACTIVITY_LABELS[a.kind] ?? a.kind}: ${a.detail}${a.reason ? ` — ${a.reason}` : ''}`, a.by, { parcelNo: a.parcel_no }));
      });
    }
    return out;
  }

  private async fromReturns(ctx: Ctx): Promise<RawItem[]> {
    const base: Record<string, unknown> = {};
    if (ctx.groupIds) base.order_group_id = { $in: ctx.groupIds };
    if (ctx.sku) base['items.seller_sku'] = ctx.sku;
    const [created, disposed] = await Promise.all([
      this.returnModel.find({ ...base, created_at: this.timeFilter(ctx), ...(ctx.actorId ? { created_by: ctx.actorId } : {}) })
        .sort({ created_at: -1 }).limit(ctx.limit).lean(),
      this.returnModel.find({ ...base, 'inspection.disposed_at': this.timeFilter(ctx) }).limit(ctx.limit).lean(),
    ]);
    const out: RawItem[] = created.map((r) => ({
      id: `rt:${String(r._id)}`,
      occurredAt: r.created_at ?? new Date(0),
      category: 'returns' as const,
      action: 'return.created',
      summary: `Tạo phiếu trả ${r.rma_code}: ${RETURN_TYPE_LABELS[r.type] ?? r.type} (${RETURN_SOURCE_LABELS[r.source] ?? r.source}) — ${r.items.map((i) => `${i.seller_sku}×${String(i.quantity)}`).join(', ')}`,
      actorId: r.created_by,
      orderGroupId: String(r.order_group_id),
      entity: { type: 'return_request', id: String(r._id), code: r.rma_code },
      skus: r.items.map((i) => i.seller_sku),
      quantity: r.items.reduce((s, i) => s + i.quantity, 0),
      fromStatus: null,
      toStatus: r.source === 'failed_delivery' ? 'received' : 'requested',
      details: { type: r.type, source: r.source, customerNote: r.customer_note, externalRef: r.external_ref },
    }));
    for (const r of disposed) {
      r.inspection.forEach((line, index) => {
        if (!line.disposed_at || (line.disposition !== 'restocked' && line.disposition !== 'discarded')) return;
        out.push({
          id: `rq:${String(r._id)}:${String(index)}`,
          occurredAt: line.disposed_at,
          category: 'returns',
          action: `return.quarantine_${line.disposition}`,
          summary: `Hàng cách ly ${line.seller_sku}×${String(line.quantity)} (phiếu ${r.rma_code}): ${line.disposition === 'restocked' ? 'nhập lại kho' : 'loại bỏ'}${line.disposition_note ? ` — ${line.disposition_note}` : ''}`,
          actorId: line.disposed_by ?? null,
          orderGroupId: String(r.order_group_id),
          entity: { type: 'return_request', id: String(r._id), code: r.rma_code },
          skus: [line.seller_sku],
          quantity: line.quantity,
          fromStatus: 'quarantine',
          toStatus: line.disposition,
          details: { note: line.disposition_note ?? null },
        });
      });
    }
    return out;
  }

  private async fromPackaging(ctx: Ctx): Promise<RawItem[]> {
    if (ctx.sku) return [];
    const filter: Record<string, unknown> = { created_at: this.timeFilter(ctx) };
    if (ctx.actorId) filter.actor_id = ctx.actorId;
    if (ctx.groupIds) {
      filter.$or = [
        { ref_type: 'order_group', ref_id: { $in: ctx.groupIds.map(String) } },
        { ref_type: 'return_request', ref_id: { $in: ctx.returnIds.map(String) } },
      ];
    }
    const rows = await this.packagingModel.find(filter).sort({ created_at: -1 }).limit(ctx.limit).lean();
    return rows.map((r) => ({
      id: `pk:${String(r._id)}`,
      occurredAt: r.created_at,
      category: 'packaging_materials' as const,
      action: `packaging.${r.type}`,
      summary: `${PACKAGING_MOVE_LABELS[r.type] ?? r.type}: ${String(Math.abs(r.delta))} ${r.material_code} (${r.condition === 'reused' ? 'tái sử dụng' : r.condition === 'new' ? 'mới' : r.condition})${r.parcel_no ? ` — kiện ${String(r.parcel_no)}` : ''}${r.saving_vnd > 0 ? ` · tiết kiệm ${r.saving_vnd.toLocaleString('vi-VN')}đ` : ''}`,
      actorId: r.actor_id,
      orderGroupId: r.ref_type === 'order_group' ? r.ref_id : null,
      entity: { type: 'packaging_material', id: null, code: r.material_code },
      skus: [],
      quantity: r.delta,
      fromStatus: null,
      toStatus: null,
      details: { condition: r.condition, balanceAfter: r.balance_after, savingVnd: r.saving_vnd, note: r.note, followedRecommendation: r.followed_recommendation },
    }));
  }

  private async fromLogins(ctx: Ctx): Promise<RawItem[]> {
    if (ctx.sku || ctx.groupIds) return [];
    const filter: Record<string, unknown> = { created_at: this.timeFilter(ctx) };
    if (ctx.actorId) filter.user_id = new Types.ObjectId(ctx.actorId);
    const rows = await this.loginModel.find(filter).sort({ created_at: -1 }).limit(ctx.limit).lean();
    return rows.map((r) => {
      const at = (r as { created_at?: Date }).created_at ?? new Date(0);
      return {
        id: `lg:${String(r._id)}`,
        occurredAt: at,
        category: 'auth' as const,
        action: r.success ? 'auth.login_success' : 'auth.login_failed',
        summary: `Đăng nhập ${r.success ? 'thành công' : `thất bại${r.failure_reason ? ` (${r.failure_reason})` : ''}`} — ${r.email_attempted}${r.ip_address ? ` · IP ${r.ip_address}` : ''}`,
        actorId: idStr(r.user_id),
        orderGroupId: null,
        entity: null,
        skus: [],
        quantity: null,
        fromStatus: null,
        toStatus: null,
        details: { email: r.email_attempted, ip: r.ip_address ?? null, userAgent: r.user_agent ?? null },
      };
    });
  }

  /** Dòng thời gian: các đơn sàn trong nhóm về hệ thống lúc nào. */
  private async fromOrders(groupIds: Types.ObjectId[]): Promise<RawItem[]> {
    const orders = await this.orderModel
      .find({ consolidated_group_id: { $in: groupIds } })
      .select('platform platform_order_id items created_at consolidated_group_id origin')
      .lean();
    return orders.map((o) => ({
      id: `od:${String(o._id)}`,
      occurredAt: (o as { created_at?: Date }).created_at ?? new Date(0),
      category: 'orders' as const,
      action: 'order.received',
      summary: `${o.origin === 'replacement' ? 'Tạo đơn thay thế (đổi hàng)' : `Đơn ${o.platform_order_id} từ ${o.platform.toUpperCase()} về hệ thống`}: ${o.items.map((i) => `${i.sku}×${String(i.quantity)}`).join(', ')}`,
      actorId: 'system',
      orderGroupId: idStr(o.consolidated_group_id),
      entity: { type: 'order', id: String(o._id), code: o.platform_order_id },
      skus: o.items.map((i) => i.sku),
      quantity: o.items.reduce((s, i) => s + i.quantity, 0),
      fromStatus: null,
      toStatus: null,
      details: { platform: o.platform },
    }));
  }

  // ------------------------------------------------------------ tra cứu phụ

  private async binCodes(ids: Types.ObjectId[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.map(String))].map((id) => new Types.ObjectId(id));
    if (unique.length === 0) return new Map();
    const bins = await this.binModel.find({ _id: { $in: unique } }).select('bin_code').lean();
    return new Map(bins.map((b) => [String(b._id), b.bin_code]));
  }

  /** Người nhận của nhóm đơn (lấy từ đơn đầu tiên) — "giao cho ai". */
  private async recipientsByGroup(ids: Types.ObjectId[]): Promise<Map<string, { name: string; phone: string; address: string }>> {
    const unique = [...new Set(ids.map(String))].map((id) => new Types.ObjectId(id));
    const orders = await this.orderModel
      .find({ consolidated_group_id: { $in: unique } })
      .select('consolidated_group_id recipient')
      .lean();
    const out = new Map<string, { name: string; phone: string; address: string }>();
    for (const o of orders) {
      const key = String(o.consolidated_group_id);
      if (out.has(key)) continue;
      const r = o.recipient as unknown as { full_name: string; phone: string; address_line1?: string; ward_name?: string | null; province_name?: string | null };
      out.set(key, {
        name: r.full_name,
        phone: r.phone,
        address: [r.address_line1, r.ward_name, r.province_name].filter(Boolean).join(', '),
      });
    }
    return out;
  }

  private async resolveActors(items: RawItem[]): Promise<HistoryItem[]> {
    const ids = [...new Set(items.map((i) => i.actorId).filter((v): v is string => typeof v === 'string' && Types.ObjectId.isValid(v)))];
    const users = ids.length
      ? await this.userModel.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } }).select('name role').lean()
      : [];
    const byId = new Map(users.map((u) => [String(u._id), u]));
    return items.map(({ actorId, ...rest }) => {
      let actor: HistoryActor | null = null;
      if (actorId?.startsWith('system')) actor = { id: actorId, name: actorId === 'system' ? 'Hệ thống' : `Hệ thống (${actorId.slice(7)})`, role: null };
      else if (actorId) {
        const u = byId.get(actorId);
        actor = { id: actorId, name: u?.name ?? 'Người dùng đã xoá', role: u ? (ROLE_LABELS[u.role] ?? null) : null };
      }
      return { ...rest, categoryLabel: CATEGORY_LABELS[rest.category], actor };
    });
  }
}

