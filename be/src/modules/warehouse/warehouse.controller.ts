import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WarehouseService, PickingListItem } from './warehouse.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { CreateZoneDto } from './dto/create-zone.dto';
import { GenerateBinLocationsDto } from './dto/generate-bin-locations.dto';
import { AssignSkuBinDto } from './dto/assign-sku-bin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { WarehouseDocument } from './schemas/warehouse.schema';
import { WarehouseZoneDocument } from './schemas/warehouse-zone.schema';
import { SkuBinAssignmentDocument } from './schemas/sku-bin-assignment.schema';

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
  async createWarehouse(@Body() dto: CreateWarehouseDto): Promise<WarehouseDocument> {
    return this.warehouseService.createWarehouse(dto);
  }

  @Get('warehouses')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách kho' })
  async listWarehouses(): Promise<WarehouseDocument[]> {
    return this.warehouseService.listWarehouses();
  }

  @Post('warehouses/:warehouseId/zones')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo khu trong 1 kho (bước 2/4)' })
  async createZone(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateZoneDto,
  ): Promise<WarehouseZoneDocument> {
    return this.warehouseService.createZone(warehouseId, dto);
  }

  @Get('warehouses/:warehouseId/zones')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách khu trong 1 kho' })
  async listZones(@Param('warehouseId') warehouseId: string): Promise<WarehouseZoneDocument[]> {
    return this.warehouseService.listZones(warehouseId);
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
  ): Promise<SkuBinAssignmentDocument> {
    return this.warehouseService.assignSkuToBin(warehouseId, dto);
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
