import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PackagingBag, PackagingBagDocument } from './schemas/packaging-bag.schema';
import { CreatePackagingBagDto, UpdatePackagingBagDto } from './dto/packaging-bag.dto';
import { AppException } from '../../common/exceptions/app-exception';
import { PACKAGING_ERROR_CODES } from './packaging.errors';

/**
 * CRUD danh mục túi zip (21/09/2026). Ngừng dùng = xóa mềm (Rule #8);
 * hồ sơ SKU chỉ được chọn túi đang dùng.
 */
@Injectable()
export class PackagingBagService {
  constructor(
    @InjectModel(PackagingBag.name)
    private readonly bagModel: Model<PackagingBagDocument>,
  ) {}

  async list(activeOnly: boolean): Promise<PackagingBagDocument[]> {
    const query = activeOnly ? { is_active: true } : {};
    return this.bagModel.find(query).sort({ code: 1 });
  }

  /** Tên túi theo mã (kể cả túi đã ngừng dùng) — dùng cho hướng dẫn đóng gói. */
  async namesByCode(codes: string[]): Promise<Map<string, string>> {
    if (codes.length === 0) return new Map();
    const bags = await this.bagModel.find({ code: { $in: codes } }).select('code name').lean();
    return new Map(bags.map((b) => [b.code, b.name]));
  }

  async assertActiveCode(code: string): Promise<void> {
    const exists = await this.bagModel.exists({ code, is_active: true });
    if (!exists) {
      throw new AppException(
        PACKAGING_ERROR_CODES.BAG_NOT_FOUND,
        `Không có túi zip "${code}" đang dùng trong danh mục.`,
        HttpStatus.NOT_FOUND,
        { code },
      );
    }
  }

  async create(dto: CreatePackagingBagDto): Promise<PackagingBagDocument> {
    try {
      return await this.bagModel.create({
        code: dto.code,
        name: dto.name,
        width_mm: dto.width_mm,
        length_mm: dto.length_mm,
        price_vnd: dto.price_vnd ?? null,
        is_sample: false,
        is_active: true,
      });
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        throw new AppException(
          PACKAGING_ERROR_CODES.BAG_CODE_IN_USE,
          `Mã túi "${dto.code}" đã tồn tại — chọn mã khác.`,
          HttpStatus.CONFLICT,
          { code: dto.code },
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdatePackagingBagDto): Promise<PackagingBagDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException(
        PACKAGING_ERROR_CODES.INVALID_BAG_ID,
        `"${id}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { id },
      );
    }
    const measurementChanged = dto.width_mm !== undefined || dto.length_mm !== undefined;
    const updated = await this.bagModel.findByIdAndUpdate(
      id,
      {
        $set: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.width_mm !== undefined && { width_mm: dto.width_mm }),
          ...(dto.length_mm !== undefined && { length_mm: dto.length_mm }),
          ...(dto.price_vnd !== undefined && { price_vnd: dto.price_vnd }),
          ...(dto.is_active !== undefined && { is_active: dto.is_active }),
          ...(measurementChanged && { is_sample: false }),
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
    if (!updated) {
      throw new AppException(
        PACKAGING_ERROR_CODES.BAG_NOT_FOUND,
        `Không tìm thấy túi "${id}".`,
        HttpStatus.NOT_FOUND,
        { id },
      );
    }
    return updated;
  }
}
