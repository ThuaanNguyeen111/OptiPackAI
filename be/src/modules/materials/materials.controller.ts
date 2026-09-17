import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { CreateCartonMaterialDto } from './dto/create-carton-material.dto';
import { ListCartonMaterialsDto } from './dto/list-carton-materials.dto';
import { StockInCartonDto } from './dto/stock-in-carton.dto';
import { CartonMaterialDocument } from './schemas/carton-material.schema';
import { MaterialsService } from './materials.service';

interface CartonMaterialResponse {
  id: string;
  code: string;
  name: string;
  dimensionsMm: { length: number; width: number; height: number };
  boardType: string;
  quantityOnHand: number;
  reorderLevel: number;
  unitCostVnd: number;
  storageLocation: string;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
}

function toCartonResponse(doc: CartonMaterialDocument): CartonMaterialResponse {
  const stockStatus = doc.quantity_on_hand === 0
    ? 'out_of_stock'
    : doc.quantity_on_hand <= doc.reorder_level
      ? 'low_stock'
      : 'in_stock';
  return {
    id: doc._id.toString(),
    code: doc.material_code,
    name: doc.material_name,
    dimensionsMm: { length: doc.length_mm, width: doc.width_mm, height: doc.height_mm },
    boardType: doc.board_type,
    quantityOnHand: doc.quantity_on_hand,
    reorderLevel: doc.reorder_level,
    unitCostVnd: doc.unit_cost_vnd,
    storageLocation: doc.storage_location,
    stockStatus,
  };
}

@ApiTags('Materials')
@ApiBearerAuth('JWT-auth')
@Controller('materials')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Get('cartons/summary')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF)
  @ApiOperation({ summary: 'Tổng quan tồn kho thùng carton' })
  getSummary(): Promise<{ total: number; inStock: number; lowStock: number; outOfStock: number }> {
    return this.materialsService.getSummary();
  }

  @Get('cartons')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF)
  @ApiOperation({ summary: 'Danh sách thùng carton' })
  async listCartons(@Query() query: ListCartonMaterialsDto): Promise<CartonMaterialResponse[]> {
    const cartons = await this.materialsService.listCartons(query);
    return cartons.map(toCartonResponse);
  }

  @Post('cartons')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Thêm quy cách thùng carton' })
  async createCarton(@Body() dto: CreateCartonMaterialDto): Promise<CartonMaterialResponse> {
    return toCartonResponse(await this.materialsService.createCarton(dto));
  }

  @Post('cartons/:cartonId/stock-in')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({ summary: 'Nhập thêm thùng carton vào tồn kho' })
  async stockIn(@Param('cartonId') cartonId: string, @Body() dto: StockInCartonDto): Promise<CartonMaterialResponse> {
    return toCartonResponse(await this.materialsService.stockIn(cartonId, dto.quantity));
  }
}
