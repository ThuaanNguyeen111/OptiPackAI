import { AdjustStockDto, TransferStockDto } from './dto/stock-operations.dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WarehouseService, PickingListItem } from './warehouse.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { CreateZoneDto } from './dto/create-zone.dto';
import { GenerateBinLocationsDto } from './dto/generate-bin-locations.dto';
import { AssignSkuBinDto } from './dto/assign-sku-bin.dto';
import { RestockSkuDto } from './dto/restock-sku.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { CreateRackDto } from './dto/create-rack.dto';
import { UpdateBinDto } from './dto/update-bin.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { WarehouseDocument } from './schemas/warehouse.schema';
import { WarehouseZoneDocument } from './schemas/warehouse-zone.schema';
import { BinLocationDocument } from './schemas/bin-location.schema';
import { SkuBinAssignmentDocument } from './schemas/sku-bin-assignment.schema';

// BỔ SUNG (2026-09-10) — Điểm yếu #9: trước đây trả THẲNG Document
// (snake_case, `_id`/`__v` thô) — sửa cho nhất quán với
// `order-groups.controller.ts`. Chỉ map 3 entity THẬT SỰ là raw
// Mongoose document ở controller này (Warehouse/Zone/SkuBinAssignment)
// — KHÔNG đụng `PickingListItem`/`PackableItem` (interface hợp đồng
// ĐÃ bàn giao cho thành viên làm AI, đổi field name lúc này sẽ phá vỡ
// hợp đồng đang dùng, ngoài phạm vi Điểm yếu #9).

interface WarehouseResponse {
  id: string;
  warehouseCode: string;
  warehouseName: string;
  address: string;
  isActive: boolean;
}
function toWarehouseResponse(doc: WarehouseDocument): WarehouseResponse {
  return {
    id: doc._id.toString(),
    warehouseCode: doc.warehouse_code,
    warehouseName: doc.warehouse_name,
    address: doc.address,
    isActive: doc.is_active,
  };
}

interface WarehouseZoneResponse {
  id: string;
  warehouseId: string;
  zoneCode: string;
  zoneName: string;
  description: string;
  isActive: boolean;
}
function toZoneResponse(doc: WarehouseZoneDocument): WarehouseZoneResponse {
  return {
    id: doc._id.toString(),
    warehouseId: doc.warehouse_id.toString(),
    zoneCode: doc.zone_code,
    zoneName: doc.zone_name,
    description: doc.description,
    isActive: doc.is_active !== false, // document cũ (trước K1) không có field -> coi là hoạt động
  };
}

interface BinLocationResponse {
  id: string;
  warehouseId: string;
  zoneId: string;
  binCode: string;
  aisle: string;
  rack: number;
  level: number;
  isActive: boolean;
  // K2 — layout v2 (kệ cũ: layoutVersion 1, các field dưới = null)
  layoutVersion: 1 | 2;
  side: 'T' | 'P' | null;
  cell: number | null;
  capacity: number | null;
  designated: {
    categoryCode: string | null;
    size: string | null;
    colorCode: string | null;
  } | null;
  pickSequence: number | null;
}
function toBinLocationResponse(doc: BinLocationDocument): BinLocationResponse {
  return {
    id: doc._id.toString(),
    warehouseId: doc.warehouse_id.toString(),
    zoneId: doc.zone_id.toString(),
    binCode: doc.bin_code,
    aisle: doc.aisle,
    rack: doc.rack,
    level: doc.level,
    isActive: doc.is_active !== false,
    layoutVersion: doc.layout_version === 2 ? 2 : 1,
    side: doc.side ?? null,
    cell: doc.cell ?? null,
    capacity: doc.capacity ?? null,
    designated: doc.designated
      ? {
          categoryCode: doc.designated.category_code ?? null,
          size: doc.designated.size ?? null,
          colorCode: doc.designated.color_code ?? null,
        }
      : null,
    pickSequence: doc.pick_sequence ?? null,
  };
}

interface SkuBinAssignmentResponse {
  id: string;
  warehouseId: string;
  platform: string;
  shopId: string;
  sellerSku: string;
  binLocationId: string;
  quantityOnHand: number;
  masterSku: string | null; // K4b — có giá trị = dòng tồn gộp chung theo SKU nội bộ
}
function toAssignmentResponse(
  doc: SkuBinAssignmentDocument,
): SkuBinAssignmentResponse {
  return {
    id: doc._id.toString(),
    warehouseId: doc.warehouse_id.toString(),
    platform: doc.platform,
    shopId: doc.shop_id,
    sellerSku: doc.seller_sku,
    binLocationId: doc.bin_location_id.toString(),
    quantityOnHand: doc.quantity_on_hand,
    masterSku: doc.master_sku ?? null, // K4b
  };
}

/**
 * ===================================================================
 * warehouse.controller.ts — MỚI (2026-09-09)
 * ===================================================================
 * Đúng "Manage warehouse configuration" (Phieu_FA26SE036.docx, System
 * Administrator) — route CẤU HÌNH kho (tạo/sửa/xóa kho, khu, kệ, gán SKU)
 * chỉ ADMIN. Route VẬN HÀNH kho mở thêm WAREHOUSE_STAFF: xem kho/khu/kệ,
 * xem tồn theo ô, nhập hàng (restock), kiểm kê (adjust), chuyển ô
 * (transfer), gợi ý ô, lịch sử, picking-list.
 * ĐÃ THAY ĐỔI (01/10/2026): bin-locations, sku-bin-assignments (GET),
 * restock, zones (GET) trước đây chỉ ADMIN.
 * ===================================================================
 */
@ApiTags('Warehouse')
@ApiBearerAuth('JWT-auth')
@Controller('warehouse')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Post('warehouses')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo kho mới (bước 1/4 trong luồng "add kho")' })
  async createWarehouse(
    @Body() dto: CreateWarehouseDto,
  ): Promise<WarehouseResponse> {
    const doc = await this.warehouseService.createWarehouse(dto);
    return toWarehouseResponse(doc);
  }

  @Get('warehouses')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({
    summary:
      'Danh sách kho. 🔄 SỬA (19/09/2026, báo cáo Hải Phượng) — mở thêm cho Warehouse Staff: trước đây CHỈ Admin xem được, nhưng picking-list/pick-item/report-missing đều BẮT BUỘC warehouse_id — Warehouse Staff không có cách nào (qua API) biết warehouse_id nào để dùng nếu route này vẫn khóa Admin-only.',
  })
  async listWarehouses(
    @CurrentUser() user: AuthenticatedUser,
    @Query('include_inactive') includeInactive?: string,
  ): Promise<WarehouseResponse[]> {
    // K1 — chỉ Admin được xem kho đã vô hiệu hóa; Warehouse Staff luôn chỉ thấy kho đang hoạt động.
    const showInactive =
      includeInactive === 'true' && user.role === UserRole.ADMIN;
    const docs = await this.warehouseService.listWarehouses(showInactive);
    return docs.map(toWarehouseResponse);
  }

  @Post('warehouses/:warehouseId/zones')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo khu trong 1 kho (bước 2/4)' })
  async createZone(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateZoneDto,
  ): Promise<WarehouseZoneResponse> {
    const doc = await this.warehouseService.createZone(warehouseId, dto);
    return toZoneResponse(doc);
  }

  @Get('warehouses/:warehouseId/zones')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({ summary: 'Danh sách khu trong 1 kho' })
  async listZones(
    @Query('include_inactive') includeInactive: string | undefined,
    @Param('warehouseId') warehouseId: string,
  ): Promise<WarehouseZoneResponse[]> {
    const docs = await this.warehouseService.listZones(
      warehouseId,
      includeInactive === 'true',
    );
    return docs.map(toZoneResponse);
  }

  @Get('zones/:zoneId/bin-locations')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'BỔ SUNG (16/09/2026, báo cáo Hải Phượng) — Danh sách kệ đã tạo trong 1 khu. Trước đây chỉ có POST .../generate để TẠO, không có cách XEM LẠI.',
  })
  async listBinLocationsByZone(
    @Query('include_inactive') includeInactive: string | undefined,
    @Param('zoneId') zoneId: string,
  ): Promise<BinLocationResponse[]> {
    const docs = await this.warehouseService.listBinLocationsByZone(
      zoneId,
      includeInactive === 'true',
    );
    return docs.map(toBinLocationResponse);
  }

  @Get('warehouses/:warehouseId/bin-locations')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({
    summary:
      'BỔ SUNG (16/09/2026) — Danh sách TOÀN BỘ kệ trong 1 kho (mọi khu gộp lại).',
  })
  async listBinLocationsByWarehouse(
    @Query('include_inactive') includeInactive: string | undefined,
    @Param('warehouseId') warehouseId: string,
  ): Promise<BinLocationResponse[]> {
    const docs = await this.warehouseService.listBinLocationsByWarehouse(
      warehouseId,
      includeInactive === 'true',
    );
    return docs.map(toBinLocationResponse);
  }

  @Get('warehouses/:warehouseId/sku-bin-assignments')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({
    summary:
      'BỔ SUNG (16/09/2026, báo cáo Hải Phượng) — Danh sách SKU đã gán vị trí trong 1 kho, để Admin xem lại/đối chiếu sau khi gán (trước đây chỉ GET được danh sách CHƯA gán, không GET được danh sách ĐÃ gán).',
  })
  async listSkuBinAssignmentsByWarehouse(
    @Param('warehouseId') warehouseId: string,
  ): Promise<SkuBinAssignmentResponse[]> {
    const docs =
      await this.warehouseService.listSkuBinAssignmentsByWarehouse(warehouseId);
    return docs.map(toAssignmentResponse);
  }

  @Post('zones/:zoneId/bin-locations/generate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    deprecated: true, // K2 — dùng POST zones/:zoneId/racks thay thế
    summary:
      'Tạo HÀNG LOẠT kệ trong 1 khu theo dãy (bước 3/4) — VD aisle=03, rack 1-10, level 1-4 -> tự sinh 40 kệ, không cần tạo tay từng cái.',
  })
  async generateBinLocations(
    @Param('zoneId') zoneId: string,
    @Body() dto: GenerateBinLocationsDto,
  ): Promise<{ created: number }> {
    return this.warehouseService.generateBinLocations(zoneId, dto);
  }

  @Post('warehouses/:warehouseId/sku-bin-assignments')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Gán 1 SKU vào 1 kệ cụ thể (bước 4/4)' })
  async assignSkuToBin(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: AssignSkuBinDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SkuBinAssignmentResponse> {
    const doc = await this.warehouseService.assignSkuToBin(
      warehouseId,
      dto,
      user.userId,
    );
    return toAssignmentResponse(doc);
  }

  @Post('warehouses/:warehouseId/sku-bin-assignments/:assignmentId/restock')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({
    summary:
      'Nhập thêm hàng vào 1 vị trí đã gán (cộng dồn quantity_on_hand, không reset về giá trị mới).',
  })
  async restockSku(
    @Param('warehouseId') warehouseId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: RestockSkuDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SkuBinAssignmentResponse> {
    const doc = await this.warehouseService.restockSku(
      warehouseId,
      assignmentId,
      dto.quantity,
      dto.force === true, // K2 — vượt sức chứa chỉ cho qua khi FE xác nhận force
      user.userId, // K3 — sổ cái
    );
    return toAssignmentResponse(doc);
  }

  @Get('sku-bin-assignments/unassigned')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Danh sách SKU đã có trong Product Master nhưng CHƯA được gán vị trí kệ — Admin chỉ cần mở đúng màn hình này mỗi khi có sản phẩm mới, không phải dò tay.',
  })
  async findUnassignedSkus(): Promise<
    { platform: string; shop_id: string; seller_sku: string }[]
  > {
    return this.warehouseService.findUnassignedSkus();
  }

  @Get(':warehouseId/picking-list/:groupId')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Picking List CÓ vị trí kệ thật, đã sắp xếp theo lộ trình vật lý trong kho (wave picking) — dùng cho màn hình Warehouse Picking (Mobile App).',
  })
  async pickingList(
    @Param('warehouseId') warehouseId: string,
    @Param('groupId') groupId: string,
  ): Promise<PickingListItem[]> {
    return this.warehouseService.getEnrichedPickingList(warehouseId, groupId);
  }
  // ===================================================================
  // K1 (26/09/2026) — VÒNG ĐỜI KHO / KHU / KỆ. Toàn bộ chỉ Admin.
  // DELETE = VÔ HIỆU HÓA (xóa mềm), không xóa hẳn. Mã (warehouse_code,
  // zone_code, bin_code) KHÔNG sửa được — gửi lên sẽ bị 400.
  // ===================================================================

  @Get('warehouses/:warehouseId')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({ summary: '🆕 K1 — Chi tiết 1 kho (kể cả đã vô hiệu hóa).' })
  async getWarehouse(
    @Param('warehouseId') warehouseId: string,
  ): Promise<WarehouseResponse> {
    return toWarehouseResponse(
      await this.warehouseService.getWarehouse(warehouseId),
    );
  }

  @Patch('warehouses/:warehouseId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: '🆕 K1 — Sửa tên/địa chỉ kho. KHÔNG sửa được warehouse_code.',
  })
  async updateWarehouse(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: UpdateWarehouseDto,
  ): Promise<WarehouseResponse> {
    return toWarehouseResponse(
      await this.warehouseService.updateWarehouse(warehouseId, dto),
    );
  }

  @Delete('warehouses/:warehouseId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      '🆕 K1 — Vô hiệu hóa kho (xóa mềm). Chặn 409 WH_HAS_STOCK nếu còn hàng. Tự vô hiệu hóa toàn bộ khu + kệ bên trong.',
  })
  async deactivateWarehouse(
    @Param('warehouseId') warehouseId: string,
  ): Promise<WarehouseResponse> {
    return toWarehouseResponse(
      await this.warehouseService.deactivateWarehouse(warehouseId),
    );
  }

  @Post('warehouses/:warehouseId/reactivate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      '🆕 K1 — Kích hoạt lại kho. CHỈ kho — các khu vẫn tắt, Admin bật lại từng khu.',
  })
  async reactivateWarehouse(
    @Param('warehouseId') warehouseId: string,
  ): Promise<WarehouseResponse> {
    return toWarehouseResponse(
      await this.warehouseService.reactivateWarehouse(warehouseId),
    );
  }

  @Patch('zones/:zoneId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      '🆕 K1 — Sửa tên/mô tả khu. KHÔNG sửa được zone_code (đã nằm trong mã kệ in trên nhãn).',
  })
  async updateZone(
    @Param('zoneId') zoneId: string,
    @Body() dto: UpdateZoneDto,
  ): Promise<WarehouseZoneResponse> {
    return toZoneResponse(await this.warehouseService.updateZone(zoneId, dto));
  }

  @Delete('zones/:zoneId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      '🆕 K1 — Vô hiệu hóa khu + toàn bộ kệ trong khu. Chặn 409 nếu còn hàng.',
  })
  async deactivateZone(
    @Param('zoneId') zoneId: string,
  ): Promise<WarehouseZoneResponse> {
    return toZoneResponse(await this.warehouseService.deactivateZone(zoneId));
  }

  @Post('zones/:zoneId/reactivate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      '🆕 K1 — Kích hoạt lại khu + toàn bộ kệ trong khu. Kho phải đang hoạt động.',
  })
  async reactivateZone(
    @Param('zoneId') zoneId: string,
  ): Promise<WarehouseZoneResponse> {
    return toZoneResponse(await this.warehouseService.reactivateZone(zoneId));
  }

  @Delete('bin-locations/:binId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: '🆕 K1 — Vô hiệu hóa 1 kệ. Chặn 409 nếu kệ còn hàng.',
  })
  async deactivateBin(
    @Param('binId') binId: string,
  ): Promise<BinLocationResponse> {
    return toBinLocationResponse(
      await this.warehouseService.deactivateBin(binId),
    );
  }

  @Post('bin-locations/:binId/reactivate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: '🆕 K1 — Kích hoạt lại 1 kệ. Khu chứa kệ phải đang hoạt động.',
  })
  async reactivateBin(
    @Param('binId') binId: string,
  ): Promise<BinLocationResponse> {
    return toBinLocationResponse(
      await this.warehouseService.reactivateBin(binId),
    );
  }
  // ===================================================================
  // K2 (26/09/2026) — BỐ CỤC KHO MỚI. Toàn bộ chỉ Admin (trừ gợi ý ô).
  // ===================================================================

  @Post('zones/:zoneId/racks')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      '🆕 K2 — Tạo 1 kệ chuẩn mới (mã KA-D1-P02-T03-1) + toàn bộ ô, mỗi tầng 1 size, mỗi ô 1 màu. Thay thế dần endpoint generate cũ.',
  })
  async createRack(
    @Param('zoneId') zoneId: string,
    @Body() dto: CreateRackDto,
  ): Promise<BinLocationResponse[]> {
    const docs = await this.warehouseService.createRack(zoneId, dto);
    return docs.map(toBinLocationResponse);
  }

  @Patch('bin-locations/:binId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      '🆕 K2 — Sửa sức chứa + danh mục/size/màu đăng ký của 1 ô. KHÔNG sửa được mã ô.',
  })
  async updateBin(
    @Param('binId') binId: string,
    @Body() dto: UpdateBinDto,
  ): Promise<BinLocationResponse> {
    return toBinLocationResponse(
      await this.warehouseService.updateBin(binId, dto),
    );
  }

  @Get('warehouses/:warehouseId/bin-suggestions')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({
    summary:
      '🆕 K2 — Gợi ý ô xếp hàng theo danh mục (bắt buộc), size, màu. Chỉ gợi ý ô còn chỗ.',
  })
  async suggestBins(
    @Param('warehouseId') warehouseId: string,
    @Query('category_code') categoryCode: string,
    @Query('size') size?: string,
    @Query('color_code') colorCode?: string,
  ): Promise<
    {
      bin: BinLocationResponse;
      matchLevel: 1 | 2 | 3;
      usedUnits: number;
      freeCapacity: number | null;
    }[]
  > {
    const rows = await this.warehouseService.suggestBins(warehouseId, {
      category_code: categoryCode,
      size,
      color_code: colorCode,
    });
    return rows.map((r) => ({ ...r, bin: toBinLocationResponse(r.bin) }));
  }
  // ===================================================================
  // K3 (27/09/2026) — SỔ CÁI, KIỂM KÊ, CHUYỂN Ô, BỎ GÁN
  // ===================================================================

  @Post('warehouses/:warehouseId/sku-bin-assignments/:assignmentId/adjust')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({
    summary:
      '🆕 K3 — Kiểm kê: nhập số đếm thực tế, hệ thống tự tính chênh lệch + ghi sổ cái (bắt buộc lý do).',
  })
  async adjustStock(
    @Param('warehouseId') warehouseId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SkuBinAssignmentResponse> {
    return toAssignmentResponse(
      await this.warehouseService.adjustStock(
        warehouseId,
        assignmentId,
        dto,
        user.userId,
      ),
    );
  }

  @Post('warehouses/:warehouseId/sku-bin-assignments/:assignmentId/transfer')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({
    summary:
      '🆕 K3 — Chuyển hàng sang ô khác cùng kho (trừ nguồn + cộng đích + 2 dòng sổ cái, 1 transaction).',
  })
  async transferStock(
    @Param('warehouseId') warehouseId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: TransferStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ from: SkuBinAssignmentResponse; to: SkuBinAssignmentResponse }> {
    const { from, to } = await this.warehouseService.transferStock(
      warehouseId,
      assignmentId,
      dto,
      user.userId,
    );
    return { from: toAssignmentResponse(from), to: toAssignmentResponse(to) };
  }

  @Delete('warehouses/:warehouseId/sku-bin-assignments/:assignmentId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      '🆕 K3 — Bỏ gán SKU khỏi ô (chỉ khi tồn = 0). Sổ cái cũ giữ nguyên.',
  })
  async unassign(
    @Param('warehouseId') warehouseId: string,
    @Param('assignmentId') assignmentId: string,
  ): Promise<{ success: true }> {
    await this.warehouseService.unassign(warehouseId, assignmentId);
    return { success: true };
  }

  @Get('warehouses/:warehouseId/sku-bin-assignments/:assignmentId/movements')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF, UserRole.STORE_OWNER)
  @ApiOperation({
    summary:
      '🆕 K3 — Sổ cái của 1 SKU trên 1 ô (mới -> cũ): nhập, lấy, kiểm kê, chuyển, hoàn.',
  })
  async listMovements(
    @Param('warehouseId') warehouseId: string,
    @Param('assignmentId') assignmentId: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>[]> {
    const docs = await this.warehouseService.listMovements(
      warehouseId,
      assignmentId,
      Number(limit) || 100,
    );
    return docs.map((m) => ({
      id: m._id.toString(),
      type: m.type,
      masterSku: m.master_sku, // K4b
      delta: m.delta,
      quantityBefore: m.quantity_before,
      quantityAfter: m.quantity_after,
      reasonCode: m.reason_code,
      note: m.note,
      refType: m.ref_type,
      refId: m.ref_id,
      actorId: m.actor_id,
      createdAt: m.created_at,
    }));
  }
}
