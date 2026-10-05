import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { PackagingMaterial, PackagingMaterialDocument, usableStock } from './schemas/packaging-material.schema';
import { PackagingMovement, PackagingMovementDocument } from './schemas/packaging-movement.schema';
import {
  CreatePackagingMaterialDto, InternalUseDto, PackagingInspectionLineDto, PurchasePackagingDto, UpdatePackagingMaterialDto,
} from './dto/packaging-material.dto';
import { MaterialCondition, MaterialMovementType } from './schemas/packaging-movement.schema';
import { PACKAGING_MATERIAL_ERROR_CODES as E } from './packaging-materials.errors';

export interface ConsumptionResult {
  consumed: { materialCode: string; condition: 'new' | 'reused'; quantity: number; savingVnd: number }[];
  warnings: string[];
}

/** 1 dòng cần trừ khi đóng gói: vật tư/thùng của 1 kiện trong kế hoạch. */
export interface ParcelMaterialNeed {
  code: string;
  quantity: number;
  planId: Types.ObjectId;
  parcelNo: number;
  /**
   * (05/10/2026) false = chỉ lấy hàng MỚI (kiện có hàng dễ vỡ mà cài đặt không
   * cho dùng thùng tái sử dụng). Không gửi = được dùng hàng tái sử dụng.
   */
  allowReused?: boolean;
}

/** Tồn trước/sau của 1 mã sau khi trừ (để báo sắp hết). */
export interface ParcelConsumed {
  code: string;
  name: string;
  before: number;
  after: number;
  reorderLevel: number;
  savingVnd: number;
}

export interface ParcelConsumption {
  consumed: ParcelConsumed[];
  shortfalls: { planId: Types.ObjectId; parcelNo: number; code: string; missing: number }[];
}

export interface RecoveryResult {
  line: PackagingInspectionLineDto;
  recoveredToReuse: boolean;
  outcome: string;
}

/**
 * ===================================================================
 * G4 (27/09/2026) — VẬT LIỆU ĐÓNG GÓI + TÁI SỬ DỤNG
 * ===================================================================
 * - Nhập vật liệu mới (purchase) -> qty_new.
 * - pack -> tự TRỪ vật liệu theo gợi ý đóng gói ĐANG HIỆU LỰC của nhóm đơn:
 *   ưu tiên hàng tái sử dụng (ghi số tiền tiết kiệm), TRỪ khi hàng dễ vỡ (gợi ý
 *   dùng Bubble Wrap) -> thùng chỉ dùng hàng MỚI. KHÔNG chặn pack nếu thiếu vật
 *   liệu/chưa khai danh mục (dữ liệu cũ) — chỉ trả cảnh báo.
 * - Kiểm hàng hoàn (G3) -> thu hồi vật liệu hạng A (đã gỡ nhãn, chưa quá số lần)
 *   vào qty_reused, CÙNG transaction với phiếu hoàn.
 * ===================================================================
 */
@Injectable()
export class PackagingMaterialsService {
  constructor(
    @InjectModel(PackagingMaterial.name) private readonly materialModel: Model<PackagingMaterialDocument>,
    @InjectModel(PackagingMovement.name) private readonly movementModel: Model<PackagingMovementDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  // ------------------------------------------------------------ danh mục

  async create(dto: CreatePackagingMaterialDto): Promise<PackagingMaterialDocument> {
    if (dto.kind === 'box' && (!dto.length_cm || !dto.width_cm || !dto.height_cm)) {
      this.fail(E.INVALID_DEFINITION, 'Thùng phải khai đủ 3 kích thước (dài, rộng, cao).', HttpStatus.BAD_REQUEST);
    }
    if (dto.kind === 'cushioning' && !dto.match_material_type) {
      this.fail(E.INVALID_DEFINITION, 'Vật liệu đệm phải khai match_material_type (VD "Bubble Wrap").', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.materialModel.create({
        code: dto.code,
        name: dto.name,
        kind: dto.kind,
        unit_cost_vnd: dto.unit_cost_vnd,
        reusable: dto.reusable ?? true,
        max_reuse_cycles: dto.max_reuse_cycles ?? 3,
        length_cm: dto.kind === 'box' ? dto.length_cm : null,
        width_cm: dto.kind === 'box' ? dto.width_cm : null,
        height_cm: dto.kind === 'box' ? dto.height_cm : null,
        match_material_type: dto.kind === 'cushioning' ? dto.match_material_type : null,
      });
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        this.fail(E.CODE_IN_USE, `Mã vật liệu "${dto.code}" đã tồn tại.`, HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async list(includeInactive = false): Promise<PackagingMaterialDocument[]> {
    return this.materialModel.find(includeInactive ? {} : { is_active: true }).sort({ kind: 1, code: 1 });
  }

  async get(code: string): Promise<PackagingMaterialDocument> {
    const m = await this.materialModel.findOne({ code });
    if (!m) this.fail(E.NOT_FOUND, `Không tìm thấy vật liệu "${code}".`, HttpStatus.NOT_FOUND);
    return m;
  }

  async update(code: string, dto: UpdatePackagingMaterialDto): Promise<PackagingMaterialDocument> {
    const set: Record<string, unknown> = {};
    if (dto.name !== undefined) set.name = dto.name;
    if (dto.unit_cost_vnd !== undefined) set.unit_cost_vnd = dto.unit_cost_vnd;
    if (dto.reusable !== undefined) set.reusable = dto.reusable;
    if (dto.max_reuse_cycles !== undefined) set.max_reuse_cycles = dto.max_reuse_cycles;
    if (Object.keys(set).length === 0) this.fail(E.NOTHING_TO_UPDATE, 'Không có trường nào để cập nhật.', HttpStatus.BAD_REQUEST);
    await this.get(code);
    const updated = await this.materialModel.findOneAndUpdate({ code }, { $set: set }, { returnDocument: 'after' });
    return updated ?? this.get(code);
  }

  async setActive(code: string, active: boolean): Promise<PackagingMaterialDocument> {
    const m = await this.get(code);
    if (!active && m.qty_new + m.qty_reused > 0) {
      this.fail(E.HAS_STOCK, `Vật liệu "${code}" còn ${String(m.qty_new + m.qty_reused)} đơn vị — dùng hết trước khi vô hiệu hóa.`, HttpStatus.CONFLICT);
    }
    await this.materialModel.updateOne({ code }, { $set: { is_active: active } });
    return this.get(code);
  }

  async purchase(code: string, dto: PurchasePackagingDto, actorId: string): Promise<PackagingMaterialDocument> {
    const m = await this.get(code);
    if (!m.is_active) this.fail(E.INACTIVE, `Vật liệu "${code}" đã bị vô hiệu hóa.`, HttpStatus.CONFLICT);
    return this.runTx(async (session) => {
      const updated = await this.materialModel.findOneAndUpdate({ code }, { $inc: { qty_new: dto.quantity } }, { returnDocument: 'after', session });
      await this.record(code, 'new', 'purchase', dto.quantity, 0, null, null, dto.note ?? null, actorId, session);
      return updated ?? m;
    });
  }

  async listMovements(code?: string, limit = 100): Promise<PackagingMovementDocument[]> {
    return this.movementModel.find(code ? { material_code: code } : {}).sort({ created_at: -1 }).limit(Math.min(500, Math.max(1, limit)));
  }

  /** Số liệu cho Dashboard: tiết kiệm, tỷ lệ dùng lại, tỷ lệ làm theo gợi ý đóng gói. */
  async savingsSummary(): Promise<{
    totalSavingVnd: number; unitsConsumedNew: number; unitsConsumedReused: number; unitsRecovered: number; reuseRate: number;
    unitsRecoveredInternal: number; unitsInternalUsed: number; unitsDiscarded: number;
    groupsPacked: number; groupsFollowedRecommendation: number; recommendationFollowRate: number;
  }> {
    const rows = await this.movementModel.aggregate<{ _id: { type: string; condition: string }; units: number; saving: number }>([
      { $match: { type: { $in: ['consume', 'recover', 'internal_use', 'discard'] } } },
      { $group: { _id: { type: '$type', condition: '$condition' }, units: { $sum: { $abs: '$delta' } }, saving: { $sum: '$saving_vnd' } } },
    ]);
    const pick = (t: string, c: string): number => rows.find((r) => r._id.type === t && r._id.condition === c)?.units ?? 0;
    const unitsConsumedNew = pick('consume', 'new');
    const unitsConsumedReused = pick('consume', 'reused');
    const total = unitsConsumedNew + unitsConsumedReused;
    const groups = await this.movementModel.aggregate<{ _id: string; followed: boolean | null }>([
      { $match: { type: 'consume', ref_type: 'order_group', followed_recommendation: { $ne: null } } },
      { $group: { _id: '$ref_id', followed: { $first: '$followed_recommendation' } } },
    ]);
    const groupsFollowed = groups.filter((g) => g.followed === true).length;
    return {
      totalSavingVnd: rows.reduce((sum, r) => sum + r.saving, 0),
      unitsConsumedNew,
      unitsConsumedReused,
      unitsRecovered: pick('recover', 'reused'),
      reuseRate: total > 0 ? Math.round((unitsConsumedReused / total) * 1000) / 10 : 0,
      unitsRecoveredInternal: pick('recover', 'internal'),
      unitsInternalUsed: pick('internal_use', 'internal'),
      unitsDiscarded: pick('discard', 'discarded'),
      groupsPacked: groups.length,
      groupsFollowedRecommendation: groupsFollowed,
      recommendationFollowRate: groups.length > 0 ? Math.round((groupsFollowed / groups.length) * 1000) / 10 : 0,
    };
  }

  // ----------------------------------------------------- trừ khi đóng gói

  /** Chạy 1 đoạn việc trong transaction (dùng cho pack: đổi trạng thái + trừ vật liệu cùng lúc). */
  async withTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    return this.runTx(work);
  }

  /**
   * Trừ vật liệu cho 1 nhóm đơn vừa "packed".
   * - Có `session`: chạy CHUNG transaction với bước đổi trạng thái pack (khuyến nghị).
   * - Có `materialsUsed`: trừ ĐÚNG vật liệu nhân viên khai (mới/tái sử dụng) và ghi
   *   nhận có làm theo gợi ý hay không. Không có: trừ theo gợi ý (ưu tiên tái sử dụng,
   *   hàng dễ vỡ chỉ dùng thùng mới).
   * - Idempotent theo nhóm đơn. Thiếu vật liệu KHÔNG chặn pack — chỉ trả cảnh báo.
   */
  /**
   * GỘP main + thi_dev (04/10/2026) — trừ tồn cho các kiện vừa đóng của kế
   * hoạch đóng gói (gọi TRONG transaction của PackingPlanService.pack). Mỗi
   * dòng ưu tiên hàng TÁI SỬ DỤNG nếu vật tư cho phép (ghi tiết kiệm), thiếu
   * mới lấy hàng mới.
   * - `strict` (thùng): thiếu → ném lỗi để caller rollback (không đóng gói khi
   *   kho không còn thùng).
   * - không strict (vật tư chèn): trừ được bao nhiêu trừ bấy nhiêu, phần thiếu
   *   trả trong `shortfalls` để báo, KHÔNG chặn đóng gói.
   */
  async consumeForParcels(
    session: ClientSession,
    needs: ParcelMaterialNeed[],
    groupId: Types.ObjectId,
    actorId: string,
    options: { strict: boolean; onShortage?: (need: ParcelMaterialNeed, available: number) => never },
  ): Promise<ParcelConsumption> {
    const balances = new Map<string, ParcelConsumed>();
    const shortfalls: ParcelConsumption['shortfalls'] = [];
    for (const need of needs) {
      if (need.quantity <= 0) continue;
      const m = await this.materialModel.findOne({ code: need.code }).session(session);
      const available = m ? usableStock(m) : 0;
      // Kiện không được dùng hàng tái sử dụng: chỉ tính phần hàng MỚI là "còn".
      const usable = m && need.allowReused === false ? Math.min(available, m.qty_new) : available;
      if (options.strict && (!m || usable < need.quantity)) {
        if (options.onShortage) options.onShortage(need, usable);
        this.fail(E.INSUFFICIENT_STOCK, `Kho chỉ còn ${String(usable)} "${need.code}", cần ${String(need.quantity)}.`, HttpStatus.CONFLICT);
      }
      let remaining = m ? Math.min(need.quantity, usable) : 0;
      let saving = 0;
      if (m && remaining > 0 && m.reusable && m.qty_reused > 0 && need.allowReused !== false) {
        const take = Math.min(remaining, m.qty_reused);
        const ok = await this.materialModel.updateOne({ _id: m._id, qty_reused: { $gte: take } }, { $inc: { qty_reused: -take } }, { session });
        if (ok.modifiedCount === 1) {
          saving = take * m.unit_cost_vnd;
          await this.recordParcel(m, 'reused', -take, saving, groupId, need, available - take, actorId, session);
          remaining -= take;
        }
      }
      let taken = m ? Math.min(need.quantity, usable) - remaining : 0;
      if (m && remaining > 0) {
        const ok = await this.materialModel.updateOne({ _id: m._id, qty_new: { $gte: remaining } }, { $inc: { qty_new: -remaining } }, { session });
        if (ok.modifiedCount === 1) {
          await this.recordParcel(m, 'new', -remaining, 0, groupId, need, available - taken - remaining, actorId, session);
          taken += remaining;
        } else if (options.strict) {
          if (options.onShortage) options.onShortage(need, available - taken);
          this.fail(E.INSUFFICIENT_STOCK, `Kho vừa hết "${need.code}" trong lúc đóng gói — tải lại rồi thử lại.`, HttpStatus.CONFLICT);
        }
      }
      if (m && taken > 0) {
        const previous = balances.get(m.code);
        balances.set(m.code, {
          code: m.code,
          name: m.name,
          before: previous?.before ?? available,
          after: available - taken,
          reorderLevel: m.reorder_level,
          savingVnd: (previous?.savingVnd ?? 0) + saving,
        });
      }
      if (taken < need.quantity) {
        shortfalls.push({ planId: need.planId, parcelNo: need.parcelNo, code: need.code, missing: need.quantity - taken });
      }
    }
    return { consumed: [...balances.values()], shortfalls };
  }

  /**
   * (05/10/2026) Thu hồi thùng khi THÁO kiện (đơn hủy sau khi đã đóng). Gọi TRONG
   * transaction của tháo kiện. reusable → kho tái sử dụng (nếu loại thùng tái sử
   * dụng được); damaged hoặc không tái sử dụng được → ghi bỏ.
   */
  async recoverFromUnpack(
    code: string,
    condition: 'reusable' | 'damaged',
    ref: { groupId: Types.ObjectId; planId: Types.ObjectId; parcelNo: number },
    actorId: string,
    session: ClientSession,
  ): Promise<'reused' | 'discarded' | 'unknown'> {
    const m = await this.materialModel.findOne({ code }).session(session);
    if (!m) return 'unknown';
    const reused = condition === 'reusable' && m.reusable;
    if (reused) await this.materialModel.updateOne({ _id: m._id }, { $inc: { qty_reused: 1 } }, { session });
    await this.movementModel.create([{
      material_code: code, condition: reused ? 'reused' : 'discarded', type: reused ? 'recover' : 'discard',
      delta: 1, saving_vnd: 0, ref_type: 'order_group', ref_id: ref.groupId.toString(),
      note: reused ? 'Thu hồi thùng khi tháo kiện (đơn hủy sau khi đóng)' : 'Thùng hỏng khi tháo kiện — bỏ',
      actor_id: actorId, packing_plan_id: ref.planId, parcel_no: ref.parcelNo,
      balance_after: usableStock(m) + (reused ? 1 : 0), created_at: new Date(),
    }], { session });
    return reused ? 'reused' : 'discarded';
  }

  /** Nhập thêm hàng MỚI theo _id (màn danh mục thùng/vật tư của engine). */
  async stockInById(id: Types.ObjectId, quantity: number, actorId: string | null, note?: string): Promise<PackagingMaterialDocument | null> {
    return this.runTx(async (session) => {
      const updated = await this.materialModel.findOneAndUpdate({ _id: id }, { $inc: { qty_new: quantity } }, { returnDocument: 'after', session });
      if (!updated) return null;
      await this.movementModel.create([{
        material_code: updated.code, condition: 'new', type: 'purchase', delta: quantity, saving_vnd: 0,
        ref_type: null, ref_id: null, note: note?.trim() ? note.trim() : null, actor_id: actorId ?? 'system',
        balance_after: usableStock(updated), created_at: new Date(),
      }], { session });
      return updated;
    });
  }

  private async recordParcel(
    m: PackagingMaterialDocument, condition: 'new' | 'reused', delta: number, saving: number,
    groupId: Types.ObjectId, need: ParcelMaterialNeed, balanceAfter: number, actorId: string, session: ClientSession,
  ): Promise<void> {
    await this.movementModel.create([{
      material_code: m.code, condition, type: 'consume', delta, saving_vnd: saving,
      ref_type: 'order_group', ref_id: groupId.toString(), note: null, actor_id: actorId,
      packing_plan_id: need.planId, parcel_no: need.parcelNo, balance_after: balanceAfter, created_at: new Date(),
    }], { session });
  }

  /** Xuất vật liệu hạng B dùng nội bộ (đựng hàng, chia khu...). */
  async internalUse(code: string, dto: InternalUseDto, actorId: string): Promise<PackagingMaterialDocument> {
    const m = await this.get(code);
    return this.runTx(async (session) => {
      const updated = await this.materialModel.findOneAndUpdate(
        { code, qty_internal: { $gte: dto.quantity } }, { $inc: { qty_internal: -dto.quantity } }, { returnDocument: 'after', session },
      );
      if (!updated) this.fail(E.INSUFFICIENT_INTERNAL, `Tồn nội bộ (hạng B) của "${code}" chỉ còn ${String(m.qty_internal)}.`, HttpStatus.CONFLICT);
      await this.record(code, 'internal', 'internal_use', -dto.quantity, 0, null, null, dto.purpose, actorId, session);
      return updated;
    });
  }

  // ------------------------------------------------ thu hồi từ hàng hoàn

  /** Gọi TRONG transaction của ReturnsService.inspect. */
  async recoverFromReturn(lines: PackagingInspectionLineDto[], returnRequestId: string, actorId: string, session: ClientSession): Promise<RecoveryResult[]> {
    const out: RecoveryResult[] = [];
    for (const line of lines) {
      const m = await this.get(line.material_code);
      if (line.grade === 'B') {
        // Hạng B -> ngăn NỘI BỘ (không bao giờ dùng để giao hàng).
        await this.materialModel.updateOne({ _id: m._id }, { $inc: { qty_internal: line.quantity } }, { session });
        await this.record(m.code, 'internal', 'recover', line.quantity, 0, 'return_request', returnRequestId, 'Thu hồi hạng B — dùng nội bộ', actorId, session);
        out.push({ line, recoveredToReuse: false, outcome: 'Hạng B — vào kho vật liệu nội bộ' });
        continue;
      }
      if (line.grade === 'C') {
        await this.record(m.code, 'discarded', 'discard', line.quantity, 0, 'return_request', returnRequestId, 'Hạng C — tái chế/loại bỏ', actorId, session);
        out.push({ line, recoveredToReuse: false, outcome: 'Hạng C — tái chế/loại bỏ' });
        continue;
      }
      if (!m.reusable) this.fail(E.NOT_REUSABLE, `Vật liệu "${m.code}" không tái sử dụng được — không xếp hạng A.`, HttpStatus.BAD_REQUEST);
      // Nhãn cũ có tên/SĐT/địa chỉ khách trước — dùng lại mà còn nhãn là lộ dữ liệu cá nhân.
      if (line.old_label_removed !== true) {
        this.fail(E.OLD_LABEL_NOT_REMOVED, `"${m.code}": phải gỡ/che nhãn vận chuyển cũ trước khi xếp hạng A.`, HttpStatus.BAD_REQUEST);
      }
      if ((line.reuse_cycle_seen ?? 0) >= m.max_reuse_cycles) {
        await this.record(m.code, 'discarded', 'discard', line.quantity, 0, 'return_request', returnRequestId, 'Quá số lần tái sử dụng — tự hạ hạng C', actorId, session);
        out.push({ line, recoveredToReuse: false, outcome: `Đã dùng ${String(line.reuse_cycle_seen)}/${String(m.max_reuse_cycles)} lần — tự hạ hạng C` });
        continue;
      }
      await this.materialModel.updateOne({ _id: m._id }, { $inc: { qty_reused: line.quantity } }, { session });
      await this.record(m.code, 'reused', 'recover', line.quantity, 0, 'return_request', returnRequestId, `Thu hồi hạng A (đã dùng ${String(line.reuse_cycle_seen ?? 0)} lần)`, actorId, session);
      out.push({ line, recoveredToReuse: true, outcome: 'Hạng A — vào kho tái sử dụng' });
    }
    return out;
  }

  // ------------------------------------------------------------ nội bộ

  private async record(
    code: string, condition: MaterialCondition, type: MaterialMovementType, delta: number, saving: number,
    refType: string | null, refId: string | null, note: string | null, actorId: string, session: ClientSession,
  ): Promise<void> {
    await this.movementModel.create([{
      material_code: code, condition, type, delta, saving_vnd: saving, ref_type: refType, ref_id: refId, note, actor_id: actorId, created_at: new Date(),
    }], { session });
  }

  private fail(code: string, message: string, status: HttpStatus): never {
    throw new AppException(code, message, status);
  }

  private async runTx<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result as T;
    } finally {
      await session.endSession();
    }
  }
}
