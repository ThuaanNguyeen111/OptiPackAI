import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PackagingMaterialService, type ActiveMaterialRules } from './packaging-material.service';
import {
  CreatePackagingMaterialDto,
  StockInPackagingMaterialDto,
  UpdateMaterialRulesDto,
  UpdatePackagingMaterialDto,
} from './dto/packaging-material.dto';
import {
  usableStock,
  type PackagingMaterialDocument,
} from '../packaging-materials/schemas/packaging-material.schema';
import type { PackagingMovement } from '../packaging-materials/schemas/packaging-movement.schema';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

export interface PackagingMaterialResponse {
  id: string;
  code: string;
  name: string;
  type: string;
  unit: string;
  weightGPerUnit: number;
  priceVndPerUnit: number;
  quantityOnHand: number;
  reorderLevel: number;
  storageLocation: string | null;
  isSample: boolean;
  isActive: boolean;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
  /** (05/10/2026) Thu hồi dùng lại được khi tháo kiện. */
  reusable: boolean;
  quantityNew: number;
  quantityReused: number;
}

export interface MaterialMovementResponse {
  delta: number;
  reason: string;
  balanceAfter: number;
  orderGroupId: string | null;
  note: string | null;
  createdAt: Date | null;
}

export interface MaterialRulesResponse {
  /** null = chưa lưu bộ luật nào, đang dùng luật mặc định. */
  version: number | null;
  isDefault: boolean;
  rules: {
    materialType: string;
    appliesTo: string;
    minUnits: number;
    basis: string;
    quantity: number;
    voidBands: { minVoidRatio: number; quantity: number }[];
  }[];
}

/** Loại sổ chung (packaging_movements) → lý do hiển thị cũ của FE. */
function movementReason(m: PackagingMovement): string {
  if (m.type === 'purchase') return 'stock_in';
  if (m.type === 'consume') return m.condition === 'reused' ? 'pack_reused' : 'pack';
  return m.type;
}

export function toMaterialResponse(doc: PackagingMaterialDocument): PackagingMaterialResponse {
  // Kho chung: tồn dùng được = mới + tái sử dụng.
  const onHand = usableStock(doc);
  return {
    id: doc._id.toString(),
    code: doc.code,
    name: doc.name,
    type: doc.material_type ?? 'unknown',
    unit: doc.unit ?? 'cái',
    weightGPerUnit: doc.weight_g_per_unit ?? 0,
    priceVndPerUnit: doc.unit_cost_vnd,
    quantityOnHand: onHand,
    reorderLevel: doc.reorder_level,
    storageLocation: doc.storage_location,
    isSample: doc.is_sample,
    isActive: doc.is_active,
    reusable: doc.reusable,
    quantityNew: doc.qty_new,
    quantityReused: doc.qty_reused,
    stockStatus: onHand === 0 ? 'out_of_stock' : onHand <= doc.reorder_level ? 'low_stock' : 'in_stock',
  };
}

function toMovementResponse(m: PackagingMovement): MaterialMovementResponse {
  return {
    delta: m.delta,
    reason: movementReason(m),
    balanceAfter: m.balance_after ?? 0,
    orderGroupId: m.ref_type === 'order_group' ? m.ref_id : null,
    note: m.note,
    createdAt: m.created_at,
  };
}

function toRulesResponse(active: ActiveMaterialRules): MaterialRulesResponse {
  return {
    version: active.version,
    isDefault: active.isDefault,
    rules: active.rules.map((r) => ({
      materialType: r.material_type,
      appliesTo: r.applies_to,
      minUnits: r.min_units ?? 1,
      basis: r.basis,
      quantity: r.quantity ?? 0,
      voidBands: (r.void_bands ?? []).map((b) => ({ minVoidRatio: b.min_void_ratio, quantity: b.quantity })),
    })),
  };
}

@ApiTags('Packaging Materials')
@ApiBearerAuth('JWT-auth')
@Controller('packaging/materials')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PackagingMaterialController {
  constructor(private readonly materialService: PackagingMaterialService) {}

  @Get()
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiQuery({ name: 'active', required: false, description: 'true (mặc định) = chỉ vật tư đang dùng' })
  @ApiOperation({
    summary: 'Danh mục vật tư chèn (góc xốp, tấm ngăn, gối hơi...) kèm tồn kho. Engine chỉ dùng vật tư đang dùng.',
  })
  async list(@Query('active') active?: string): Promise<PackagingMaterialResponse[]> {
    const docs = await this.materialService.list(active !== 'false');
    return docs.map(toMaterialResponse);
  }

  @Get('rules')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Bộ luật chọn vật tư hiện hành (version null = luật mặc định trong code). Kết quả là ƯỚC LƯỢNG theo luật, không phải lượng đệm tính từ hình học.',
  })
  async getRules(): Promise<MaterialRulesResponse> {
    return toRulesResponse(await this.materialService.getActiveRules());
  }

  @Put('rules')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lưu bộ luật mới (tạo version kế tiếp, bản cũ tắt — giữ lịch sử). Áp dụng từ lần generate sau.' })
  async saveRules(
    @Body() dto: UpdateMaterialRulesDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MaterialRulesResponse> {
    return toRulesResponse(await this.materialService.saveRules(dto.rules, user.userId));
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Thêm vật tư vào danh mục (Admin). Tồn ban đầu 0 — nhập qua stock-in.' })
  async create(@Body() dto: CreatePackagingMaterialDto): Promise<PackagingMaterialResponse> {
    return toMaterialResponse(await this.materialService.create(dto));
  }

  @Post(':id/stock-in')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({ summary: 'Nhập thêm vật tư vào kho (ghi 1 dòng sổ). Tồn chỉ đổi qua route này hoặc lúc pack.' })
  async stockIn(
    @Param('id') id: string,
    @Body() dto: StockInPackagingMaterialDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PackagingMaterialResponse> {
    return toMaterialResponse(await this.materialService.stockIn(id, dto.quantity, user.userId, dto.note));
  }

  @Get(':id/movements')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF)
  @ApiOperation({ summary: 'Lịch sử xuất/nhập của 1 vật tư (mới nhất trước, tối đa 20 dòng).' })
  async movements(@Param('id') id: string): Promise<MaterialMovementResponse[]> {
    const rows = await this.materialService.listMovements(id);
    return rows.map(toMovementResponse);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Sửa vật tư, mức cảnh báo, vị trí hoặc ngừng dùng (is_active=false) — Admin. Không sửa được tồn (dùng stock-in).',
  })
  async update(@Param('id') id: string, @Body() dto: UpdatePackagingMaterialDto): Promise<PackagingMaterialResponse> {
    return toMaterialResponse(await this.materialService.update(id, dto));
  }
}
