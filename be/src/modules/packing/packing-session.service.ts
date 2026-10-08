import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { UserRole } from '../../common/enums/user-role.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { OrderGroupsService } from '../order-groups/order-groups.service';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import { PackagingBoxService, type ConsumedBox } from '../packaging/packaging-box.service';
import {
  PackagingMaterialService,
  type ConsumedMaterial,
  type MaterialShortfall,
} from '../packaging/packaging-material.service';
import { PackagingMaterialsService } from '../packaging-materials/packaging-materials.service';
import {
  MarketplaceSkuMapping,
  MarketplaceSkuMappingDocument,
} from '../master-skus/schemas/marketplace-sku-mapping.schema';
import { resolveMasterSkus } from '../master-skus/stock-key.util';
import {
  PackingPlan,
  PackingPlanDocument,
  type PlanParcel,
  type PlanScan,
} from './schemas/packing-plan.schema';
import { PACKING_ERROR_CODES } from './packing.errors';
import { PackingPlanService } from './packing-plan.service';
import { PackingSettingsService, type ActivePackingSettings } from './packing-settings.service';
import { isLiveParcel, type Plain } from './utils/parcels.util';
import type { PackPlanDto } from './dto/packing-plan.dto';
import type {
  UnsealParcelDto,
  ReportIssueDto,
  ReviewParcelDto,
  ScanItemDto,
  SealParcelDto,
  UnpackParcelDto,
  UnscanItemDto,
} from './dto/packing-session.dto';

type ParcelData = Plain<PlanParcel>;
type PlanData = Omit<Plain<PackingPlan>, 'parcels'> & { _id: Types.ObjectId; parcels: ParcelData[] };

export interface ScanOutcome {
  parcelNo: number;
  sku: string;
  itemKeys: string[];
  /** Món của kiện còn chưa quét. */
  remainingInParcel: number;
  /** Gửi lại cùng client_event_id — không đếm thêm. */
  duplicate: boolean;
}

export interface SessionResult {
  plan: PackingPlanDocument;
  /** true = vừa chuyển cả kế hoạch + nhóm sang packed (controller báo Lazada). */
  completed: boolean;
}

/** Trạng thái kế hoạch cho phép làm việc với kiện. */
const SESSION_STATUSES = ['approved', 'packing'];

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * ===================================================================
 * Phiên đóng gói (05/10/2026)
 * ===================================================================
 * Trước đây "đóng gói" chỉ là 1 lần gửi cân cho cả nhóm, kiện lệch cân vẫn
 * thành packed ngay và không ai kiểm món nào đã vào thùng nào. Giờ:
 *   approved ──start/quét──► packing ──(mọi kiện còn giao đều sealed)──► packed
 * Mỗi kiện: pending (quét từng món, sai kiện/thừa bị chặn) → niêm phong + cân
 * (trừ thùng + vật tư ĐÚNG lúc này) → sealed, hoặc held khi lệch cân quá ngưỡng
 * → người KHÁC người niêm phong xem lại (chấp nhận / cân lại / mở ra đóng lại).
 * Nhóm đơn vẫn ở approved_for_packing trong suốt phiên, sang packed cùng
 * transaction với kiện cuối cùng. POST pack (lối tắt) vẫn giữ: tự ghi quét
 * `bypass` rồi niêm phong mọi kiện còn lại theo cùng luật cân.
 * ===================================================================
 */
@Injectable()
export class PackingSessionService {
  private readonly logger = new Logger(PackingSessionService.name);

  constructor(
    @InjectModel(PackingPlan.name) private readonly planModel: Model<PackingPlanDocument>,
    @InjectModel(MarketplaceSkuMapping.name) private readonly mappingModel: Model<MarketplaceSkuMappingDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly planService: PackingPlanService,
    private readonly orderGroupsService: OrderGroupsService,
    private readonly boxService: PackagingBoxService,
    private readonly materialService: PackagingMaterialService,
    private readonly materialsService: PackagingMaterialsService,
    private readonly settingsService: PackingSettingsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ------------------------------------------------------------------ bắt đầu / hoàn tất

  async start(groupId: string, expectedVersion: number, userId: string): Promise<PackingPlanDocument> {
    await this.orderGroupsService.assertHasActiveOrders(groupId);
    const plan = await this.planService.requireActivePlan(groupId);
    if (plan.status === 'packing') return plan; // bấm lại — không lỗi
    this.assertSession(plan, 'bắt đầu đóng');
    if (plan.version !== expectedVersion) throw this.planService.versionConflict(groupId);
    return this.save(plan, { ...this.startFields(plan, userId), activity: [...this.data(plan).activity, this.activity('start', userId, 'Bắt đầu đóng gói')] });
  }

  /**
   * Hoàn tất thủ công: dùng khi các kiện còn lại đều đã niêm phong nhưng kế hoạch
   * chưa tự sang packed (vd đơn cuối cùng còn kiện chưa đóng vừa bị hủy).
   */
  async finish(groupId: string, expectedVersion: number, userId: string): Promise<SessionResult> {
    const plan = await this.planService.requireActivePlan(groupId);
    if (plan.status !== 'packing') throw this.planService.wrongStatus(groupId, plan.status, 'hoàn tất đóng gói');
    if (plan.version !== expectedVersion) throw this.planService.versionConflict(groupId);
    const result = await this.runInTransaction((session) => this.finalizeIfComplete(plan, userId, session));
    if (!result) {
      const open = plan.parcels.filter((p) => isLiveParcel(p) && p.status !== 'sealed');
      throw new AppException(
        PACKING_ERROR_CODES.NOT_COMPLETE,
        open.length > 0
          ? `Còn ${String(open.length)} kiện chưa niêm phong hoặc đang chờ xem lại.`
          : 'Kế hoạch không còn kiện nào để giao.',
        HttpStatus.CONFLICT,
        { groupId, parcels: open.map((p) => ({ parcelNo: p.parcel_no, status: p.status })) },
      );
    }
    return { plan: result, completed: true };
  }

  // ------------------------------------------------------------------ quét món

  async scan(groupId: string, parcelNo: number, dto: ScanItemDto, userId: string): Promise<{ plan: PackingPlanDocument; scan: ScanOutcome }> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const plan = await this.planService.requireActivePlan(groupId);
      this.assertSession(plan, 'quét món');
      const data = this.data(plan);

      if (dto.client_event_id) {
        for (const p of data.parcels) {
          const hits = p.scans.filter((s) => s.client_event_id === dto.client_event_id);
          if (hits.length > 0) {
            return {
              plan,
              scan: {
                parcelNo: p.parcel_no,
                sku: hits[0]?.sku ?? '',
                itemKeys: hits.map((h) => h.item_key),
                remainingInParcel: this.unscanned(p).length,
                duplicate: true,
              },
            };
          }
        }
      }

      const parcel = this.parcelOf(data, parcelNo);
      if (parcel.status !== 'pending') throw this.parcelWrongStatus(groupId, parcel, 'quét món');
      const sku = await this.resolveScannedSku(groupId, data, dto.code);
      if (!parcel.placements.some((p) => p.sku === sku)) {
        const belongs = data.parcels
          .filter((p) => isLiveParcel(p) && p.placements.some((q) => q.sku === sku))
          .map((p) => p.parcel_no);
        throw new AppException(
          PACKING_ERROR_CODES.SCAN_WRONG_PARCEL,
          `Món "${sku}" không thuộc kiện ${String(parcelNo)}${belongs.length > 0 ? ` — món này của kiện ${belongs.join(', ')}` : ''}.`,
          HttpStatus.CONFLICT,
          { parcelNo, sku, belongsToParcels: belongs },
        );
      }
      const quantity = dto.quantity ?? 1;
      const open = this.unscanned(parcel).filter((p) => p.sku === sku);
      if (open.length < quantity) {
        throw new AppException(
          PACKING_ERROR_CODES.SCAN_OVER,
          `Kiện ${String(parcelNo)} chỉ còn ${String(open.length)} món "${sku}" chưa quét — không quét thêm ${String(quantity)}.`,
          HttpStatus.CONFLICT,
          { parcelNo, sku, remaining: open.length, requested: quantity },
        );
      }
      const now = new Date();
      const scans: PlanScan[] = open.slice(0, quantity).map((p) => ({
        item_key: p.item_key,
        sku,
        method: dto.scan_method,
        by: new Types.ObjectId(userId),
        at: now,
        client_event_id: dto.client_event_id ?? null,
      }));
      const parcels = data.parcels.map((p) => (p.parcel_no === parcelNo ? { ...p, scans: [...p.scans, ...scans] } : p));
      const updated = await this.planModel.findOneAndUpdate(
        { _id: plan._id, version: plan.version, is_active: true },
        { $set: { parcels, ...this.startFields(plan, userId) }, $inc: { version: 1 } },
        { returnDocument: 'after' },
      );
      if (!updated) continue; // quét đồng thời → đọc lại, kiểm tra lại
      return {
        plan: updated,
        scan: {
          parcelNo,
          sku,
          itemKeys: scans.map((s) => s.item_key),
          remainingInParcel: this.unscanned(parcel).length - scans.length,
          duplicate: false,
        },
      };
    }
    throw this.planService.versionConflict(groupId);
  }

  async unscan(groupId: string, parcelNo: number, dto: UnscanItemDto, userId: string): Promise<PackingPlanDocument> {
    const plan = await this.planService.requireActivePlan(groupId);
    this.assertSession(plan, 'gỡ lần quét');
    if (plan.version !== dto.expected_version) throw this.planService.versionConflict(groupId);
    const data = this.data(plan);
    const parcel = this.parcelOf(data, parcelNo);
    if (parcel.status !== 'pending') throw this.parcelWrongStatus(groupId, parcel, 'gỡ lần quét');
    if (!parcel.scans.some((s) => s.item_key === dto.item_key)) {
      throw new AppException(
        PACKING_ERROR_CODES.SCAN_NOT_FOUND,
        `Kiện ${String(parcelNo)} chưa quét món "${dto.item_key}".`,
        HttpStatus.NOT_FOUND,
        { parcelNo, itemKey: dto.item_key },
      );
    }
    const parcels = data.parcels.map((p) =>
      p.parcel_no === parcelNo ? { ...p, scans: p.scans.filter((s) => s.item_key !== dto.item_key) } : p,
    );
    return this.save(plan, {
      parcels,
      activity: [
        ...data.activity,
        this.activity('unscan', userId, `Gỡ lần quét ${dto.item_key}`, parcelNo, dto.reason.trim()),
      ],
    });
  }

  // ------------------------------------------------------------------ niêm phong + cân

  async seal(groupId: string, parcelNo: number, dto: SealParcelDto, userId: string): Promise<SessionResult> {
    await this.orderGroupsService.assertHasActiveOrders(groupId);
    const plan = await this.planService.requireActivePlan(groupId);
    this.assertSession(plan, 'niêm phong kiện');
    if (plan.version !== dto.expected_version) throw this.planService.versionConflict(groupId);
    const data = this.data(plan);
    const parcel = this.parcelOf(data, parcelNo);
    if (parcel.status !== 'pending') throw this.parcelWrongStatus(groupId, parcel, 'niêm phong');
    const missing = this.unscanned(parcel);
    if (missing.length > 0) {
      throw new AppException(
        PACKING_ERROR_CODES.PARCEL_NOT_FULLY_SCANNED,
        `Kiện ${String(parcelNo)} còn ${String(missing.length)} món chưa quét — quét đủ trước khi niêm phong.`,
        HttpStatus.CONFLICT,
        { parcelNo, missing: missing.map((p) => ({ itemKey: p.item_key, sku: p.sku })) },
      );
    }
    const settings = await this.settingsService.get();
    return this.sealParcels(plan, new Map([[parcelNo, dto.weight_kg]]), settings, userId, false);
  }

  /**
   * Lối tắt (giữ từ trước): cân cho ĐỦ các kiện chưa niêm phong trong 1 lần — tự
   * ghi quét `bypass` cho món chưa quét. Kiện lệch cân vẫn bị GIỮ (không còn
   * thành packed ngay như trước 05/10/2026).
   */
  async quickPack(groupId: string, dto: PackPlanDto, userId: string): Promise<SessionResult> {
    await this.orderGroupsService.assertHasActiveOrders(groupId);
    const plan = await this.planService.requireActivePlan(groupId);
    this.assertSession(plan, 'xác nhận đóng gói');
    if (plan.version !== dto.expected_version) throw this.planService.versionConflict(groupId);
    const settings = await this.settingsService.get();
    if (settings.requireScan) {
      throw new AppException(
        PACKING_ERROR_CODES.SCAN_REQUIRED,
        'Cài đặt đóng gói đang bắt buộc quét từng món — dùng quét + niêm phong từng kiện.',
        HttpStatus.CONFLICT,
        { groupId },
      );
    }
    const pending = this.data(plan).parcels.filter((p) => p.status === 'pending');
    const weights = new Map<number, number>();
    for (const w of dto.parcels) {
      if (!pending.some((p) => p.parcel_no === w.parcel_no) || weights.has(w.parcel_no)) {
        throw new AppException(
          PACKING_ERROR_CODES.PACK_WEIGHTS_MISMATCH,
          `Kiện ${String(w.parcel_no)} không phải kiện đang chờ niêm phong hoặc bị gửi cân hai lần.`,
          HttpStatus.BAD_REQUEST,
          { parcelNo: w.parcel_no, pending: pending.map((p) => p.parcel_no) },
        );
      }
      weights.set(w.parcel_no, w.weight_kg);
    }
    if (weights.size !== pending.length) {
      throw new AppException(
        PACKING_ERROR_CODES.PACK_WEIGHTS_MISMATCH,
        `Cần cân cho đủ ${String(pending.length)} kiện chưa niêm phong, mới có ${String(weights.size)}.`,
        HttpStatus.BAD_REQUEST,
        { expected: pending.length, received: weights.size, pending: pending.map((p) => p.parcel_no) },
      );
    }
    return this.sealParcels(plan, weights, settings, userId, true);
  }

  private async sealParcels(
    plan: PackingPlanDocument,
    weights: Map<number, number>,
    settings: ActivePackingSettings,
    userId: string,
    bypassScan: boolean,
  ): Promise<SessionResult> {
    const groupId = plan.order_group_id.toString();
    const data = this.data(plan);
    const by = new Types.ObjectId(userId);
    const now = new Date();
    const targets = data.parcels.filter((p) => weights.has(p.parcel_no));
    const allowReused = (p: ParcelData): boolean => !(p.has_fragile && !settings.allowReusedBoxForFragile);

    let consumed: ConsumedBox[] = [];
    let consumedMaterials: ConsumedMaterial[] = [];
    let shortfalls: MaterialShortfall[] = [];
    const outcome = await this.runInTransaction(async (session) => {
      const toConsume = targets.filter((p) => !p.box_consumed);
      consumed = await this.boxService.consumeForPack(
        session,
        toConsume.map((p) => ({ boxCode: p.box.code, planId: plan._id, parcelNo: p.parcel_no, allowReused: allowReused(p) })),
        plan.order_group_id,
        userId,
      );
      const materialResult = await this.materialService.consumeForPack(
        session,
        toConsume.flatMap((p) =>
          p.materials.flatMap((m) =>
            m.code === null ? [] : [{ code: m.code, quantity: m.quantity, planId: plan._id, parcelNo: p.parcel_no }],
          ),
        ),
        plan.order_group_id,
        userId,
      );
      consumedMaterials = materialResult.consumed;
      shortfalls = materialResult.shortfalls;

      const parcels = data.parcels.map((p): ParcelData => {
        const weight = weights.get(p.parcel_no);
        if (weight === undefined) return p;
        const abnormal = this.isAbnormal(p.estimated_weight_g, weight, settings.abnormalWeightThreshold);
        const scanned = new Set(p.scans.map((s) => s.item_key));
        const bypass: PlanScan[] = bypassScan
          ? p.placements
              .filter((q) => !scanned.has(q.item_key))
              .map((q) => ({ item_key: q.item_key, sku: q.sku, method: 'bypass', by, at: now, client_event_id: null }))
          : [];
        return {
          ...p,
          scans: [...p.scans, ...bypass],
          status: abnormal ? 'held' : 'sealed',
          box_consumed: true,
          sealed_by: by,
          sealed_at: now,
          actual_weight_kg: weight,
          is_abnormal: abnormal,
          weighings: [...p.weighings, { weight_kg: weight, kind: 'seal', is_abnormal: abnormal, by, at: now }],
          materials_shortfall: p.box_consumed
            ? p.materials_shortfall
            : shortfalls.filter((s) => s.parcelNo === p.parcel_no).map((s) => ({ code: s.code, missing: s.missing })),
        };
      });
      const updated = await this.planModel.findOneAndUpdate(
        { _id: plan._id, version: plan.version, is_active: true },
        { $set: { parcels, ...this.startFields(plan, userId) }, $inc: { version: 1 } },
        { session, returnDocument: 'after' },
      );
      if (!updated) throw this.planService.versionConflict(groupId);
      const finalized = await this.finalizeIfComplete(updated, userId, session);
      return { plan: finalized ?? updated, completed: finalized !== null };
    });

    for (const p of outcome.plan.parcels.filter((x) => weights.has(x.parcel_no) && x.status === 'held'))
      await this.notifyHeld(groupId, p, settings.abnormalWeightThreshold);
    await this.notifyStock(consumed, consumedMaterials, shortfalls);
    return outcome;
  }

  // ------------------------------------------------------------------ kiện lệch cân

  async review(groupId: string, parcelNo: number, dto: ReviewParcelDto, userId: string): Promise<SessionResult> {
    if (dto.reason === 'OTHER' && !dto.note?.trim()) {
      throw new AppException(PACKING_ERROR_CODES.NOTE_REQUIRED, 'Chọn lý do "Khác" thì phải ghi chú cụ thể.', HttpStatus.BAD_REQUEST);
    }
    const plan = await this.planService.requireActivePlan(groupId);
    if (plan.status !== 'packing') throw this.planService.wrongStatus(groupId, plan.status, 'xem lại kiện');
    if (plan.version !== dto.expected_version) throw this.planService.versionConflict(groupId);
    const data = this.data(plan);
    const parcel = this.parcelOf(data, parcelNo);
    if (parcel.status !== 'held') throw this.parcelWrongStatus(groupId, parcel, 'xem lại');
    if (dto.action === 'accept' && parcel.sealed_by?.toString() === userId) {
      throw new AppException(
        PACKING_ERROR_CODES.SELF_REVIEW_FORBIDDEN,
        'Không tự chấp nhận kiện chính mình vừa niêm phong — nhờ Packaging Staff khác hoặc Admin xem lại.',
        HttpStatus.FORBIDDEN,
        { parcelNo },
      );
    }
    if (dto.action === 'reweigh' && dto.weight_kg === undefined) {
      throw new AppException(PACKING_ERROR_CODES.WEIGHT_REQUIRED, 'Cân lại phải gửi weight_kg.', HttpStatus.BAD_REQUEST);
    }
    const settings = await this.settingsService.get();
    const by = new Types.ObjectId(userId);
    const now = new Date();
    const review = { action: dto.action, reason: dto.reason, note: dto.note?.trim() ? dto.note.trim() : null, by, at: now };

    let next: ParcelData;
    if (dto.action === 'accept') {
      next = { ...parcel, status: 'sealed', reviews: [...parcel.reviews, review] };
    } else if (dto.action === 'reweigh') {
      const weight = dto.weight_kg ?? 0;
      const abnormal = this.isAbnormal(parcel.estimated_weight_g, weight, settings.abnormalWeightThreshold);
      next = {
        ...parcel,
        status: abnormal ? 'held' : 'sealed',
        actual_weight_kg: weight,
        is_abnormal: abnormal,
        weighings: [...parcel.weighings, { weight_kg: weight, kind: 'reweigh', is_abnormal: abnormal, by, at: now }],
        reviews: [...parcel.reviews, review],
      };
    } else {
      // Mở ra đóng lại: thùng đã trừ tồn từ lần niêm phong trước — box_consumed giữ true.
      next = {
        ...parcel,
        status: 'pending',
        actual_weight_kg: null,
        is_abnormal: false,
        sealed_by: null,
        sealed_at: null,
        scans: dto.rescan === true ? [] : parcel.scans,
        reviews: [...parcel.reviews, review],
      };
    }
    const parcels = data.parcels.map((p) => (p.parcel_no === parcelNo ? next : p));
    return this.runInTransaction(async (session) => {
      const updated = await this.planModel.findOneAndUpdate(
        { _id: plan._id, version: plan.version, is_active: true },
        { $set: { parcels }, $inc: { version: 1 } },
        { session, returnDocument: 'after' },
      );
      if (!updated) throw this.planService.versionConflict(groupId);
      const finalized = await this.finalizeIfComplete(updated, userId, session);
      return { plan: finalized ?? updated, completed: finalized !== null };
    });
  }

  // ------------------------------------------------------------------ hoàn tác niêm phong (08/10/2026)

  /**
   * Mở lại 1 kiện đã niêm phong (sealed/held) để đóng lại. Kế hoạch còn `packing`:
   * nhân viên đóng gói làm được. Nhóm đã `packed` (chưa giao): chỉ Admin/Store
   * Owner — kế hoạch về `packing`, nhóm về `approved_for_packing`. Đã giao thì
   * không hoàn tác (409). Thùng `reusable` → đóng lại bằng chính thùng, không
   * trừ tồn lần 2; `damaged` → thùng + vật tư lần trước coi như mất (đã trừ lúc
   * niêm phong), niêm phong lại sẽ trừ cái mới, ghi hao hụt cho báo cáo.
   * Lazada không có API hoàn tác Pack — controller trả cảnh báo.
   */
  async unseal(
    groupId: string,
    parcelNo: number,
    dto: UnsealParcelDto,
    userId: string,
    role: UserRole,
  ): Promise<{ plan: PackingPlanDocument; wasPacked: boolean }> {
    if (dto.reason === 'OTHER' && !dto.note?.trim()) {
      throw new AppException(PACKING_ERROR_CODES.NOTE_REQUIRED, 'Chọn lý do "Khác" thì phải ghi chú cụ thể.', HttpStatus.BAD_REQUEST);
    }
    const plan = await this.planService.requireActivePlan(groupId);
    if (plan.status !== 'packing' && plan.status !== 'packed') {
      throw this.planService.wrongStatus(groupId, plan.status, 'hoàn tác niêm phong');
    }
    const wasPacked = plan.status === 'packed';
    if (wasPacked && role !== UserRole.ADMIN && role !== UserRole.STORE_OWNER) {
      throw new AppException(
        PACKING_ERROR_CODES.UNSEAL_NOT_ALLOWED,
        'Nhóm đã đóng xong — chỉ Admin hoặc Store Owner được hoàn tác niêm phong.',
        HttpStatus.FORBIDDEN,
        { groupId },
      );
    }
    if (plan.version !== dto.expected_version) throw this.planService.versionConflict(groupId);
    const data = this.data(plan);
    const parcel = this.parcelOf(data, parcelNo);
    if (parcel.status !== 'sealed' && parcel.status !== 'held') {
      throw this.parcelWrongStatus(groupId, parcel, 'hoàn tác niêm phong (chỉ kiện đã niêm phong hoặc đang bị giữ)');
    }
    const group = await this.orderGroupsService.findOrderGroupById(groupId);
    const expectedGroup = wasPacked ? GroupFulfillmentStatus.PACKED : GroupFulfillmentStatus.APPROVED_FOR_PACKING;
    if (group.fulfillment_status !== expectedGroup) {
      throw this.planService.wrongStatus(groupId, group.fulfillment_status, 'hoàn tác niêm phong');
    }

    const damaged = dto.box_condition === 'damaged';
    const now = new Date();
    const by = new Types.ObjectId(userId);
    const next: ParcelData = {
      ...parcel,
      status: 'pending',
      actual_weight_kg: null,
      is_abnormal: false,
      sealed_by: null,
      sealed_at: null,
      scans: dto.rescan === true ? [] : parcel.scans,
      // Thùng hỏng: lần niêm phong trước đã trừ thùng + vật tư → mất; đóng lại phải trừ cái mới.
      box_consumed: damaged ? false : parcel.box_consumed,
      materials_shortfall: damaged ? [] : parcel.materials_shortfall,
    };
    const parcels = data.parcels.map((p) => (p.parcel_no === parcelNo ? next : p));
    const adjustment = {
      kind: 'unseal' as const,
      detail: `Kiện ${String(parcelNo)}: hoàn tác niêm phong (thùng ${parcel.box.code}: ${damaged ? 'hỏng, ghi hao hụt' : 'còn tốt, dùng lại'})`,
      skus: [...new Set(parcel.placements.map((p) => p.sku))],
      box_codes: [parcel.box.code],
      old_box_outcome: damaged ? ('damaged' as const) : ('unused' as const),
      waste_cost_vnd: damaged ? (parcel.box.price_vnd ?? 0) : 0,
      reason: dto.reason,
      note: dto.note?.trim() ? dto.note.trim() : null,
      by,
      at: now,
    };
    const updated = await this.runInTransaction(async (session) => {
      const res = await this.planModel.findOneAndUpdate(
        { _id: plan._id, version: plan.version, is_active: true, status: plan.status },
        {
          $set: wasPacked
            ? { parcels, status: 'packing', packed_by: null, packed_at: null, pack_mode: null }
            : { parcels },
          $push: {
            adjustments: adjustment,
            activity: this.activity('unseal', userId, `Hoàn tác niêm phong kiện ${String(parcelNo)}`, parcelNo, dto.reason),
          },
          $inc: { version: 1 },
        },
        { session, returnDocument: 'after' },
      );
      if (!res) throw this.planService.versionConflict(groupId);
      if (wasPacked) {
        await this.orderGroupsService.transitionFulfillmentStatus(
          groupId,
          GroupFulfillmentStatus.APPROVED_FOR_PACKING,
          group.__v,
          session,
        );
      }
      return res;
    });
    return { plan: updated, wasPacked };
  }

  // ------------------------------------------------------------------ sự cố lúc đóng

  async reportIssue(groupId: string, dto: ReportIssueDto, userId: string): Promise<PackingPlanDocument> {
    const plan = await this.planService.requireActivePlan(groupId);
    this.assertSession(plan, 'báo sự cố');
    if (plan.version !== dto.expected_version) throw this.planService.versionConflict(groupId);
    const data = this.data(plan);
    const parcel = this.parcelOf(data, dto.parcel_no);
    if (parcel.status !== 'pending') throw this.parcelWrongStatus(groupId, parcel, 'báo sự cố (mở kiện ra trước)');
    const placement = parcel.placements.find((p) => p.item_key === dto.item_key);
    if (!placement) {
      throw new AppException(
        PACKING_ERROR_CODES.ITEM_NOT_IN_PARCEL,
        `Món "${dto.item_key}" không nằm trong kiện ${String(dto.parcel_no)}.`,
        HttpStatus.NOT_FOUND,
        { parcelNo: dto.parcel_no, itemKey: dto.item_key },
      );
    }
    const by = new Types.ObjectId(userId);
    const note = dto.note?.trim() ? dto.note.trim() : null;
    const issueNote = `Sự cố lúc đóng (${dto.issue}) — ${placement.item_key}${note ? `: ${note}` : ''}`;

    if (dto.resolution === 'replace') {
      if (!dto.warehouse_id) {
        throw new AppException(
          PACKING_ERROR_CODES.REPLACEMENT_WAREHOUSE_REQUIRED,
          'Lấy món thay cần warehouse_id (kho lấy hàng).',
          HttpStatus.BAD_REQUEST,
        );
      }
      const warehouseId = dto.warehouse_id;
      const updated = await this.runInTransaction(async (session) => {
        // Món cũ bị loại (không trả kệ) rồi lấy món thay: "đã lấy" của lượt giữ nguyên.
        await this.orderGroupsService.adjustPickedUnits(groupId, [{ sku: placement.sku, quantity: 1 }], {
          restock: false,
          kind: 'pack_issue',
          note: issueNote,
          actorId: userId,
          session,
        });
        await this.orderGroupsService.takeReplacementUnit(
          groupId,
          placement.sku,
          warehouseId,
          dto.bin_location_id,
          userId,
          session,
        );
        const parcels = data.parcels.map((p) =>
          p.parcel_no === dto.parcel_no ? { ...p, scans: p.scans.filter((s) => s.item_key !== dto.item_key) } : p,
        );
        const doc = await this.planModel.findOneAndUpdate(
          { _id: plan._id, version: plan.version, is_active: true },
          {
            $set: {
              parcels,
              issues: [
                ...data.issues,
                { parcel_no: dto.parcel_no, item_key: dto.item_key, sku: placement.sku, issue: dto.issue, resolution: 'replaced', note, by, at: new Date() },
              ],
            },
            $inc: { version: 1 },
          },
          { session, returnDocument: 'after' },
        );
        if (!doc) throw this.planService.versionConflict(groupId);
        return doc;
      });
      await this.notifyIssue(groupId, placement.sku, dto.issue, 'đã lấy món thay từ kệ', [UserRole.STORE_OWNER]);
      return updated;
    }

    // Trả về lấy hàng: chỉ khi chưa có kiện nào trừ thùng (đã niêm phong) — không thì phải lấy món thay.
    if (data.parcels.some((p) => p.box_consumed)) {
      throw new AppException(
        PACKING_ERROR_CODES.ISSUE_HAS_SEALED_PARCELS,
        'Đã có kiện niêm phong — không trả cả nhóm về lấy hàng được. Lấy món thay từ kệ (resolution = replace).',
        HttpStatus.CONFLICT,
        { groupId },
      );
    }
    const superseded = await this.runInTransaction(async (session) => {
      await this.orderGroupsService.adjustPickedUnits(groupId, [{ sku: placement.sku, quantity: 1 }], {
        restock: false,
        kind: 'pack_issue',
        note: issueNote,
        actorId: userId,
        session,
      });
      const doc = await this.planModel.findOneAndUpdate(
        { _id: plan._id, version: plan.version, is_active: true },
        {
          $set: {
            is_active: false,
            status: 'superseded',
            issues: [
              ...data.issues,
              { parcel_no: dto.parcel_no, item_key: dto.item_key, sku: placement.sku, issue: dto.issue, resolution: 'back_to_picking', note, by, at: new Date() },
            ],
          },
          $inc: { version: 1 },
        },
        { session, returnDocument: 'after' },
      );
      if (!doc) throw this.planService.versionConflict(groupId);
      const group = await this.orderGroupsService.findOrderGroupById(groupId);
      await this.orderGroupsService.transitionFulfillmentStatus(groupId, GroupFulfillmentStatus.PICKING, group.__v, session);
      return doc;
    });
    await this.orderGroupsService.reconcileReservation(groupId);
    await this.notifyIssue(groupId, placement.sku, dto.issue, 'nhóm đơn quay lại bước lấy hàng để lấy món thay', [
      UserRole.WAREHOUSE_STAFF,
      UserRole.STORE_OWNER,
    ]);
    return superseded;
  }

  // ------------------------------------------------------------------ tháo kiện (đơn hủy sau khi đóng)

  async unpack(
    groupId: string,
    parcelNo: number,
    dto: UnpackParcelDto,
    userId: string,
  ): Promise<{
    plan: PackingPlanDocument;
    completed: boolean;
    restocked: number;
    withoutLocation: number;
    box: string;
    materials: { code: string; quantity: number; outcome: string }[];
  }> {
    const plan = await this.planService.requireActivePlan(groupId);
    if (plan.version !== dto.expected_version) throw this.planService.versionConflict(groupId);
    const data = this.data(plan);
    const parcel = this.parcelOf(data, parcelNo);
    if (parcel.status !== 'to_unpack') throw this.parcelWrongStatus(groupId, parcel, 'tháo kiện');
    const recovered = this.validateRecoveredMaterials(parcel, dto.recovered_materials ?? []);
    const counts = new Map<string, number>();
    for (const p of parcel.placements) counts.set(p.sku, (counts.get(p.sku) ?? 0) + 1);
    const now = new Date();
    const note = dto.note?.trim() ? dto.note.trim() : null;

    let restocked = 0;
    let withoutLocation = 0;
    let box = 'not_consumed';
    let materials: { code: string; quantity: number; outcome: 'reused' | 'discarded' | 'unknown' }[] = [];
    const outcome = await this.runInTransaction(async (session) => {
      const adjusted = await this.orderGroupsService.adjustPickedUnits(
        groupId,
        [...counts].map(([sku, quantity]) => ({ sku, quantity })),
        { restock: true, kind: 'unpack', note: `Tháo kiện ${String(parcelNo)} (đơn hủy sau khi đóng)`, actorId: userId, session },
      );
      restocked = adjusted.restocked;
      withoutLocation = adjusted.withoutLocation;
      if (parcel.box_consumed) {
        const results = await this.materialsService.recoverFromUnpack(
          [
            { code: parcel.box.code, quantity: 1, condition: dto.box_condition },
            // Vật tư chèn chỉ thu hồi phần người dùng khai còn dùng được; phần còn lại coi như đã dùng.
            ...recovered.map((r) => ({ code: r.code, quantity: r.quantity, condition: 'reusable' as const, strict: true })),
          ],
          { groupId: plan.order_group_id, planId: plan._id, parcelNo },
          userId,
          session,
        );
        const [boxResult, ...rest] = results;
        box = boxResult?.outcome ?? 'unknown';
        materials = rest;
      }
      const parcels = data.parcels.map((p): ParcelData =>
        p.parcel_no === parcelNo
          ? {
              ...p,
              status: 'voided',
              unpack: {
                reason: p.unpack?.reason ?? 'Đơn bị hủy sau khi đã bắt đầu đóng gói',
                requested_at: p.unpack?.requested_at ?? now,
                box_condition: parcel.box_consumed ? dto.box_condition : null,
                units_restocked: adjusted.restocked,
                recovered_materials: parcel.box_consumed
                  ? [{ code: parcel.box.code, quantity: 1, outcome: box as 'reused' | 'discarded' | 'unknown' }, ...materials]
                  : [],
                note,
                by: new Types.ObjectId(userId),
                done_at: now,
              },
            }
          : p,
      );
      const group = await this.orderGroupsService.findOrderGroupById(groupId);
      const stillToUnpack = parcels.some((p) => p.status === 'to_unpack');
      // Nhóm đã hủy hết + tháo xong → kế hoạch kết thúc (nhả mọi giữ chỗ).
      const close = !stillToUnpack && group.fulfillment_status === GroupFulfillmentStatus.CANCELED;
      const doc = await this.planModel.findOneAndUpdate(
        { _id: plan._id, version: plan.version, is_active: true },
        { $set: { parcels, ...(close ? { is_active: false, status: 'superseded' } : {}) }, $inc: { version: 1 } },
        { session, returnDocument: 'after' },
      );
      if (!doc) throw this.planService.versionConflict(groupId);
      if (close) return { plan: doc, completed: false };
      const finalized = await this.finalizeIfComplete(doc, userId, session);
      return { plan: finalized ?? doc, completed: finalized !== null };
    });
    return { ...outcome, restocked, withoutLocation, box, materials };
  }

  /**
   * Vật tư chèn khai thu hồi phải có trong kiện và không vượt số lượng của kiện.
   * Kiện chưa niêm phong (chưa trừ vật tư) thì không có gì để thu hồi → bỏ qua.
   */
  private validateRecoveredMaterials(
    parcel: ParcelData,
    lines: { code: string; quantity: number }[],
  ): { code: string; quantity: number }[] {
    if (!parcel.box_consumed) return [];
    const merged = new Map<string, number>();
    for (const l of lines) merged.set(l.code, (merged.get(l.code) ?? 0) + l.quantity);
    for (const [code, quantity] of merged) {
      const inParcel = parcel.materials.filter((m) => m.code === code).reduce((s, m) => s + m.quantity, 0);
      if (inParcel === 0 || quantity > inParcel) {
        throw new AppException(
          PACKING_ERROR_CODES.RECOVER_MATERIAL_INVALID,
          inParcel === 0
            ? `Kiện ${String(parcel.parcel_no)} không có vật tư "${code}".`
            : `Kiện ${String(parcel.parcel_no)} chỉ có ${String(inParcel)} "${code}", không thu hồi ${String(quantity)}.`,
          HttpStatus.BAD_REQUEST,
          { parcelNo: parcel.parcel_no, code, inParcel, requested: quantity },
        );
      }
    }
    return [...merged].map(([code, quantity]) => ({ code, quantity }));
  }

  // ------------------------------------------------------------------ nội bộ

  /**
   * Kế hoạch đang `packing` mà mọi kiện CÒN GIAO đều sealed → kế hoạch + nhóm
   * sang packed (cùng transaction của caller). Kiện đang tháo không chặn — việc
   * giao bị chặn riêng tới khi tháo xong. Trả kế hoạch mới, hoặc null.
   */
  private async finalizeIfComplete(
    plan: PackingPlanDocument,
    userId: string,
    session: ClientSession,
  ): Promise<PackingPlanDocument | null> {
    if (plan.status !== 'packing') return null;
    const live = plan.parcels.filter(isLiveParcel);
    if (live.length === 0 || live.some((p) => p.status !== 'sealed')) return null;
    const group = await this.orderGroupsService.findOrderGroupById(plan.order_group_id.toString());
    if (group.fulfillment_status !== GroupFulfillmentStatus.APPROVED_FOR_PACKING) return null;
    const quick = live.some((p) => p.scans.some((s) => s.method === 'bypass'));
    const updated = await this.planModel.findOneAndUpdate(
      { _id: plan._id, version: plan.version, is_active: true, status: 'packing' },
      {
        $set: {
          status: 'packed',
          packed_by: new Types.ObjectId(userId),
          packed_at: new Date(),
          pack_mode: quick ? 'quick' : 'scan',
        },
        $inc: { version: 1 },
      },
      { session, returnDocument: 'after' },
    );
    if (!updated) throw this.planService.versionConflict(plan.order_group_id.toString());
    await this.orderGroupsService.transitionFulfillmentStatus(
      plan.order_group_id.toString(),
      GroupFulfillmentStatus.PACKED,
      group.__v,
      session,
    );
    return updated;
  }

  /** Mã quét → SKU sàn của kế hoạch: khớp SKU sàn, hoặc SKU nội bộ đã nối (không phân biệt hoa/thường). */
  private async resolveScannedSku(groupId: string, data: PlanData, code: string): Promise<string> {
    const wanted = normalizeCode(code);
    const skus = [...new Set(data.parcels.filter(isLiveParcel).flatMap((p) => p.placements.map((q) => q.sku)))];
    const direct = skus.find((s) => normalizeCode(s) === wanted);
    if (direct) return direct;
    const group = await this.orderGroupsService.findOrderGroupById(groupId);
    const masters = await resolveMasterSkus(this.mappingModel, group.platform, group.shop_id, skus);
    const viaMaster = skus.find((s) => {
      const m = masters.get(s);
      return m !== undefined && normalizeCode(m) === wanted;
    });
    if (viaMaster) return viaMaster;
    throw new AppException(
      PACKING_ERROR_CODES.SCAN_NOT_IN_PLAN,
      `Mã "${code}" không thuộc kế hoạch đóng gói của nhóm này.`,
      HttpStatus.NOT_FOUND,
      { groupId, code },
    );
  }

  private unscanned(parcel: ParcelData): ParcelData['placements'] {
    const scanned = new Set(parcel.scans.map((s) => s.item_key));
    return parcel.placements.filter((p) => !scanned.has(p.item_key)).sort((a, b) => a.step - b.step);
  }

  private startFields(plan: PackingPlanDocument, userId: string): Record<string, unknown> {
    return plan.status === 'approved'
      ? { status: 'packing', packing_started_by: new Types.ObjectId(userId), packing_started_at: new Date() }
      : {};
  }

  private activity(
    kind: 'start' | 'unscan' | 'assign' | 'finish' | 'unseal',
    userId: string,
    detail: string,
    parcelNo: number | null = null,
    reason: string | null = null,
  ): PackingPlan['activity'][number] {
    return { kind, parcel_no: parcelNo, detail, reason, by: new Types.ObjectId(userId), at: new Date() };
  }

  private async save(plan: PackingPlanDocument, set: Record<string, unknown>): Promise<PackingPlanDocument> {
    const updated = await this.planModel.findOneAndUpdate(
      { _id: plan._id, version: plan.version, is_active: true },
      { $set: set, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    if (!updated) throw this.planService.versionConflict(plan.order_group_id.toString());
    return updated;
  }

  /** Bản sao thuần của kế hoạch (không phải subdocument Mongoose) để tính rồi ghi lại. */
  private data(plan: PackingPlanDocument): PlanData {
    return plan.toObject<PlanData>();
  }

  private parcelOf(data: PlanData, parcelNo: number): ParcelData {
    const parcel = data.parcels.find((p) => p.parcel_no === parcelNo);
    if (!parcel) {
      throw new AppException(
        PACKING_ERROR_CODES.PARCEL_NOT_FOUND,
        `Kế hoạch không có kiện ${String(parcelNo)} (có ${String(data.parcels.length)} kiện).`,
        HttpStatus.NOT_FOUND,
        { parcelNo, parcelCount: data.parcels.length },
      );
    }
    return parcel;
  }

  private assertSession(plan: PackingPlanDocument, action: string): void {
    if (!SESSION_STATUSES.includes(plan.status)) {
      throw this.planService.wrongStatus(plan.order_group_id.toString(), plan.status, action);
    }
  }

  private parcelWrongStatus(groupId: string, parcel: ParcelData, action: string): AppException {
    const label: Record<string, string> = {
      pending: 'chưa niêm phong',
      sealed: 'đã niêm phong',
      held: 'đang chờ xem lại (lệch cân)',
      to_unpack: 'phải tháo (đơn đã hủy)',
      voided: 'đã tháo',
    };
    return new AppException(
      PACKING_ERROR_CODES.PARCEL_WRONG_STATUS,
      `Không thể ${action}: kiện ${String(parcel.parcel_no)} ${label[parcel.status] ?? parcel.status}.`,
      HttpStatus.CONFLICT,
      { groupId, parcelNo: parcel.parcel_no, status: parcel.status },
    );
  }

  private isAbnormal(estimatedG: number, actualKg: number, threshold: number): boolean {
    if (estimatedG <= 0) return false;
    const estimatedKg = estimatedG / 1000;
    return Math.abs(actualKg - estimatedKg) / estimatedKg > threshold;
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

  private async notifyHeld(groupId: string, parcel: PlanParcel, threshold: number): Promise<void> {
    const estimated = parcel.estimated_weight_g / 1000;
    const actual = parcel.actual_weight_kg ?? 0;
    const label = `${parcel.platform_order_id ?? groupId} (kiện ${String(parcel.parcel_no)})`;
    const title = `Kiện ${label} lệch cân — chờ xem lại`;
    const message =
      `Cân thật ${actual.toFixed(2)} kg, ước tính ${estimated.toFixed(2)} kg (lệch quá ${String(Math.round(threshold * 100))}%). ` +
      'Kiện chưa được bàn giao. Một nhân viên khác cần chấp nhận, cân lại hoặc mở kiện ra kiểm tra.';
    for (const recipientRole of [UserRole.PACKAGING_STAFF, UserRole.STORE_OWNER]) {
      await this.safeNotify({
        recipientRole,
        type: NotificationType.PACKING_PARCEL_HELD,
        severity: 'warning',
        title,
        message,
        relatedEntityType: 'order_group',
        relatedEntityId: groupId,
      });
    }
  }

  private async notifyIssue(groupId: string, sku: string, issue: string, outcome: string, roles: UserRole[]): Promise<void> {
    const what: Record<string, string> = { damaged: 'hỏng', missing: 'thiếu', wrong_item: 'sai' };
    for (const recipientRole of roles) {
      await this.safeNotify({
        recipientRole,
        type: NotificationType.PACKING_ISSUE,
        severity: 'warning',
        title: `Món ${sku} bị ${what[issue] ?? issue} lúc đóng gói`,
        message: `Nhân viên đóng gói báo món ${sku} bị ${what[issue] ?? issue}; ${outcome}.`,
        relatedEntityType: 'order_group',
        relatedEntityId: groupId,
      });
    }
  }

  private async notifyStock(
    consumed: ConsumedBox[],
    consumedMaterials: ConsumedMaterial[],
    shortfalls: MaterialShortfall[],
  ): Promise<void> {
    for (const box of consumed.filter((c) => c.before > c.reorderLevel && c.after <= c.reorderLevel))
      await this.notifyLowStock('box', box.code, box.code, box.after, box.reorderLevel, 0);
    for (const m of consumedMaterials.filter((c) => c.before > c.reorderLevel && c.after <= c.reorderLevel))
      await this.notifyLowStock('material', m.code, m.name, m.after, m.reorderLevel, 0);
    const missingByCode = new Map<string, number>();
    for (const s of shortfalls) missingByCode.set(s.code, (missingByCode.get(s.code) ?? 0) + s.missing);
    for (const [code, missing] of missingByCode) await this.notifyLowStock('material', code, code, 0, 0, missing);
  }

  private async notifyLowStock(
    kind: 'box' | 'material',
    code: string,
    name: string,
    after: number,
    reorderLevel: number,
    missing: number,
  ): Promise<void> {
    const what = kind === 'box' ? 'thùng' : 'vật tư';
    const title =
      missing > 0 ? `Thiếu ${what} ${code} khi đóng gói` : after === 0 ? `Đã hết ${what} ${name}` : `${what === 'thùng' ? 'Thùng' : 'Vật tư'} ${name} sắp hết`;
    const message =
      missing > 0
        ? `Kho không đủ ${what} ${code}: thiếu ${String(missing)} so với kế hoạch. Đơn vẫn được đóng — kiểm tra lại kiện và nhập thêm.`
        : after === 0
          ? `Kho vừa dùng hết ${what} ${name}. Vui lòng nhập thêm.`
          : `Kho còn ${String(after)} ${what} ${name} (mức cảnh báo ${String(reorderLevel)}). Vui lòng nhập thêm.`;
    for (const recipientRole of [UserRole.ADMIN, UserRole.STORE_OWNER]) {
      await this.safeNotify({
        recipientRole,
        type: kind === 'box' ? NotificationType.LOW_BOX_STOCK : NotificationType.LOW_MATERIAL_STOCK,
        severity: 'warning',
        title,
        message,
        relatedEntityType: kind === 'box' ? 'packaging_box' : 'packaging_material',
        relatedEntityId: code,
      });
    }
  }
}
