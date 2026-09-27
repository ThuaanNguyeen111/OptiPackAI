import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { BinLocation, BinLocationDocument } from '../warehouse/schemas/bin-location.schema';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CATEGORY_ERROR_CODES } from './categories.errors';
import { AppException } from '../../common/exceptions/app-exception';

export interface CategoryTreeNode {
  category: CategoryDocument;
  children: CategoryDocument[];
}

/**
 * K2 (26/09/2026) — danh mục 2 cấp, đủ vòng đời ngay từ lúc tạo (áp dụng
 * "Bảng vòng đời" trong CLAUDE.md): Tạo, Xem cây, Xem 1, Sửa (tên + thang
 * size), Vô hiệu hóa, Kích hoạt lại. Không xóa cứng.
 * Đăng ký lại schema BinLocation (không import WarehouseModule) để kiểm
 * "danh mục/size đang được kệ dùng" mà không tạo vòng phụ thuộc module.
 */
@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(BinLocation.name) private readonly binModel: Model<BinLocationDocument>,
  ) {}

  private fail(code: string, message: string, status: HttpStatus, details?: Record<string, unknown>): never {
    throw new AppException(code, message, status, details);
  }

  async getByCode(code: string): Promise<CategoryDocument> {
    const cat = await this.categoryModel.findOne({ code });
    if (!cat) this.fail(CATEGORY_ERROR_CODES.NOT_FOUND, `Không tìm thấy danh mục "${code}".`, HttpStatus.NOT_FOUND, { code });
    return cat;
  }

  /** Dùng bởi module kho: danh mục gắn vào kệ phải là cấp 2 đang hoạt động. */
  async getActiveLevel2(code: string): Promise<CategoryDocument> {
    const cat = await this.getByCode(code);
    if (cat.level !== 2) {
      this.fail(CATEGORY_ERROR_CODES.NOT_LEVEL_2, `"${code}" là danh mục cấp 1 — chỉ gắn được danh mục cấp 2 (VD Áo thun, không phải Áo).`, HttpStatus.BAD_REQUEST, { code });
    }
    if (!cat.is_active) this.fail(CATEGORY_ERROR_CODES.INACTIVE, `Danh mục "${code}" đã bị vô hiệu hóa.`, HttpStatus.CONFLICT, { code });
    return cat;
  }

  async create(dto: CreateCategoryDto): Promise<CategoryDocument> {
    const sizes = dto.size_scale ?? [];
    let level: 1 | 2 = 1;
    if (dto.parent_code) {
      const parent = await this.categoryModel.findOne({ code: dto.parent_code });
      if (!parent) this.fail(CATEGORY_ERROR_CODES.PARENT_NOT_FOUND, `Không tìm thấy danh mục cha "${dto.parent_code}".`, HttpStatus.NOT_FOUND);
      if (parent.level !== 1) this.fail(CATEGORY_ERROR_CODES.PARENT_NOT_LEVEL_1, 'Chỉ hỗ trợ 2 cấp — danh mục cha phải là cấp 1.', HttpStatus.BAD_REQUEST);
      if (!parent.is_active) this.fail(CATEGORY_ERROR_CODES.PARENT_INACTIVE, `Danh mục cha "${parent.code}" đã bị vô hiệu hóa.`, HttpStatus.CONFLICT);
      level = 2;
      if (sizes.length === 0) this.fail(CATEGORY_ERROR_CODES.SIZE_SCALE_REQUIRED, 'Danh mục cấp 2 bắt buộc có thang size.', HttpStatus.BAD_REQUEST);
    } else if (sizes.length > 0) {
      this.fail(CATEGORY_ERROR_CODES.SIZE_SCALE_NOT_ALLOWED, 'Danh mục cấp 1 chỉ để nhóm, không có thang size.', HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.categoryModel.create({
        code: dto.code,
        name: dto.name,
        parent_code: dto.parent_code ?? null,
        level,
        size_scale: sizes,
      });
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        this.fail(CATEGORY_ERROR_CODES.CODE_IN_USE, `Mã danh mục "${dto.code}" đã được dùng.`, HttpStatus.CONFLICT, { code: dto.code });
      }
      throw error;
    }
  }

  async listTree(includeInactive = false): Promise<CategoryTreeNode[]> {
    const all = await this.categoryModel.find(includeInactive ? {} : { is_active: true }).sort({ code: 1 });
    const roots = all.filter((c) => c.level === 1);
    return roots.map((root) => ({ category: root, children: all.filter((c) => c.parent_code === root.code) }));
  }

  async update(code: string, dto: UpdateCategoryDto): Promise<CategoryDocument> {
    if (dto.name === undefined && dto.size_scale === undefined) {
      this.fail(CATEGORY_ERROR_CODES.NOTHING_TO_UPDATE, 'Không có trường nào để cập nhật.', HttpStatus.BAD_REQUEST);
    }
    const cat = await this.getByCode(code);
    const set: Record<string, unknown> = {};
    if (dto.name !== undefined) set.name = dto.name;
    if (dto.size_scale !== undefined) {
      if (cat.level === 1) this.fail(CATEGORY_ERROR_CODES.SIZE_SCALE_NOT_ALLOWED, 'Danh mục cấp 1 không có thang size.', HttpStatus.BAD_REQUEST);
      if (dto.size_scale.length === 0) this.fail(CATEGORY_ERROR_CODES.SIZE_SCALE_REQUIRED, 'Thang size không được rỗng.', HttpStatus.BAD_REQUEST);
      // Xung đột với dữ liệu đang dùng: bỏ 1 size mà kệ đang đăng ký size đó -> kệ
      // mang size "không còn tồn tại" -> chặn, bắt đổi đăng ký kệ trước.
      const removed = cat.size_scale.filter((s) => !dto.size_scale?.includes(s));
      if (removed.length > 0) {
        const inUse = await this.binModel.countDocuments({
          'designated.category_code': code,
          'designated.size': { $in: removed },
          is_active: { $ne: false },
        });
        if (inUse > 0) {
          this.fail(CATEGORY_ERROR_CODES.SIZE_IN_USE, `Không bỏ được size ${removed.join(', ')} — đang có ${String(inUse)} ô kệ đăng ký. Đổi đăng ký các ô đó trước.`, HttpStatus.CONFLICT, { removed, binsInUse: inUse });
        }
      }
      set.size_scale = dto.size_scale;
    }
    const updated = await this.categoryModel.findOneAndUpdate({ code }, { $set: set }, { returnDocument: 'after' });
    return updated ?? this.getByCode(code);
  }

  async deactivate(code: string): Promise<CategoryDocument> {
    const cat = await this.getByCode(code);
    if (!cat.is_active) return cat;
    if (cat.level === 1) {
      const activeChildren = await this.categoryModel.countDocuments({ parent_code: code, is_active: true });
      if (activeChildren > 0) {
        this.fail(CATEGORY_ERROR_CODES.HAS_ACTIVE_CHILDREN, `Còn ${String(activeChildren)} danh mục con đang hoạt động — vô hiệu hóa chúng trước.`, HttpStatus.CONFLICT, { activeChildren });
      }
    } else {
      const binsInUse = await this.binModel.countDocuments({ 'designated.category_code': code, is_active: { $ne: false } });
      if (binsInUse > 0) {
        this.fail(CATEGORY_ERROR_CODES.IN_USE, `Còn ${String(binsInUse)} ô kệ đang đăng ký danh mục này.`, HttpStatus.CONFLICT, { binsInUse });
      }
    }
    await this.categoryModel.updateOne({ code }, { $set: { is_active: false } });
    return this.getByCode(code);
  }

  async reactivate(code: string): Promise<CategoryDocument> {
    const cat = await this.getByCode(code);
    if (cat.parent_code) {
      const parent = await this.getByCode(cat.parent_code);
      if (!parent.is_active) this.fail(CATEGORY_ERROR_CODES.PARENT_INACTIVE, `Kích hoạt lại danh mục cha "${parent.code}" trước.`, HttpStatus.CONFLICT);
    }
    await this.categoryModel.updateOne({ code }, { $set: { is_active: true } });
    return this.getByCode(code);
  }
}
