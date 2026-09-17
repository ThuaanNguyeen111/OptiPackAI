import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Warehouse, WarehouseDocument } from './schemas/warehouse.schema';
import { WarehouseZone, WarehouseZoneDocument } from './schemas/warehouse-zone.schema';
import { BinLocation, BinLocationDocument } from './schemas/bin-location.schema';
import { SkuBinAssignment, SkuBinAssignmentDocument } from './schemas/sku-bin-assignment.schema';
import { ProductMaster, ProductMasterDocument } from '../product-master/schemas/product-master.schema';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { CreateZoneDto } from './dto/create-zone.dto';
import { GenerateBinLocationsDto } from './dto/generate-bin-locations.dto';
import { AssignSkuBinDto } from './dto/assign-sku-bin.dto';
import { WAREHOUSE_ERROR_CODES } from './warehouse.errors';
import { AppException } from '../../common/exceptions/app-exception';
import { OrderGroupsService } from '../order-groups/order-groups.service';
import { PackableItem } from '../../common/interfaces/packaging.interface';
import { parseMarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { oidString } from './utils/oid-string.util';

export interface PickingListItem extends PackableItem {
  zone_code: string;
  bin_code: string;
}

export interface BinWarehouseIdBackfillResult {
  scanned: number;
  attached: number;
  retargeted: number;
  deleted: number;
  skipped: number;
}

function oidKey(value: unknown): string {
  return oidString(value);
}

function asObjectId(value: unknown): Types.ObjectId | null {
  const key = oidKey(value);
  if (key.length === 0 || !Types.ObjectId.isValid(key)) {
    return null;
  }
  return new Types.ObjectId(key);
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

/**
 * ===================================================================
 * warehouse.service.ts — MỚI (2026-09-09)
 * ===================================================================
 * Toàn bộ mô hình 4 tầng (Warehouse -> Zone -> BinLocation ->
 * SkuBinAssignment) + Picking List sắp xếp theo lộ trình vật lý — ĐÚNG
 * thiết kế đã chốt sẵn trong CLAUDE.md, mục "Nghiên cứu Actor & Hệ
 * thống Kho vị trí" — implement không đổi ý giữa chừng.
 * ===================================================================
 */
@Injectable()
export class WarehouseService implements OnModuleInit {
  private readonly logger = new Logger(WarehouseService.name);
  private inFlightBinWarehouseIdBackfill: Promise<BinWarehouseIdBackfillResult> | null =
    null;

  constructor(
    @InjectModel(Warehouse.name) private readonly warehouseModel: Model<WarehouseDocument>,
    @InjectModel(WarehouseZone.name) private readonly zoneModel: Model<WarehouseZoneDocument>,
    @InjectModel(BinLocation.name) private readonly binModel: Model<BinLocationDocument>,
    @InjectModel(SkuBinAssignment.name)
    private readonly assignmentModel: Model<SkuBinAssignmentDocument>,
    @InjectModel(ProductMaster.name) private readonly productMasterModel: Model<ProductMasterDocument>,
    private readonly orderGroupsService: OrderGroupsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.tryBackfillMissingBinWarehouseIds();
  }

  /**
   * Kệ sinh TRƯỚC bản vá `$setOnInsert.warehouse_id` có thể thiếu field
   * (list kệ crash, dropdown trống). Tự gắn lại từ `zone.warehouse_id`.
   * Nếu Admin sinh lại cùng khoảng sau khi vá, bản đủ field đã tồn tại
   * → chuyển SKU đang trỏ kệ mồ côi sang bản đủ, rồi xóa bản thiếu.
   */
  async backfillMissingBinWarehouseIds(): Promise<BinWarehouseIdBackfillResult> {
    const orphans = await this.binModel
      .find({
        $or: [{ warehouse_id: { $exists: false } }, { warehouse_id: null }],
      })
      .select('_id zone_id bin_code')
      .lean();

    if (orphans.length === 0) {
      return { scanned: 0, attached: 0, retargeted: 0, deleted: 0, skipped: 0 };
    }

    const zoneIdKeys = [
      ...new Set(orphans.map((bin) => oidKey(bin.zone_id)).filter((id) => id.length > 0)),
    ];
    const zoneObjectIds = zoneIdKeys
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    const zones = await this.zoneModel
      .find({ _id: { $in: zoneObjectIds } })
      .select('_id warehouse_id')
      .lean();
    const warehouseByZoneId = new Map<string, Types.ObjectId>();
    for (const zone of zones) {
      const zoneId = oidKey(zone._id);
      const warehouseId = asObjectId(zone.warehouse_id);
      if (zoneId.length > 0 && warehouseId) {
        warehouseByZoneId.set(zoneId, warehouseId);
      }
    }

    const warehouseIds: Types.ObjectId[] = [];
    const binCodes: string[] = [];
    for (const orphan of orphans) {
      const warehouseId = warehouseByZoneId.get(oidKey(orphan.zone_id));
      if (!warehouseId) continue;
      warehouseIds.push(warehouseId);
      binCodes.push(orphan.bin_code);
    }

    const completeBins =
      warehouseIds.length === 0
        ? []
        : await this.binModel
            .find({
              warehouse_id: { $in: warehouseIds },
              bin_code: { $in: binCodes },
            })
            .select('_id warehouse_id bin_code')
            .lean();

    const completeByKey = new Map<string, Types.ObjectId>();
    for (const bin of completeBins) {
      const warehouseId = asObjectId(bin.warehouse_id);
      const binId = asObjectId(bin._id);
      if (!warehouseId || !binId) continue;
      completeByKey.set(`${oidKey(warehouseId)}|${bin.bin_code}`, binId);
    }

    const attachOps: {
      updateOne: {
        filter: { _id: Types.ObjectId };
        update: { $set: { warehouse_id: Types.ObjectId } };
      };
    }[] = [];
    const retargetOps: {
      updateMany: {
        filter: { bin_location_id: Types.ObjectId };
        update: { $set: { bin_location_id: Types.ObjectId } };
      };
    }[] = [];
    const deleteIds: Types.ObjectId[] = [];
    let skipped = 0;

    const keeperOrphanByKey = new Map<string, Types.ObjectId>();

    for (const orphan of orphans) {
      const orphanId = asObjectId(orphan._id);
      const warehouseId = warehouseByZoneId.get(oidKey(orphan.zone_id));
      if (!orphanId || !warehouseId) {
        skipped += 1;
        this.logger.warn(
          `Bin ${orphan.bin_code} (${oidKey(orphan._id)}) thiếu zone hợp lệ — không gắn warehouse_id.`,
        );
        continue;
      }

      const key = `${oidKey(warehouseId)}|${orphan.bin_code}`;
      const existingComplete = completeByKey.get(key);
      if (existingComplete) {
        retargetOps.push({
          updateMany: {
            filter: { bin_location_id: orphanId },
            update: { $set: { bin_location_id: existingComplete } },
          },
        });
        deleteIds.push(orphanId);
        continue;
      }

      const keeperOrphan = keeperOrphanByKey.get(key);
      if (keeperOrphan) {
        retargetOps.push({
          updateMany: {
            filter: { bin_location_id: orphanId },
            update: { $set: { bin_location_id: keeperOrphan } },
          },
        });
        deleteIds.push(orphanId);
        continue;
      }

      keeperOrphanByKey.set(key, orphanId);
      attachOps.push({
        updateOne: {
          filter: { _id: orphanId },
          update: { $set: { warehouse_id: warehouseId } },
        },
      });
    }

    if (attachOps.length > 0) {
      await this.binModel.bulkWrite(attachOps);
    }
    if (retargetOps.length > 0) {
      await this.assignmentModel.bulkWrite(retargetOps);
    }
    if (deleteIds.length > 0) {
      await this.binModel.deleteMany({ _id: { $in: deleteIds } });
    }

    return {
      scanned: orphans.length,
      attached: attachOps.length,
      retargeted: retargetOps.length,
      deleted: deleteIds.length,
      skipped,
    };
  }

  private async tryBackfillMissingBinWarehouseIds(): Promise<void> {
    const owned = this.inFlightBinWarehouseIdBackfill === null;
    if (owned) {
      this.inFlightBinWarehouseIdBackfill = this.backfillMissingBinWarehouseIds().finally(() => {
        this.inFlightBinWarehouseIdBackfill = null;
      });
    }

    try {
      const result = await this.inFlightBinWarehouseIdBackfill;
      if (owned && result && result.scanned > 0) {
        this.logger.log(
          `Backfill bin warehouse_id: scanned=${String(result.scanned)} attached=${String(result.attached)} retargeted=${String(result.retargeted)} deleted=${String(result.deleted)} skipped=${String(result.skipped)}`,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Backfill bin warehouse_id thất bại: ${message}`);
    }
  }

  async createWarehouse(dto: CreateWarehouseDto): Promise<WarehouseDocument> {
    try {
      return await this.warehouseModel.create({
        warehouse_code: dto.warehouse_code.trim(),
        warehouse_name: dto.warehouse_name.trim(),
        address: dto.address.trim(),
        is_active: true,
      });
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        throw new AppException(
          WAREHOUSE_ERROR_CODES.WAREHOUSE_CODE_IN_USE,
          `Mã kho "${dto.warehouse_code.trim()}" đã tồn tại.`,
          HttpStatus.CONFLICT,
          { warehouse_code: dto.warehouse_code.trim() },
        );
      }
      throw error;
    }
  }

  async listWarehouses(): Promise<WarehouseDocument[]> {
    // Admin cấu hình kho cần thấy MỌI kho đã tạo. Filter `is_active: true`
    // làm mất document nếu field default chưa được ghi xuống Mongo
    // (create xong FE hiện, reload thì biến mất — trùng mã thì 11000).
    return this.warehouseModel.find().sort({ created_at: -1 }).lean();
  }

  private async assertWarehouseExists(warehouseId: string): Promise<void> {
    if (!Types.ObjectId.isValid(warehouseId)) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.WAREHOUSE_NOT_FOUND,
        `"${warehouseId}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { warehouseId },
      );
    }
    const exists = await this.warehouseModel.exists({ _id: warehouseId });
    if (!exists) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.WAREHOUSE_NOT_FOUND,
        `Không tìm thấy kho với id "${warehouseId}".`,
        HttpStatus.NOT_FOUND,
        { warehouseId },
      );
    }
  }

  private parseObjectId(id: string, errorCode: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException(
        errorCode,
        `"${id}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { id, label },
      );
    }
    return new Types.ObjectId(id);
  }

  async createZone(warehouseId: string, dto: CreateZoneDto): Promise<WarehouseZoneDocument> {
    await this.assertWarehouseExists(warehouseId);
    try {
      return await this.zoneModel.create({
        warehouse_id: this.parseObjectId(
          warehouseId,
          WAREHOUSE_ERROR_CODES.WAREHOUSE_NOT_FOUND,
          'warehouseId',
        ),
        zone_code: dto.zone_code.trim(),
        zone_name: dto.zone_name.trim(),
        description: dto.description?.trim() ?? '',
      });
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        throw new AppException(
          WAREHOUSE_ERROR_CODES.ZONE_CODE_IN_USE,
          `Mã khu "${dto.zone_code.trim()}" đã tồn tại trong kho này.`,
          HttpStatus.CONFLICT,
          { zone_code: dto.zone_code.trim(), warehouseId },
        );
      }
      throw error;
    }
  }

  async listZones(warehouseId: string): Promise<WarehouseZoneDocument[]> {
    const warehouseObjectId = this.parseObjectId(
      warehouseId,
      WAREHOUSE_ERROR_CODES.WAREHOUSE_NOT_FOUND,
      'warehouseId',
    );
    return this.zoneModel
      .find({ warehouse_id: warehouseObjectId })
      .sort({ zone_code: 1 })
      .lean();
  }

  private async assertZoneExists(zoneId: string): Promise<WarehouseZoneDocument> {
    if (!Types.ObjectId.isValid(zoneId)) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.ZONE_NOT_FOUND,
        `"${zoneId}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { zoneId },
      );
    }
    const zone = await this.zoneModel.findById(zoneId);
    if (!zone) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.ZONE_NOT_FOUND,
        `Không tìm thấy khu với id "${zoneId}".`,
        HttpStatus.NOT_FOUND,
        { zoneId },
      );
    }
    return zone;
  }

  /**
   * Range generator — Admin không tạo tay từng kệ. Ghi bằng bulkWrite()
   * (Rule #14, CLAUDE.md) — không lặp N lần create() riêng lẻ.
   */
  async generateBinLocations(
    zoneId: string,
    dto: GenerateBinLocationsDto,
  ): Promise<{ created: number }> {
    const zone = await this.assertZoneExists(zoneId);

    if (dto.rack_from > dto.rack_to || dto.level_from > dto.level_to) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.INVALID_BIN_RANGE,
        'rack_from/level_from phải nhỏ hơn hoặc bằng rack_to/level_to.',
        HttpStatus.BAD_REQUEST,
        { dto },
      );
    }

    const bulkOps: {
      updateOne: {
        filter: { warehouse_id: Types.ObjectId; bin_code: string };
        update: { $setOnInsert: Record<string, unknown> };
        upsert: true;
      };
    }[] = [];

    for (let rack = dto.rack_from; rack <= dto.rack_to; rack++) {
      for (let level = dto.level_from; level <= dto.level_to; level++) {
        const rackStr = String(rack).padStart(2, '0');
        const levelStr = String(level).padStart(2, '0');
        const binCode = `${zone.zone_code}-${dto.aisle}-${rackStr}-${levelStr}`;
        bulkOps.push({
          updateOne: {
            filter: { warehouse_id: zone.warehouse_id, bin_code: binCode },
            update: {
              $setOnInsert: {
                warehouse_id: zone.warehouse_id,
                zone_id: zone._id,
                bin_code: binCode,
                aisle: dto.aisle,
                rack,
                level,
              },
            },
            upsert: true, // idempotent — gọi lại range đã tạo trước đó không tạo trùng, không lỗi
          },
        });
      }
    }

    const result = await this.binModel.bulkWrite(bulkOps);
    await this.tryBackfillMissingBinWarehouseIds();
    return { created: result.upsertedCount };
  }

  async findUnassignedSkus(): Promise<{ platform: string; shop_id: string; seller_sku: string }[]> {
    // Product Master ĐÃ CÓ (không sửa) — join thủ công qua $nin danh
    // sách đã gán, KHÔNG dùng $lookup (Rule #21 — hạn chế $lookup ở
    // đường tần suất cao; đây là màn hình Admin, tần suất thấp, nhưng
    // vẫn tránh $lookup cho nhất quán, dùng 2 query + Set trong bộ nhớ).
    const assigned = await this.assignmentModel.find().select('platform shop_id seller_sku').lean();
    const assignedKeys = new Set(assigned.map((a) => `${a.platform}|${a.shop_id}|${a.seller_sku}`));

    const allProducts = await this.productMasterModel
      .find()
      .select('platform shop_id seller_sku')
      .lean();

    return allProducts
      .filter((p) => !assignedKeys.has(`${p.platform}|${p.shop_id}|${p.seller_sku}`))
      .map((p) => ({
        // Catalog hiện 100% Lazada; document cũ có thể thiếu platform
        // → gán lazada để FE luôn gửi đúng enum, không bắt Admin chọn sàn.
        platform: parseMarketplacePlatform(p.platform),
        shop_id: p.shop_id,
        seller_sku: p.seller_sku,
      }));
  }

  async assignSkuToBin(warehouseId: string, dto: AssignSkuBinDto): Promise<SkuBinAssignmentDocument> {
    await this.assertWarehouseExists(warehouseId);
    const warehouseObjectId = this.parseObjectId(
      warehouseId,
      WAREHOUSE_ERROR_CODES.WAREHOUSE_NOT_FOUND,
      'warehouseId',
    );
    const binObjectId = this.parseObjectId(
      dto.bin_location_id,
      WAREHOUSE_ERROR_CODES.ZONE_NOT_FOUND,
      'bin_location_id',
    );
    return this.assignmentModel.findOneAndUpdate(
      {
        warehouse_id: warehouseObjectId,
        platform: parseMarketplacePlatform(dto.platform),
        shop_id: dto.shop_id,
        seller_sku: dto.seller_sku,
      },
      {
        $set: { bin_location_id: binObjectId },
        // $setOnInsert (không phải $set) — nếu SKU đã có sẵn assignment
        // từ trước (chỉ đang ĐỔI vị trí kệ), KHÔNG reset quantity_on_hand
        // đang có về giá trị mới truyền vào — chỉ áp dụng lúc TẠO MỚI.
        $setOnInsert: { quantity_on_hand: dto.initial_quantity ?? 0 },
      },
      { upsert: true, returnDocument: 'after' },
    );
  }

  async listBinLocations(zoneId: string): Promise<BinLocationDocument[]> {
    const zone = await this.assertZoneExists(zoneId);
    await this.tryBackfillMissingBinWarehouseIds();
    const zoneObjectId = zone._id;
    const zoneIdHex = oidKey(zone._id);
    return this.binModel
      .find({
        $or: [{ zone_id: zoneObjectId }, ...(zoneIdHex.length > 0 ? [{ zone_id: zoneIdHex }] : [])],
      })
      .sort({ aisle: 1, rack: 1, level: 1 })
      .lean();
  }

  /**
   * Mọi kệ thuộc 1 kho: có warehouse_id khớp, HOẶC zone_id thuộc khu của kho
   * (kệ sinh trước khi có warehouse_id). Kệ mất khu vẫn hiện nếu đã gắn warehouse_id.
   */
  async listBinLocationsForWarehouse(warehouseId: string): Promise<BinLocationDocument[]> {
    const warehouseObjectId = this.parseObjectId(
      warehouseId,
      WAREHOUSE_ERROR_CODES.WAREHOUSE_NOT_FOUND,
      'warehouseId',
    );
    await this.tryBackfillMissingBinWarehouseIds();
    const zones = await this.zoneModel.find({ warehouse_id: warehouseObjectId }).select('_id').lean();
    const zoneIds = zones.map((zone) => zone._id);
    return this.binModel
      .find({
        $or: [
          { warehouse_id: warehouseObjectId },
          ...(zoneIds.length > 0 ? [{ zone_id: { $in: zoneIds } }] : []),
        ],
      })
      .sort({ aisle: 1, rack: 1, level: 1 })
      .lean();
  }

  /**
   * Danh sách SKU đã gán kệ trong 1 kho — kèm `bin_code` để Admin restock
   * không phải nhớ ObjectId. Join 2 query `$in` (Rule #16), không `$lookup`.
   */
  async listSkuBinAssignments(warehouseId: string): Promise<
    {
      _id: Types.ObjectId;
      warehouse_id: Types.ObjectId;
      platform: string;
      shop_id: string;
      seller_sku: string;
      bin_location_id: Types.ObjectId;
      quantity_on_hand: number;
      bin_code: string;
    }[]
  > {
    await this.assertWarehouseExists(warehouseId);
    const warehouseObjectId = this.parseObjectId(
      warehouseId,
      WAREHOUSE_ERROR_CODES.WAREHOUSE_NOT_FOUND,
      'warehouseId',
    );
    const assignments = await this.assignmentModel.find({ warehouse_id: warehouseObjectId }).lean();
    const binIds = assignments
      .map((row) => asObjectId(row.bin_location_id))
      .filter((id): id is Types.ObjectId => id !== null);
    const bins = await this.binModel.find({ _id: { $in: binIds } }).select('bin_code').lean();
    const binMap = new Map(bins.map((bin) => [oidKey(bin._id), bin.bin_code]));
    return assignments.map((row) => ({
      _id: row._id,
      warehouse_id: row.warehouse_id,
      platform: row.platform,
      shop_id: row.shop_id,
      seller_sku: row.seller_sku,
      bin_location_id: row.bin_location_id,
      quantity_on_hand: row.quantity_on_hand,
      bin_code: binMap.get(oidKey(row.bin_location_id)) ?? '',
    }));
  }

  /**
   * Nhập thêm hàng (restock) — nghiệp vụ KHÁC gán vị trí (assignSkuToBin):
   * gán vị trí làm 1 LẦN, nhập hàng lặp lại ĐỊNH KỲ. Cộng dồn bằng $inc
   * (Rule #7, atomic — không đọc-rồi-ghi).
   */
  async restockSku(warehouseId: string, assignmentId: string, quantity: number): Promise<SkuBinAssignmentDocument> {
    if (!Types.ObjectId.isValid(assignmentId)) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.WAREHOUSE_NOT_FOUND, // dùng chung mã lỗi validate id, không cần thêm mã riêng
        `"${assignmentId}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { assignmentId },
      );
    }
    const updated = await this.assignmentModel.findOneAndUpdate(
      { _id: assignmentId, warehouse_id: warehouseId },
      { $inc: { quantity_on_hand: quantity } },
      { returnDocument: 'after' },
    );
    if (!updated) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.WAREHOUSE_NOT_FOUND,
        `Không tìm thấy sku_bin_assignment với id "${assignmentId}" trong kho "${warehouseId}".`,
        HttpStatus.NOT_FOUND,
        { assignmentId, warehouseId },
      );
    }
    return updated;
  }

  /**
   * Picking List có VỊ TRÍ KỆ thật — TÁI DÙNG getPackableItemsForGroup()
   * đã có (order-groups/), KHÔNG viết lại logic lấy item từ đầu. Sắp
   * xếp theo (zone_code, aisle, rack, level) — route optimization/wave
   * picking, đúng thiết kế đã chốt trong CLAUDE.md.
   */
  async getEnrichedPickingList(warehouseId: string, groupId: string): Promise<PickingListItem[]> {
    const { items } = await this.orderGroupsService.getPackableItemsForGroup(groupId);
    const skus = items.map((i) => i.sku);

    // 1 query $in duy nhất — Rule #16, tránh N+1.
    const assignments = await this.assignmentModel
      .find({ warehouse_id: warehouseId, seller_sku: { $in: skus } })
      .lean();
    const binIds = assignments.map((a) => a.bin_location_id);
    const bins = await this.binModel.find({ _id: { $in: binIds } }).lean();
    const binMap = new Map(bins.map((b) => [b._id.toString(), b]));
    const zoneIds = bins.map((b) => b.zone_id);
    const zones = await this.zoneModel.find({ _id: { $in: zoneIds } }).lean();
    const zoneMap = new Map(zones.map((z) => [z._id.toString(), z]));
    const assignmentBySku = new Map(assignments.map((a) => [a.seller_sku, a]));

    const enriched: PickingListItem[] = items.map((item) => {
      const assignment = assignmentBySku.get(item.sku);
      const bin = assignment ? binMap.get(assignment.bin_location_id.toString()) : undefined;
      const zone = bin ? zoneMap.get(bin.zone_id.toString()) : undefined;
      return {
        ...item,
        zone_code: zone?.zone_code ?? 'ZZZ', // xếp cuối nếu chưa gán — 'ZZZ' sort sau mọi zone_code thật (thường 1-2 ký tự)
        bin_code: bin?.bin_code ?? 'CHƯA GÁN VỊ TRÍ',
      };
    });

    // SẮP XẾP theo lộ trình vật lý (zone -> aisle/rack/level qua bin_code
    // string vì đã zero-pad sẵn lúc generate) — đúng kỹ thuật WMS wave
    // picking đã note trong CLAUDE.md.
    enriched.sort((a, b) => {
      if (a.zone_code !== b.zone_code) return a.zone_code.localeCompare(b.zone_code);
      return a.bin_code.localeCompare(b.bin_code);
    });

    return enriched;
  }
}
