import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  PackagingMovement,
  PackagingMovementDocument,
} from '../packaging-materials/schemas/packaging-movement.schema';
import { PackagingBag, PackagingBagDocument } from './schemas/packaging-bag.schema';
import { CreatePackagingBagDto, StockInBagDto, UpdatePackagingBagDto } from './dto/packaging-bag.dto';
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
    @InjectModel(PackagingMovement.name)
    private readonly movementModel: Model<PackagingMovementDocument>,
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
        ...(dto.reorder_level !== undefined && { reorder_level: dto.reorder_level }),
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
          ...(dto.reorder_level !== undefined && { reorder_level: dto.reorder_level }),
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

  /** Nhập thêm túi: tăng tồn + 1 dòng sổ (loại purchase) trong cùng giao dịch. */
  async stockIn(id: string, dto: StockInBagDto, userId: string): Promise<PackagingBagDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException(
        PACKAGING_ERROR_CODES.INVALID_BAG_ID,
        `"${id}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { id },
      );
    }
    const session = await this.bagModel.db.startSession();
    try {
      let updated = null as PackagingBagDocument | null;
      await session.withTransaction(async () => {
        updated = await this.bagModel.findByIdAndUpdate(
          id,
          { $inc: { quantity_on_hand: dto.quantity } },
          { returnDocument: 'after', session },
        );
        if (!updated) return;
        await this.movementModel.create(
          [
            {
              material_code: updated.code,
              condition: 'new',
              type: 'purchase',
              delta: dto.quantity,
              saving_vnd: 0,
              ref_type: 'zip_bag',
              ref_id: null,
              note: dto.note?.trim() ? dto.note.trim() : null,
              actor_id: userId,
              balance_after: updated.quantity_on_hand,
              created_at: new Date(),
            },
          ],
          { session },
        );
      });
      if (!updated) {
        throw new AppException(
          PACKAGING_ERROR_CODES.BAG_NOT_FOUND,
          `Không tìm thấy túi "${id}".`,
          HttpStatus.NOT_FOUND,
          { id },
        );
      }
      return updated;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Trừ túi cho các kiện vừa niêm phong (gọi TRONG transaction của niêm phong).
   * KHÔNG chặn khi thiếu — túi đã bọc trên món rồi; trừ được bao nhiêu trừ bấy
   * nhiêu, phần thiếu trả về để ghi `materials_shortfall` + báo Admin.
   */
  async consumeForParcels(
    session: ClientSession,
    needs: { code: string; quantity: number; parcelNo: number }[],
    ref: { groupId: Types.ObjectId; planId: Types.ObjectId },
    actorId: string,
  ): Promise<{
    consumed: { code: string; name: string; before: number; after: number; reorderLevel: number }[];
    shortfalls: { parcelNo: number; code: string; missing: number }[];
  }> {
    const consumed = new Map<string, { code: string; name: string; before: number; after: number; reorderLevel: number }>();
    const shortfalls: { parcelNo: number; code: string; missing: number }[] = [];
    for (const need of needs) {
      if (need.quantity <= 0) continue;
      const bag = await this.bagModel.findOne({ code: need.code }).session(session);
      if (!bag) {
        shortfalls.push({ parcelNo: need.parcelNo, code: need.code, missing: need.quantity });
        continue;
      }
      const take = Math.min(need.quantity, bag.quantity_on_hand);
      let taken = 0;
      if (take > 0) {
        const ok = await this.bagModel.updateOne(
          { _id: bag._id, quantity_on_hand: { $gte: take } },
          { $inc: { quantity_on_hand: -take } },
          { session },
        );
        if (ok.modifiedCount === 1) taken = take;
      }
      if (taken > 0) {
        const before = consumed.get(bag.code)?.before ?? bag.quantity_on_hand;
        consumed.set(bag.code, {
          code: bag.code,
          name: bag.name,
          before,
          after: bag.quantity_on_hand - taken, // lần đọc nào cũng thấy số đã trừ ở các dòng trước (cùng giao dịch)
          reorderLevel: bag.reorder_level,
        });
        await this.movementModel.create(
          [
            {
              material_code: bag.code,
              condition: 'new',
              type: 'consume',
              delta: -taken,
              saving_vnd: 0,
              ref_type: 'order_group',
              ref_id: ref.groupId.toString(),
              note: null,
              actor_id: actorId,
              packing_plan_id: ref.planId,
              parcel_no: need.parcelNo,
              balance_after: bag.quantity_on_hand - taken,
              created_at: new Date(),
            },
          ],
          { session },
        );
      }
      if (taken < need.quantity) shortfalls.push({ parcelNo: need.parcelNo, code: bag.code, missing: need.quantity - taken });
    }
    return { consumed: [...consumed.values()], shortfalls };
  }
}
