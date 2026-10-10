import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  PackagingMaterial,
  PackagingMaterialDocument,
  usableStock,
} from '../packaging-materials/schemas/packaging-material.schema';
import {
  PackagingMovement,
  PackagingMovementDocument,
} from '../packaging-materials/schemas/packaging-movement.schema';
import { PackagingMaterialsService } from '../packaging-materials/packaging-materials.service';
import {
  PackingPlan,
  PackingPlanDocument,
  RESERVING_PLAN_STATUSES,
} from '../packing/schemas/packing-plan.schema';
import { CreatePackagingBoxDto, UpdatePackagingBoxDto } from './dto/packaging-box.dto';
import { AppException } from '../../common/exceptions/app-exception';
import { PACKAGING_ERROR_CODES } from './packaging.errors';
import type { BoxSpec } from './engine';

/** Tồn một loại thùng: `available` = `onHand` − `reserved` (không âm). */
export interface BoxAvailability {
  onHand: number;
  reserved: number;
  available: number;
  reorderLevel: number;
}

/** Thùng vừa bị trừ tồn lúc pack — dùng để báo sắp hết. */
export interface ConsumedBox {
  code: string;
  before: number;
  after: number;
  reorderLevel: number;
}

interface DimensionsMm {
  length_mm: number;
  width_mm: number;
  height_mm: number;
}

/** Thùng engine dùng được: đang dùng + đủ số đo mm/bì/tải. */
const PLANNABLE_BOX_FILTER: Record<string, unknown> = {
  kind: 'box',
  is_active: true,
  inner: { $ne: null },
  outer: { $ne: null },
  tare_g: { $ne: null },
  max_load_g: { $ne: null },
};

function toBoxSpec(box: PackagingMaterial): BoxSpec {
  if (!box.inner || !box.outer || box.tare_g === null || box.max_load_g === null) {
    throw new Error(`Thùng ${box.code} thiếu số đo cho engine.`);
  }
  return {
    code: box.code,
    name: box.name,
    inner: { length_mm: box.inner.length_mm, width_mm: box.inner.width_mm, height_mm: box.inner.height_mm },
    outer: { length_mm: box.outer.length_mm, width_mm: box.outer.width_mm, height_mm: box.outer.height_mm },
    tare_g: box.tare_g,
    max_load_g: box.max_load_g,
    price_vnd: box.unit_cost_vnd,
  };
}

/** Kích thước ngoài (mm) → cm 1 chữ số thập phân — giữ length/width/height_cm của main đồng bộ. */
function outerCm(outer: DimensionsMm): { length_cm: number; width_cm: number; height_cm: number } {
  const cm = (mm: number): number => Math.round(mm) / 10;
  return { length_cm: cm(outer.length_mm), width_cm: cm(outer.width_mm), height_cm: cm(outer.height_mm) };
}

/**
 * Danh mục thùng carton cho engine đóng gói 3D.
 *
 * 🔄 GỘP main + thi_dev (04/10/2026): đọc/ghi KHO VẬT TƯ CHUNG
 * `packaging_materials` (kind = box) — không còn collection `packaging_boxes`
 * riêng. Tồn = `qty_new + qty_reused` (thùng tái sử dụng từ hàng hoàn được ưu
 * tiên khi đóng gói, ghi tiết kiệm); sổ biến động là `packaging_movements`.
 * Route `/packaging/boxes` giữ nguyên hình dạng response cho FE.
 */
@Injectable()
export class PackagingBoxService {
  constructor(
    @InjectModel(PackagingMaterial.name)
    private readonly materialModel: Model<PackagingMaterialDocument>,
    @InjectModel(PackagingMovement.name)
    private readonly movementModel: Model<PackagingMovementDocument>,
    @InjectModel(PackingPlan.name)
    private readonly planModel: Model<PackingPlanDocument>,
    private readonly materialsService: PackagingMaterialsService,
  ) {}

  /**
   * Giữ chỗ mềm: mỗi KIỆN chưa niêm phong của kế hoạch đang hoạt động ở trạng
   * thái `ready`, `approved` hoặc `packing` giữ 1 thùng. `exclude.groupId` = nhóm đang tính lại;
   * `exclude.planId` = kế hoạch đang chỉnh tay.
   */
  async listAvailability(
    exclude: { groupId?: string; planId?: Types.ObjectId } = {},
  ): Promise<Map<string, BoxAvailability>> {
    const match: Record<string, unknown> = {
      is_active: true,
      status: { $in: RESERVING_PLAN_STATUSES },
    };
    if (exclude.groupId) match.order_group_id = { $ne: new Types.ObjectId(exclude.groupId) };
    if (exclude.planId) match._id = { $ne: exclude.planId };
    const [boxes, reservedRows] = await Promise.all([
      this.materialModel.find({ kind: 'box', is_active: true }).select('code qty_new qty_reused reorder_level').lean(),
      this.planModel.aggregate<{ _id: string; count: number }>([
        { $match: match },
        { $unwind: '$parcels' },
        // (05/10/2026) Kiện đã niêm phong đã TRỪ tồn thật — không giữ chỗ thêm lần nữa;
        // kiện đang/đã tháo không còn cần thùng.
        { $match: { 'parcels.box_consumed': { $ne: true }, 'parcels.status': { $nin: ['to_unpack', 'voided'] } } },
        { $group: { _id: '$parcels.box.code', count: { $sum: 1 } } },
      ]),
    ]);
    const reservedByCode = new Map(reservedRows.map((r) => [r._id, r.count]));
    return new Map(
      boxes.map((b) => {
        const onHand = usableStock(b);
        const reorderLevel = Number.isFinite(b.reorder_level) ? b.reorder_level : 10;
        const reserved = reservedByCode.get(b.code) ?? 0;
        return [b.code, { onHand, reserved, available: Math.max(0, onHand - reserved), reorderLevel }];
      }),
    );
  }

  /** Nhập thêm thùng MỚI — `$inc qty_new` + 1 dòng sổ trong cùng transaction. */
  async stockIn(id: string, quantity: number, userId: string | null, note?: string): Promise<PackagingMaterialDocument> {
    const box = await this.findById(id);
    const updated = await this.materialsService.stockInById(box._id, quantity, userId, note);
    if (!updated) throw this.notFound(id);
    return updated;
  }

  async listMovements(id: string, limit = 20): Promise<PackagingMovement[]> {
    const box = await this.findById(id);
    return this.movementModel.find({ material_code: box.code }).sort({ created_at: -1 }).limit(limit).lean();
  }

  /**
   * Trừ tồn cho các kiện vừa đóng (gọi TRONG transaction của pack). Thiếu
   * tồn → PKG_BOX_OUT_OF_STOCK, caller rollback toàn bộ (không chuyển packed).
   */
  async consumeForPack(
    session: ClientSession,
    packages: { boxCode: string; planId: Types.ObjectId; parcelNo: number; allowReused?: boolean }[],
    groupId: Types.ObjectId,
    userId: string,
  ): Promise<ConsumedBox[]> {
    const result = await this.materialsService.consumeForParcels(
      session,
      packages.map((p) => ({
        code: p.boxCode,
        quantity: 1,
        planId: p.planId,
        parcelNo: p.parcelNo,
        allowReused: p.allowReused,
      })),
      groupId,
      userId,
      {
        strict: true,
        onShortage: (need) => {
          throw new AppException(
            PACKAGING_ERROR_CODES.BOX_OUT_OF_STOCK,
            `Kho đã hết thùng "${need.code}" — nhập thêm thùng hoặc đổi thùng cho kiện ${String(need.parcelNo)} trước khi xác nhận đóng.`,
            HttpStatus.CONFLICT,
            { boxCode: need.code },
          );
        },
      },
    );
    return result.consumed.map((c) => ({ code: c.code, before: c.before, after: c.after, reorderLevel: c.reorderLevel }));
  }

  /** Thùng hỏng trước khi niêm phong (đổi thùng lúc đóng): trừ tồn + ghi sổ hao hụt. */
  async recordWaste(
    session: ClientSession,
    boxCode: string,
    ref: { groupId: Types.ObjectId; planId: Types.ObjectId; parcelNo: number },
    userId: string,
    note: string,
  ): Promise<{ taken: number; unitCostVnd: number }> {
    return this.materialsService.recordWaste(boxCode, 1, ref, userId, note, session);
  }

  async list(activeOnly: boolean): Promise<PackagingMaterialDocument[]> {
    const query: Record<string, unknown> = { kind: 'box' };
    if (activeOnly) query.is_active = true;
    return this.materialModel.find(query).sort({ code: 1 });
  }

  /** Thùng đang dùng có đủ số đo, đổi sang kiểu lõi của engine. */
  async listActiveSpecs(): Promise<BoxSpec[]> {
    const boxes = await this.materialModel.find(PLANNABLE_BOX_FILTER).lean();
    return boxes.map(toBoxSpec);
  }

  async findActiveSpecByCode(code: string): Promise<BoxSpec> {
    const box = await this.materialModel.findOne({ ...PLANNABLE_BOX_FILTER, code }).lean();
    if (!box) {
      throw new AppException(
        PACKAGING_ERROR_CODES.BOX_NOT_FOUND,
        `Không có thùng "${code}" đang dùng (đủ số đo) trong danh mục.`,
        HttpStatus.NOT_FOUND,
        { code },
      );
    }
    return toBoxSpec(box);
  }

  async create(dto: CreatePackagingBoxDto): Promise<PackagingMaterialDocument> {
    this.assertOuterNotSmaller(dto.inner, dto.outer);
    try {
      return await this.materialModel.create({
        code: dto.code,
        name: dto.name,
        kind: 'box',
        ...outerCm(dto.outer),
        inner: dto.inner,
        outer: dto.outer,
        tare_g: dto.tare_g,
        max_load_g: dto.max_load_g,
        unit_cost_vnd: dto.price_vnd ?? 0,
        // Tồn ban đầu 0 — nhập qua stock-in để có dòng sổ.
        qty_new: 0,
        qty_reused: 0,
        reorder_level: dto.reorder_level ?? 10,
        storage_location: dto.storage_location?.trim() ? dto.storage_location.trim() : null,
        is_sample: false,
        is_active: true,
      });
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        throw new AppException(
          PACKAGING_ERROR_CODES.BOX_CODE_IN_USE,
          `Mã "${dto.code}" đã có trong kho vật tư — chọn mã khác.`,
          HttpStatus.CONFLICT,
          { code: dto.code },
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdatePackagingBoxDto): Promise<PackagingMaterialDocument> {
    const box = await this.findById(id);
    const inner = dto.inner ?? box.inner;
    const outer = dto.outer ?? box.outer;
    if (inner && outer) this.assertOuterNotSmaller(inner, outer);
    const measurementChanged =
      dto.inner !== undefined ||
      dto.outer !== undefined ||
      dto.tare_g !== undefined ||
      dto.max_load_g !== undefined;

    const updated = await this.materialModel.findByIdAndUpdate(
      box._id,
      {
        $set: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.inner !== undefined && { inner: dto.inner }),
          ...(dto.outer !== undefined && { outer: dto.outer, ...outerCm(dto.outer) }),
          ...(dto.tare_g !== undefined && { tare_g: dto.tare_g }),
          ...(dto.max_load_g !== undefined && { max_load_g: dto.max_load_g }),
          ...(dto.price_vnd !== undefined && { unit_cost_vnd: dto.price_vnd ?? 0 }),
          ...(dto.is_active !== undefined && { is_active: dto.is_active }),
          ...(dto.reorder_level !== undefined && { reorder_level: dto.reorder_level }),
          ...(dto.storage_location !== undefined && {
            storage_location: dto.storage_location?.trim() ? dto.storage_location.trim() : null,
          }),
          // Sửa số đo/bì/tải = đã có số thật, bỏ nhãn "giả lập".
          ...(measurementChanged && { is_sample: false }),
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
    if (!updated) throw this.notFound(id);
    return updated;
  }

  private async findById(id: string): Promise<PackagingMaterialDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException(
        PACKAGING_ERROR_CODES.INVALID_BOX_ID,
        `"${id}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { id },
      );
    }
    const box = await this.materialModel.findOne({ _id: id, kind: 'box' });
    if (!box) throw this.notFound(id);
    return box;
  }

  private notFound(id: string): AppException {
    return new AppException(
      PACKAGING_ERROR_CODES.BOX_NOT_FOUND,
      `Không tìm thấy thùng "${id}".`,
      HttpStatus.NOT_FOUND,
      { id },
    );
  }

  private assertOuterNotSmaller(inner: DimensionsMm, outer: DimensionsMm): void {
    if (
      outer.length_mm < inner.length_mm ||
      outer.width_mm < inner.width_mm ||
      outer.height_mm < inner.height_mm
    ) {
      throw new AppException(
        PACKAGING_ERROR_CODES.BOX_INVALID_DIMENSIONS,
        'Kích thước ngoài của thùng phải lớn hơn hoặc bằng lòng thùng ở cả 3 chiều.',
        HttpStatus.BAD_REQUEST,
        { inner, outer },
      );
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}
