import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { UserRole } from '../../common/enums/user-role.enum';
import type { PackableItem } from '../../common/interfaces/packaging.interface';
import type { PackerConfig } from '../../config/packer.config';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { OrderGroupsService } from '../order-groups/order-groups.service';
import { addBusinessHours } from '../order-groups/utils/add-business-hours.util';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import { PackagingBoxService } from '../packaging/packaging-box.service';
import { PackagingMaterialService } from '../packaging/packaging-material.service';
import { PackagingBagService } from '../packaging/packaging-bag.service';
import { PackingGuideAiService } from '../packaging/packing-guide-ai.service';
import {
  ALL_ORIENTATIONS,
  DEFAULT_FRAGILE_CUSHION_MM,
  describePackingSteps,
  expandToUnits,
  type BoxSpec,
  type Orientation,
  type PackingUnit,
  type Placement,
} from '../packaging/engine';
import {
  CP_SAT_MAX_UNITS,
  SOLVER_VERSION,
  httpCpSatChecker,
  solveOrder,
  upgradeWithCpSat,
  type SolveResult,
  type SolvedParcel,
} from './solver';
import {
  PackingPlan,
  PackingPlanDocument,
  type CpSatState,
  type PlanOrder,
  type PlanParcel,
} from './schemas/packing-plan.schema';
import { PACKING_ERROR_CODES } from './packing.errors';
import { freshParcelSession, renumberParcels, type Plain } from './utils/parcels.util';
import { describeSuggestion, suggestStock } from './utils/stock-suggestion.util';
import type {
  BackToPickingDto,
  ChangeBoxDto,
  ChangeBoxInSessionDto,
  ManualPackDto, MoveItemDto, RecomputePlanDto, RejectReason } from './dto/packing-plan.dto';
import { PackingSettingsService } from './packing-settings.service';
import { PackerAssignmentService } from './packer-assignment.service';

/**
 * Đệm hàng dễ vỡ của 1 kế hoạch (05/10/2026: lấy từ packing_settings lúc tính,
 * chụp vào `solver.options`). Mọi đường dựng lại món của kế hoạch (đổi thùng,
 * chuyển món, hướng dẫn) PHẢI dùng đúng số đã chụp, không dùng cài đặt hiện tại.
 * Kế hoạch trước 05/10 không có trường → 5 mm như trước.
 */
function unitOptionsOf(plan: { solver: { options: { fragile_cushion_mm?: number } } }): { fragileCushionMm: number } {
  return { fragileCushionMm: plan.solver.options.fragile_cushion_mm ?? DEFAULT_FRAGILE_CUSHION_MM };
}

/** Hạn xử lý kế hoạch bị từ chối (giờ làm việc, 8h-17h, tính cả Thứ 7). */
export const REJECTION_DUE_BUSINESS_HOURS = 2;

interface Allocation {
  order_id: string;
  platform_order_id: string;
  items: PackableItem[];
}

/** Việc CP-SAT chạy nền cho 1 đơn sau khi BRKGA đã ghi kết quả. */
export interface CpSatTask {
  planId: Types.ObjectId;
  revision: number;
  orderId: string;
  units: PackingUnit[];
  result: SolveResult;
  availability: Map<string, number>;
}

export interface ComputeOutcome {
  plan: PackingPlanDocument;
  tasks: CpSatTask[];
}

function toPlanParcel(
  p: SolvedParcel,
  orderId: Types.ObjectId,
  platformOrderId: string | null,
  parcelNo: number,
  fragileKeys: ReadonlySet<string> = new Set(),
): PlanParcel {
  return {
    ...freshParcelSession(p.placements.some((q) => fragileKeys.has(q.item_key))),
    parcel_no: parcelNo,
    order_id: orderId,
    platform_order_id: platformOrderId,
    box: {
      code: p.box.code,
      name: p.box.name,
      inner_mm: { ...p.box.inner },
      outer_mm: { ...p.box.outer },
      tare_g: p.box.tare_g,
      max_load_g: p.box.max_load_g,
      price_vnd: p.box.price_vnd,
    },
    placements: p.placements.map((q) => ({ ...q, folded: q.folded === true })),
    fill_ratio: p.fill_ratio,
    manual_layout: false,
    items_weight_g: p.items_weight_g,
    estimated_weight_g: p.estimated_package_weight_g,
    volumetric_weight_g: p.volumetric_weight_g,
    materials: p.materials.map((m) => ({
      type: m.type,
      code: m.code,
      name: m.name,
      unit: m.unit,
      quantity: m.quantity,
      weight_g: m.weight_g,
      cost_vnd: m.cost_vnd,
    })),
    materials_weight_g: p.materials_weight_g,
    materials_cost_vnd: p.materials_cost_vnd,
    shipping_cost_vnd: null,
    guide: null,
    actual_weight_kg: null,
    is_abnormal: false,
    materials_shortfall: [],
  };
}

function fragileKeysOf(units: PackingUnit[]): Set<string> {
  return new Set(units.filter((u) => u.is_fragile).map((u) => u.item_key));
}

function dimsOf(d: { length_mm: number; width_mm: number; height_mm: number }): {
  length_mm: number;
  width_mm: number;
  height_mm: number;
} {
  return { length_mm: d.length_mm, width_mm: d.width_mm, height_mm: d.height_mm };
}

function boxSpecOf(parcel: PlanParcel): BoxSpec {
  return {
    code: parcel.box.code,
    name: parcel.box.name,
    inner: dimsOf(parcel.box.inner_mm),
    outer: dimsOf(parcel.box.outer_mm),
    tare_g: parcel.box.tare_g,
    max_load_g: parcel.box.max_load_g,
    price_vnd: parcel.box.price_vnd,
  };
}

function toItemProfiles(items: PackableItem[]): PackingPlan['item_profiles'] {
  const seen = new Map<string, PackingPlan['item_profiles'][number]>();
  for (const i of items) {
    if (!seen.has(i.sku))
      seen.set(i.sku, {
        sku: i.sku,
        product_category: i.product_category ?? null,
        zip_bag_code: i.zip_bag_code ?? null,
        zip_bag_folded: i.zip_bag_folded ?? false,
      });
  }
  return [...seen.values()];
}

/**
 * ===================================================================
 * Kế hoạch đóng gói (`packing_plans`) — 04/10/2026, đợt 3 làm lại
 * ===================================================================
 * Luồng: nhóm `picked` → compute (BRKGA, đồng bộ, vài trăm ms) ghi kế hoạch
 * `ready` + nhóm `pending_approval` trong 1 transaction → CP-SAT chạy NỀN
 * để nâng nhãn chứng minh (hoặc tìm phương án tốt hơn khi kế hoạch còn
 * `ready`) → người duyệt / chỉnh tay (đổi thùng, chuyển món) / từ chối →
 * `approved` + nhóm `approved_for_packing` → pack (cân từng kiện, trừ tồn)
 * → `packed`. Mọi phương án đều qua validator TS trước khi ghi.
 * ===================================================================
 */
@Injectable()
export class PackingPlanService {
  private readonly logger = new Logger(PackingPlanService.name);

  constructor(
    @InjectModel(PackingPlan.name) private readonly planModel: Model<PackingPlanDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly orderGroupsService: OrderGroupsService,
    private readonly boxService: PackagingBoxService,
    private readonly materialService: PackagingMaterialService,
    private readonly bagService: PackagingBagService,
    private readonly guideAi: PackingGuideAiService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
    private readonly settingsService: PackingSettingsService,
    private readonly packerAssignment: PackerAssignmentService,
  ) {}

  // ------------------------------------------------------------------ đọc

  async getActivePlan(groupId: string): Promise<PackingPlanDocument | null> {
    const id = this.objectId(groupId);
    return this.planModel.findOne({ order_group_id: id, is_active: true });
  }

  /** Kế hoạch đang hoạt động của nhiều nhóm (cho bảng hàng chờ) — 1 truy vấn `$in`. */
  async listActiveByGroupIds(groupIds: string[]): Promise<PackingPlanDocument[]> {
    const ids = groupIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    if (ids.length === 0) return [];
    return this.planModel.find({ order_group_id: { $in: ids }, is_active: true });
  }

  async requireActivePlan(groupId: string): Promise<PackingPlanDocument> {
    const plan = await this.getActivePlan(groupId);
    if (!plan) {
      throw new AppException(
        PACKING_ERROR_CODES.PLAN_NOT_FOUND,
        'Nhóm đơn này chưa có kế hoạch đóng gói.',
        HttpStatus.NOT_FOUND,
        { groupId },
      );
    }
    return plan;
  }

  // ------------------------------------------------------------------ tính

  /**
   * Tính kế hoạch cho nhóm đang `picked` chưa có kế hoạch hoạt động. Bản ghi
   * `computing` được chèn TRƯỚC (chỉ mục duy nhất theo nhóm) nên 2 lần gọi
   * đồng thời không thể cùng tính 1 nhóm. Lỗi dữ liệu (vd hồ sơ SKU chưa
   * sẵn sàng) → kế hoạch `failed` kèm lý do, giữ nguyên để cron không tính
   * lặp vô hạn; người dùng sửa xong bấm "Tính lại".
   */
  async compute(
    groupId: string,
    options: Pick<RecomputePlanDto, 'exclude_box_codes' | 'prefer'> = {},
  ): Promise<ComputeOutcome> {
    const group = await this.orderGroupsService.findOrderGroupById(groupId);
    if (group.fulfillment_status !== GroupFulfillmentStatus.PICKED) {
      throw new AppException(
        PACKING_ERROR_CODES.WRONG_PLAN_STATUS,
        `Chỉ tính kế hoạch khi nhóm đã lấy hàng xong (picked); hiện tại "${group.fulfillment_status}".`,
        HttpStatus.CONFLICT,
        { groupId, status: group.fulfillment_status },
      );
    }
    const last = await this.planModel
      .findOne({ order_group_id: group._id })
      .sort({ revision: -1 })
      .select('revision assigned_packer_id')
      .lean();
    const settings = await this.settingsService.get();
    const prefer = options.prefer ?? settings.defaultPrefer;
    const exclude = options.exclude_box_codes ?? [];
    const unitOptions = { fragileCushionMm: settings.fragileCushionMm };

    let plan: PackingPlanDocument;
    try {
      plan = await this.planModel.create({
        order_group_id: group._id,
        revision: (last?.revision ?? 0) + 1,
        version: 1,
        is_active: true,
        status: 'computing',
        solver: {
          engine_version: SOLVER_VERSION,
          computation_ms: 0,
          options: { exclude_box_codes: exclude, prefer, fragile_cushion_mm: unitOptions.fragileCushionMm },
        },
      });
    } catch (error: unknown) {
      if (this.isDuplicateKey(error)) {
        throw new AppException(
          PACKING_ERROR_CODES.PLAN_COMPUTING,
          'Nhóm này đang có kế hoạch khác (hoặc đang được tính) — tải lại dữ liệu.',
          HttpStatus.CONFLICT,
          { groupId },
        );
      }
      throw error;
    }

    const started = Date.now();
    try {
      const allocations: Allocation[] = await this.orderGroupsService.allocatePickedItemsToOrders(groupId);
      const [boxes, availability, materials] = await Promise.all([
        this.boxService.listActiveSpecs(),
        this.boxService.listAvailability({ groupId }),
        this.materialService.planningData(),
      ]);
      // Giải TUẦN TỰ từng đơn, trừ dần thùng còn trống — 2 đơn không giành 1 thùng cuối.
      const remaining = new Map([...availability].map(([code, a]) => [code, a.available]));
      const orders: PlanOrder[] = [];
      const parcels: PlanParcel[] = [];
      const pending: Omit<CpSatTask, 'planId' | 'revision'>[] = [];
      const packer = this.packerConfig();

      for (const allocation of allocations) {
        const units = expandToUnits(allocation.items, unitOptions);
        const fragileKeys = new Set(units.filter((u) => u.is_fragile).map((u) => u.item_key));
        const stockForOrder = new Map(remaining);
        const result = solveOrder(units, boxes, {
          availability: stockForOrder,
          materials,
          excludeBoxCodes: exclude,
          prefer,
        });
        for (const p of result.parcels) remaining.set(p.box.code, (remaining.get(p.box.code) ?? 0) - 1);
        const orderId = new Types.ObjectId(allocation.order_id);
        for (const p of result.parcels)
          parcels.push(toPlanParcel(p, orderId, allocation.platform_order_id, parcels.length + 1, fragileKeys));

        const wantsCpSat =
          result.proof === 'heuristic' &&
          result.unplaced.length === 0 &&
          result.open_candidates.length > 0 &&
          units.length <= (packer?.maxUnits ?? 0);
        const cpSat: CpSatState = !wantsCpSat ? 'skipped' : packer ? 'pending' : 'unavailable';
        // Gợi ý kho thùng: chỉ khi kho thiếu thùng vừa hơn mới làm phương án xấu đi.
        const suggestion = suggestStock(units, boxes, result, stockForOrder, {
          materials,
          excludeBoxCodes: exclude,
          prefer,
        });
        const explanation = [...result.explanation];
        if (suggestion) explanation.push(describeSuggestion(suggestion));
        const maxUnits = packer?.maxUnits ?? CP_SAT_MAX_UNITS;
        if (result.proof === 'heuristic' && result.unplaced.length === 0 && units.length > maxUnits) {
          explanation.push(
            `Đơn ${String(units.length)} món vượt giới hạn ${String(maxUnits)} món của bước chứng minh CP-SAT. ` +
              `Cận dưới ${String(result.lower_bound_parcels)} kiện chỉ tính theo thể tích, cân và diện tích đáy nên có thể thấp hơn mức xếp được thật — ` +
              `chưa khẳng định được ${String(result.lower_bound_parcels)} kiện là không thể.`,
          );
        }
        if (cpSat === 'unavailable') {
          explanation.push('Service CP-SAT chưa được bật nên chưa kiểm chứng thêm các tổ hợp thùng còn mở.');
        }
        const overParcelLimit =
          settings.maxParcelsPerOrder !== null && result.parcels.length > settings.maxParcelsPerOrder;
        if (overParcelLimit) {
          explanation.push(
            `Đơn cần ${String(result.parcels.length)} kiện, vượt mức tối đa ${String(settings.maxParcelsPerOrder)} kiện/đơn trong cài đặt — duyệt phải ghi lý do.`,
          );
        }
        orders.push({
          order_id: orderId,
          platform_order_id: allocation.platform_order_id,
          status: result.status,
          unplaced: result.unplaced.map((u) => ({ item_key: u.item_key, code: u.code, reason: u.reason })),
          proof: result.proof,
          lower_bound_parcels: result.lower_bound_parcels,
          explanation,
          strategy: result.strategy,
          cp_sat: cpSat,
          stock_suggestion: suggestion,
          over_parcel_limit: overParcelLimit,
        });
        if (cpSat === 'pending')
          pending.push({ orderId: allocation.order_id, units, result, availability: stockForOrder });
      }

      const saved = await this.runInTransaction(async (session) => {
        const updated = await this.planModel.findOneAndUpdate(
          { _id: plan._id, status: 'computing' },
          {
            $set: {
              status: 'ready',
              orders,
              parcels: renumberParcels(parcels, orders.map((o) => o.order_id)),
              item_profiles: toItemProfiles(allocations.flatMap((a) => a.items)),
              'solver.computation_ms': Date.now() - started,
            },
          },
          { session, returnDocument: 'after' },
        );
        if (!updated) throw this.versionConflict(groupId);
        const fresh = await this.orderGroupsService.findOrderGroupById(groupId);
        await this.orderGroupsService.transitionFulfillmentStatus(
          groupId,
          GroupFulfillmentStatus.PENDING_APPROVAL,
          fresh.__v,
          session,
        );
        return updated;
      });

      // Giao người đóng: giữ người của lần tính trước (tính lại), không thì người ít việc nhất.
      const assigned = await this.packerAssignment.assignOnReady(saved._id, last?.assigned_packer_id ?? null);
      await this.notifyPendingPlan(groupId, assigned ?? saved);
      this.logger.log(
        `Kế hoạch đóng gói nhóm ${groupId} (lần ${String(saved.revision)}): ${String(saved.orders.length)} đơn, ${String(saved.parcels.length)} kiện, ${String(Date.now() - started)} ms.`,
      );
      return {
        plan: assigned ?? saved,
        tasks: pending.map((t) => ({ ...t, planId: saved._id, revision: saved.revision })),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await this.planModel.updateOne(
        { _id: plan._id, status: 'computing' },
        { $set: { status: 'failed', failure_reason: message } },
      );
      this.logger.warn(`Tính kế hoạch nhóm ${groupId} thất bại: ${message}`);
      throw error;
    }
  }

  /**
   * Tính lại có điều kiện (loại trừ thùng / ưu tiên rẻ). Thay kế hoạch hiện
   * tại (ready / failed / rejected) bằng lần tính mới; nhóm đang chờ duyệt
   * quay về `picked` trong cùng transaction rồi tính ngay.
   */
  async recompute(groupId: string, dto: RecomputePlanDto): Promise<ComputeOutcome> {
    const current = await this.getActivePlan(groupId);
    if (current) {
      if (!['ready', 'failed', 'rejected'].includes(current.status)) {
        throw this.wrongStatus(groupId, current.status, 'tính lại');
      }
      if (dto.expected_version !== current.version) throw this.versionConflict(groupId);
      await this.runInTransaction(async (session) => {
        const superseded = await this.planModel.updateOne(
          { _id: current._id, version: current.version, is_active: true },
          {
            $set:
              current.status === 'rejected'
                ? { is_active: false, status: 'superseded', rejection_resolution: 'recompute', rejection_resolved_at: new Date() }
                : { is_active: false, status: 'superseded' },
          },
          { session },
        );
        if (superseded.matchedCount === 0) throw this.versionConflict(groupId);
        const group = await this.orderGroupsService.findOrderGroupById(groupId);
        if (group.fulfillment_status === GroupFulfillmentStatus.PENDING_APPROVAL) {
          await this.orderGroupsService.transitionFulfillmentStatus(
            groupId,
            GroupFulfillmentStatus.PICKED,
            group.__v,
            session,
          );
        }
      });
    }
    return this.compute(groupId, dto);
  }

  // ------------------------------------------------------------------ duyệt / từ chối

  async approve(
    groupId: string,
    expectedVersion: number,
    userId: string,
    overrideReason?: string,
  ): Promise<PackingPlanDocument> {
    const plan = await this.requireActivePlan(groupId);
    this.assertStatus(plan, 'ready', 'duyệt');
    if (plan.version !== expectedVersion) throw this.versionConflict(groupId);
    const unresolved = plan.orders.filter((o) => o.status === 'partial' || o.status === 'no_fit');
    if (unresolved.length > 0) {
      throw new AppException(
        PACKING_ERROR_CODES.HAS_UNPLACED,
        `Còn ${String(unresolved.length)} đơn chưa xếp hết món — chỉnh tay hoặc tính lại trước khi duyệt.`,
        HttpStatus.CONFLICT,
        { groupId, orderIds: unresolved.map((o) => o.order_id.toString()) },
      );
    }
    const overLimit = plan.orders.filter((o) => o.over_parcel_limit);
    const reason = overrideReason?.trim() ?? '';
    if (overLimit.length > 0 && reason.length < 3) {
      throw new AppException(
        PACKING_ERROR_CODES.PARCEL_LIMIT_EXCEEDED,
        `Có ${String(overLimit.length)} đơn vượt số kiện tối đa trong cài đặt — ghi lý do (override_reason) để duyệt.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { groupId, orderIds: overLimit.map((o) => o.order_id.toString()) },
      );
    }
    return this.runInTransaction(async (session) => {
      const updated = await this.planModel.findOneAndUpdate(
        { _id: plan._id, version: expectedVersion, status: 'ready', is_active: true },
        {
          $set: {
            status: 'approved',
            approved_by: new Types.ObjectId(userId),
            approved_at: new Date(),
            approve_override_reason: overLimit.length > 0 ? reason : null,
          },
          $inc: { version: 1 },
        },
        { session, returnDocument: 'after' },
      );
      if (!updated) throw this.versionConflict(groupId);
      const group = await this.orderGroupsService.findOrderGroupById(groupId);
      await this.orderGroupsService.transitionFulfillmentStatus(
        groupId,
        GroupFulfillmentStatus.APPROVED_FOR_PACKING,
        group.__v,
        session,
      );
      return updated;
    });
  }

  /**
   * Từ chối kế hoạch (08/10/2026: có kiểm soát). Lý do theo MÃ, có người chịu
   * trách nhiệm + hạn xử lý (giờ làm việc). Kế hoạch `rejected` vẫn hoạt động để
   * cron không tự tính lại; lối ra: tính lại (`recompute`), đóng thủ công
   * (`manualPack`) hoặc trả về lấy hàng — không còn "xử lý ngoài hệ thống".
   */
  async reject(
    groupId: string,
    expectedVersion: number,
    reason: RejectReason,
    note: string | undefined,
    userId: string,
    ownerId?: string,
  ): Promise<PackingPlanDocument> {
    this.assertNote(reason, note);
    const plan = await this.requireActivePlan(groupId);
    this.assertStatus(plan, 'ready', 'từ chối');
    if (plan.version !== expectedVersion) throw this.versionConflict(groupId);
    const owner = ownerId ? this.objectId(ownerId) : null;
    const trimmedNote = note?.trim() ? note.trim() : null;
    const now = new Date();
    const dueAt = addBusinessHours(now, REJECTION_DUE_BUSINESS_HOURS);
    const readable = trimmedNote ? `${reason}: ${trimmedNote}` : reason;
    const updated = await this.runInTransaction(async (session) => {
      const doc = await this.planModel.findOneAndUpdate(
        { _id: plan._id, version: expectedVersion, status: 'ready', is_active: true },
        {
          $set: {
            status: 'rejected',
            rejected_by: new Types.ObjectId(userId),
            rejected_at: now,
            rejection_reason: readable,
            rejection_reason_code: reason,
            rejection_owner_id: owner,
            rejection_due_at: dueAt,
          },
          $inc: { version: 1 },
        },
        { session, returnDocument: 'after' },
      );
      if (!doc) throw this.versionConflict(groupId);
      const group = await this.orderGroupsService.findOrderGroupById(groupId);
      await this.orderGroupsService.transitionFulfillmentStatus(
        groupId,
        GroupFulfillmentStatus.PICKED,
        group.__v,
        session,
      );
      return doc;
    });
    await this.notifyRejected(groupId, readable, owner?.toString() ?? null, dueAt);
    return updated;
  }

  /**
   * Lối ra thứ 3 sau khi từ chối (09/10/2026): TRẢ VỀ LẤY HÀNG. Các món khai
   * báo bị rút khỏi số "đã lấy" của lượt hiện tại (món hỏng loại bỏ; món lấy
   * nhầm `restock: true` cộng lại đúng ô), kế hoạch `rejected` thành
   * `superseded` (`rejection_resolution: back_to_picking`), nhóm `picked →
   * picking`. Kho chỉ cần quét bù đúng số món đã rút rồi xác nhận lấy xong —
   * cron tự tính kế hoạch mới. Tất cả trong 1 transaction.
   */
  async backToPicking(groupId: string, dto: BackToPickingDto, userId: string): Promise<PackingPlanDocument> {
    const plan = await this.requireActivePlan(groupId);
    this.assertStatus(plan, 'rejected', 'trả về lấy hàng');
    if (plan.version !== dto.expected_version) throw this.versionConflict(groupId);

    const picked = new Map<string, number>();
    for (const a of await this.orderGroupsService.allocatePickedItemsToOrders(groupId)) {
      for (const item of a.items) picked.set(item.sku, (picked.get(item.sku) ?? 0) + item.quantity);
    }
    const wanted = new Map<string, { remove: number; restock: number }>();
    for (const line of dto.items) {
      const cur = wanted.get(line.sku) ?? { remove: 0, restock: 0 };
      if (line.restock) cur.restock += line.quantity;
      else cur.remove += line.quantity;
      wanted.set(line.sku, cur);
    }
    for (const [sku, w] of wanted) {
      const have = picked.get(sku) ?? 0;
      if (w.remove + w.restock > have) {
        throw new AppException(
          PACKING_ERROR_CODES.BACK_TO_PICKING_INVALID,
          have === 0
            ? `SKU "${sku}" không có trong hàng đã lấy của nhóm.`
            : `SKU "${sku}": khai ${String(w.remove + w.restock)} món nhưng nhóm chỉ lấy ${String(have)}.`,
          HttpStatus.BAD_REQUEST,
          { sku, requested: w.remove + w.restock, picked: have },
        );
      }
    }

    const note = dto.note?.trim() ? dto.note.trim() : null;
    const baseNote = `Kế hoạch bị từ chối (${plan.rejection_reason_code ?? '—'}) — trả về lấy hàng${note ? `: ${note}` : ''}`;
    const updated = await this.runInTransaction(async (session) => {
      const removeLines = [...wanted].filter(([, w]) => w.remove > 0).map(([sku, w]) => ({ sku, quantity: w.remove }));
      const restockLines = [...wanted].filter(([, w]) => w.restock > 0).map(([sku, w]) => ({ sku, quantity: w.restock }));
      if (removeLines.length > 0) {
        await this.orderGroupsService.adjustPickedUnits(groupId, removeLines, {
          restock: false,
          kind: 'pack_issue',
          note: baseNote,
          actorId: userId,
          session,
        });
      }
      if (restockLines.length > 0) {
        await this.orderGroupsService.adjustPickedUnits(groupId, restockLines, {
          restock: true,
          kind: 'reject_return',
          note: baseNote,
          actorId: userId,
          session,
        });
      }
      const doc = await this.planModel.findOneAndUpdate(
        { _id: plan._id, version: dto.expected_version, status: 'rejected', is_active: true },
        {
          $set: {
            is_active: false,
            status: 'superseded',
            rejection_resolution: 'back_to_picking',
            rejection_resolved_at: new Date(),
          },
          $push: {
            adjustments: {
              kind: 'back_to_picking',
              detail: dto.items
                .map((i) => `${i.sku} ×${String(i.quantity)}${i.restock ? ' (về kệ)' : ' (loại bỏ)'}`)
                .join(', '),
              reason: plan.rejection_reason_code ?? 'OTHER',
              note,
              by: new Types.ObjectId(userId),
              at: new Date(),
              skus: [...wanted.keys()],
              box_codes: [],
            },
          },
          $inc: { version: 1 },
        },
        { session, returnDocument: 'after' },
      );
      if (!doc) throw this.versionConflict(groupId);
      const group = await this.orderGroupsService.findOrderGroupById(groupId);
      await this.orderGroupsService.transitionFulfillmentStatus(
        groupId,
        GroupFulfillmentStatus.PICKING,
        group.__v,
        session,
      );
      return doc;
    });
    await this.orderGroupsService.reconcileReservation(groupId);
    const summary = dto.items.map((i) => `${i.sku} ×${String(i.quantity)}`).join(', ');
    const common = {
      type: NotificationType.PACKING_ISSUE,
      severity: 'warning' as const,
      title: 'Nhóm đơn quay lại bước lấy hàng',
      message: `Kế hoạch đóng gói bị từ chối — cần lấy lại: ${summary}.`,
      relatedEntityType: 'order_group',
      relatedEntityId: groupId,
    };
    const group = await this.orderGroupsService.findOrderGroupById(groupId);
    if (group.assigned_staff_id) {
      await this.safeNotify({ ...common, recipientUserId: group.assigned_staff_id.toString() });
    } else {
      await this.safeNotify({ ...common, recipientRole: UserRole.WAREHOUSE_STAFF });
    }
    return updated;
  }

  /**
   * Đóng gói THỦ CÔNG sau khi từ chối: người xử lý nhập kiện thật (thùng + món).
   * Hệ thống kiểm: đủ món (mỗi món đúng 1 kiện), thùng có trong danh mục và còn
   * tồn, tổng cân không vượt tải thùng. Cố gắng xếp hình học vào thùng đó; nếu
   * không xếp được thì giữ kiện không tọa độ (`manual_layout`). Kế hoạch mới
   * `source: manual` ở trạng thái `ready` — người KHÁC duyệt như luồng thường
   * (hai cặp mắt), rồi quét, niêm phong, trừ tồn, cân, báo sàn.
   */
  async manualPack(groupId: string, dto: ManualPackDto, userId: string): Promise<PackingPlanDocument> {
    const plan = await this.requireActivePlan(groupId);
    this.assertStatus(plan, 'rejected', 'đóng thủ công');
    if (plan.version !== dto.expected_version) throw this.versionConflict(groupId);

    const allocations = await this.orderGroupsService.allocatePickedItemsToOrders(groupId);
    const unitsByKey = new Map<string, { orderId: string; unit: PackingUnit }>();
    for (const a of allocations) {
      for (const unit of expandToUnits(a.items, unitOptionsOf(plan))) {
        unitsByKey.set(unit.item_key, { orderId: a.order_id, unit });
      }
    }
    const orderIds = new Set(plan.orders.filter((o) => o.status !== 'canceled').map((o) => o.order_id.toString()));
    const seen = new Set<string>();
    for (const p of dto.parcels) {
      if (!orderIds.has(p.order_id)) {
        throw this.manualInvalid(`Đơn ${p.order_id} không thuộc kế hoạch này.`, { orderId: p.order_id });
      }
      for (const key of p.item_keys) {
        const entry = unitsByKey.get(key);
        if (entry?.orderId !== p.order_id) {
          throw this.manualInvalid(`Món "${key}" không thuộc đơn ${p.order_id}.`, { itemKey: key });
        }
        if (seen.has(key)) throw this.manualInvalid(`Món "${key}" xuất hiện trong hơn một kiện.`, { itemKey: key });
        seen.add(key);
      }
    }
    const missing = [...unitsByKey.keys()].filter((k) => !seen.has(k));
    if (missing.length > 0) {
      throw this.manualInvalid(`Còn ${String(missing.length)} món chưa nằm trong kiện nào.`, { missing });
    }

    // Thùng: có trong danh mục, đủ tồn cho số kiện dùng.
    const availability = await this.boxService.listAvailability({ planId: plan._id });
    const used = new Map<string, number>();
    for (const p of dto.parcels) used.set(p.box_code, (used.get(p.box_code) ?? 0) + 1);
    const boxes = new Map<string, BoxSpec>();
    for (const [code, count] of used) {
      boxes.set(code, await this.boxService.findActiveSpecByCode(code));
      const stock = availability.get(code);
      if (!stock || stock.available < count) {
        throw new AppException(
          'PKG_BOX_OUT_OF_STOCK',
          `Kho không đủ thùng "${code}" (cần ${String(count)}, còn trống ${String(stock?.available ?? 0)}).`,
          HttpStatus.CONFLICT,
          { boxCode: code },
        );
      }
    }

    const materials = await this.materialService.planningData();
    const parcels: PlanParcel[] = [];
    for (const input of dto.parcels) {
      const box = boxes.get(input.box_code);
      if (!box) throw this.manualInvalid(`Thùng "${input.box_code}" không có trong danh mục.`, { boxCode: input.box_code });
      const units = input.item_keys.map((k) => (unitsByKey.get(k) as { unit: PackingUnit }).unit);
      const weight = units.reduce((sum, u) => sum + u.weight_g, 0);
      if (weight > box.max_load_g) {
        throw this.manualInvalid(
          `Kiện thùng "${box.code}" nặng ${String(weight)} g, vượt tải tối đa ${String(box.max_load_g)} g.`,
          { boxCode: box.code, weightG: weight },
        );
      }
      const orderId = new Types.ObjectId(input.order_id);
      const platformOrderId = plan.orders.find((o) => o.order_id.equals(orderId))?.platform_order_id ?? null;
      const solved = solveOrder(units, [box], { materials });
      const [only] = solved.parcels;
      parcels.push(
        solved.status === 'ok' && solved.parcels.length === 1 && only
          ? toPlanParcel(only, orderId, platformOrderId, parcels.length + 1, fragileKeysOf(units))
          : this.manualLayoutParcel(box, units, orderId, platformOrderId, parcels.length + 1),
      );
    }

    const adjustment: PackingPlan['adjustments'][number] = {
      kind: 'manual_pack',
      detail: `Đóng thủ công ${String(parcels.length)} kiện sau khi từ chối`,
      reason: 'OTHER',
      note: dto.note.trim(),
      by: new Types.ObjectId(userId),
      at: new Date(),
      skus: [...new Set([...seen].map((k) => (unitsByKey.get(k) as { unit: PackingUnit }).unit.sku))],
      box_codes: [...used.keys()],
    };
    const orders = plan.orders.map((o) => ({
      ...this.plain(o),
      status: o.status === 'canceled' ? o.status : ('ok' as const),
      unplaced: [],
      proof: 'heuristic' as const,
      cp_sat: 'skipped' as const,
      strategy: 'manual',
      stock_suggestion: null,
      over_parcel_limit: false,
      explanation: [`Đóng thủ công do kế hoạch bị từ chối: ${dto.note.trim()}`],
    }));

    return this.runInTransaction(async (session) => {
      const old = await this.planModel.updateOne(
        { _id: plan._id, version: dto.expected_version, status: 'rejected', is_active: true },
        {
          $set: {
            is_active: false,
            status: 'superseded',
            rejection_resolution: 'manual',
            rejection_resolved_at: new Date(),
          },
        },
        { session },
      );
      if (old.matchedCount === 0) throw this.versionConflict(groupId);
      const [created] = await this.planModel.create(
        [
          {
            order_group_id: plan.order_group_id,
            revision: plan.revision + 1,
            version: 1,
            is_active: true,
            status: 'ready',
            source: 'manual',
            orders,
            parcels: renumberParcels(parcels, plan.orders.map((o) => o.order_id)),
            item_profiles: plan.item_profiles.map((i) => this.plain(i)),
            adjustments: [adjustment],
            solver: this.plain(plan.solver),
            assigned_packer_id: plan.assigned_packer_id,
            assigned_packer_at: plan.assigned_packer_at,
          },
        ],
        { session },
      );
      if (!created) throw this.versionConflict(groupId);
      const group = await this.orderGroupsService.findOrderGroupById(groupId);
      await this.orderGroupsService.transitionFulfillmentStatus(
        groupId,
        GroupFulfillmentStatus.PENDING_APPROVAL,
        group.__v,
        session,
      );
      return created;
    });
  }

  /** Kiện nhập tay mà bộ giải không xếp được: liệt kê món, không có tọa độ thật. */
  private manualLayoutParcel(
    box: BoxSpec,
    units: PackingUnit[],
    orderId: Types.ObjectId,
    platformOrderId: string | null,
    parcelNo: number,
  ): PlanParcel {
    const itemsWeight = units.reduce((sum, u) => sum + u.weight_g, 0);
    const itemsVolume = units.reduce((sum, u) => sum + u.length_mm * u.width_mm * u.height_mm, 0);
    const innerVolume = box.inner.length_mm * box.inner.width_mm * box.inner.height_mm;
    const outerVolume = box.outer.length_mm * box.outer.width_mm * box.outer.height_mm;
    return {
      ...freshParcelSession(units.some((u) => u.is_fragile)),
      parcel_no: parcelNo,
      order_id: orderId,
      platform_order_id: platformOrderId,
      box: {
        code: box.code,
        name: box.name,
        inner_mm: { ...box.inner },
        outer_mm: { ...box.outer },
        tare_g: box.tare_g,
        max_load_g: box.max_load_g,
        price_vnd: box.price_vnd,
      },
      placements: units.map((u, i) => ({
        item_key: u.item_key,
        sku: u.sku,
        step: i + 1,
        x: 0,
        y: 0,
        z: 0,
        dx: u.length_mm,
        dy: u.width_mm,
        dz: u.height_mm,
        orientation: 'LWH',
        folded: false,
      })),
      fill_ratio: innerVolume > 0 ? Math.min(1, itemsVolume / innerVolume) : 0,
      manual_layout: true,
      items_weight_g: itemsWeight,
      estimated_weight_g: itemsWeight + box.tare_g,
      volumetric_weight_g: Math.round(outerVolume / 5),
      materials: [],
      materials_weight_g: 0,
      materials_cost_vnd: 0,
      shipping_cost_vnd: null,
      guide: null,
      actual_weight_kg: null,
      is_abnormal: false,
      materials_shortfall: [],
    };
  }

  private manualInvalid(message: string, details: Record<string, unknown>): AppException {
    return new AppException(PACKING_ERROR_CODES.MANUAL_PACK_INVALID, message, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }

  // ------------------------------------------------------------------ chỉnh tay

  /** Đổi thùng cho 1 kiện: xếp lại đúng các món của kiện vào thùng mới, phải qua validator. */
  async changeBox(
    groupId: string,
    parcelNo: number,
    dto: ChangeBoxDto,
    userId: string,
  ): Promise<PackingPlanDocument> {
    this.assertNote(dto.reason, dto.note);
    const plan = await this.requireEditablePlan(groupId, dto.expected_version);
    const parcel = this.findParcel(plan, parcelNo);
    const box = await this.boxService.findActiveSpecByCode(dto.box_code);
    await this.assertBoxInStock(plan, box.code, parcelNo);

    const units = await this.unitsOfParcel(groupId, parcel, plan);
    const result = solveOrder(units, [box], { materials: await this.materialService.planningData() });
    const [only] = result.parcels;
    if (result.status !== 'ok' || result.parcels.length !== 1 || !only) {
      throw new AppException(
        PACKING_ERROR_CODES.BOX_DOES_NOT_FIT,
        `Thùng "${box.code}" không xếp vừa các món của kiện ${String(parcelNo)}.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { boxCode: box.code, parcelNo },
      );
    }
    const replaced = toPlanParcel(only, parcel.order_id, parcel.platform_order_id, parcel.parcel_no, fragileKeysOf(units));
    const parcels = plan.parcels.map((p) => (p.parcel_no === parcelNo ? replaced : this.plain(p)));
    return this.saveManualEdit(plan, dto.expected_version, parcels, parcel.order_id, {
      kind: 'change_box',
      detail: `Kiện ${String(parcelNo)}: ${parcel.box.code} → ${box.code}`,
      skus: [...new Set(units.map((u) => u.sku))],
      box_codes: [parcel.box.code, box.code],
      reason: dto.reason,
      note: dto.note?.trim() ? dto.note.trim() : null,
      by: new Types.ObjectId(userId),
      at: new Date(),
    });
  }

  /**
   * Đổi thùng khi ĐANG đóng (08/10/2026): kế hoạch đã duyệt/đang đóng, kiện chưa
   * niêm phong (thùng chưa trừ tồn). Bắt buộc khai thùng cũ: `unused` = trả lại
   * kệ, không tốn gì; `damaged` = đã hỏng → trừ 1 thùng cũ khỏi tồn + ghi sổ
   * hao hụt (`waste`). Giữ nguyên các lần quét đã có của kiện.
   */
  async changeBoxInSession(
    groupId: string,
    parcelNo: number,
    dto: ChangeBoxInSessionDto,
    userId: string,
  ): Promise<PackingPlanDocument> {
    this.assertNote(dto.reason, dto.note);
    const plan = await this.requireActivePlan(groupId);
    if (plan.status !== 'approved' && plan.status !== 'packing') {
      throw this.wrongStatus(groupId, plan.status, 'đổi thùng khi đóng');
    }
    if (plan.version !== dto.expected_version) throw this.versionConflict(groupId);
    const parcel = this.findParcel(plan, parcelNo);
    if (parcel.status !== 'pending' || parcel.box_consumed) {
      throw new AppException(
        PACKING_ERROR_CODES.PARCEL_WRONG_STATUS,
        `Kiện ${String(parcelNo)} đã niêm phong hoặc đã trừ thùng — chỉ đổi được kiện chưa niêm phong.`,
        HttpStatus.CONFLICT,
        { parcelNo, status: parcel.status },
      );
    }
    const damaged = dto.old_box_outcome === 'damaged';
    const sameBox = dto.box_code === parcel.box.code;
    if (sameBox && !damaged) {
      throw new AppException(
        PACKING_ERROR_CODES.SAME_BOX,
        'Thùng mới trùng thùng hiện tại — chọn thùng khác, hoặc khai thùng cũ đã hỏng để thay cái mới cùng loại.',
        HttpStatus.BAD_REQUEST,
        { boxCode: dto.box_code },
      );
    }
    const box = await this.boxService.findActiveSpecByCode(dto.box_code);
    // Thùng cũ hỏng cùng loại: 1 cái bị bỏ, cần thêm 1 cái nữa cho kiện.
    await this.assertBoxInStock(plan, box.code, parcelNo, sameBox && damaged ? 1 : 0);

    let replaced: PlanParcel = this.plain(parcel);
    if (!sameBox) {
      const units = await this.unitsOfParcel(groupId, parcel, plan);
      const result = solveOrder(units, [box], { materials: await this.materialService.planningData() });
      const [only] = result.parcels;
      if (result.status !== 'ok' || result.parcels.length !== 1 || !only) {
        throw new AppException(
          PACKING_ERROR_CODES.BOX_DOES_NOT_FIT,
          `Thùng "${box.code}" không xếp vừa các món của kiện ${String(parcelNo)}.`,
          HttpStatus.UNPROCESSABLE_ENTITY,
          { boxCode: box.code, parcelNo },
        );
      }
      // Giữ lần quét/cân đã có: chỉ đổi thùng + cách xếp.
      const kept = this.plain(parcel);
      replaced = Object.assign(
        {},
        toPlanParcel(only, parcel.order_id, parcel.platform_order_id, parcel.parcel_no, fragileKeysOf(units)),
        { status: parcel.status, scans: kept.scans, weighings: kept.weighings, reviews: kept.reviews },
      );
    }
    const parcels = plan.parcels.map((p) => (p.parcel_no === parcelNo ? replaced : this.plain(p)));
    const oldCode = parcel.box.code;
    return this.runInTransaction(async (session) => {
      let wasteCost = 0;
      if (damaged) {
        const waste = await this.boxService.recordWaste(
          session,
          oldCode,
          { groupId: plan.order_group_id, planId: plan._id, parcelNo },
          userId,
          `Thùng hỏng trước khi niêm phong (kiện ${String(parcelNo)}): ${dto.reason}`,
        );
        wasteCost = waste.taken * waste.unitCostVnd;
      }
      return this.saveManualEdit(
        plan,
        dto.expected_version,
        parcels,
        parcel.order_id,
        {
          kind: 'change_box_in_session',
          detail: `Kiện ${String(parcelNo)}: ${oldCode} → ${box.code} (thùng cũ: ${damaged ? 'đã hỏng, ghi hao hụt' : 'chưa dùng'})`,
          skus: [...new Set(parcel.placements.map((p) => p.sku))],
          box_codes: [oldCode, box.code],
          old_box_outcome: dto.old_box_outcome,
          waste_cost_vnd: wasteCost,
          reason: dto.reason,
          note: dto.note?.trim() ? dto.note.trim() : null,
          by: new Types.ObjectId(userId),
          at: new Date(),
        },
        { statuses: ['approved', 'packing'], session },
      );
    });
  }

  /**
   * Chuyển 1 món sang kiện khác CÙNG đơn (giữ thùng của kiện đích) hoặc tách
   * ra kiện mới (hệ thống chọn thùng tốt nhất còn tồn). Kiện nguồn hết món
   * thì bị bỏ. Mọi kiện bị chạm đều xếp lại + qua validator.
   */
  async moveItem(
    groupId: string,
    parcelNo: number,
    dto: MoveItemDto,
    userId: string,
  ): Promise<PackingPlanDocument> {
    this.assertNote(dto.reason, dto.note);
    const plan = await this.requireEditablePlan(groupId, dto.expected_version);
    const source = this.findParcel(plan, parcelNo);
    if (!source.placements.some((p) => p.item_key === dto.item_key)) {
      throw new AppException(
        PACKING_ERROR_CODES.ITEM_NOT_IN_PARCEL,
        `Món "${dto.item_key}" không nằm trong kiện ${String(parcelNo)}.`,
        HttpStatus.NOT_FOUND,
        { parcelNo, itemKey: dto.item_key },
      );
    }
    const target =
      dto.to_parcel_no === undefined || dto.to_parcel_no === null
        ? null
        : this.findParcel(plan, dto.to_parcel_no);
    if (target && !target.order_id.equals(source.order_id)) {
      throw new AppException(
        PACKING_ERROR_CODES.MOVE_ACROSS_ORDERS,
        'Chỉ chuyển món giữa các kiện của CÙNG một đơn.',
        HttpStatus.BAD_REQUEST,
        { from: parcelNo, to: target.parcel_no },
      );
    }
    if (target?.parcel_no === parcelNo) return plan;

    const materials = await this.materialService.planningData();
    const sourceUnits = await this.unitsOfParcel(groupId, source, plan);
    const moving = sourceUnits.find((u) => u.item_key === dto.item_key);
    if (!moving) throw this.versionConflict(groupId);
    const rest = sourceUnits.filter((u) => u.item_key !== dto.item_key);

    const repack = (units: PackingUnit[], boxes: BoxSpec[], where: string, stock?: Map<string, number>): SolvedParcel => {
      const r = solveOrder(units, boxes, { materials, availability: stock });
      const [one] = r.parcels;
      if (r.status !== 'ok' || r.parcels.length !== 1 || !one) {
        throw new AppException(
          PACKING_ERROR_CODES.BOX_DOES_NOT_FIT,
          `${where} không xếp vừa sau khi chuyển món — thử đổi thùng trước.`,
          HttpStatus.UNPROCESSABLE_ENTITY,
          { parcelNo, itemKey: dto.item_key },
        );
      }
      return one;
    };

    const next: PlanParcel[] = [];
    for (const p of plan.parcels) {
      if (p.parcel_no === source.parcel_no) {
        if (rest.length > 0)
          next.push(
            toPlanParcel(
              repack(rest, [boxSpecOf(p)], `Kiện ${String(p.parcel_no)}`),
              p.order_id,
              p.platform_order_id,
              p.parcel_no,
              fragileKeysOf(rest),
            ),
          );
      } else if (p.parcel_no === target?.parcel_no) {
        const targetUnits = await this.unitsOfParcel(groupId, p, plan);
        next.push(
          toPlanParcel(
            repack([...targetUnits, moving], [boxSpecOf(p)], `Kiện ${String(p.parcel_no)}`),
            p.order_id,
            p.platform_order_id,
            p.parcel_no,
            fragileKeysOf([...targetUnits, moving]),
          ),
        );
      } else {
        next.push(this.plain(p));
      }
    }
    if (!target) {
      const [boxes, availability] = await Promise.all([
        this.boxService.listActiveSpecs(),
        this.boxService.listAvailability({ planId: plan._id }),
      ]);
      // Tồn còn trống sau khi trừ các kiện còn lại của chính kế hoạch này.
      const stock = new Map([...availability].map(([code, a]) => [code, a.available]));
      for (const p of next) stock.set(p.box.code, (stock.get(p.box.code) ?? 0) - 1);
      next.push(
        toPlanParcel(
          repack([moving], boxes, 'Kiện mới', stock),
          source.order_id,
          source.platform_order_id,
          Math.max(...plan.parcels.map((p) => p.parcel_no)) + 1,
          fragileKeysOf([moving]),
        ),
      );
    }

    return this.saveManualEdit(plan, dto.expected_version, next, source.order_id, {
      kind: 'move_item',
      detail: `${dto.item_key}: kiện ${String(parcelNo)} → ${target ? `kiện ${String(target.parcel_no)}` : 'kiện mới'}`,
      skus: [moving.sku],
      box_codes: [source.box.code, ...(target ? [target.box.code] : [])],
      reason: dto.reason,
      note: dto.note?.trim() ? dto.note.trim() : null,
      by: new Types.ObjectId(userId),
      at: new Date(),
    });
  }

  private async saveManualEdit(
    plan: PackingPlanDocument,
    expectedVersion: number,
    parcels: PlanParcel[],
    orderId: Types.ObjectId,
    adjustment: PackingPlan['adjustments'][number],
    opts: { statuses?: PackingPlan['status'][]; session?: ClientSession } = {},
  ): Promise<PackingPlanDocument> {
    const orderIds = plan.orders.map((o) => o.order_id);
    // Chỉnh tay = không còn là lời giải của bộ tối ưu → nhãn heuristic cho đơn đó.
    const orders = plan.orders.map((o) =>
      o.order_id.equals(orderId)
        ? {
            ...this.plain(o),
            proof: 'heuristic' as const,
            cp_sat: 'skipped' as const,
            explanation: [...o.explanation, `Đã chỉnh tay: ${adjustment.detail}.`],
          }
        : this.plain(o),
    );
    const updated = await this.planModel.findOneAndUpdate(
      { _id: plan._id, version: expectedVersion, status: opts.statuses ? { $in: opts.statuses } : 'ready', is_active: true },
      {
        $set: { parcels: renumberParcels(parcels, orderIds), orders },
        $push: { adjustments: adjustment },
        $inc: { version: 1 },
      },
      { returnDocument: 'after', session: opts.session },
    );
    if (!updated) throw this.versionConflict(plan.order_group_id.toString());
    return updated;
  }

  // ------------------------------------------------------------------ hướng dẫn

  async getOrCreateGuide(groupId: string, parcelNo: number, regenerate: boolean): Promise<PackingPlanDocument> {
    const plan = await this.requireActivePlan(groupId);
    const parcel = this.findParcel(plan, parcelNo);
    if (parcel.placements.length === 0) {
      throw new AppException(
        PACKING_ERROR_CODES.GUIDE_NOT_AVAILABLE,
        'Kiện này chưa có cách xếp để hướng dẫn.',
        HttpStatus.CONFLICT,
        { groupId, parcelNo },
      );
    }
    if (parcel.guide && !regenerate) return plan;

    const placements: Placement[] = parcel.placements.map((p) => ({
      item_key: p.item_key,
      sku: p.sku,
      step: p.step,
      x: p.x,
      y: p.y,
      z: p.z,
      dx: p.dx,
      dy: p.dy,
      dz: p.dz,
      orientation: ALL_ORIENTATIONS.includes(p.orientation as Orientation) ? (p.orientation as Orientation) : 'LWH',
      folded: p.folded,
    }));
    let units: PackingUnit[] = [];
    try {
      units = await this.unitsOfParcel(groupId, parcel, plan);
    } catch (error: unknown) {
      this.logger.warn(
        `Không lấy được hồ sơ món cho hướng dẫn (nhóm ${groupId}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const bagCodes = [
      ...new Set(plan.item_profiles.map((p) => p.zip_bag_code).filter((c): c is string => c !== null)),
    ];
    const bagNames = await this.bagService.namesByCode(bagCodes);
    const profiles = new Map(
      plan.item_profiles.map((p) => [
        p.sku,
        {
          product_category: p.product_category,
          zip_bag:
            p.zip_bag_code === null
              ? null
              : { code: p.zip_bag_code, name: bagNames.get(p.zip_bag_code) ?? p.zip_bag_code, folded: p.zip_bag_folded },
        },
      ]),
    );
    const box = boxSpecOf(parcel);
    const guide = await this.guideAi.writeGuide({
      box,
      facts: describePackingSteps(placements, box, units, profiles),
      fill_ratio: parcel.fill_ratio,
      materials: parcel.materials.map((m) => ({ name: m.name, quantity: m.quantity, unit: m.unit })),
    });
    const index = plan.parcels.findIndex((p) => p.parcel_no === parcelNo);
    // Không tăng version: hướng dẫn là lời, không đổi phương án.
    const updated = await this.planModel.findOneAndUpdate(
      { _id: plan._id, version: plan.version, is_active: true },
      {
        $set: {
          [`parcels.${String(index)}.guide`]: {
            source: guide.source,
            model: guide.model,
            fallback_reason: guide.fallback_reason,
            summary: guide.summary,
            steps: guide.steps,
            generated_at: new Date(),
          },
        },
      },
      { returnDocument: 'after' },
    );
    if (!updated) throw this.versionConflict(groupId);
    return updated;
  }

  // ------------------------------------------------------------------ CP-SAT nền

  /** Chạy CP-SAT cho các đơn chờ chứng minh — gọi KHÔNG chờ (fire-and-forget) sau compute. */
  runCpSatInBackground(tasks: CpSatTask[]): void {
    if (tasks.length === 0) return;
    void this.runCpSat(tasks).catch((error: unknown) => {
      this.logger.error(`CP-SAT nền lỗi: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  async runCpSat(tasks: CpSatTask[]): Promise<void> {
    const packer = this.packerConfig();
    const materials = await this.materialService.planningData();
    for (const task of tasks) {
      if (!packer) {
        await this.applyCpSat(task, null);
        continue;
      }
      const upgraded = await upgradeWithCpSat(
        task.result,
        task.units,
        httpCpSatChecker(packer.baseUrl, packer.timeoutMs),
        {
          availability: task.availability,
          materials,
          maxUnits: packer.maxUnits,
          deterministicTimePerCombo: packer.deterministicTimePerCombo,
          wallTimeLimitS: packer.wallTimeLimitS,
        },
      );
      await this.applyCpSat(task, upgraded);
    }
  }

  /**
   * Ghi kết quả CP-SAT của 1 đơn. Đổi KIỆN chỉ khi kế hoạch còn `ready` và
   * chưa ai chỉnh (version không đổi kể từ lần đọc); đã duyệt thì chỉ cập nhật
   * nhãn khi phương án giữ nguyên.
   */
  private async applyCpSat(task: CpSatTask, upgraded: SolveResult | null): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const plan = await this.planModel.findOne({ _id: task.planId, is_active: true, revision: task.revision });
      if (!plan) return;
      const order = plan.orders.find((o) => o.order_id.toString() === task.orderId);
      if (order?.cp_sat !== 'pending') return;

      const changed = upgraded !== null && upgraded.parcels !== task.result.parcels;
      const canReplace = changed && plan.status === 'ready';
      const orders = plan.orders.map((o) => {
        if (o.order_id.toString() !== task.orderId) return this.plain(o);
        if (!upgraded) return { ...this.plain(o), cp_sat: 'unavailable' as const };
        if (changed && !canReplace)
          return {
            ...this.plain(o),
            cp_sat: 'done' as const,
            explanation: [
              ...o.explanation,
              'CP-SAT tìm được phương án tốt hơn sau khi kế hoạch đã duyệt — không tự thay; có thể tính lại nếu cần.',
            ],
          };
        return { ...this.plain(o), cp_sat: 'done' as const, proof: upgraded.proof, explanation: upgraded.explanation };
      });
      const update: Record<string, unknown> = { orders };
      if (canReplace) {
        const orderId = new Types.ObjectId(task.orderId);
        const kept = plan.parcels.filter((p) => !p.order_id.equals(orderId)).map((p) => this.plain(p));
        const fresh = upgraded.parcels.map((p, i) =>
          toPlanParcel(p, orderId, order.platform_order_id, 10_000 + i),
        );
        update.parcels = renumberParcels([...kept, ...fresh], plan.orders.map((o) => o.order_id));
      }
      const res = await this.planModel.updateOne(
        { _id: plan._id, version: plan.version },
        canReplace ? { $set: update, $inc: { version: 1 } } : { $set: update },
      );
      if (res.matchedCount > 0) return;
    }
    this.logger.warn(`Không ghi được kết quả CP-SAT cho đơn ${task.orderId} (kế hoạch đổi liên tục).`);
  }

  // ------------------------------------------------------------------ tiện ích

  private packerConfig(): PackerConfig | null {
    return this.configService.get<PackerConfig | null>('packer.packer', null) ?? null;
  }

  private async requireEditablePlan(groupId: string, expectedVersion: number): Promise<PackingPlanDocument> {
    const plan = await this.requireActivePlan(groupId);
    this.assertStatus(plan, 'ready', 'chỉnh tay');
    if (plan.version !== expectedVersion) throw this.versionConflict(groupId);
    return plan;
  }

  findParcel(plan: PackingPlanDocument, parcelNo: number): PlanParcel {
    const parcel = plan.parcels.find((p) => p.parcel_no === parcelNo);
    if (!parcel) {
      throw new AppException(
        PACKING_ERROR_CODES.PARCEL_NOT_FOUND,
        `Kế hoạch không có kiện ${String(parcelNo)} (có ${String(plan.parcels.length)} kiện).`,
        HttpStatus.NOT_FOUND,
        { parcelNo, parcelCount: plan.parcels.length },
      );
    }
    return parcel;
  }

  /** Món (đúng dạng gốc, đã đệm dễ vỡ) của 1 kiện — dựng lại từ hàng đã lấy của đơn. */
  private async unitsOfParcel(groupId: string, parcel: PlanParcel, plan: PackingPlanDocument): Promise<PackingUnit[]> {
    const allocation = (await this.orderGroupsService.allocatePickedItemsToOrders(groupId)).find(
      (a) => a.order_id === parcel.order_id.toString(),
    );
    const keys = new Set(parcel.placements.map((p) => p.item_key));
    const units = allocation
      ? expandToUnits(allocation.items, unitOptionsOf(plan)).filter((u) => keys.has(u.item_key))
      : [];
    if (units.length !== keys.size) throw this.versionConflict(groupId);
    return units;
  }

  private async assertBoxInStock(plan: PackingPlanDocument, code: string, parcelNo: number, extraNeeded = 0): Promise<void> {
    const stock = (await this.boxService.listAvailability({ planId: plan._id })).get(code);
    const usedByOthers = plan.parcels.filter((p) => p.parcel_no !== parcelNo && p.box.code === code).length;
    if (!stock || stock.available - usedByOthers - extraNeeded <= 0) {
      throw new AppException(
        'PKG_BOX_OUT_OF_STOCK',
        `Kho không còn thùng "${code}" trống (tồn ${String(stock?.onHand ?? 0)}, đang giữ chỗ ${String(stock?.reserved ?? 0)}).`,
        HttpStatus.CONFLICT,
        { boxCode: code },
      );
    }
  }

  private assertStatus(plan: PackingPlanDocument, expected: PackingPlan['status'], action: string): void {
    if (plan.status !== expected) throw this.wrongStatus(plan.order_group_id.toString(), plan.status, action);
  }

  private assertNote(reason: string, note: string | undefined): void {
    if (reason === 'OTHER' && !note?.trim()) {
      throw new AppException(
        PACKING_ERROR_CODES.NOTE_REQUIRED,
        'Chọn lý do "Khác" thì phải ghi chú cụ thể.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  wrongStatus(groupId: string, status: string, action: string): AppException {
    return new AppException(
      PACKING_ERROR_CODES.WRONG_PLAN_STATUS,
      `Không thể ${action} khi kế hoạch đang ở trạng thái "${status}".`,
      HttpStatus.CONFLICT,
      { groupId, status },
    );
  }

  versionConflict(groupId: string): AppException {
    return new AppException(
      PACKING_ERROR_CODES.VERSION_CONFLICT,
      'Kế hoạch đóng gói vừa được thay đổi — tải lại dữ liệu mới nhất rồi thử lại.',
      HttpStatus.CONFLICT,
      { groupId },
    );
  }

  /** Bản sao thuần (không phải subdocument Mongoose) để ghi lại an toàn. */
  private plain<T>(value: T): Plain<T> {
    const v = value as unknown as { toObject?: () => Plain<T> };
    return typeof v.toObject === 'function' ? v.toObject() : (value);
  }

  private objectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException(
        PACKING_ERROR_CODES.INVALID_ID,
        `"${id}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { id },
      );
    }
    return new Types.ObjectId(id);
  }

  private isDuplicateKey(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;
  }

  private async runInTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(() => work(session));
    } finally {
      await session.endSession();
    }
  }

  // ------------------------------------------------------------------ thông báo (best-effort)

  private async safeNotify(params: Parameters<NotificationsService['notify']>[0]): Promise<void> {
    try {
      await this.notificationsService.notify(params);
    } catch (error: unknown) {
      this.logger.error(`Gửi thông báo thất bại: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async notifyPendingPlan(groupId: string, plan: PackingPlanDocument): Promise<void> {
    const blocked = plan.orders.filter((o) => o.status !== 'ok').length;
    const boxSummary =
      blocked === 0
        ? `${String(plan.orders.length)} đơn, ${String(plan.parcels.length)} kiện`
        : `${String(plan.orders.length)} đơn, trong đó ${String(blocked)} đơn chưa xếp hết món`;
    const { title, message } = this.notificationsService.buildPendingPackagingPlanMessage({ groupId, boxSummary });
    await this.safeNotify({
      recipientRole: UserRole.PACKAGING_STAFF,
      type: NotificationType.PENDING_APPROVAL,
      severity: 'info',
      title,
      message,
      relatedEntityType: 'order_group',
      relatedEntityId: groupId,
    });
  }

  private async notifyRejected(groupId: string, reason: string, ownerId: string | null, dueAt: Date): Promise<void> {
    const base = this.notificationsService.buildPackagingRejectedMessage({ groupId, reason });
    const common = {
      type: NotificationType.PACKAGING_REJECTED,
      severity: 'warning' as const,
      title: base.title,
      message: `${base.message} Hạn xử lý: ${dueAt.toLocaleString('vi-VN')}.`,
      relatedEntityType: 'order_group',
      relatedEntityId: groupId,
    };
    if (ownerId) {
      await this.safeNotify({ ...common, recipientUserId: ownerId });
      return;
    }
    await this.safeNotify({ ...common, recipientRole: UserRole.ADMIN });
    await this.safeNotify({ ...common, recipientRole: UserRole.STORE_OWNER });
  }
}
