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
import { CreateRackDto } from './dto/create-rack.dto';
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

export interface PickingListItem extends PackableItem {
  zone_code: string;
  bin_code: string;
  pick_sequence: number | null; // K2 — null = kệ chuẩn cũ (v1) hoặc chưa gán vị trí
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

    const allProducts = await this.productMasterModel
      .find()
      .select('platform shop_id seller_sku')
      .lean();

    return allProducts
      .filter(
        (p) => !assignedKeys.has(`${p.platform}|${p.shop_id}|${p.seller_sku}`),
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
    // K2 — sức chứa ô tính trên TỔNG hàng của mọi SKU đang nằm trong ô.
    if (typeof bin.capacity === 'number' && dto.force !== true) {
      const existing = await this.assignmentModel
        .findOne({ warehouse_id: warehouseId, platform: dto.platform, shop_id: dto.shop_id, seller_sku: dto.seller_sku })
        .lean();
      const binTotal = await this.countStockUnits({ bin_location_id: bin._id });
      const alreadyHere = existing?.bin_location_id.toString() === bin._id.toString();
      const incoming = existing ? existing.quantity_on_hand : (dto.initial_quantity ?? 0);
      const after = binTotal - (alreadyHere ? incoming : 0) + incoming;
      if (after > bin.capacity) this.throwOverCapacity(bin.bin_code, bin.capacity, binTotal, incoming);
    }
    return this.assignmentModel.findOneAndUpdate(
      {
        warehouse_id: warehouseId,
        platform: dto.platform,
        shop_id: dto.shop_id,
        seller_sku: dto.seller_sku,
      },
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
  async restockSku(
    warehouseId: string,
    assignmentId: string,
    quantity: number,
    force = false,
  ): Promise<SkuBinAssignmentDocument> {
    await this.assertWarehouseActive(warehouseId); // K1
    // K2 — kiểm tra sức chứa ô trước khi cộng (không atomic tuyệt đối: 2 lần
    // nhập cùng lúc có thể cùng lọt — ghi nhận ở điểm yếu, xử lý ở K3 bằng sổ cái).
    if (Types.ObjectId.isValid(assignmentId) && !force) {
      const current = await this.assignmentModel.findOne({ _id: assignmentId, warehouse_id: warehouseId }).lean();
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
  async getEnrichedPickingList(
    warehouseId: string,
    groupId: string,
  ): Promise<PickingListItem[]> {
    await this.assertWarehouseActive(warehouseId); // K1 — kho đã tắt thì không lấy hàng
    const { items } =
      await this.orderGroupsService.getPackableItemsForGroup(groupId);
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
      const bin = assignment
        ? binMap.get(assignment.bin_location_id.toString())
        : undefined;
      const zone = bin ? zoneMap.get(bin.zone_id.toString()) : undefined;
      return {
        ...item,
        zone_code: zone?.zone_code ?? 'ZZZ', // xếp cuối nếu chưa gán — 'ZZZ' sort sau mọi zone_code thật (thường 1-2 ký tự)
        bin_code: bin?.bin_code ?? 'CHƯA GÁN VỊ TRÍ',
        pick_sequence: bin?.pick_sequence ?? null,
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
}
