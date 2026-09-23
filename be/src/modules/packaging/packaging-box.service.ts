import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { PackagingBox, PackagingBoxDocument } from './schemas/packaging-box.schema';
import {
  PackagingStockMovement,
  PackagingStockMovementDocument,
} from './schemas/packaging-stock-movement.schema';
import {
  PackagingRecommendationDoc,
  PackagingRecommendationDocument,
} from './schemas/packaging-recommendation.schema';
import { PackagingApprovalStatus } from './enums/packaging-approval-status.enum';
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

function toBoxSpec(box: PackagingBox): BoxSpec {
  return {
    code: box.code,
    name: box.name,
    inner: { length_mm: box.inner.length_mm, width_mm: box.inner.width_mm, height_mm: box.inner.height_mm },
    outer: { length_mm: box.outer.length_mm, width_mm: box.outer.width_mm, height_mm: box.outer.height_mm },
    tare_g: box.tare_g,
    max_load_g: box.max_load_g,
    price_vnd: box.price_vnd,
  };
}

/**
 * CRUD danh mục thùng carton (Bước 0 engine 3D, 21/09/2026). Engine chỉ
 * dùng thùng `is_active: true`; ngừng dùng = xóa mềm (Rule #8).
 */
@Injectable()
export class PackagingBoxService {
  constructor(
    @InjectModel(PackagingBox.name)
    private readonly boxModel: Model<PackagingBoxDocument>,
    @InjectModel(PackagingStockMovement.name)
    private readonly movementModel: Model<PackagingStockMovementDocument>,
    @InjectModel(PackagingRecommendationDoc.name)
    private readonly recommendationModel: Model<PackagingRecommendationDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /**
   * ===================================================================
   * Tồn kho thùng (22/09/2026)
   * ===================================================================
   * Giữ chỗ mềm: thùng đã được phương án đang chờ duyệt / đã duyệt nhưng
   * chưa đóng chọn thì không tính là còn trống. `exclude.groupId` = group
   * đang tính lại (phương án cũ sắp bị thay); `exclude.recommendationId` =
   * phương án đang adjust (chỗ nó giữ sắp được trả lại).
   */
  async listAvailability(
    exclude: { groupId?: string; recommendationId?: Types.ObjectId } = {},
  ): Promise<Map<string, BoxAvailability>> {
    const match: Record<string, unknown> = {
      is_active: true,
      solution_status: 'ok',
      packed_at: null,
      box_code: { $ne: null },
      approval_status: {
        $in: [PackagingApprovalStatus.PENDING, PackagingApprovalStatus.APPROVED, PackagingApprovalStatus.ADJUSTED],
      },
    };
    if (exclude.groupId) match.order_group_id = { $ne: new Types.ObjectId(exclude.groupId) };
    if (exclude.recommendationId) match._id = { $ne: exclude.recommendationId };
    const [boxes, reservedRows] = await Promise.all([
      this.boxModel.find({ is_active: true }).select('code quantity_on_hand reorder_level').lean(),
      this.recommendationModel.aggregate<{ _id: string; count: number }>([
        { $match: match },
        { $group: { _id: '$box_code', count: { $sum: 1 } } },
      ]),
    ]);
    const reservedByCode = new Map(reservedRows.map((r) => [r._id, r.count]));
    return new Map(
      boxes.map((b) => {
        // Thùng tạo trước 22/09 chưa có field tồn và `.lean()` không điền
        // default → coi là 0 (hết hàng), không để NaN lọt qua thành "còn hàng".
        const onHand = Number.isFinite(b.quantity_on_hand) ? b.quantity_on_hand : 0;
        const reorderLevel = Number.isFinite(b.reorder_level) ? b.reorder_level : 10;
        const reserved = reservedByCode.get(b.code) ?? 0;
        return [b.code, { onHand, reserved, available: Math.max(0, onHand - reserved), reorderLevel }];
      }),
    );
  }

  /** Nhập thêm thùng — `$inc` + 1 dòng sổ trong cùng transaction. */
  async stockIn(id: string, quantity: number, userId: string | null, note?: string): Promise<PackagingBoxDocument> {
    const box = await this.findById(id);
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(async () => {
        const doc = await this.boxModel.findOneAndUpdate(
          { _id: box._id },
          { $inc: { quantity_on_hand: quantity } },
          { returnDocument: 'after', session },
        );
        if (!doc) throw this.notFound(id);
        await this.movementModel.create(
          [
            {
              box_id: box._id,
              box_code: box.code,
              delta: quantity,
              reason: 'stock_in',
              balance_after: doc.quantity_on_hand,
              // null = script hệ thống (seed), không phải người thao tác.
              user_id: userId ? new Types.ObjectId(userId) : null,
              note: note?.trim() ? note.trim() : null,
            },
          ],
          { session },
        );
        return doc;
      });
    } finally {
      await session.endSession();
    }
  }

  async listMovements(id: string, limit = 20): Promise<PackagingStockMovement[]> {
    const box = await this.findById(id);
    return this.movementModel.find({ box_id: box._id }).sort({ created_at: -1 }).limit(limit).lean();
  }

  /**
   * Trừ tồn cho các kiện vừa đóng (gọi TRONG transaction của pack). Thiếu
   * tồn → PKG_BOX_OUT_OF_STOCK, caller rollback toàn bộ (không chuyển packed).
   */
  async consumeForPack(
    session: ClientSession,
    packages: { boxCode: string; recommendationId: Types.ObjectId }[],
    groupId: Types.ObjectId,
    userId: string,
  ): Promise<ConsumedBox[]> {
    const consumed: ConsumedBox[] = [];
    for (const pkg of packages) {
      const updated = await this.boxModel.findOneAndUpdate(
        { code: pkg.boxCode, quantity_on_hand: { $gte: 1 } },
        { $inc: { quantity_on_hand: -1 } },
        { returnDocument: 'after', session },
      );
      if (!updated) {
        throw new AppException(
          PACKAGING_ERROR_CODES.BOX_OUT_OF_STOCK,
          `Kho đã hết thùng "${pkg.boxCode}" — nhập thêm thùng hoặc đổi thùng (adjust) trước khi xác nhận đóng.`,
          HttpStatus.CONFLICT,
          { boxCode: pkg.boxCode },
        );
      }
      await this.movementModel.create(
        [
          {
            box_id: updated._id,
            box_code: updated.code,
            delta: -1,
            reason: 'pack',
            balance_after: updated.quantity_on_hand,
            order_group_id: groupId,
            recommendation_id: pkg.recommendationId,
            user_id: new Types.ObjectId(userId),
          },
        ],
        { session },
      );
      consumed.push({
        code: updated.code,
        before: updated.quantity_on_hand + 1,
        after: updated.quantity_on_hand,
        reorderLevel: updated.reorder_level,
      });
    }
    return consumed;
  }

  async list(activeOnly: boolean): Promise<PackagingBoxDocument[]> {
    const query = activeOnly ? { is_active: true } : {};
    return this.boxModel.find(query).sort({ code: 1 });
  }

  /** Thùng đang dùng, đổi sang kiểu lõi của engine. */
  async listActiveSpecs(): Promise<BoxSpec[]> {
    const boxes = await this.boxModel.find({ is_active: true }).lean();
    return boxes.map(toBoxSpec);
  }

  async findActiveSpecByCode(code: string): Promise<BoxSpec> {
    const box = await this.boxModel.findOne({ code, is_active: true }).lean();
    if (!box) {
      throw new AppException(
        PACKAGING_ERROR_CODES.BOX_NOT_FOUND,
        `Không có thùng "${code}" đang dùng trong danh mục.`,
        HttpStatus.NOT_FOUND,
        { code },
      );
    }
    return toBoxSpec(box);
  }

  async create(dto: CreatePackagingBoxDto): Promise<PackagingBoxDocument> {
    this.assertOuterNotSmaller(dto.inner, dto.outer);
    try {
      return await this.boxModel.create({
        code: dto.code,
        name: dto.name,
        inner: dto.inner,
        outer: dto.outer,
        tare_g: dto.tare_g,
        max_load_g: dto.max_load_g,
        price_vnd: dto.price_vnd ?? null,
        // Tồn ban đầu 0 — nhập qua stock-in để có dòng sổ.
        quantity_on_hand: 0,
        reorder_level: dto.reorder_level ?? 10,
        storage_location: dto.storage_location?.trim() ? dto.storage_location.trim() : null,
        is_sample: false,
        is_active: true,
      });
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        throw new AppException(
          PACKAGING_ERROR_CODES.BOX_CODE_IN_USE,
          `Mã thùng "${dto.code}" đã tồn tại — chọn mã khác.`,
          HttpStatus.CONFLICT,
          { code: dto.code },
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdatePackagingBoxDto): Promise<PackagingBoxDocument> {
    const box = await this.findById(id);
    this.assertOuterNotSmaller(dto.inner ?? box.inner, dto.outer ?? box.outer);
    const measurementChanged =
      dto.inner !== undefined ||
      dto.outer !== undefined ||
      dto.tare_g !== undefined ||
      dto.max_load_g !== undefined;

    const updated = await this.boxModel.findByIdAndUpdate(
      box._id,
      {
        $set: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.inner !== undefined && { inner: dto.inner }),
          ...(dto.outer !== undefined && { outer: dto.outer }),
          ...(dto.tare_g !== undefined && { tare_g: dto.tare_g }),
          ...(dto.max_load_g !== undefined && { max_load_g: dto.max_load_g }),
          ...(dto.price_vnd !== undefined && { price_vnd: dto.price_vnd }),
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

  private async findById(id: string): Promise<PackagingBoxDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException(
        PACKAGING_ERROR_CODES.INVALID_BOX_ID,
        `"${id}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { id },
      );
    }
    const box = await this.boxModel.findById(id);
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
