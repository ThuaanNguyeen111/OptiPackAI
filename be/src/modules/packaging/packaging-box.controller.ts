import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PackagingBoxService, type BoxAvailability } from './packaging-box.service';
import { CreatePackagingBoxDto, StockInPackagingBoxDto, UpdatePackagingBoxDto } from './dto/packaging-box.dto';
import { PackagingBoxDocument } from './schemas/packaging-box.schema';
import type { PackagingStockMovement } from './schemas/packaging-stock-movement.schema';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

interface DimensionsMmResponse {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

export interface PackagingBoxResponse {
  id: string;
  code: string;
  name: string;
  inner: DimensionsMmResponse;
  outer: DimensionsMmResponse;
  tareG: number;
  maxLoadG: number;
  priceVnd: number | null;
  isSample: boolean;
  isActive: boolean;
  /** (22/09/2026) Tồn kho: thực có, đang được phương án chưa đóng giữ chỗ, còn trống. */
  quantityOnHand: number;
  reserved: number;
  available: number;
  reorderLevel: number;
  storageLocation: string | null;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export interface StockMovementResponse {
  delta: number;
  reason: string;
  balanceAfter: number;
  orderGroupId: string | null;
  note: string | null;
  createdAt: Date | null;
}

function toMovementResponse(m: PackagingStockMovement): StockMovementResponse {
  return {
    delta: m.delta,
    reason: m.reason,
    balanceAfter: m.balance_after,
    orderGroupId: m.order_group_id ? m.order_group_id.toString() : null,
    note: m.note,
    createdAt: m.created_at ?? null,
  };
}

function toBoxResponse(doc: PackagingBoxDocument, stock?: BoxAvailability): PackagingBoxResponse {
  const onHand = doc.quantity_on_hand;
  const reserved = stock?.reserved ?? 0;
  const available = Math.max(0, onHand - reserved);
  return {
    id: doc._id.toString(),
    code: doc.code,
    name: doc.name,
    inner: { lengthMm: doc.inner.length_mm, widthMm: doc.inner.width_mm, heightMm: doc.inner.height_mm },
    outer: { lengthMm: doc.outer.length_mm, widthMm: doc.outer.width_mm, heightMm: doc.outer.height_mm },
    tareG: doc.tare_g,
    maxLoadG: doc.max_load_g,
    priceVnd: doc.price_vnd,
    isSample: doc.is_sample,
    isActive: doc.is_active,
    quantityOnHand: onHand,
    reserved,
    available,
    reorderLevel: doc.reorder_level,
    storageLocation: doc.storage_location,
    stockStatus: available === 0 ? 'out_of_stock' : available <= doc.reorder_level ? 'low_stock' : 'in_stock',
  };
}

@ApiTags('Packaging Boxes')
@ApiBearerAuth('JWT-auth')
@Controller('packaging/boxes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PackagingBoxController {
  constructor(private readonly boxService: PackagingBoxService) {}

  @Get()
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiQuery({ name: 'active', required: false, description: 'true (mặc định) = chỉ thùng đang dùng' })
  @ApiOperation({
    summary:
      'Danh mục thùng carton (mm/g) kèm tồn kho: quantityOnHand (thực có), reserved (phương án chưa đóng đang giữ chỗ), available (còn trống — engine chỉ chọn thùng available > 0).',
  })
  async list(@Query('active') active?: string): Promise<PackagingBoxResponse[]> {
    const [docs, availability] = await Promise.all([
      this.boxService.list(active !== 'false'),
      this.boxService.listAvailability(),
    ]);
    return docs.map((d) => toBoxResponse(d, availability.get(d.code)));
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Thêm thùng carton vào danh mục (Admin).' })
  async create(@Body() dto: CreatePackagingBoxDto): Promise<PackagingBoxResponse> {
    return toBoxResponse(await this.boxService.create(dto));
  }

  @Post(':id/stock-in')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({ summary: 'Nhập thêm thùng vào kho (ghi 1 dòng sổ xuất/nhập). Tồn chỉ đổi qua route này hoặc lúc pack.' })
  async stockIn(
    @Param('id') id: string,
    @Body() dto: StockInPackagingBoxDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PackagingBoxResponse> {
    const doc = await this.boxService.stockIn(id, dto.quantity, user.userId, dto.note);
    const availability = await this.boxService.listAvailability();
    return toBoxResponse(doc, availability.get(doc.code));
  }

  @Get(':id/movements')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF)
  @ApiOperation({ summary: 'Lịch sử xuất/nhập của 1 loại thùng (mới nhất trước, tối đa 20 dòng).' })
  async movements(@Param('id') id: string): Promise<StockMovementResponse[]> {
    const rows = await this.boxService.listMovements(id);
    return rows.map(toMovementResponse);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Sửa thùng, mức cảnh báo, vị trí hoặc ngừng dùng (is_active=false) — Admin. Không sửa được tồn (dùng stock-in).' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePackagingBoxDto,
  ): Promise<PackagingBoxResponse> {
    const doc = await this.boxService.update(id, dto);
    const availability = await this.boxService.listAvailability();
    return toBoxResponse(doc, availability.get(doc.code));
  }
}
