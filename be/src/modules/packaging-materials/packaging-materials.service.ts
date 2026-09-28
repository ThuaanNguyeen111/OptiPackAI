import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { PackagingMaterial, PackagingMaterialDocument } from './schemas/packaging-material.schema';
import { PackagingMovement, PackagingMovementDocument } from './schemas/packaging-movement.schema';
import { PackagingRecommendationDoc, PackagingRecommendationDocument } from '../packaging/schemas/packaging-recommendation.schema';
import {
  CreatePackagingMaterialDto, InternalUseDto, MaterialUsedDto, PackagingInspectionLineDto, PurchasePackagingDto, UpdatePackagingMaterialDto,
} from './dto/packaging-material.dto';
import { MaterialCondition, MaterialMovementType } from './schemas/packaging-movement.schema';
import { PACKAGING_MATERIAL_ERROR_CODES as E } from './packaging-materials.errors';

export interface ConsumptionResult {
  consumed: { materialCode: string; condition: 'new' | 'reused'; quantity: number; savingVnd: number }[];
  warnings: string[];
  recommendedBoxCode: string | null; // thùng theo gợi ý đóng gói
  followedRecommendation: boolean | null; // nhân viên có dùng đúng thùng gợi ý không
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
  private readonly logger = new Logger(PackagingMaterialsService.name);

  constructor(
    @InjectModel(PackagingMaterial.name) private readonly materialModel: Model<PackagingMaterialDocument>,
    @InjectModel(PackagingMovement.name) private readonly movementModel: Model<PackagingMovementDocument>,
    @InjectModel(PackagingRecommendationDoc.name) private readonly recommendationModel: Model<PackagingRecommendationDocument>,
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
  async consumeForPackedGroup(orderGroupId: string, actorId: string, session?: ClientSession, materialsUsed?: MaterialUsedDto[]): Promise<ConsumptionResult> {
    const work = (s: ClientSession): Promise<ConsumptionResult> => this.consumeInSession(orderGroupId, actorId, s, materialsUsed);
    return session ? work(session) : this.runTx(work);
  }

  private async consumeInSession(orderGroupId: string, actorId: string, session: ClientSession, materialsUsed?: MaterialUsedDto[]): Promise<ConsumptionResult> {
    const result: ConsumptionResult = { consumed: [], warnings: [], recommendedBoxCode: null, followedRecommendation: null };
    const already = await this.movementModel.exists({ ref_type: 'order_group', ref_id: orderGroupId, type: 'consume' }).session(session);
    if (already) return result;

    const rec = await this.recommendationModel.findOne({ order_group_id: new Types.ObjectId(orderGroupId), is_active: true }).session(session);
    const fragile = rec?.material_type === 'Bubble Wrap';
    const recBox = rec
      ? await this.materialModel.findOne({ kind: 'box', is_active: true, length_cm: rec.box_size.length_cm, width_cm: rec.box_size.width_cm, height_cm: rec.box_size.height_cm }).session(session)
      : null;
    result.recommendedBoxCode = recBox?.code ?? null;

    if (materialsUsed && materialsUsed.length > 0) {
      // Khai thực tế: trừ đúng ngăn nhân viên đã lấy.
      const usedBoxCodes: string[] = [];
      for (const line of materialsUsed) {
        const m = await this.materialModel.findOne({ code: line.material_code, is_active: true }).session(session);
        if (!m) {
          result.warnings.push(`Vật liệu "${line.material_code}" không có trong danh mục (hoặc đã vô hiệu hóa) — bỏ qua.`);
          continue;
        }
        if (m.kind === 'box') usedBoxCodes.push(m.code);
        await this.deduct(m, line.condition, line.quantity, orderGroupId, actorId, session, result);
      }
      result.followedRecommendation = recBox ? usedBoxCodes.length === 1 && usedBoxCodes[0] === recBox.code : null;
    } else {
      if (!rec) {
        result.warnings.push('Nhóm đơn chưa có gợi ý đóng gói đang hiệu lực — không trừ vật liệu.');
        return result;
      }
      if (recBox) {
        await this.consumeOne(recBox, 1, !fragile, orderGroupId, actorId, session, result);
      } else {
        result.warnings.push(`Chưa khai thùng ${String(rec.box_size.length_cm)}x${String(rec.box_size.width_cm)}x${String(rec.box_size.height_cm)} trong danh mục vật liệu.`);
      }
      if (fragile) {
        const cushioning = await this.materialModel.findOne({ kind: 'cushioning', is_active: true, match_material_type: rec.material_type }).session(session);
        if (cushioning) await this.consumeOne(cushioning, rec.material_quantity, true, orderGroupId, actorId, session, result);
        else result.warnings.push(`Chưa khai vật liệu đệm "${rec.material_type}" trong danh mục.`);
      }
      result.followedRecommendation = recBox ? true : null;
    }
    // Đánh dấu mọi dòng tiêu hao của nhóm đơn này có theo gợi ý hay không (phục vụ chỉ số).
    await this.movementModel.updateMany({ ref_type: 'order_group', ref_id: orderGroupId, type: 'consume' }, { $set: { followed_recommendation: result.followedRecommendation } }, { session });
    if (result.warnings.length > 0) this.logger.warn(`Trừ vật liệu nhóm đơn ${orderGroupId}: ${result.warnings.join(' | ')}`);
    return result;
  }

  /** Trừ đúng 1 ngăn (mới / tái sử dụng) theo khai báo của nhân viên. */
  private async deduct(
    m: PackagingMaterialDocument, condition: 'new' | 'reused', quantity: number, groupId: string, actorId: string,
    session: ClientSession, result: ConsumptionResult,
  ): Promise<void> {
    const field = condition === 'reused' ? 'qty_reused' : 'qty_new';
    const ok = await this.materialModel.updateOne({ _id: m._id, [field]: { $gte: quantity } }, { $inc: { [field]: -quantity } }, { session });
    if (ok.modifiedCount !== 1) {
      result.warnings.push(`Không đủ "${m.code}" (${condition === 'reused' ? 'tái sử dụng' : 'mới'}) — cần ${String(quantity)}, còn ${String(m[field])}. Kiểm tra lại tồn vật liệu.`);
      return;
    }
    const saving = condition === 'reused' ? quantity * m.unit_cost_vnd : 0;
    await this.record(m.code, condition, 'consume', -quantity, saving, 'order_group', groupId, null, actorId, session);
    result.consumed.push({ materialCode: m.code, condition, quantity, savingVnd: saving });
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

  private async consumeOne(
    m: PackagingMaterialDocument, quantity: number, allowReused: boolean, groupId: string, actorId: string,
    session: ClientSession, result: ConsumptionResult,
  ): Promise<void> {
    let remaining = quantity;
    if (allowReused && m.reusable && m.qty_reused > 0) {
      const take = Math.min(remaining, m.qty_reused);
      const ok = await this.materialModel.updateOne({ _id: m._id, qty_reused: { $gte: take } }, { $inc: { qty_reused: -take } }, { session });
      if (ok.modifiedCount === 1) {
        const saving = take * m.unit_cost_vnd;
        await this.record(m.code, 'reused', 'consume', -take, saving, 'order_group', groupId, null, actorId, session);
        result.consumed.push({ materialCode: m.code, condition: 'reused', quantity: take, savingVnd: saving });
        remaining -= take;
      }
    }
    if (remaining > 0) {
      const ok = await this.materialModel.updateOne({ _id: m._id, qty_new: { $gte: remaining } }, { $inc: { qty_new: -remaining } }, { session });
      if (ok.modifiedCount === 1) {
        await this.record(m.code, 'new', 'consume', -remaining, 0, 'order_group', groupId, null, actorId, session);
        result.consumed.push({ materialCode: m.code, condition: 'new', quantity: remaining, savingVnd: 0 });
      } else {
        result.warnings.push(`Không đủ "${m.code}" (cần ${String(remaining)}, còn mới ${String(m.qty_new)}) — nhập thêm vật liệu.`);
      }
    }
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
