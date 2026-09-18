import { HttpStatus, Injectable } from '@nestjs/common';
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

export interface PickingListItem extends PackableItem {
  zone_code: string;
  bin_code: string;
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
export class WarehouseService {
  constructor(
    @InjectModel(Warehouse.name) private readonly warehouseModel: Model<WarehouseDocument>,
    @InjectModel(WarehouseZone.name) private readonly zoneModel: Model<WarehouseZoneDocument>,
    @InjectModel(BinLocation.name) private readonly binModel: Model<BinLocationDocument>,
    @InjectModel(SkuBinAssignment.name)
    private readonly assignmentModel: Model<SkuBinAssignmentDocument>,
    @InjectModel(ProductMaster.name) private readonly productMasterModel: Model<ProductMasterDocument>,
    private readonly orderGroupsService: OrderGroupsService,
  ) {}

  async createWarehouse(dto: CreateWarehouseDto): Promise<WarehouseDocument> {
    return this.warehouseModel.create(dto);
  }

  async listWarehouses(): Promise<WarehouseDocument[]> {
    return this.warehouseModel.find({ is_active: true }).lean();
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

  async createZone(warehouseId: string, dto: CreateZoneDto): Promise<WarehouseZoneDocument> {
    await this.assertWarehouseExists(warehouseId);
    return this.zoneModel.create({
      warehouse_id: new Types.ObjectId(warehouseId),
      zone_code: dto.zone_code,
      zone_name: dto.zone_name,
      description: dto.description,
    });
  }

  async listZones(warehouseId: string): Promise<WarehouseZoneDocument[]> {
    return this.zoneModel.find({ warehouse_id: warehouseId }).lean();
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
      .map((p) => ({ platform: p.platform, shop_id: p.shop_id, seller_sku: p.seller_sku }));
  }

  async assignSkuToBin(warehouseId: string, dto: AssignSkuBinDto): Promise<SkuBinAssignmentDocument> {
    await this.assertWarehouseExists(warehouseId);
    return this.assignmentModel.findOneAndUpdate(
      { warehouse_id: warehouseId, platform: dto.platform, shop_id: dto.shop_id, seller_sku: dto.seller_sku },
      {
        $set: { bin_location_id: dto.bin_location_id },
        // $setOnInsert (không phải $set) — nếu SKU đã có sẵn assignment
        // từ trước (chỉ đang ĐỔI vị trí kệ), KHÔNG reset quantity_on_hand
        // đang có về giá trị mới truyền vào — chỉ áp dụng lúc TẠO MỚI.
        $setOnInsert: { quantity_on_hand: dto.initial_quantity ?? 0 },
      },
      { upsert: true, returnDocument: 'after' },
    );
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
