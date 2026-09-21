import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PackagingBox, PackagingBoxDocument } from './schemas/packaging-box.schema';
import { CreatePackagingBoxDto, UpdatePackagingBoxDto } from './dto/packaging-box.dto';
import { AppException } from '../../common/exceptions/app-exception';
import { PACKAGING_ERROR_CODES } from './packaging.errors';
import type { BoxSpec } from './engine';

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
  ) {}

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
