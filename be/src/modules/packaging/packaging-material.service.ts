import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { PackagingMaterial, PackagingMaterialDocument } from './schemas/packaging-material.schema';
import {
  PackagingMaterialMovement,
  PackagingMaterialMovementDocument,
} from './schemas/packaging-material-movement.schema';
import {
  MaterialRuleEntry,
  PackagingMaterialRules,
  PackagingMaterialRulesDocument,
} from './schemas/packaging-material-rules.schema';
import {
  CreatePackagingMaterialDto,
  MaterialRuleDto,
  UpdatePackagingMaterialDto,
} from './dto/packaging-material.dto';
import { AppException } from '../../common/exceptions/app-exception';
import { PACKAGING_ERROR_CODES } from './packaging.errors';
import { DEFAULT_MATERIAL_RULES, type MaterialPlanning, type MaterialRule, type MaterialSpec } from './engine';

/** Vật tư vừa bị trừ tồn lúc pack — dùng để báo sắp hết. */
export interface ConsumedMaterial {
  code: string;
  name: string;
  before: number;
  after: number;
  reorderLevel: number;
}

/** Thiếu vật tư cho 1 kiện: đóng gói vẫn tiếp tục, chỉ ghi nhận + báo. */
export interface MaterialShortfall {
  planId: Types.ObjectId;
  parcelNo: number;
  code: string;
  missing: number;
}

export interface MaterialConsumption {
  consumed: ConsumedMaterial[];
  shortfalls: MaterialShortfall[];
}

export interface MaterialNeed {
  code: string;
  quantity: number;
  planId: Types.ObjectId;
  parcelNo: number;
}

export interface ActiveMaterialRules {
  /** null = chưa lưu bộ luật nào, đang dùng luật mặc định trong code. */
  version: number | null;
  rules: MaterialRule[];
  isDefault: boolean;
}

function toMaterialSpec(material: PackagingMaterial): MaterialSpec {
  return {
    code: material.code,
    name: material.name,
    type: material.type,
    unit: material.unit,
    weight_g_per_unit: material.weight_g_per_unit,
    price_vnd_per_unit: material.price_vnd_per_unit,
  };
}

function entryToRule(entry: MaterialRuleEntry): MaterialRule {
  return {
    material_type: entry.material_type,
    applies_to: entry.applies_to,
    min_units: entry.min_units,
    basis: entry.basis,
    quantity: entry.quantity,
    ...(entry.void_bands.length > 0 && {
      void_bands: entry.void_bands.map((b) => ({ min_void_ratio: b.min_void_ratio, quantity: b.quantity })),
    }),
  };
}

/**
 * ===================================================================
 * PackagingMaterialService — danh mục, tồn kho và luật vật tư chèn (P1, 28/09/2026)
 * ===================================================================
 * Mượn khuôn PackagingBoxService (tồn chỉ đổi qua stock-in/pack, mỗi lần
 * 1 dòng sổ trong cùng transaction). KHÁC thùng: vật tư rẻ và đếm lẻ nên
 * KHÔNG giữ chỗ mềm và KHÔNG chặn đóng gói khi thiếu — trừ `min(cần, tồn)`,
 * ghi phần thiếu vào recommendation + báo, để kho không tắc vì 1 cái tem.
 * ===================================================================
 */
@Injectable()
export class PackagingMaterialService {
  constructor(
    @InjectModel(PackagingMaterial.name)
    private readonly materialModel: Model<PackagingMaterialDocument>,
    @InjectModel(PackagingMaterialMovement.name)
    private readonly movementModel: Model<PackagingMaterialMovementDocument>,
    @InjectModel(PackagingMaterialRules.name)
    private readonly rulesModel: Model<PackagingMaterialRulesDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  // ------------------------------------------------------------------
  // Dữ liệu cho engine
  // ------------------------------------------------------------------

  /** Danh mục đang dùng + bộ luật hiện hành, đổi sang kiểu lõi của engine. */
  async planningData(): Promise<MaterialPlanning> {
    const [materials, active] = await Promise.all([
      this.materialModel.find({ is_active: true }).lean(),
      this.getActiveRules(),
    ]);
    return { catalog: materials.map(toMaterialSpec), rules: active.rules };
  }

  async getActiveRules(): Promise<ActiveMaterialRules> {
    const doc = await this.rulesModel.findOne({ is_active: true }).sort({ version: -1 }).lean();
    if (!doc) return { version: null, rules: DEFAULT_MATERIAL_RULES, isDefault: true };
    return { version: doc.version, rules: doc.rules.map(entryToRule), isDefault: false };
  }

  /** Lưu bộ luật MỚI: tạo document version kế tiếp, tắt các bản cũ (giữ lịch sử). */
  async saveRules(rules: MaterialRuleDto[], userId: string): Promise<ActiveMaterialRules> {
    const latest = await this.rulesModel.findOne().sort({ version: -1 }).select('version').lean();
    const version = (latest?.version ?? 0) + 1;
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.rulesModel.create(
          [
            {
              version,
              rules: rules.map((r) => ({
                material_type: r.material_type,
                applies_to: r.applies_to,
                min_units: r.min_units ?? 1,
                basis: r.basis,
                quantity: r.quantity ?? 0,
                void_bands: r.void_bands ?? [],
              })),
              updated_by: new Types.ObjectId(userId),
              is_active: true,
            },
          ],
          { session },
        );
        await this.rulesModel.updateMany(
          { version: { $ne: version }, is_active: true },
          { $set: { is_active: false } },
          { session },
        );
      });
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        throw new AppException(
          PACKAGING_ERROR_CODES.MATERIAL_RULES_CONFLICT,
          'Bộ luật vừa được người khác lưu — tải lại rồi lưu lại.',
          HttpStatus.CONFLICT,
          { version },
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
    return this.getActiveRules();
  }

  // ------------------------------------------------------------------
  // Tồn kho
  // ------------------------------------------------------------------

  /** Nhập thêm vật tư — `$inc` + 1 dòng sổ trong cùng transaction. */
  async stockIn(id: string, quantity: number, userId: string | null, note?: string): Promise<PackagingMaterialDocument> {
    const material = await this.findById(id);
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(async () => {
        const doc = await this.materialModel.findOneAndUpdate(
          { _id: material._id },
          { $inc: { quantity_on_hand: quantity } },
          { returnDocument: 'after', session },
        );
        if (!doc) throw this.notFound(id);
        await this.movementModel.create(
          [
            {
              material_id: material._id,
              material_code: material.code,
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

  async listMovements(id: string, limit = 20): Promise<PackagingMaterialMovement[]> {
    const material = await this.findById(id);
    return this.movementModel.find({ material_id: material._id }).sort({ created_at: -1 }).limit(limit).lean();
  }

  /**
   * Trừ tồn cho các kiện vừa đóng (gọi TRONG transaction của pack). Thiếu tồn
   * KHÔNG ném lỗi: trừ phần có, trả về phần thiếu để caller ghi + báo.
   */
  async consumeForPack(
    session: ClientSession,
    needs: MaterialNeed[],
    groupId: Types.ObjectId,
    userId: string,
  ): Promise<MaterialConsumption> {
    const shortfalls: MaterialShortfall[] = [];
    const balances = new Map<string, ConsumedMaterial>();

    for (const need of needs) {
      if (need.quantity <= 0) continue;
      const material = await this.materialModel.findOne({ code: need.code }).session(session);
      const available = material?.quantity_on_hand ?? 0;
      const take = Math.min(need.quantity, available);
      let taken = 0;

      if (material && take > 0) {
        const updated = await this.materialModel.findOneAndUpdate(
          { _id: material._id, quantity_on_hand: { $gte: take } },
          { $inc: { quantity_on_hand: -take } },
          { returnDocument: 'after', session },
        );
        if (updated) {
          taken = take;
          await this.movementModel.create(
            [
              {
                material_id: updated._id,
                material_code: updated.code,
                delta: -take,
                reason: 'pack',
                balance_after: updated.quantity_on_hand,
                order_group_id: groupId,
                packing_plan_id: need.planId,
                parcel_no: need.parcelNo,
                user_id: new Types.ObjectId(userId),
              },
            ],
            { session },
          );
          const previous = balances.get(updated.code);
          balances.set(updated.code, {
            code: updated.code,
            name: updated.name,
            // `before` giữ lần trừ đầu tiên, `after` cập nhật theo lần trừ cuối.
            before: previous?.before ?? updated.quantity_on_hand + take,
            after: updated.quantity_on_hand,
            reorderLevel: updated.reorder_level,
          });
        }
      }
      if (taken < need.quantity) {
        shortfalls.push({
          planId: need.planId,
          parcelNo: need.parcelNo,
          code: need.code,
          missing: need.quantity - taken,
        });
      }
    }
    return { consumed: [...balances.values()], shortfalls };
  }

  // ------------------------------------------------------------------
  // CRUD danh mục
  // ------------------------------------------------------------------

  async list(activeOnly: boolean): Promise<PackagingMaterialDocument[]> {
    const query = activeOnly ? { is_active: true } : {};
    return this.materialModel.find(query).sort({ code: 1 });
  }

  async create(dto: CreatePackagingMaterialDto): Promise<PackagingMaterialDocument> {
    try {
      return await this.materialModel.create({
        code: dto.code,
        name: dto.name,
        type: dto.type,
        unit: dto.unit,
        weight_g_per_unit: dto.weight_g_per_unit,
        price_vnd_per_unit: dto.price_vnd_per_unit,
        // Tồn ban đầu 0 — nhập qua stock-in để có dòng sổ.
        quantity_on_hand: 0,
        reorder_level: dto.reorder_level ?? 20,
        storage_location: dto.storage_location?.trim() ? dto.storage_location.trim() : null,
        is_sample: false,
        is_active: true,
      });
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        throw new AppException(
          PACKAGING_ERROR_CODES.MATERIAL_CODE_IN_USE,
          `Mã vật tư "${dto.code}" đã tồn tại — chọn mã khác.`,
          HttpStatus.CONFLICT,
          { code: dto.code },
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdatePackagingMaterialDto): Promise<PackagingMaterialDocument> {
    const material = await this.findById(id);
    const measurementChanged = dto.weight_g_per_unit !== undefined || dto.price_vnd_per_unit !== undefined;
    const updated = await this.materialModel.findByIdAndUpdate(
      material._id,
      {
        $set: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.unit !== undefined && { unit: dto.unit }),
          ...(dto.weight_g_per_unit !== undefined && { weight_g_per_unit: dto.weight_g_per_unit }),
          ...(dto.price_vnd_per_unit !== undefined && { price_vnd_per_unit: dto.price_vnd_per_unit }),
          ...(dto.is_active !== undefined && { is_active: dto.is_active }),
          ...(dto.reorder_level !== undefined && { reorder_level: dto.reorder_level }),
          ...(dto.storage_location !== undefined && {
            storage_location: dto.storage_location?.trim() ? dto.storage_location.trim() : null,
          }),
          // Sửa khối lượng/giá = đã có số thật, bỏ nhãn "giả lập".
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
        PACKAGING_ERROR_CODES.INVALID_MATERIAL_ID,
        `"${id}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { id },
      );
    }
    const material = await this.materialModel.findById(id);
    if (!material) throw this.notFound(id);
    return material;
  }

  private notFound(id: string): AppException {
    return new AppException(
      PACKAGING_ERROR_CODES.MATERIAL_NOT_FOUND,
      `Không tìm thấy vật tư "${id}".`,
      HttpStatus.NOT_FOUND,
      { id },
    );
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}
