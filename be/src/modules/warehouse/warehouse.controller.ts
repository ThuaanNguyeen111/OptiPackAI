import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WarehouseService, PickingListItem } from './warehouse.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { CreateZoneDto } from './dto/create-zone.dto';
import { GenerateBinLocationsDto } from './dto/generate-bin-locations.dto';
import { AssignSkuBinDto } from './dto/assign-sku-bin.dto';
import { RestockSkuDto } from './dto/restock-sku.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { WarehouseDocument } from './schemas/warehouse.schema';
import { WarehouseZoneDocument } from './schemas/warehouse-zone.schema';
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
}
function toZoneResponse(doc: WarehouseZoneDocument): WarehouseZoneResponse {
  return {
    id: doc._id.toString(),
    warehouseId: doc.warehouse_id.toString(),
    zoneCode: doc.zone_code,
    zoneName: doc.zone_name,
    description: doc.description,
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
}
function toAssignmentResponse(doc: SkuBinAssignmentDocument): SkuBinAssignmentResponse {
  return {
    id: doc._id.toString(),
    warehouseId: doc.warehouse_id.toString(),
    platform: doc.platform,
    shopId: doc.shop_id,
    sellerSku: doc.seller_sku,
    binLocationId: doc.bin_location_id.toString(),
    quantityOnHand: doc.quantity_on_hand,
  };
}

/**
 * ===================================================================
 * warehouse.controller.ts — MỚI (2026-09-09)
 * ===================================================================
 * Đúng "Manage warehouse configuration" (Phieu_FA26SE036.docx, System
 * Administrator) — TOÀN BỘ route ở đây @Roles(ADMIN), TRỪ 2 route đọc
 * cuối cùng (picking-list, unassigned) cần Warehouse Staff xem được.
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
  async createWarehouse(@Body() dto: CreateWarehouseDto): Promise<WarehouseResponse> {
    const doc = await this.warehouseService.createWarehouse(dto);
    return toWarehouseResponse(doc);
  }

  @Get('warehouses')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách kho' })
  async listWarehouses(): Promise<WarehouseResponse[]> {
    const docs = await this.warehouseService.listWarehouses();
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
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách khu trong 1 kho' })
  async listZones(@Param('warehouseId') warehouseId: string): Promise<WarehouseZoneResponse[]> {
    const docs = await this.warehouseService.listZones(warehouseId);
    return docs.map(toZoneResponse);
  }

  @Post('zones/:zoneId/bin-locations/generate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
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
  ): Promise<SkuBinAssignmentResponse> {
    const doc = await this.warehouseService.assignSkuToBin(warehouseId, dto);
    return toAssignmentResponse(doc);
  }

  @Post('warehouses/:warehouseId/sku-bin-assignments/:assignmentId/restock')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Nhập thêm hàng vào 1 vị trí đã gán (cộng dồn quantity_on_hand, không reset về giá trị mới).',
  })
  async restockSku(
    @Param('warehouseId') warehouseId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: RestockSkuDto,
  ): Promise<SkuBinAssignmentResponse> {
    const doc = await this.warehouseService.restockSku(warehouseId, assignmentId, dto.quantity);
    return toAssignmentResponse(doc);
  }

  @Get('sku-bin-assignments/unassigned')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Danh sách SKU đã có trong Product Master nhưng CHƯA được gán vị trí kệ — Admin chỉ cần mở đúng màn hình này mỗi khi có sản phẩm mới, không phải dò tay.',
  })
  async findUnassignedSkus(): Promise<{ platform: string; shop_id: string; seller_sku: string }[]> {
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
}
