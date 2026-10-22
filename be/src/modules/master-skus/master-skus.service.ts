import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { CategoriesService } from '../categories/categories.service';
import { ProductMaster, ProductMasterDocument } from '../product-master/schemas/product-master.schema';
import { Color, ColorDocument } from './schemas/color.schema';
import { MasterSku, MasterSkuDocument } from './schemas/master-sku.schema';
import { MarketplaceSkuMapping, MarketplaceSkuMappingDocument } from './schemas/marketplace-sku-mapping.schema';
import {
  CreateColorDto, CreateMasterSkuDto, UpdateColorDto, UpdateMasterSkuDto,
} from './dto/master-sku.dto';
import { MASTER_SKU_ERROR_CODES as E } from './master-skus.errors';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { SkuBinAssignment, SkuBinAssignmentDocument } from '../warehouse/schemas/sku-bin-assignment.schema';
import { InventoryMovement, InventoryMovementDocument } from '../warehouse/schemas/inventory-movement.schema';

export function buildMasterSkuCode(p: { category_code: string; model_no: number; color_code: string; size: string }): string {
  return `${p.category_code}-${String(p.model_no).padStart(3, '0')}-${p.color_code}-${p.size}`;
}

export function normalizeSellerSku(sku: string): string {
  return sku.trim().toUpperCase();
}

/**
 * ===================================================================
 * K4a (27/09/2026) — DANH MỤC MÀU + SKU NỘI BỘ + NỐI SKU SÀN
 * ===================================================================
 * Mã SKU nội bộ do hệ thống GHÉP (không cho gõ tay) -> luôn đúng quy ước.
 * Màu và size được kiểm theo danh mục chuẩn -> hết lệch "DEN"/"DENN".
 * Nối SKU sàn: chỉ nối được SKU đã ĐỒNG BỘ về (product_master) -> hết gõ sai.
 * Tồn kho ở K4a VẪN tính theo SKU sàn; K4b mới chuyển sang tính theo SKU nội bộ.
 * ===================================================================
 */
@Injectable()
export class MasterSkusService {
  constructor(
    @InjectModel(Color.name) private readonly colorModel: Model<ColorDocument>,
    @InjectModel(MasterSku.name) private readonly skuModel: Model<MasterSkuDocument>,
    @InjectModel(MarketplaceSkuMapping.name) private readonly mappingModel: Model<MarketplaceSkuMappingDocument>,
    @InjectModel(ProductMaster.name) private readonly productMasterModel: Model<ProductMasterDocument>,
    private readonly categoriesService: CategoriesService,
    // K4b — gắn nhãn / gộp tồn khi nối SKU
    @InjectModel(SkuBinAssignment.name) private readonly assignmentModel: Model<SkuBinAssignmentDocument>,
    @InjectModel(InventoryMovement.name) private readonly movementModel: Model<InventoryMovementDocument>,
  ) {}

  // ------------------------------------------------------------ màu

  async createColor(dto: CreateColorDto): Promise<ColorDocument> {
    try {
      return await this.colorModel.create({ code: dto.code, name: dto.name, hex: dto.hex ?? null });
    } catch (error: unknown) {
      if (this.isDup(error)) this.fail(E.COLOR_CODE_IN_USE, `Mã màu "${dto.code}" đã tồn tại.`, HttpStatus.CONFLICT);
      throw error;
    }
  }

  async listColors(includeInactive = false): Promise<ColorDocument[]> {
    return this.colorModel.find(includeInactive ? {} : { is_active: true }).sort({ code: 1 });
  }

  async updateColor(code: string, dto: UpdateColorDto): Promise<ColorDocument> {
    const set: Record<string, unknown> = {};
    if (dto.name !== undefined) set.name = dto.name;
    if (dto.hex !== undefined) set.hex = dto.hex;
    if (Object.keys(set).length === 0) this.fail(E.NOTHING_TO_UPDATE, 'Không có trường nào để cập nhật.', HttpStatus.BAD_REQUEST);
    const updated = await this.colorModel.findOneAndUpdate({ code }, { $set: set }, { returnDocument: 'after' });
    if (!updated) this.fail(E.COLOR_NOT_FOUND, `Không tìm thấy màu "${code}".`, HttpStatus.NOT_FOUND);
    return updated;
  }

  async setColorActive(code: string, active: boolean): Promise<ColorDocument> {
    if (!active) {
      const used = await this.skuModel.countDocuments({ color_code: code, is_active: true });
      if (used > 0) this.fail(E.COLOR_IN_USE, `Còn ${String(used)} SKU nội bộ đang dùng màu "${code}".`, HttpStatus.CONFLICT);
    }
    const updated = await this.colorModel.findOneAndUpdate({ code }, { $set: { is_active: active } }, { returnDocument: 'after' });
    if (!updated) this.fail(E.COLOR_NOT_FOUND, `Không tìm thấy màu "${code}".`, HttpStatus.NOT_FOUND);
    return updated;
  }

  private async assertActiveColor(code: string): Promise<void> {
    const c = await this.colorModel.findOne({ code });
    if (!c) this.fail(E.COLOR_NOT_FOUND, `Màu "${code}" chưa có trong danh mục màu — khai màu trước.`, HttpStatus.BAD_REQUEST);
    if (!c.is_active) this.fail(E.COLOR_INACTIVE, `Màu "${code}" đã bị vô hiệu hóa.`, HttpStatus.CONFLICT);
  }

  // ------------------------------------------------------- SKU nội bộ

  async create(dto: CreateMasterSkuDto, actorId: string, session?: ClientSession): Promise<MasterSkuDocument> {
    const category = await this.categoriesService.getActiveLevel2(dto.category_code);
    if (!category.size_scale.includes(dto.size)) {
      this.fail(E.SIZE_NOT_IN_SCALE, `Size "${dto.size}" không thuộc thang size của "${category.code}" (${category.size_scale.join(', ')}).`, HttpStatus.BAD_REQUEST);
    }
    await this.assertActiveColor(dto.color_code);
    const code = buildMasterSkuCode(dto);
    try {
      const [doc] = await this.skuModel.create([{
        master_sku: code,
        category_code: dto.category_code,
        model_no: dto.model_no,
        color_code: dto.color_code,
        size: dto.size,
        name: dto.name,
        gender: dto.gender ?? 'unisex',
        length_cm: dto.length_cm ?? null,
        width_cm: dto.width_cm ?? null,
        height_cm: dto.height_cm ?? null,
        weight_kg: dto.weight_kg ?? null,
        is_fragile: dto.is_fragile ?? false,
        created_by: actorId,
      }], { session });
      if (!doc) throw new Error('Tạo SKU nội bộ không trả về document');
      return doc;
    } catch (error: unknown) {
      if (this.isDup(error)) this.fail(E.ALREADY_EXISTS, `SKU nội bộ "${code}" đã tồn tại.`, HttpStatus.CONFLICT);
      throw error;
    }
  }

  async list(p: { categoryCode?: string; colorCode?: string; search?: string; includeInactive?: boolean; page: number; limit: number }): Promise<{ items: MasterSkuDocument[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (!p.includeInactive) filter.is_active = true;
    if (p.categoryCode) filter.category_code = p.categoryCode;
    if (p.colorCode) filter.color_code = p.colorCode;
    if (p.search) filter.master_sku = { $regex: p.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const [items, total] = await Promise.all([
      this.skuModel.find(filter).sort({ master_sku: 1 }).skip((p.page - 1) * p.limit).limit(p.limit),
      this.skuModel.countDocuments(filter),
    ]);
    return { items, total };
  }

  async get(code: string): Promise<MasterSkuDocument> {
    const doc = await this.skuModel.findOne({ master_sku: code });
    if (!doc) this.fail(E.NOT_FOUND, `Không tìm thấy SKU nội bộ "${code}".`, HttpStatus.NOT_FOUND);
    return doc;
  }

  async update(code: string, dto: UpdateMasterSkuDto): Promise<MasterSkuDocument> {
    const set: Record<string, unknown> = {};
    for (const k of ['name', 'gender', 'length_cm', 'width_cm', 'height_cm', 'weight_kg', 'is_fragile'] as const) {
      if (dto[k] !== undefined) set[k] = dto[k];
    }
    if (Object.keys(set).length === 0) this.fail(E.NOTHING_TO_UPDATE, 'Không có trường nào để cập nhật (mã và danh mục/mẫu/màu/size không sửa được).', HttpStatus.BAD_REQUEST);
    await this.get(code);
    const updated = await this.skuModel.findOneAndUpdate({ master_sku: code }, { $set: set }, { returnDocument: 'after' });
    return updated ?? this.get(code);
  }

  async setActive(code: string, active: boolean): Promise<MasterSkuDocument> {
    const doc = await this.get(code);
    if (!active) {
      const mapped = await this.mappingModel.countDocuments({ master_sku: code });
      if (mapped > 0) this.fail(E.HAS_MAPPINGS, `Còn ${String(mapped)} SKU sàn nối vào "${code}" — bỏ nối hoặc dùng "Thay thế SKU".`, HttpStatus.CONFLICT);
    } else if (doc.replaced_by) {
      this.fail(E.INACTIVE, `SKU "${code}" đã được thay bằng "${doc.replaced_by}" — không kích hoạt lại.`, HttpStatus.CONFLICT);
    }
    await this.skuModel.updateOne({ master_sku: code }, { $set: { is_active: active } });
    return this.get(code);
  }

  /**
   * 10/10/2026 — XOÁ HẲN SKU nội bộ tạo nhầm (báo cáo Hải Phượng). Chỉ khi CHƯA
   * TỪNG DÙNG: không còn SKU sàn nối vào, không nằm trên ô nào (kể cả dòng tồn 0),
   * không có dòng sổ cái nào. Đã dùng → vô hiệu hoá (DELETE thường) hoặc "Thay thế".
   * 3 truy vấn kiểm tra đều có index riêng theo master_sku.
   */
  async purge(code: string): Promise<{ deleted: true; masterSku: string }> {
    await this.get(code);
    const [mapped, onBin, movement] = await Promise.all([
      this.mappingModel.countDocuments({ master_sku: code }),
      this.assignmentModel.exists({ master_sku: code }),
      this.movementModel.exists({ master_sku: code }),
    ]);
    if (mapped > 0) this.fail(E.HAS_MAPPINGS, `Còn ${String(mapped)} SKU sàn nối vào "${code}" — bỏ nối trước khi xoá.`, HttpStatus.CONFLICT);
    if (onBin) this.fail(E.HAS_STOCK, `SKU "${code}" đang được gán vào ô trong kho — bỏ gán (hoặc chuyển hết hàng) trước khi xoá.`, HttpStatus.CONFLICT);
    if (movement) this.fail(E.HAS_HISTORY, `SKU "${code}" đã có lịch sử nhập–xuất — chỉ vô hiệu hoá hoặc "Thay thế SKU", không xoá hẳn.`, HttpStatus.CONFLICT);
    // Điều kiện lặp lại ngay trong lệnh xoá không cần: 3 điều kiện trên đều do
    // thao tác của Admin tạo ra (nối/gán/nhập), xung đột đồng thời gần như không có.
    await this.skuModel.deleteOne({ master_sku: code });
    return { deleted: true, masterSku: code };
  }


  // ------------------------------------------------------- nối SKU sàn

  async listMappings(code: string): Promise<MarketplaceSkuMappingDocument[]> {
    await this.get(code);
    return this.mappingModel.find({ master_sku: code }).sort({ platform: 1, shop_id: 1 });
  }

  /** K4b — dòng tồn > 0 CHƯA tính theo SKU nội bộ: chưa nối, hoặc đã nối mà chưa đồng bộ. */
  async listUnpooledStock(): Promise<{ notMapped: Record<string, unknown>[]; mappedNotSynced: Record<string, unknown>[] }> {
    const rows = await this.assignmentModel.find({ master_sku: null, quantity_on_hand: { $gt: 0 } }).lean();
    const maps = await this.mappingModel.find().select('platform shop_id seller_sku_normalized master_sku').lean();
    const mapKey = new Map(maps.map((m) => [`${m.platform}|${m.shop_id}|${m.seller_sku_normalized}`, m.master_sku]));
    const notMapped: Record<string, unknown>[] = [];
    const mappedNotSynced: Record<string, unknown>[] = [];
    for (const r of rows) {
      const master = mapKey.get(`${r.platform}|${r.shop_id}|${normalizeSellerSku(r.seller_sku)}`);
      const item = { assignmentId: r._id.toString(), warehouseId: r.warehouse_id.toString(), binLocationId: r.bin_location_id.toString(), platform: r.platform, shopId: r.shop_id, sellerSku: r.seller_sku, quantityOnHand: r.quantity_on_hand };
      if (master) mappedNotSynced.push({ ...item, masterSku: master });
      else notMapped.push(item);
    }
    return { notMapped, mappedNotSynced };
  }

  /** SKU sàn đã đồng bộ về nhưng CHƯA nối SKU nội bộ — danh sách việc cần làm của Admin. */
  async listUnmappedSellerSkus(): Promise<{ platform: MarketplacePlatform; shop_id: string; seller_sku: string }[]> {
    const mapped = await this.mappingModel.find().select('platform shop_id seller_sku_normalized').lean();
    const keys = new Set(mapped.map((m) => `${m.platform}|${m.shop_id}|${m.seller_sku_normalized}`));
    const all = await this.productMasterModel.find().select('platform shop_id seller_sku').lean();
    return all
      .filter((p) => !keys.has(`${p.platform}|${p.shop_id}|${normalizeSellerSku(p.seller_sku)}`))
      .map((p) => ({ platform: p.platform, shop_id: p.shop_id, seller_sku: p.seller_sku }));
  }

  /** Tra SKU sàn -> SKU nội bộ (dùng cho K4b và FE hiển thị). */
  async resolve(platform: MarketplacePlatform, shopId: string, sellerSku: string): Promise<MasterSkuDocument | null> {
    const m = await this.mappingModel.findOne({ platform, shop_id: shopId, seller_sku_normalized: normalizeSellerSku(sellerSku) });
    return m ? this.skuModel.findOne({ master_sku: m.master_sku }) : null;
  }

  // ------------------------------------------------------------ nội bộ

  private isDup(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }

  private fail(code: string, message: string, status: HttpStatus): never {
    throw new AppException(code, message, status);
  }
}
