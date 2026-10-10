import { MarketplaceSkuMapping, MarketplaceSkuMappingDocument } from '../master-skus/schemas/marketplace-sku-mapping.schema';
import { normalizeSellerSku } from '../master-skus/master-skus.service';
import {
  resolveMasterSkus,
  stockAssignmentOrBranches,
  stockUpsertFilterFor,
} from '../master-skus/stock-key.util';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Warehouse, WarehouseDocument } from './schemas/warehouse.schema';
import {
  WarehouseZone,
  WarehouseZoneDocument,
} from './schemas/warehouse-zone.schema';
import {
  BinLocation,
  BinLocationDocument,
} from './schemas/bin-location.schema';
import {
  SkuBinAssignment,
  SkuBinAssignmentDocument,
} from './schemas/sku-bin-assignment.schema';
import {
  ProductMaster,
  ProductMasterDocument,
} from '../product-master/schemas/product-master.schema';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { CreateZoneDto } from './dto/create-zone.dto';
import { GenerateBinLocationsDto } from './dto/generate-bin-locations.dto';
import { AssignSkuBinDto } from './dto/assign-sku-bin.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { AdjustStockDto, MoveAssignmentDto, TransferStockDto } from './dto/stock-operations.dto';
import { InventoryMovement, InventoryMovementDocument, MovementType, StockAdjustReason } from './schemas/inventory-movement.schema';
import { CreateRackDto, PurgeRackQueryDto } from './dto/create-rack.dto';
import { UpdateBinDto } from './dto/update-bin.dto';
import { CategoriesService } from '../categories/categories.service';
import { ZONE_CODE_V2_REGEX, buildBinCodeV2, computePickSequence } from './warehouse-layout';

// K1 (26/09/2026) — document khu/kệ tạo TRƯỚC K1 không có field is_active.
// Lọc bằng `$ne: false` (không phải `is_active: true`) để document cũ vẫn
// được coi là đang hoạt động — tương thích ngược, không cần migration.
const ACTIVE_ONLY = { is_active: { $ne: false } } as const;
import { WAREHOUSE_ERROR_CODES } from './warehouse.errors';
import { AppException } from '../../common/exceptions/app-exception';
import { OrderGroupsService } from '../order-groups/order-groups.service';
import { PackableItem } from '../../common/interfaces/packaging.interface';

/** 10/10/2026 — số bản ghi đã xoá hẳn (DELETE .../permanent). */
export interface PurgeResult {
  warehouses: number;
  zones: number;
  bins: number;
  assignments: number;
}

export interface PickingListItem extends PackableItem {
  zone_code: string;
  bin_code: string;
  pick_sequence: number | null; // K2 — null = kệ chuẩn cũ (v1) hoặc chưa gán vị trí
  master_sku: string | null; // K4b — SKU nội bộ nếu SKU sàn đã nối (tồn tính chung)
  bin_location_id: string | null; // K3 — ô CHÍNH nên lấy (gửi kèm khi quét pick-item)
  other_bins: { bin_location_id: string; bin_code: string; quantity_on_hand: number }[]; // K3 — 1 SKU nhiều ô
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
    @InjectModel(Warehouse.name)
    private readonly warehouseModel: Model<WarehouseDocument>,
    @InjectModel(WarehouseZone.name)
    private readonly zoneModel: Model<WarehouseZoneDocument>,
    @InjectModel(BinLocation.name)
    private readonly binModel: Model<BinLocationDocument>,
    @InjectModel(SkuBinAssignment.name)
    private readonly assignmentModel: Model<SkuBinAssignmentDocument>,
    @InjectModel(ProductMaster.name)
    private readonly productMasterModel: Model<ProductMasterDocument>,
    private readonly orderGroupsService: OrderGroupsService,
    // K1 — transaction cho vô hiệu hóa dây chuyền kho -> khu -> kệ
    @InjectConnection() private readonly connection: Connection,
    // K2 — kiểm tra danh mục cấp 2 + thang size khi tạo kệ/đăng ký ô
    private readonly categoriesService: CategoriesService,
    // K3 — sổ cái biến động kho
    @InjectModel(InventoryMovement.name)
    private readonly movementModel: Model<InventoryMovementDocument>,
    // K4b — tra SKU sàn -> SKU nội bộ (đường lùi: chưa nối thì tính theo SKU sàn)
    @InjectModel(MarketplaceSkuMapping.name)
    private readonly mappingModel: Model<MarketplaceSkuMappingDocument>,
  ) {}

  async createWarehouse(dto: CreateWarehouseDto): Promise<WarehouseDocument> {
    try {
      return await this.warehouseModel.create(dto);
    } catch (error: unknown) {
      // BỔ SUNG (16/09/2026) — báo cáo thật: trước đây lỗi trùng
      // warehouse_code rơi thẳng ra MongoServerError thô (E11000,
      // 500 Internal Server Error) — FE không bắt được rõ ràng. Bắt
      // đúng mã lỗi MongoDB (code 11000 = duplicate key) và dịch
      // sang AppException nghiệp vụ.
      if (this.isDuplicateKeyError(error)) {
        throw new AppException(
          WAREHOUSE_ERROR_CODES.WAREHOUSE_CODE_IN_USE,
          `Mã kho "${dto.warehouse_code}" đã được dùng — chọn mã khác.`,
          HttpStatus.CONFLICT,
          { warehouseCode: dto.warehouse_code },
        );
      }
      throw error;
    }
  }

  async listWarehouses(includeInactive = false): Promise<WarehouseDocument[]> {
    // K1 — Admin xem được cả kho đã vô hiệu hóa (để kích hoạt lại).
    return this.warehouseModel.find(includeInactive ? {} : { is_active: true }).lean();
  }

  async createZone(
    warehouseId: string,
    dto: CreateZoneDto,
  ): Promise<WarehouseZoneDocument> {
    // K1 — không cho thêm khu vào kho đã vô hiệu hóa.
    await this.assertWarehouseActive(warehouseId);
    try {
      return await this.zoneModel.create({
        warehouse_id: new Types.ObjectId(warehouseId),
        zone_code: dto.zone_code,
        zone_name: dto.zone_name,
        description: dto.description,
      });
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        throw new AppException(
          WAREHOUSE_ERROR_CODES.ZONE_CODE_IN_USE,
          `Mã khu "${dto.zone_code}" đã tồn tại trong kho này — chọn mã khác.`,
          HttpStatus.CONFLICT,
          { warehouseId, zoneCode: dto.zone_code },
        );
      }
      throw error;
    }
  }

  // BỔ SUNG (16/09/2026) — kiểm tra 1 error object có phải lỗi trùng
  // khóa MongoDB (E11000) hay không, KHÔNG dùng `instanceof MongoServerError`
  // (tránh phải import thêm driver `mongodb` chỉ để check type) — driver
  // Mongo LUÔN gắn field `.code === 11000` cho lỗi loại này, kiểm tra
  // trực tiếp field đó đơn giản, đủ tin cậy.
  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }

  async listZones(
    warehouseId: string,
    includeInactive = false,
  ): Promise<WarehouseZoneDocument[]> {
    // Ép kiểu tường minh sang ObjectId (thay vì để Mongoose tự cast
    // string trong filter) — theo báo cáo thật từ Hải Phượng (16/09):
    // GET không trả ra dữ liệu dù đã tạo thành công (xác nhận qua lỗi
    // "trùng" khi tạo lại) — về lý thuyết Mongoose tự cast string hợp
    // lệ sang ObjectId trong query filter, nhưng ép kiểu tường minh ở
    // đây loại bỏ HOÀN TOÀN nghi ngờ, không có hại gì nếu không phải
    // nguyên nhân thật (Types.ObjectId(x) idempotent nếu x đã đúng).
    if (!Types.ObjectId.isValid(warehouseId)) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.WAREHOUSE_NOT_FOUND,
        `"${warehouseId}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { warehouseId },
      );
    }
    return this.zoneModel
      .find({
        warehouse_id: new Types.ObjectId(warehouseId),
        ...(includeInactive ? {} : ACTIVE_ONLY),
      })
      .lean();
  }

  /**
   * BỔ SUNG (16/09/2026) — báo cáo thật từ Hải Phượng: thiếu GET để
   * liệt kê lại bin-locations đã tạo (trước đây chỉ có POST .../generate
   * để TẠO, không có cách nào XEM LẠI danh sách qua API).
   */
  async listBinLocationsByZone(
    zoneId: string,
    includeInactive = false,
  ): Promise<BinLocationDocument[]> {
    if (!Types.ObjectId.isValid(zoneId)) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.ZONE_NOT_FOUND,
        `"${zoneId}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { zoneId },
      );
    }
    return this.binModel
      .find({
        zone_id: new Types.ObjectId(zoneId),
        ...(includeInactive ? {} : ACTIVE_ONLY),
      })
      .lean();
  }

  async listBinLocationsByWarehouse(
    warehouseId: string,
    includeInactive = false,
  ): Promise<BinLocationDocument[]> {
    if (!Types.ObjectId.isValid(warehouseId)) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.WAREHOUSE_NOT_FOUND,
        `"${warehouseId}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { warehouseId },
      );
    }
    return this.binModel
      .find({
        warehouse_id: new Types.ObjectId(warehouseId),
        ...(includeInactive ? {} : ACTIVE_ONLY),
      })
      .lean();
  }

  async listSkuBinAssignmentsByWarehouse(
    warehouseId: string,
  ): Promise<SkuBinAssignmentDocument[]> {
    if (!Types.ObjectId.isValid(warehouseId)) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.WAREHOUSE_NOT_FOUND,
        `"${warehouseId}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { warehouseId },
      );
    }
    return this.assignmentModel
      .find({ warehouse_id: new Types.ObjectId(warehouseId) })
      .lean();
  }

  private async assertZoneExists(
    zoneId: string,
  ): Promise<WarehouseZoneDocument> {
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
    // K1 — không sinh kệ trong khu/kho đã vô hiệu hóa. Lưu ý: kệ đã tồn tại
    // mà bị vô hiệu hóa thì generate lại KHÔNG kích hoạt lại ($setOnInsert chỉ
    // chạy khi tạo mới) — muốn dùng lại phải gọi POST .../reactivate.
    if (zone.is_active === false) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.ZONE_INACTIVE,
        `Khu "${zone.zone_code}" đã bị vô hiệu hóa — kích hoạt lại trước khi sinh kệ.`,
        HttpStatus.CONFLICT,
        { zoneId },
      );
    }
    await this.assertWarehouseActive(zone.warehouse_id.toString());
    // SỬA (26/09/2026, rà K2) — route cũ (deprecated) vẫn sinh được kệ mã cũ
    // "KA-03-01-01" TRONG khu chuẩn mới -> 1 khu lẫn 2 kiểu mã, lộ trình lấy
    // hàng lẫn lộn. Chỉ cho dùng route cũ ở khu mã cũ (tương thích ngược).
    if (ZONE_CODE_V2_REGEX.test(zone.zone_code)) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.ZONE_V2_USE_RACKS,
        `Khu "${zone.zone_code}" theo chuẩn mới — dùng POST /warehouse/zones/:zoneId/racks để tạo kệ.`,
        HttpStatus.CONFLICT,
        { zoneId },
      );
    }

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

  async findUnassignedSkus(): Promise<
    { platform: string; shop_id: string; seller_sku: string }[]
  > {
    // Product Master ĐÃ CÓ (không sửa) — join thủ công qua $nin danh
    // sách đã gán, KHÔNG dùng $lookup (Rule #21 — hạn chế $lookup ở
    // đường tần suất cao; đây là màn hình Admin, tần suất thấp, nhưng
    // vẫn tránh $lookup cho nhất quán, dùng 2 query + Set trong bộ nhớ).
    const assigned = await this.assignmentModel
      .find()
      .select('platform shop_id seller_sku')
      .lean();
    const assignedKeys = new Set(
      assigned.map((a) => `${a.platform}|${a.shop_id}|${a.seller_sku}`),
    );
    // 🔄 K4b — SKU sàn đã nối mà SKU nội bộ của nó đã có ô -> coi như đã gán.
    const pooledMasters = await this.assignmentModel.distinct('master_sku', { master_sku: { $type: 'string' } });
    const pooledMaps = await this.mappingModel.find({ master_sku: { $in: pooledMasters } }).select('platform shop_id seller_sku_normalized').lean();
    const pooledKeys = new Set(pooledMaps.map((m) => `${m.platform}|${m.shop_id}|${m.seller_sku_normalized}`));

    const allProducts = await this.productMasterModel
      .find()
      .select('platform shop_id seller_sku')
      .lean();

    return allProducts
      .filter(
        (p) => !assignedKeys.has(`${p.platform}|${p.shop_id}|${p.seller_sku}`) && !pooledKeys.has(`${p.platform}|${p.shop_id}|${p.seller_sku.trim().toUpperCase()}`),
      )
      .map((p) => ({
        platform: p.platform,
        shop_id: p.shop_id,
        seller_sku: p.seller_sku,
      }));
  }

  async assignSkuToBin(
    warehouseId: string,
    dto: AssignSkuBinDto,
    actorId = 'system',
  ): Promise<SkuBinAssignmentDocument> {
    await this.assertWarehouseActive(warehouseId);
    // SỬA LỖI (26/09/2026, K1) — trước đây KHÔNG kiểm tra bin_location_id:
    // gán được SKU vào kệ không tồn tại, kệ của KHO KHÁC, hoặc kệ đã tắt —
    // Picking List sau đó hiện vị trí sai/rỗng mà không ai biết vì sao.
    const bin = await this.assertBinExists(dto.bin_location_id);
    if (bin.warehouse_id.toString() !== warehouseId) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.BIN_NOT_IN_WAREHOUSE,
        `Kệ "${bin.bin_code}" không thuộc kho này.`,
        HttpStatus.BAD_REQUEST,
        { binId: bin._id.toString(), warehouseId },
      );
    }
    if (bin.is_active === false) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.BIN_INACTIVE,
        `Kệ "${bin.bin_code}" đã bị vô hiệu hóa.`,
        HttpStatus.CONFLICT,
        { binId: bin._id.toString() },
      );
    }
    // 🔄 K3 (27/09/2026) — 1 SKU nhiều ô: "gán" nghĩa là ĐƯA SKU VÀO THÊM 1 Ô.
    // Trước K3, gọi lại với ô khác = DỜI SKU sang ô mới (kèm toàn bộ tồn) mà
    // không ghi lịch sử. Nay: đã có (SKU, ô) -> trả về như cũ, không đổi gì
    // (idempotent); muốn dời hàng thì dùng thao tác CHUYỂN Ô (có sổ cái).
    const filter = {
      warehouse_id: new Types.ObjectId(warehouseId),
      platform: dto.platform,
      shop_id: dto.shop_id,
      seller_sku: dto.seller_sku,
      bin_location_id: bin._id,
    };
    // 🔄 K4b — SKU sàn đã nối: 1 dòng tồn cho SKU nội bộ trên mỗi ô (chung mọi sàn).
    const master = (await resolveMasterSkus(this.mappingModel, dto.platform, dto.shop_id, [dto.seller_sku])).get(dto.seller_sku);
    const lookup = master
      ? { warehouse_id: filter.warehouse_id, bin_location_id: bin._id, master_sku: master }
      : { ...filter, master_sku: null };
    const existing = await this.assignmentModel.findOne(lookup);
    if (existing) return existing;

    const initial = dto.initial_quantity ?? 0;
    // K2 — sức chứa ô tính trên TỔNG hàng của mọi SKU đang nằm trong ô.
    if (typeof bin.capacity === 'number' && dto.force !== true && initial > 0) {
      const binTotal = await this.countStockUnits({ bin_location_id: bin._id });
      if (binTotal + initial > bin.capacity) this.throwOverCapacity(bin.bin_code, bin.capacity, binTotal, initial);
    }
    try {
      return await this.runTx(async (session) => {
        const [created] = await this.assignmentModel.create([{ ...filter, master_sku: master ?? null, quantity_on_hand: initial }], { session });
        if (!created) throw new Error('Tạo assignment không trả về document');
        if (initial > 0) {
          await this.recordMovement(created, 'assign_initial', initial, 0, actorId, session, { note: 'Tồn ban đầu khi gán SKU vào ô' });
        }
        return created;
      });
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        const raced = await this.assignmentModel.findOne(lookup);
        if (raced) return raced; // 2 người gán cùng lúc -> trả bản đã có
      }
      throw error;
    }
  }

  /**
   * Nhập thêm hàng (restock) — nghiệp vụ KHÁC gán vị trí (assignSkuToBin):
   * gán vị trí làm 1 LẦN, nhập hàng lặp lại ĐỊNH KỲ. Cộng dồn bằng $inc
   * (Rule #7, atomic — không đọc-rồi-ghi).
   */
  async restockSku(
    warehouseId: string,
    assignmentId: string,
    quantity: number,
    force = false,
    actorId = 'system',
  ): Promise<SkuBinAssignmentDocument> {
    await this.assertWarehouseActive(warehouseId); // K1
    // 🔄 07/10/2026 — SỬA LỖI: trước đây truy vấn `warehouse_id: warehouseId` (chuỗi) trong khi
    // DB lưu ObjectId và schema bị Mongoose hiểu là Mixed (không tự ép kiểu) -> không bao giờ tìm
    // thấy dòng tồn -> "Nhập thêm hàng" luôn 404. Schema nay đã khai đúng SchemaTypes.ObjectId
    // (Mongoose tự ép); vẫn ép tường minh ở đây để không phụ thuộc vào khai báo schema.
    const warehouseObjectId = new Types.ObjectId(warehouseId);
    // K2 — kiểm tra sức chứa ô trước khi cộng (không atomic tuyệt đối: 2 lần
    // nhập cùng lúc có thể cùng lọt — ghi nhận ở điểm yếu, xử lý ở K3 bằng sổ cái).
    if (Types.ObjectId.isValid(assignmentId) && !force) {
      const current = await this.assignmentModel.findOne({ _id: assignmentId, warehouse_id: warehouseObjectId }).lean();
      if (current) {
        const bin = await this.binModel.findById(current.bin_location_id).lean();
        if (bin && typeof bin.capacity === 'number') {
          const binTotal = await this.countStockUnits({ bin_location_id: bin._id });
          if (binTotal + quantity > bin.capacity) this.throwOverCapacity(bin.bin_code, bin.capacity, binTotal, quantity);
        }
      }
    }
    if (!Types.ObjectId.isValid(assignmentId)) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.WAREHOUSE_NOT_FOUND, // dùng chung mã lỗi validate id, không cần thêm mã riêng
        `"${assignmentId}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { assignmentId },
      );
    }
    // 🔄 K3 — cộng tồn + ghi sổ cái trong CÙNG transaction.
    const updated = await this.runTx(async (session) => {
      const doc = await this.assignmentModel.findOneAndUpdate(
        { _id: assignmentId, warehouse_id: warehouseObjectId },
        { $inc: { quantity_on_hand: quantity } },
        { returnDocument: 'after', session },
      );
      if (doc) await this.recordMovement(doc, 'receive', quantity, doc.quantity_on_hand - quantity, actorId, session);
      return doc;
    });
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
  async getEnrichedPickingList(
    warehouseId: string,
    groupId: string,
  ): Promise<PickingListItem[]> {
    await this.assertWarehouseActive(warehouseId); // K1 — kho đã tắt thì không lấy hàng
    const { items } =
      await this.orderGroupsService.getPackableItemsForGroup(groupId);
    const skus = items.map((i) => i.sku);

    // 1 query $in duy nhất — Rule #16, tránh N+1.
    // 🔄 K4a — lọc đúng sàn/shop của nhóm đơn (trước đây chỉ kho + seller_sku).
    const group = await this.orderGroupsService.findOrderGroupById(groupId);
    // 🔄 K4b — SKU đã nối lấy tồn theo SKU nội bộ (chung mọi sàn); chưa nối giữ cách cũ.
    // 🔄 (05/10/2026) — thêm nhánh unpooled cho SKU đã nối + khớp seller_sku không phân biệt hoa/thường
    // (Admin nhập tồn trước sync-stock → trước đây Picking List hiện «CHƯA GÁN VỊ TRÍ»).
    const masters = await resolveMasterSkus(this.mappingModel, group.platform, group.shop_id, skus);
    const orBranches = stockAssignmentOrBranches(
      group.platform,
      group.shop_id,
      skus,
      masters,
    );
    const warehouseObjectId = Types.ObjectId.isValid(warehouseId)
      ? new Types.ObjectId(warehouseId)
      : warehouseId;
    const assignments =
      orBranches.length === 0
        ? []
        : await this.assignmentModel
            .find({
              warehouse_id: warehouseObjectId,
              $or: orBranches,
            })
            .lean();
    const rowKey = (a: { master_sku?: string | null; seller_sku: string }): string => (a.master_sku ? `M:${a.master_sku}` : `S:${normalizeSellerSku(a.seller_sku)}`);
    const binIds = assignments.map((a) => a.bin_location_id);
    const bins = await this.binModel.find({ _id: { $in: binIds } }).lean();
    const binMap = new Map(bins.map((b) => [b._id.toString(), b]));
    const zoneIds = bins.map((b) => b.zone_id);
    const zones = await this.zoneModel.find({ _id: { $in: zoneIds } }).lean();
    const zoneMap = new Map(zones.map((z) => [z._id.toString(), z]));
    // 🔄 K3 — 1 SKU có thể nằm nhiều ô: gom theo SKU, ô CHÍNH = ô còn hàng
    // đứng trước theo lộ trình; các ô còn hàng khác trả kèm để nhân viên biết.
    const seqOf = (a: (typeof assignments)[number]): number =>
      binMap.get(a.bin_location_id.toString())?.pick_sequence ?? Number.MAX_SAFE_INTEGER;
    const assignmentsBySku = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const keys = new Set<string>([rowKey(a)]);
      // Unpooled row của SKU đã nối: index thêm dưới M:master để itemKey tìm thấy.
      if (!a.master_sku) {
        for (const [sellerSku, master] of masters) {
          if (normalizeSellerSku(sellerSku) === normalizeSellerSku(a.seller_sku)) {
            keys.add(`M:${master}`);
          }
        }
      }
      for (const key of keys) {
        const list = assignmentsBySku.get(key) ?? [];
        list.push(a);
        assignmentsBySku.set(key, list);
      }
    }
    for (const list of assignmentsBySku.values()) {
      list.sort((x, y) => Number(y.quantity_on_hand > 0) - Number(x.quantity_on_hand > 0) || seqOf(x) - seqOf(y));
    }

    const candidatesForSku = (sku: string): typeof assignments => {
      const master = masters.get(sku);
      if (master) {
        const pooled = assignmentsBySku.get(`M:${master}`);
        if (pooled && pooled.length > 0) return pooled;
      }
      return assignmentsBySku.get(`S:${normalizeSellerSku(sku)}`) ?? [];
    };

    const enriched: PickingListItem[] = items.map((item) => {
      const candidates = candidatesForSku(item.sku);
      const assignment = candidates[0];
      const bin = assignment
        ? binMap.get(assignment.bin_location_id.toString())
        : undefined;
      const zone = bin ? zoneMap.get(bin.zone_id.toString()) : undefined;
      return {
        ...item,
        zone_code: zone?.zone_code ?? 'ZZZ', // xếp cuối nếu chưa gán — 'ZZZ' sort sau mọi zone_code thật (thường 1-2 ký tự)
        bin_code: bin?.bin_code ?? 'CHƯA GÁN VỊ TRÍ',
        pick_sequence: bin?.pick_sequence ?? null,
        master_sku: masters.get(item.sku) ?? null,
        bin_location_id: bin ? bin._id.toString() : null,
        other_bins: candidates
          .slice(1)
          .filter((c) => c.quantity_on_hand > 0)
          .map((c) => ({
            bin_location_id: c.bin_location_id.toString(),
            bin_code: binMap.get(c.bin_location_id.toString())?.bin_code ?? '?',
            quantity_on_hand: c.quantity_on_hand,
          })),
      };
    });

    // SẮP XẾP theo lộ trình vật lý (zone -> aisle/rack/level qua bin_code
    // string vì đã zero-pad sẵn lúc generate) — đúng kỹ thuật WMS wave
    // picking đã note trong CLAUDE.md.
    // 🔄 K2 (26/09/2026) — kệ chuẩn mới (v2) sắp theo pick_sequence (lộ trình
    // hình rắn, tính sẵn lúc tạo kệ), đi TRƯỚC; kệ chuẩn cũ (v1) và dòng chưa
    // gán vị trí giữ cách sắp chuỗi như trước, đi SAU. Kho đang chuyển đổi
    // (có cả 2 loại) vẫn cho ra thứ tự ổn định, không vỡ luồng cũ.
    enriched.sort((a, b) => {
      if (a.pick_sequence !== null && b.pick_sequence !== null) return a.pick_sequence - b.pick_sequence;
      if (a.pick_sequence !== null) return -1;
      if (b.pick_sequence !== null) return 1;
      if (a.zone_code !== b.zone_code) return a.zone_code.localeCompare(b.zone_code);
      return a.bin_code.localeCompare(b.bin_code);
    });

    return enriched;
  }
// ===================================================================
  // K1 (26/09/2026) — VÒNG ĐỜI KHO / KHU / KỆ
  // Quy tắc (xem CLAUDE.md "Bảng vòng đời"):
  // - Xóa = VÔ HIỆU HÓA (is_active=false), không xóa hẳn khỏi DB — giữ
  //   lịch sử (pick_events, đơn đã lấy từ kho đó vẫn tra ra được).
  // - CHẶN vô hiệu hóa khi còn hàng tồn (tổng quantity_on_hand > 0) —
  //   phải chuyển hàng đi trước, nếu không hàng "biến mất" khỏi mọi màn hình.
  // - Vô hiệu hóa KHO -> dây chuyền khu + kệ (1 transaction).
  //   Vô hiệu hóa KHU -> dây chuyền kệ. Kích hoạt lại KHU -> kích hoạt lại
  //   toàn bộ kệ của khu. Kích hoạt lại KHO -> CHỈ kho (Admin tự bật từng khu).
  // - Thao tác lặp lại (tắt cái đã tắt) trả về trạng thái hiện tại, không lỗi.
  // ===================================================================

  async getWarehouse(warehouseId: string): Promise<WarehouseDocument> {
    if (!Types.ObjectId.isValid(warehouseId)) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.WAREHOUSE_NOT_FOUND,
        `"${warehouseId}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { warehouseId },
      );
    }
    const warehouse = await this.warehouseModel.findById(warehouseId);
    if (!warehouse) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.WAREHOUSE_NOT_FOUND,
        `Không tìm thấy kho với id "${warehouseId}".`,
        HttpStatus.NOT_FOUND,
        { warehouseId },
      );
    }
    return warehouse;
  }

  private async assertWarehouseActive(warehouseId: string): Promise<WarehouseDocument> {
    const warehouse = await this.getWarehouse(warehouseId);
    if (!warehouse.is_active) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.WAREHOUSE_INACTIVE,
        `Kho "${warehouse.warehouse_code}" đã bị vô hiệu hóa.`,
        HttpStatus.CONFLICT,
        { warehouseId },
      );
    }
    return warehouse;
  }

  private async assertBinExists(binId: string): Promise<BinLocationDocument> {
    if (!Types.ObjectId.isValid(binId)) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.BIN_NOT_FOUND,
        `"${binId}" không đúng định dạng ObjectId hợp lệ.`,
        HttpStatus.BAD_REQUEST,
        { binId },
      );
    }
    const bin = await this.binModel.findById(binId);
    if (!bin) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.BIN_NOT_FOUND,
        `Không tìm thấy kệ với id "${binId}".`,
        HttpStatus.NOT_FOUND,
        { binId },
      );
    }
    return bin;
  }

  /** Tổng số đơn vị hàng đang nằm trong phạm vi lọc (chỉ tính ô có hàng). */
  private async countStockUnits(match: Record<string, unknown>): Promise<number> {
    const [row] = await this.assignmentModel.aggregate<{ total: number }>([
      { $match: { ...match, quantity_on_hand: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$quantity_on_hand' } } },
    ]);
    return row?.total ?? 0;
  }

  private throwHasStock(scope: string, units: number, details: Record<string, unknown>): never {
    throw new AppException(
      WAREHOUSE_ERROR_CODES.HAS_STOCK,
      `${scope} còn ${String(units)} đơn vị hàng tồn — chuyển hết hàng đi trước khi vô hiệu hóa.`,
      HttpStatus.CONFLICT,
      { ...details, unitsInStock: units },
    );
  }

  private async runInTransaction(work: (session: ClientSession) => Promise<void>): Promise<void> {
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await work(session);
      });
    } finally {
      await session.endSession();
    }
  }

  async updateWarehouse(warehouseId: string, dto: UpdateWarehouseDto): Promise<WarehouseDocument> {
    if (dto.warehouse_name === undefined && dto.address === undefined) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.NOTHING_TO_UPDATE,
        'Không có trường nào để cập nhật (chỉ sửa được warehouse_name, address).',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.getWarehouse(warehouseId);
    const updated = await this.warehouseModel.findByIdAndUpdate(
      warehouseId,
      {
        $set: {
          ...(dto.warehouse_name !== undefined && { warehouse_name: dto.warehouse_name }),
          ...(dto.address !== undefined && { address: dto.address }),
        },
      },
      { returnDocument: 'after' },
    );
    return updated ?? this.getWarehouse(warehouseId);
  }

  async deactivateWarehouse(warehouseId: string): Promise<WarehouseDocument> {
    const warehouse = await this.getWarehouse(warehouseId);
    if (!warehouse.is_active) return warehouse;

    const whId = new Types.ObjectId(warehouseId);
    const units = await this.countStockUnits({ warehouse_id: whId });
    if (units > 0) this.throwHasStock(`Kho "${warehouse.warehouse_code}"`, units, { warehouseId });

    await this.runInTransaction(async (session) => {
      await this.warehouseModel.updateOne({ _id: whId }, { $set: { is_active: false } }, { session });
      await this.zoneModel.updateMany({ warehouse_id: whId }, { $set: { is_active: false } }, { session });
      await this.binModel.updateMany({ warehouse_id: whId }, { $set: { is_active: false } }, { session });
    });
    return this.getWarehouse(warehouseId);
  }

  async reactivateWarehouse(warehouseId: string): Promise<WarehouseDocument> {
    await this.getWarehouse(warehouseId);
    await this.warehouseModel.updateOne({ _id: warehouseId }, { $set: { is_active: true } });
    return this.getWarehouse(warehouseId);
  }

  async updateZone(zoneId: string, dto: UpdateZoneDto): Promise<WarehouseZoneDocument> {
    if (dto.zone_name === undefined && dto.description === undefined) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.NOTHING_TO_UPDATE,
        'Không có trường nào để cập nhật (chỉ sửa được zone_name, description).',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.assertZoneExists(zoneId);
    const updated = await this.zoneModel.findByIdAndUpdate(
      zoneId,
      {
        $set: {
          ...(dto.zone_name !== undefined && { zone_name: dto.zone_name }),
          ...(dto.description !== undefined && { description: dto.description }),
        },
      },
      { returnDocument: 'after' },
    );
    return updated ?? this.assertZoneExists(zoneId);
  }

  async deactivateZone(zoneId: string): Promise<WarehouseZoneDocument> {
    const zone = await this.assertZoneExists(zoneId);
    if (zone.is_active === false) return zone;

    const zId = new Types.ObjectId(zoneId);
    const binIds = (await this.binModel.find({ zone_id: zId }).select('_id').lean()).map((b) => b._id);
    const units = binIds.length > 0 ? await this.countStockUnits({ bin_location_id: { $in: binIds } }) : 0;
    if (units > 0) this.throwHasStock(`Khu "${zone.zone_code}"`, units, { zoneId });

    await this.runInTransaction(async (session) => {
      await this.zoneModel.updateOne({ _id: zId }, { $set: { is_active: false } }, { session });
      await this.binModel.updateMany({ zone_id: zId }, { $set: { is_active: false } }, { session });
    });
    return this.assertZoneExists(zoneId);
  }

  async reactivateZone(zoneId: string): Promise<WarehouseZoneDocument> {
    const zone = await this.assertZoneExists(zoneId);
    await this.assertWarehouseActive(zone.warehouse_id.toString()); // kho đang tắt thì không bật khu
    const zId = new Types.ObjectId(zoneId);
    await this.runInTransaction(async (session) => {
      await this.zoneModel.updateOne({ _id: zId }, { $set: { is_active: true } }, { session });
      await this.binModel.updateMany({ zone_id: zId }, { $set: { is_active: true } }, { session });
    });
    return this.assertZoneExists(zoneId);
  }

  async deactivateBin(binId: string): Promise<BinLocationDocument> {
    const bin = await this.assertBinExists(binId);
    if (bin.is_active === false) return bin;
    const units = await this.countStockUnits({ bin_location_id: bin._id });
    if (units > 0) this.throwHasStock(`Kệ "${bin.bin_code}"`, units, { binId });
    await this.binModel.updateOne({ _id: bin._id }, { $set: { is_active: false } });
    return this.assertBinExists(binId);
  }

  async reactivateBin(binId: string): Promise<BinLocationDocument> {
    const bin = await this.assertBinExists(binId);
    const zone = await this.zoneModel.findById(bin.zone_id).lean();
    if (zone?.is_active === false) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.ZONE_INACTIVE,
        `Khu "${zone.zone_code}" đang bị vô hiệu hóa — kích hoạt lại khu trước.`,
        HttpStatus.CONFLICT,
        { binId, zoneId: bin.zone_id.toString() },
      );
    }
    await this.binModel.updateOne({ _id: bin._id }, { $set: { is_active: true } });
    return this.assertBinExists(binId);
  }
  // ===================================================================
  // 10/10/2026 — XOÁ HẲN mục tạo nhầm (báo cáo Hải Phượng: "nhiều mã quá,
  // chỉ ẩn được"). Quy tắc: CHƯA TỪNG DÙNG thì xoá hẳn; đã có nhập–xuất thì
  // chỉ vô hiệu hoá (DELETE cũ) — giữ toàn vẹn sổ cái inventory_movements.
  // "Đã dùng" = có ô còn hàng HOẶC có ≥ 1 dòng sổ cái trỏ tới ô (mọi luồng
  // làm đổi tồn — nhập, kiểm kê, chuyển ô, lấy hàng, nhập lại hàng hoàn — đều
  // ghi sổ cái, nên chỉ cần kiểm tra sổ cái). Dòng "SKU trên ô" tồn 0 chưa
  // từng nhập–xuất là gán thử → xoá luôn cùng ô.
  // ===================================================================

  /** Chặn xoá hẳn nếu phạm vi ô đã có hàng hoặc có lịch sử nhập–xuất. */
  private async assertBinsNeverUsed(
    warehouseId: Types.ObjectId,
    binIds: Types.ObjectId[],
    scope: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    if (binIds.length === 0) return;
    const [units, movement] = await Promise.all([
      // warehouse_id đứng đầu → dùng được index unique của sku_bin_assignments
      this.countStockUnits({ warehouse_id: warehouseId, bin_location_id: { $in: binIds } }),
      this.movementModel.exists({ bin_location_id: { $in: binIds } }), // index bin_location_id
    ]);
    if (units > 0) this.throwHasStock(scope, units, details);
    if (movement) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.HAS_HISTORY,
        `${scope} đã có lịch sử nhập–xuất hàng — chỉ vô hiệu hoá được (DELETE thường), không xoá hẳn để giữ sổ cái.`,
        HttpStatus.CONFLICT,
        details,
      );
    }
  }

  /** Xoá hẳn 1 ô (kệ) chưa từng dùng + các dòng gán thử (tồn 0) trên ô. */
  async purgeBin(binId: string): Promise<PurgeResult> {
    const bin = await this.assertBinExists(binId);
    await this.assertBinsNeverUsed(bin.warehouse_id, [bin._id], `Ô "${bin.bin_code}"`, { binId });
    const result: PurgeResult = { warehouses: 0, zones: 0, bins: 0, assignments: 0 };
    await this.runInTransaction(async (session) => {
      const a = await this.assignmentModel.deleteMany(
        { warehouse_id: bin.warehouse_id, bin_location_id: bin._id, quantity_on_hand: 0 },
        { session },
      );
      const b = await this.binModel.deleteOne({ _id: bin._id }, { session });
      result.assignments = a.deletedCount;
      result.bins = b.deletedCount;
    });
    return result;
  }

  /**
   * Xoá hẳn NGUYÊN KỆ / NGUYÊN DÃY chưa từng dùng (mọi ô + dòng gán thử tồn 0),
   * tất cả hoặc không gì cả — có 1 ô đã dùng thì 409, không xoá ô nào (tránh
   * kệ bị thủng lỗ trên sơ đồ). Lọc theo zone_id (index) + aisle/side/rack.
   */
  async purgeRack(zoneId: string, query: PurgeRackQueryDto): Promise<PurgeResult> {
    const zone = await this.assertZoneExists(zoneId);
    const filter = {
      zone_id: zone._id,
      aisle: query.aisle,
      ...(query.side !== undefined && { side: query.side }),
      ...(query.bay !== undefined && { rack: query.bay }),
    };
    const rackBins = await this.binModel.find(filter).select('_id side').lean();
    const label = `${query.aisle}${query.side ?? ''}${query.bay !== undefined ? `-${String(query.bay).padStart(2, '0')}` : ''}`;
    const details = { zoneId, aisle: query.aisle, side: query.side ?? null, bay: query.bay ?? null };
    if (rackBins.length === 0) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.BIN_NOT_FOUND,
        `Không có ô nào thuộc ${query.bay !== undefined ? 'kệ' : 'dãy'} "${label}" trong khu "${zone.zone_code}".`,
        HttpStatus.NOT_FOUND,
        details,
      );
    }
    // Có số kệ mà không có bên, trong khi dãy có cả T và P → mơ hồ (2 kệ khác nhau) → bắt chọn bên.
    if (query.bay !== undefined && query.side === undefined && new Set(rackBins.map((b) => b.side ?? '')).size > 1) {
      this.layoutFail(
        WAREHOUSE_ERROR_CODES.INVALID_RACK_LAYOUT,
        `Dãy ${query.aisle} có kệ số ${String(query.bay)} ở cả bên T và bên P — truyền thêm side để chọn đúng 1 kệ.`,
        details,
      );
    }
    const binIds = rackBins.map((b) => b._id);
    const scope = `${query.bay !== undefined ? 'Kệ' : 'Dãy'} "${label}" (khu ${zone.zone_code})`;
    await this.assertBinsNeverUsed(zone.warehouse_id, binIds, scope, details);
    const result: PurgeResult = { warehouses: 0, zones: 0, bins: 0, assignments: 0 };
    await this.runInTransaction(async (session) => {
      const a = await this.assignmentModel.deleteMany(
        { warehouse_id: zone.warehouse_id, bin_location_id: { $in: binIds }, quantity_on_hand: 0 },
        { session },
      );
      const b = await this.binModel.deleteMany({ _id: { $in: binIds } }, { session });
      result.assignments = a.deletedCount;
      result.bins = b.deletedCount;
    });
    return result;
  }

  /** Xoá hẳn 1 khu chưa từng dùng + toàn bộ ô trong khu + dòng gán thử. */
  async purgeZone(zoneId: string): Promise<PurgeResult> {
    const zone = await this.assertZoneExists(zoneId);
    const binIds = (await this.binModel.find({ zone_id: zone._id }).select('_id').lean()).map((b) => b._id);
    await this.assertBinsNeverUsed(zone.warehouse_id, binIds, `Khu "${zone.zone_code}"`, { zoneId });
    const result: PurgeResult = { warehouses: 0, zones: 0, bins: 0, assignments: 0 };
    await this.runInTransaction(async (session) => {
      if (binIds.length > 0) {
        const a = await this.assignmentModel.deleteMany(
          { warehouse_id: zone.warehouse_id, bin_location_id: { $in: binIds }, quantity_on_hand: 0 },
          { session },
        );
        const b = await this.binModel.deleteMany({ zone_id: zone._id }, { session });
        result.assignments = a.deletedCount;
        result.bins = b.deletedCount;
      }
      const z = await this.zoneModel.deleteOne({ _id: zone._id }, { session });
      result.zones = z.deletedCount;
    });
    return result;
  }

  /** Xoá hẳn 1 kho chưa từng dùng + toàn bộ khu, ô, dòng gán thử bên trong. */
  async purgeWarehouse(warehouseId: string): Promise<PurgeResult> {
    const warehouse = await this.getWarehouse(warehouseId);
    const whId = warehouse._id;
    const binIds = (await this.binModel.find({ warehouse_id: whId }).select('_id').lean()).map((b) => b._id);
    await this.assertBinsNeverUsed(whId, binIds, `Kho "${warehouse.warehouse_code}"`, { warehouseId });
    // Sổ cái theo kho (kể cả dòng trỏ tới ô đã bị xoá trước đây) — index warehouse_id đứng đầu.
    if (await this.movementModel.exists({ warehouse_id: whId })) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.HAS_HISTORY,
        `Kho "${warehouse.warehouse_code}" đã có lịch sử nhập–xuất hàng — chỉ vô hiệu hoá được, không xoá hẳn.`,
        HttpStatus.CONFLICT,
        { warehouseId },
      );
    }
    const result: PurgeResult = { warehouses: 0, zones: 0, bins: 0, assignments: 0 };
    await this.runInTransaction(async (session) => {
      const a = await this.assignmentModel.deleteMany({ warehouse_id: whId, quantity_on_hand: 0 }, { session });
      const b = await this.binModel.deleteMany({ warehouse_id: whId }, { session });
      const z = await this.zoneModel.deleteMany({ warehouse_id: whId }, { session });
      const w = await this.warehouseModel.deleteOne({ _id: whId }, { session });
      result.assignments = a.deletedCount;
      result.bins = b.deletedCount;
      result.zones = z.deletedCount;
      result.warehouses = w.deletedCount;
    });
    return result;
  }

  // ===================================================================
  // K2 (26/09/2026) — BỐ CỤC KHO MỚI: tạo kệ, sửa ô, gợi ý ô, sức chứa
  // ===================================================================

  private throwOverCapacity(binCode: string, capacity: number, current: number, incoming: number): never {
    throw new AppException(
      WAREHOUSE_ERROR_CODES.BIN_OVER_CAPACITY,
      `Ô "${binCode}" chứa tối đa ${String(capacity)}, đang có ${String(current)} — thêm ${String(incoming)} sẽ vượt. Gửi force=true nếu vẫn muốn xếp.`,
      HttpStatus.CONFLICT,
      { binCode, capacity, current, incoming },
    );
  }

  private layoutFail(code: string, message: string, details?: Record<string, unknown>): never {
    throw new AppException(code, message, HttpStatus.BAD_REQUEST, details);
  }

  /** Tạo 1 kệ + toàn bộ ô bên trong (tất cả hoặc không ô nào — transaction). */
  async createRack(zoneId: string, dto: CreateRackDto): Promise<BinLocationDocument[]> {
    const zone = await this.assertZoneExists(zoneId);
    if (zone.is_active === false) {
      throw new AppException(WAREHOUSE_ERROR_CODES.ZONE_INACTIVE, `Khu "${zone.zone_code}" đã bị vô hiệu hóa.`, HttpStatus.CONFLICT, { zoneId });
    }
    await this.assertWarehouseActive(zone.warehouse_id.toString());
    if (!ZONE_CODE_V2_REGEX.test(zone.zone_code)) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.ZONE_LEGACY_FORMAT,
        `Khu "${zone.zone_code}" dùng mã chuẩn cũ — kệ chuẩn mới chỉ tạo trong khu mã KA..KZ. Tạo khu mới theo chuẩn.`,
        HttpStatus.CONFLICT,
        { zoneId, zoneCode: zone.zone_code },
      );
    }
    const category = await this.categoriesService.getActiveLevel2(dto.category_code);

    const tierNumbers = dto.tiers.map((t) => t.tier);
    if (new Set(tierNumbers).size !== tierNumbers.length) {
      this.layoutFail(WAREHOUSE_ERROR_CODES.INVALID_RACK_LAYOUT, 'Có tầng bị khai trùng.', { tiers: tierNumbers });
    }
    const badSizes = dto.tiers.filter((t) => !category.size_scale.includes(t.size)).map((t) => t.size);
    if (badSizes.length > 0) {
      this.layoutFail(WAREHOUSE_ERROR_CODES.SIZE_NOT_IN_SCALE, `Size ${badSizes.join(', ')} không thuộc thang size của "${category.code}" (${category.size_scale.join(', ')}).`, { badSizes, sizeScale: category.size_scale });
    }
    if (dto.cell_colors && dto.cell_colors.length !== dto.cells_per_tier) {
      this.layoutFail(WAREHOUSE_ERROR_CODES.INVALID_RACK_LAYOUT, `Khai ${String(dto.cell_colors.length)} màu cho ${String(dto.cells_per_tier)} ô — phải bằng nhau (mỗi ô 1 màu).`);
    }
    const existing = await this.binModel.countDocuments({ zone_id: zone._id, aisle: dto.aisle, side: dto.side, rack: dto.bay, layout_version: 2 });
    if (existing > 0) {
      throw new AppException(WAREHOUSE_ERROR_CODES.RACK_EXISTS, `Kệ ${dto.aisle}-${dto.side}${String(dto.bay).padStart(2, '0')} đã tồn tại trong khu "${zone.zone_code}".`, HttpStatus.CONFLICT, { zoneId });
    }

    const docs = dto.tiers.flatMap((t) =>
      Array.from({ length: dto.cells_per_tier }, (_v, i) => {
        const pos = { zoneCode: zone.zone_code, aisle: dto.aisle, side: dto.side, bay: dto.bay, tier: t.tier, cell: i + 1 };
        return {
          warehouse_id: zone.warehouse_id,
          zone_id: zone._id,
          bin_code: buildBinCodeV2(pos),
          aisle: dto.aisle,
          rack: dto.bay, // giữ tương thích code cũ đọc rack/level
          level: t.tier,
          layout_version: 2 as const,
          side: dto.side,
          cell: i + 1,
          capacity: dto.capacity_per_cell ?? null,
          designated: { category_code: category.code, size: t.size, color_code: dto.cell_colors?.[i] ?? null },
          pick_sequence: computePickSequence(pos),
          is_active: true,
        };
      }),
    );
    try {
      await this.runInTransaction(async (session) => {
        await this.binModel.insertMany(docs, { session });
      });
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        throw new AppException(WAREHOUSE_ERROR_CODES.RACK_EXISTS, 'Mã ô bị trùng (có thể vừa có người tạo cùng kệ).', HttpStatus.CONFLICT, { zoneId });
      }
      throw error;
    }
    return this.binModel.find({ zone_id: zone._id, aisle: dto.aisle, side: dto.side, rack: dto.bay, layout_version: 2 }).sort({ pick_sequence: 1 });
  }

  /** Sửa sức chứa + thuộc tính đăng ký của 1 ô (thiếu chức năng Sửa kệ từ K1). */
  async updateBin(binId: string, dto: UpdateBinDto): Promise<BinLocationDocument> {
    const bin = await this.assertBinExists(binId);
    const set: Record<string, unknown> = {};

    if (dto.capacity !== undefined) {
      if (dto.capacity !== null) {
        const current = await this.countStockUnits({ bin_location_id: bin._id });
        if (current > dto.capacity) this.throwOverCapacity(bin.bin_code, dto.capacity, current, 0);
      }
      set.capacity = dto.capacity;
    }

    const touchesDesignation =
      dto.designated_category_code !== undefined || dto.designated_size !== undefined || dto.designated_color_code !== undefined;
    if (touchesDesignation) {
      // SỬA (26/09/2026, rà K2) — ô đang có hàng mà đổi danh mục/size/màu thì
      // nhãn trên hệ thống nói 1 đằng, thùng thật chứa 1 nẻo (VD đăng ký "size M"
      // nhưng trong thùng vẫn là size L) -> nhân viên lấy nhầm. Bắt dọn ô trước.
      const unitsHere = await this.countStockUnits({ bin_location_id: bin._id });
      if (unitsHere > 0) {
        throw new AppException(
          WAREHOUSE_ERROR_CODES.BIN_HAS_STOCK_DESIGNATION,
          `Ô "${bin.bin_code}" đang chứa ${String(unitsHere)} đơn vị hàng — chuyển hết hàng ra trước khi đổi danh mục/size/màu đăng ký.`,
          HttpStatus.CONFLICT,
          { binId, unitsInStock: unitsHere },
        );
      }
      const categoryCode = dto.designated_category_code ?? bin.designated?.category_code;
      const size = dto.designated_size ?? bin.designated?.size;
      if (categoryCode) {
        const category = await this.categoriesService.getActiveLevel2(categoryCode);
        if (size && !category.size_scale.includes(size)) {
          this.layoutFail(WAREHOUSE_ERROR_CODES.SIZE_NOT_IN_SCALE, `Size "${size}" không thuộc thang size của "${category.code}" (${category.size_scale.join(', ')}).`, { size, sizeScale: category.size_scale });
        }
      } else if (size) {
        this.layoutFail(WAREHOUSE_ERROR_CODES.INVALID_RACK_LAYOUT, 'Muốn đăng ký size phải có danh mục.');
      }
      if (dto.designated_category_code !== undefined) set['designated.category_code'] = dto.designated_category_code;
      if (dto.designated_size !== undefined) set['designated.size'] = dto.designated_size;
      if (dto.designated_color_code !== undefined) set['designated.color_code'] = dto.designated_color_code;
    }

    if (Object.keys(set).length === 0) {
      throw new AppException(WAREHOUSE_ERROR_CODES.NOTHING_TO_UPDATE, 'Không có trường nào để cập nhật.', HttpStatus.BAD_REQUEST);
    }
    await this.binModel.updateOne({ _id: bin._id }, { $set: set });
    return this.assertBinExists(binId);
  }

  /**
   * Gợi ý ô để xếp hàng theo thuộc tính (danh mục bắt buộc; size, màu tùy chọn).
   * Mức khớp: 3 = đủ danh mục+size+màu; 2 = danh mục+size; 1 = cùng danh mục.
   * Trong cùng mức: ô còn trống nhiều hơn đứng trước, rồi theo lộ trình.
   * Quy tắc xếp kệ là GỢI Ý, không phải ràng buộc — Admin vẫn chọn ô khác được.
   */
  async suggestBins(
    warehouseId: string,
    query: { category_code: string; size?: string; color_code?: string },
  ): Promise<{ bin: BinLocationDocument; matchLevel: 1 | 2 | 3; usedUnits: number; freeCapacity: number | null }[]> {
    await this.assertWarehouseActive(warehouseId);
    await this.categoriesService.getActiveLevel2(query.category_code);
    const bins = await this.binModel.find({
      warehouse_id: new Types.ObjectId(warehouseId),
      'designated.category_code': query.category_code,
      ...ACTIVE_ONLY,
    });
    if (bins.length === 0) return [];
    const usage = await this.assignmentModel.aggregate<{ _id: Types.ObjectId; used: number }>([
      { $match: { bin_location_id: { $in: bins.map((b) => b._id) } } },
      { $group: { _id: '$bin_location_id', used: { $sum: '$quantity_on_hand' } } },
    ]);
    const usedMap = new Map(usage.map((u) => [u._id.toString(), u.used]));
    return bins
      .map((bin) => {
        const sizeOk = query.size !== undefined && bin.designated?.size === query.size;
        const colorOk = query.color_code !== undefined && bin.designated?.color_code === query.color_code;
        const matchLevel: 1 | 2 | 3 = sizeOk && colorOk ? 3 : sizeOk ? 2 : 1;
        const usedUnits = usedMap.get(bin._id.toString()) ?? 0;
        const freeCapacity = typeof bin.capacity === 'number' ? Math.max(0, bin.capacity - usedUnits) : null;
        return { bin, matchLevel, usedUnits, freeCapacity };
      })
      .filter((r) => r.freeCapacity === null || r.freeCapacity > 0) // ô đã đầy thì không gợi ý
      .sort((a, b) =>
        b.matchLevel - a.matchLevel ||
        (b.freeCapacity ?? Number.MAX_SAFE_INTEGER) - (a.freeCapacity ?? Number.MAX_SAFE_INTEGER) ||
        (a.bin.pick_sequence ?? Number.MAX_SAFE_INTEGER) - (b.bin.pick_sequence ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(0, 20);
  }
  // ===================================================================
  // K3 (27/09/2026) — SỔ CÁI, KIỂM KÊ, CHUYỂN Ô, BỎ GÁN
  // Mọi thay đổi quantity_on_hand đi kèm 1 dòng inventory_movements trong
  // CÙNG transaction. Không còn đường nào đổi tồn kho mà không để lại dấu vết.
  // ===================================================================

  private async runTx<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result as T;
    } finally {
      await session.endSession();
    }
  }

  private async recordMovement(
    a: SkuBinAssignmentDocument,
    type: MovementType,
    delta: number,
    quantityBefore: number,
    actorId: string,
    session: ClientSession,
    extra: { reasonCode?: string | null; note?: string | null; refType?: string | null; refId?: string | null } = {},
  ): Promise<void> {
    await this.movementModel.create([{
      warehouse_id: a.warehouse_id,
      assignment_id: a._id,
      bin_location_id: a.bin_location_id,
      platform: a.platform,
      shop_id: a.shop_id,
      seller_sku: a.seller_sku,
      master_sku: a.master_sku ?? null, // K4b
      type,
      delta,
      quantity_before: quantityBefore,
      quantity_after: quantityBefore + delta,
      reason_code: extra.reasonCode ?? null,
      note: extra.note ?? null,
      ref_type: extra.refType ?? null,
      ref_id: extra.refId ?? null,
      actor_id: actorId,
      created_at: new Date(),
    }], { session });
  }

  private async getAssignmentInWarehouse(warehouseId: string, assignmentId: string): Promise<SkuBinAssignmentDocument> {
    if (!Types.ObjectId.isValid(assignmentId)) {
      throw new AppException(WAREHOUSE_ERROR_CODES.ASSIGNMENT_NOT_FOUND, `"${assignmentId}" không đúng định dạng ObjectId.`, HttpStatus.BAD_REQUEST, { assignmentId });
    }
    const a = await this.assignmentModel.findOne({ _id: assignmentId, warehouse_id: new Types.ObjectId(warehouseId) });
    if (!a) {
      throw new AppException(WAREHOUSE_ERROR_CODES.ASSIGNMENT_NOT_FOUND, 'Không tìm thấy SKU trên ô này trong kho.', HttpStatus.NOT_FOUND, { assignmentId, warehouseId });
    }
    return a;
  }

  /**
   * Kiểm kê: nhập SỐ ĐẾM THỰC TẾ -> hệ thống tự tính chênh lệch và ghi sổ.
   * Kiểm kê khớp (chênh 0) VẪN ghi 1 dòng — bằng chứng đã kiểm, ai kiểm, lúc nào.
   * Chống ghi đè: chỉ ghi nếu tồn KHÔNG đổi kể từ lúc đọc (nếu vừa có người
   * lấy hàng giữa chừng -> 409, đếm lại).
   */
  async adjustStock(warehouseId: string, assignmentId: string, dto: AdjustStockDto, actorId: string): Promise<SkuBinAssignmentDocument> {
    await this.assertWarehouseActive(warehouseId);
    if (dto.reason_code === StockAdjustReason.OTHER && !dto.note?.trim()) {
      throw new AppException(WAREHOUSE_ERROR_CODES.NOTE_REQUIRED, 'Chọn "Lý do khác" thì bắt buộc ghi chú.', HttpStatus.BAD_REQUEST);
    }
    const current = await this.getAssignmentInWarehouse(warehouseId, assignmentId);
    const before = current.quantity_on_hand;
    return this.runTx(async (session) => {
      const updated = await this.assignmentModel.findOneAndUpdate(
        { _id: current._id, quantity_on_hand: before },
        { $set: { quantity_on_hand: dto.counted_quantity } },
        { returnDocument: 'after', session },
      );
      if (!updated) {
        throw new AppException(
          WAREHOUSE_ERROR_CODES.STOCK_CHANGED,
          'Tồn kho của ô vừa thay đổi (có người lấy/nhập hàng) trong lúc kiểm kê — tải lại và đếm lại.',
          HttpStatus.CONFLICT,
          { assignmentId },
        );
      }
      await this.recordMovement(updated, 'adjust', dto.counted_quantity - before, before, actorId, session, { reasonCode: dto.reason_code, note: dto.note ?? null });
      return updated;
    });
  }

  /** Chuyển hàng sang ô khác cùng kho: trừ nguồn + cộng đích + 2 dòng sổ cái, 1 transaction. */
  async transferStock(
    warehouseId: string,
    assignmentId: string,
    dto: TransferStockDto,
    actorId: string,
  ): Promise<{ from: SkuBinAssignmentDocument; to: SkuBinAssignmentDocument }> {
    await this.assertWarehouseActive(warehouseId);
    const source = await this.getAssignmentInWarehouse(warehouseId, assignmentId);
    const dest = await this.assertBinExists(dto.to_bin_location_id);
    if (dest.warehouse_id.toString() !== warehouseId) {
      throw new AppException(WAREHOUSE_ERROR_CODES.BIN_NOT_IN_WAREHOUSE, `Ô "${dest.bin_code}" không thuộc kho này.`, HttpStatus.BAD_REQUEST, { binId: dto.to_bin_location_id });
    }
    if (dest._id.equals(source.bin_location_id)) {
      throw new AppException(WAREHOUSE_ERROR_CODES.SAME_BIN, 'Ô đích trùng ô đang chứa hàng.', HttpStatus.BAD_REQUEST);
    }
    if (dest.is_active === false) {
      throw new AppException(WAREHOUSE_ERROR_CODES.BIN_INACTIVE, `Ô "${dest.bin_code}" đã bị vô hiệu hóa.`, HttpStatus.CONFLICT, { binId: dto.to_bin_location_id });
    }
    if (typeof dest.capacity === 'number' && dto.force !== true) {
      const destTotal = await this.countStockUnits({ bin_location_id: dest._id });
      if (destTotal + dto.quantity > dest.capacity) this.throwOverCapacity(dest.bin_code, dest.capacity, destTotal, dto.quantity);
    }
    const transferId = new Types.ObjectId().toString();
    return this.runTx(async (session) => {
      const from = await this.assignmentModel.findOneAndUpdate(
        { _id: source._id, quantity_on_hand: { $gte: dto.quantity } },
        { $inc: { quantity_on_hand: -dto.quantity } },
        { returnDocument: 'after', session },
      );
      if (!from) {
        throw new AppException(
          WAREHOUSE_ERROR_CODES.INSUFFICIENT_STOCK,
          `Ô nguồn chỉ còn ${String(source.quantity_on_hand)} — không chuyển được ${String(dto.quantity)}.`,
          HttpStatus.CONFLICT,
          { available: source.quantity_on_hand, requested: dto.quantity },
        );
      }
      // 🔄 K4b — dòng tồn đã gộp theo SKU nội bộ thì ô đích cũng gộp theo SKU nội bộ.
      const to = await this.assignmentModel.findOneAndUpdate(
        source.master_sku
          ? { warehouse_id: source.warehouse_id, master_sku: source.master_sku, bin_location_id: dest._id }
          : { warehouse_id: source.warehouse_id, platform: source.platform, shop_id: source.shop_id, seller_sku: source.seller_sku, bin_location_id: dest._id, master_sku: null },
        {
          $inc: { quantity_on_hand: dto.quantity },
          ...(source.master_sku ? { $setOnInsert: { platform: source.platform, shop_id: source.shop_id, seller_sku: source.seller_sku } } : {}),
        },
        { upsert: true, returnDocument: 'after', session },
      );
      const extra = { refType: 'transfer', refId: transferId, note: dto.note ?? null };
      await this.recordMovement(from, 'transfer_out', -dto.quantity, from.quantity_on_hand + dto.quantity, actorId, session, extra);
      await this.recordMovement(to, 'transfer_in', dto.quantity, to.quantity_on_hand - dto.quantity, actorId, session, extra);
      return { from, to };
    });
  }

  /** Bỏ gán SKU khỏi ô — chỉ khi ô hết hàng của SKU đó. Sổ cái cũ vẫn giữ nguyên. */
  async unassign(warehouseId: string, assignmentId: string): Promise<void> {
    const a = await this.getAssignmentInWarehouse(warehouseId, assignmentId);
    if (a.quantity_on_hand > 0) {
      throw new AppException(
        WAREHOUSE_ERROR_CODES.ASSIGNMENT_HAS_STOCK,
        `SKU "${a.seller_sku}" còn ${String(a.quantity_on_hand)} trên ô này — chuyển/điều chỉnh về 0 trước khi bỏ gán.`,
        HttpStatus.CONFLICT,
        { assignmentId, quantityOnHand: a.quantity_on_hand },
      );
    }
    await this.assignmentModel.deleteOne({ _id: a._id, quantity_on_hand: 0 });
  }

  /**
   * 10/10/2026 — SỬA GÁN NHẦM: dời 1 dòng "SKU trên ô" sang ô đúng (cùng kho).
   *  - Ô nguồn hết hàng: chỉ đổi ô (không có hàng nên không ghi sổ cái). Nếu ô
   *    đích đã có sẵn dòng của đúng SKU đó → bỏ dòng nguồn, giữ dòng đích.
   *  - Ô nguồn còn hàng: chuyển TOÀN BỘ số đang có qua transferStock (2 dòng sổ
   *    cái, kiểm tra sức chứa) rồi bỏ dòng nguồn đã về 0.
   * Trả về dòng ở ô đích.
   */
  async moveAssignment(
    warehouseId: string,
    assignmentId: string,
    dto: MoveAssignmentDto,
    actorId: string,
  ): Promise<SkuBinAssignmentDocument> {
    await this.assertWarehouseActive(warehouseId);
    const source = await this.getAssignmentInWarehouse(warehouseId, assignmentId);

    if (source.quantity_on_hand > 0) {
      const { to } = await this.transferStock(
        warehouseId,
        assignmentId,
        {
          to_bin_location_id: dto.to_bin_location_id,
          quantity: source.quantity_on_hand,
          force: dto.force,
          note: dto.note ?? 'Sửa gán nhầm ô',
        },
        actorId,
      );
      // Có người lấy hàng xen giữa thì quantity_on_hand > 0 → giữ dòng, không xoá.
      await this.assignmentModel.deleteOne({ _id: source._id, quantity_on_hand: 0 });
      return to;
    }

    const dest = await this.assertBinExists(dto.to_bin_location_id);
    if (dest.warehouse_id.toString() !== warehouseId) {
      throw new AppException(WAREHOUSE_ERROR_CODES.BIN_NOT_IN_WAREHOUSE, `Ô "${dest.bin_code}" không thuộc kho này.`, HttpStatus.BAD_REQUEST, { binId: dto.to_bin_location_id });
    }
    if (dest._id.equals(source.bin_location_id)) {
      throw new AppException(WAREHOUSE_ERROR_CODES.SAME_BIN, 'Ô đích trùng ô đang gán.', HttpStatus.BAD_REQUEST);
    }
    if (dest.is_active === false) {
      throw new AppException(WAREHOUSE_ERROR_CODES.BIN_INACTIVE, `Ô "${dest.bin_code}" đã bị vô hiệu hóa.`, HttpStatus.CONFLICT, { binId: dto.to_bin_location_id });
    }
    // Cùng khoá định danh với transferStock (master_sku nếu đã nối, ngược lại SKU sàn).
    const destFilter = source.master_sku
      ? { warehouse_id: source.warehouse_id, master_sku: source.master_sku, bin_location_id: dest._id }
      : { warehouse_id: source.warehouse_id, platform: source.platform, shop_id: source.shop_id, seller_sku: source.seller_sku, bin_location_id: dest._id, master_sku: null };
    const existingAtDest = await this.assignmentModel.findOne(destFilter);
    if (existingAtDest) {
      await this.assignmentModel.deleteOne({ _id: source._id, quantity_on_hand: 0 });
      return existingAtDest;
    }
    try {
      const moved = await this.assignmentModel.findOneAndUpdate(
        { _id: source._id, quantity_on_hand: 0 },
        { $set: { bin_location_id: dest._id } },
        { returnDocument: 'after' },
      );
      if (!moved) {
        throw new AppException(WAREHOUSE_ERROR_CODES.STOCK_CHANGED, 'Ô vừa được nhập hàng trong lúc sửa — tải lại rồi thử lại.', HttpStatus.CONFLICT, { assignmentId });
      }
      return moved;
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        // Vừa có người gán cùng SKU vào ô đích — giữ dòng đích, bỏ dòng nguồn.
        await this.assignmentModel.deleteOne({ _id: source._id, quantity_on_hand: 0 });
        const winner = await this.assignmentModel.findOne(destFilter);
        if (winner) return winner;
      }
      throw error;
    }
  }

  async listMovements(warehouseId: string, assignmentId: string, limit = 100): Promise<InventoryMovementDocument[]> {
    const a = await this.getAssignmentInWarehouse(warehouseId, assignmentId);
    return this.movementModel.find({ assignment_id: a._id }).sort({ created_at: -1 }).limit(Math.min(500, Math.max(1, limit)));
  }

  /**
   * G3 (dùng chung) — nhập lại hàng trả/hoàn đạt kiểm tra vào 1 ô, có sổ cái.
   * Chạy trong session của bên gọi để cùng transaction với phiếu trả hàng.
   */
  async restockReturnedItem(
    params: { warehouseId: string; binLocationId: string; platform: MarketplacePlatform; shopId: string; sellerSku: string; quantity: number; returnRequestId: string; actorId: string },
    session: ClientSession,
  ): Promise<void> {
    const bin = await this.assertBinExists(params.binLocationId);
    if (bin.warehouse_id.toString() !== params.warehouseId) {
      throw new AppException(WAREHOUSE_ERROR_CODES.BIN_NOT_IN_WAREHOUSE, `Ô "${bin.bin_code}" không thuộc kho này.`, HttpStatus.BAD_REQUEST, { binId: params.binLocationId });
    }
    if (bin.is_active === false) {
      throw new AppException(WAREHOUSE_ERROR_CODES.BIN_INACTIVE, `Ô "${bin.bin_code}" đã bị vô hiệu hóa.`, HttpStatus.CONFLICT, { binId: params.binLocationId });
    }
    // 🔄 K4b — SKU đã nối thì hàng hoàn nhập lại vào tồn chung của SKU nội bộ.
    const master = (await resolveMasterSkus(this.mappingModel, params.platform, params.shopId, [params.sellerSku])).get(params.sellerSku);
    // 🔄 07/10/2026 — upsert phải dùng bộ lọc KHỚP CHÍNH XÁC (stockUpsertFilterFor).
    // Dùng stockFilterFor (có $or + regex) thì khi ô chưa có dòng tồn, dòng mới tạo ra
    // thiếu master_sku (SKU đã nối) hoặc thiếu seller_sku (SKU chưa nối).
    const doc = await this.assignmentModel.findOneAndUpdate(
      { warehouse_id: bin.warehouse_id, bin_location_id: bin._id, ...stockUpsertFilterFor(master, params.platform, params.shopId, params.sellerSku) },
      {
        $inc: { quantity_on_hand: params.quantity },
        ...(master ? { $setOnInsert: { platform: params.platform, shop_id: params.shopId, seller_sku: params.sellerSku } } : {}),
      },
      { upsert: true, returnDocument: 'after', session },
    );
    await this.recordMovement(doc, 'return_restock', params.quantity, doc.quantity_on_hand - params.quantity, params.actorId, session, {
      refType: 'return_request', refId: params.returnRequestId,
    });
  }
}
