import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model, Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import type { ProductCategory } from '../../common/enums/product-category.enum';
import { ProductMaster, type ProductMasterDocument } from '../product-master/schemas/product-master.schema';
import type { CreatePrimitiveModelDto, ListModelsQueryDto, UpdateModelDto, UploadModelDto } from './dto/product-model.dto';
import { MAX_MODEL_SIZE_M, MIN_MODEL_SIZE_M, inspectGlb } from './glb-inspect';
import { modelCategoryMismatch, modelSourceLabel } from './model-rules';
import { deleteModelFile, uploadModelFile } from './model-storage';
import { PRIMITIVE_PARAM_KEYS, normalizePrimitiveParams, type PrimitiveParams } from './primitive-params';
import { PRODUCT_MODEL_ERROR_CODES as E } from './product-models.errors';
import { ProductModel, type ProductModelDocument, type PrimitiveShape } from './schemas/product-model.schema';

export const MAX_MODEL_BYTES = 10 * 1024 * 1024;

export type ProductModelLean = ProductModel & { _id: Types.ObjectId; created_at?: Date; updated_at?: Date };

/** Ảnh chụp mô hình ghi vào kế hoạch đóng gói (spec §5.1, Q7) — kế hoạch cũ hiển thị đúng hình lúc tính. */
export interface ModelSnapshot {
  id: string;
  version: number;
  source: ProductModel['source'];
  kind: ProductModel['kind'];
  url: string | null;
  primitive: {
    shape: PrimitiveShape;
    corner_radius_pct: number | null;
    cap_height_pct: number | null;
    shoulder_pct: number | null;
    neck_height_pct: number | null;
    neck_diameter_pct: number | null;
    crimp_pct: number | null;
    body_color: string;
    cap_color: string | null;
  } | null;
}

export interface ModelFileInput {
  buffer: Buffer;
  size: number;
}

export function toSnapshot(m: ProductModelLean): ModelSnapshot {
  return {
    id: m._id.toString(),
    version: m.version,
    source: m.source,
    kind: m.kind,
    url: m.file?.url ?? null,
    primitive: m.primitive
      ? {
          shape: m.primitive.shape,
          corner_radius_pct: m.primitive.corner_radius_pct ?? null,
          cap_height_pct: m.primitive.cap_height_pct ?? null,
          shoulder_pct: m.primitive.shoulder_pct ?? null,
          neck_height_pct: m.primitive.neck_height_pct ?? null,
          neck_diameter_pct: m.primitive.neck_diameter_pct ?? null,
          crimp_pct: m.primitive.crimp_pct ?? null,
          body_color: m.primitive.body_color,
          cap_color: m.primitive.cap_color ?? null,
        }
      : null,
  };
}

export function toModelResponse(m: ProductModelLean, usageCount?: number): Record<string, unknown> {
  return {
    id: m._id.toString(),
    name: m.name,
    source: m.source,
    sourceLabel: modelSourceLabel(m),
    kind: m.kind,
    categoryKey: m.category_key ?? null,
    version: m.version,
    status: m.status,
    hasFoldRig: m.has_fold_rig,
    bboxM: m.bbox_m ?? null,
    credit: m.credit ?? null,
    snapshot: toSnapshot(m),
    usageCount: usageCount ?? null,
    createdAt: m.created_at ?? null,
    updatedAt: m.updated_at ?? null,
  };
}

/** AOFP-352 — thư viện mô hình 3D dùng chung (docs/specs/PRODUCT_3D_MODELS.md). */
@Injectable()
export class ProductModelsService {
  private readonly logger = new Logger(ProductModelsService.name);

  constructor(
    @InjectModel(ProductModel.name) private readonly modelModel: Model<ProductModelDocument>,
    @InjectModel(ProductMaster.name) private readonly productMasterModel: Model<ProductMasterDocument>,
  ) {}

  private parseId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException(E.INVALID_ID, `"${id}" không đúng định dạng ObjectId.`, HttpStatus.BAD_REQUEST, { id });
    }
    return new Types.ObjectId(id);
  }

  async findById(id: string): Promise<ProductModelLean> {
    const doc = await this.modelModel.findById(this.parseId(id)).lean<ProductModelLean>();
    if (!doc) throw new AppException(E.NOT_FOUND, 'Không tìm thấy mô hình 3D.', HttpStatus.NOT_FOUND, { id });
    return doc;
  }

  private async usageCounts(ids: Types.ObjectId[]): Promise<Map<string, number>> {
    const rows = await this.productMasterModel.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { model_id: { $in: ids } } },
      { $group: { _id: '$model_id', n: { $sum: 1 } } },
    ]);
    return new Map(rows.map((r) => [r._id.toString(), r.n]));
  }

  async list(query: ListModelsQueryDto): Promise<{ items: Record<string, unknown>[]; total: number; page: number; limit: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const filter: Record<string, unknown> = {};
    const status = query.status ?? 'active';
    if (status !== 'all') filter.status = status;
    if (query.source) filter.source = query.source;
    if (query.q?.trim()) filter.name = { $regex: query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    if (query.unused) {
      const used = await this.productMasterModel.distinct('model_id', { model_id: { $ne: null } });
      filter._id = { $nin: used };
    }
    const [docs, total] = await Promise.all([
      this.modelModel
        .find(filter)
        .sort({ source: 1, name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<ProductModelLean[]>(),
      this.modelModel.countDocuments(filter),
    ]);
    const counts = await this.usageCounts(docs.map((d) => d._id));
    return { items: docs.map((d) => toModelResponse(d, counts.get(d._id.toString()) ?? 0)), total, page, limit };
  }

  async detail(id: string): Promise<Record<string, unknown>> {
    const model = await this.findById(id);
    const usedBy = await this.productMasterModel
      .find({ model_id: model._id })
      .select('platform shop_id seller_sku product_category packaging_profile_status')
      .sort({ seller_sku: 1 })
      .limit(500)
      .lean();
    return {
      ...toModelResponse(model, usedBy.length),
      usedBy: usedBy.map((p) => ({
        id: (p as { _id: Types.ObjectId })._id.toString(),
        platform: p.platform,
        shopId: p.shop_id,
        sellerSku: p.seller_sku,
        productCategory: p.product_category ?? null,
        packagingProfileStatus: p.packaging_profile_status,
      })),
    };
  }

  async createPrimitive(dto: CreatePrimitiveModelDto, userId: string): Promise<ProductModelLean> {
    const { params, error } = normalizePrimitiveParams(dto.shape, (dto.params ?? {}));
    if (error) throw new AppException(E.INVALID_PRIMITIVE, `Thông số hình cơ bản không hợp lệ: ${error}.`, HttpStatus.BAD_REQUEST);
    const created = await this.modelModel.create({
      name: dto.name.trim(),
      source: 'primitive',
      kind: 'rigid',
      primitive: { shape: dto.shape, ...params, body_color: dto.body_color, cap_color: dto.cap_color ?? null },
      credit: { type: 'self_made', url: null, license: null },
      created_by: new Types.ObjectId(userId),
      updated_by: new Types.ObjectId(userId),
    });
    return created.toObject();
  }

  /** Kiểm tra file GLB (R6–R8). Trả khối bao + có rig gập. */
  private validateFile(file: ModelFileInput | undefined, kind: ProductModel['kind']): {
    buffer: Buffer;
    bbox: { x: number; y: number; z: number };
    hasFoldRig: boolean;
  } {
    if (!file || file.size === 0) throw new AppException(E.NO_FILE, 'Chọn file mô hình GLB (field "file").');
    if (file.size > MAX_MODEL_BYTES) {
      throw new AppException(E.INVALID_FILE, 'File phải là GLB (glTF 2.0), tối đa 10 MB.', HttpStatus.BAD_REQUEST, {
        maxBytes: MAX_MODEL_BYTES,
      });
    }
    const inspected = inspectGlb(file.buffer);
    if (!inspected.ok) {
      throw new AppException(E.INVALID_FILE, 'File phải là GLB (glTF 2.0), tối đa 10 MB.', HttpStatus.BAD_REQUEST, {
        reason: inspected.reason,
      });
    }
    const dims = [inspected.bbox.x, inspected.bbox.y, inspected.bbox.z];
    const largest = Math.max(...dims);
    if (Math.min(...dims) <= 0 || largest < MIN_MODEL_SIZE_M || largest > MAX_MODEL_SIZE_M) {
      throw new AppException(
        E.BAD_UNITS,
        `Mô hình có cạnh lớn nhất ${String(largest)} m — có thể sai đơn vị (glTF dùng mét, hợp lệ 0,01–2 m).`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { bboxM: inspected.bbox },
      );
    }
    if (kind === 'garment' && !inspected.hasFoldRig) {
      throw new AppException(
        E.GARMENT_RIG_MISSING,
        'Mô hình quần áo cần có xương gập và clip gập + túi zip (node "zipbag_bottom") để chạy hướng dẫn gập — dùng mô hình theo loại hoặc dựng theo mẫu.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return { buffer: file.buffer, bbox: inspected.bbox, hasFoldRig: inspected.hasFoldRig };
  }

  async upload(file: ModelFileInput | undefined, dto: UploadModelDto, userId: string): Promise<ProductModelLean> {
    const { buffer, bbox, hasFoldRig } = this.validateFile(file, dto.kind);
    const stored = await uploadModelFile(buffer);
    try {
      const created = await this.modelModel.create({
        name: dto.name.trim(),
        source: 'upload',
        kind: dto.kind,
        file: { url: stored.url, public_id: stored.publicId, bytes: stored.bytes, sha256: createHash('sha256').update(buffer).digest('hex') },
        bbox_m: bbox,
        has_fold_rig: hasFoldRig,
        credit: { type: dto.credit.type, url: dto.credit.url ?? null, license: dto.credit.license ?? null },
        created_by: new Types.ObjectId(userId),
        updated_by: new Types.ObjectId(userId),
      });
      return created.toObject();
    } catch (error: unknown) {
      await deleteModelFile(stored.publicId);
      throw error;
    }
  }

  /** Admin thay file (R12): mọi SKU đang dùng đổi hình; kế hoạch cũ giữ ảnh chụp phiên bản cũ. File cũ giữ lại. */
  async replaceFile(id: string, file: ModelFileInput | undefined, userId: string): Promise<ProductModelLean> {
    const model = await this.findById(id);
    if (model.source === 'primitive') {
      throw new AppException(E.NOT_A_FILE_MODEL, 'Mô hình dựng từ hình cơ bản không có file — sửa thông số thay vì tải file.', HttpStatus.BAD_REQUEST);
    }
    const { buffer, bbox, hasFoldRig } = this.validateFile(file, model.kind);
    const stored = await uploadModelFile(buffer);
    try {
      const updated = await this.modelModel
        .findOneAndUpdate(
          { _id: model._id, version: model.version },
          {
            $set: {
              file: { url: stored.url, public_id: stored.publicId, bytes: stored.bytes, sha256: createHash('sha256').update(buffer).digest('hex') },
              bbox_m: bbox,
              has_fold_rig: hasFoldRig,
              updated_by: new Types.ObjectId(userId),
            },
            $inc: { version: 1 },
            $push: { history: { version: model.version, file: model.file, primitive: null, replaced_at: new Date() } },
          },
          { returnDocument: 'after' },
        )
        .lean<ProductModelLean>();
      if (!updated) throw new AppException(E.NOT_FOUND, 'Mô hình vừa bị người khác sửa — tải lại rồi thử lại.', HttpStatus.CONFLICT, { id });
      this.logger.log(`Thay file mô hình ${model.name} v${String(model.version)} → v${String(updated.version)}.`);
      return updated;
    } catch (error: unknown) {
      await deleteModelFile(stored.publicId);
      throw error;
    }
  }

  async update(id: string, dto: UpdateModelDto, userId: string): Promise<ProductModelLean> {
    const model = await this.findById(id);
    const set: Record<string, unknown> = { updated_by: new Types.ObjectId(userId) };
    if (dto.name !== undefined) set.name = dto.name.trim();
    if (dto.credit !== undefined) set.credit = { type: dto.credit.type, url: dto.credit.url ?? null, license: dto.credit.license ?? null };
    const touchesShape = dto.params !== undefined || dto.body_color !== undefined || dto.cap_color !== undefined;
    const update: Record<string, unknown> = { $set: set };
    if (touchesShape) {
      if (!model.primitive) {
        throw new AppException(E.NOT_A_PRIMITIVE, 'Chỉ mô hình dựng từ hình cơ bản mới sửa được thông số.', HttpStatus.BAD_REQUEST);
      }
      const current = model.primitive;
      const merged: PrimitiveParams = {};
      for (const key of PRIMITIVE_PARAM_KEYS) {
        const value = dto.params?.[key] ?? current[key];
        if (value != null) merged[key] = value;
      }
      const { params, error } = normalizePrimitiveParams(current.shape, merged);
      if (error) throw new AppException(E.INVALID_PRIMITIVE, `Thông số hình cơ bản không hợp lệ: ${error}.`, HttpStatus.BAD_REQUEST);
      set.primitive = {
        shape: current.shape,
        ...params,
        body_color: dto.body_color ?? current.body_color,
        cap_color: dto.cap_color === undefined ? current.cap_color : dto.cap_color,
      };
      update.$inc = { version: 1 };
      update.$push = { history: { version: model.version, file: null, primitive: current, replaced_at: new Date() } };
    }
    const updated = await this.modelModel
      .findOneAndUpdate({ _id: model._id, version: model.version }, update, { returnDocument: 'after', runValidators: true })
      .lean<ProductModelLean>();
    if (!updated) throw new AppException(E.NOT_FOUND, 'Mô hình vừa bị người khác sửa — tải lại rồi thử lại.', HttpStatus.CONFLICT, { id });
    return updated;
  }

  /** R13 — ngừng dùng: ẩn khỏi danh sách chọn, SKU đang dùng vẫn hợp lệ. Không có xoá cứng (R14). */
  async setStatus(id: string, status: 'active' | 'retired', userId: string): Promise<ProductModelLean> {
    const model = await this.findById(id);
    const updated = await this.modelModel
      .findByIdAndUpdate(model._id, { $set: { status, updated_by: new Types.ObjectId(userId) } }, { returnDocument: 'after' })
      .lean<ProductModelLean>();
    return updated ?? model;
  }

  /**
   * Gắn mô hình cho SKU: phải tồn tại, hợp loại. Mô hình đã ngừng dùng chỉ được giữ nếu SKU đang dùng sẵn
   * (không gắn mới). Ném AppException với mã truyền vào để product-master giữ mã lỗi của mình.
   */
  async assertAttachable(
    modelId: string,
    category: string | null | undefined,
    currentModelId: Types.ObjectId | null | undefined,
    codes: { required: string; mismatch: string },
  ): Promise<ProductModelLean> {
    if (!Types.ObjectId.isValid(modelId)) {
      throw new AppException(codes.required, 'Chọn mô hình 3D trước khi xác nhận hồ sơ đóng gói.', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const model = await this.modelModel.findById(modelId).lean<ProductModelLean>();
    if (!model || (model.status === 'retired' && !currentModelId?.equals(model._id))) {
      throw new AppException(codes.required, 'Mô hình 3D không có hoặc đã ngừng dùng — chọn mô hình khác.', HttpStatus.UNPROCESSABLE_ENTITY, {
        modelId,
      });
    }
    const mismatch = modelCategoryMismatch(category, model);
    if (mismatch) {
      throw new AppException(codes.mismatch, mismatch, HttpStatus.UNPROCESSABLE_ENTITY, { modelId, productCategory: category ?? null });
    }
    return model;
  }

  /** Xác nhận hồ sơ: có model_id thì kiểm tra; không có thì giữ mô hình đang gắn nếu hợp loại, rồi tới mô hình theo loại. */
  async resolveForConfirm(
    modelId: string | null,
    category: string | null | undefined,
    currentModelId: Types.ObjectId | null | undefined,
    codes: { required: string; mismatch: string },
  ): Promise<ProductModelLean> {
    if (modelId) return this.assertAttachable(modelId, category, currentModelId, codes);
    const current = currentModelId ? await this.modelModel.findById(currentModelId).lean<ProductModelLean>() : null;
    if (current && !modelCategoryMismatch(category, current)) return current;
    const byCategory = await this.findCategoryModel(category);
    if (byCategory) return byCategory;
    throw new AppException(codes.required, 'Chọn mô hình 3D trước khi xác nhận hồ sơ đóng gói.', HttpStatus.UNPROCESSABLE_ENTITY);
  }

  /** Ảnh chụp cho nhiều mô hình một lần (ghi kế hoạch). */
  async snapshots(ids: (Types.ObjectId | null | undefined)[]): Promise<Map<string, ModelSnapshot>> {
    const unique = [...new Set(ids.filter((x): x is Types.ObjectId => !!x).map((x) => x.toString()))];
    if (unique.length === 0) return new Map();
    const docs = await this.modelModel.find({ _id: { $in: unique.map((x) => new Types.ObjectId(x)) } }).lean<ProductModelLean[]>();
    return new Map(docs.map((d) => [d._id.toString(), toSnapshot(d)]));
  }

  async findCategoryModel(category: string | null | undefined): Promise<ProductModelLean | null> {
    if (!category) return null;
    return this.modelModel.findOne({ source: 'category', category_key: category as ProductCategory, status: 'active' }).lean<ProductModelLean>();
  }
}
