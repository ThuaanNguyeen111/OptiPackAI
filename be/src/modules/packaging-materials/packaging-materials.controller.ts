import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PackagingMaterialsService } from './packaging-materials.service';
import { PackagingMaterialDocument } from './schemas/packaging-material.schema';
import { CreatePackagingMaterialDto, PurchasePackagingDto, UpdatePackagingMaterialDto } from './dto/packaging-material.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { UserRole } from '../../common/enums/user-role.enum';

function toResponse(m: PackagingMaterialDocument): Record<string, unknown> {
  return {
    code: m.code, name: m.name, kind: m.kind,
    lengthCm: m.length_cm, widthCm: m.width_cm, heightCm: m.height_cm, matchMaterialType: m.match_material_type,
    unitCostVnd: m.unit_cost_vnd, reusable: m.reusable, maxReuseCycles: m.max_reuse_cycles,
    qtyNew: m.qty_new, qtyReused: m.qty_reused, isActive: m.is_active,
  };
}

const READERS = [UserRole.ADMIN, UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF];

/** G4 (27/09/2026) — vật liệu đóng gói + tái sử dụng. */
@ApiTags('Packaging Materials')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('packaging-materials')
export class PackagingMaterialsController {
  constructor(private readonly service: PackagingMaterialsService) {}

  @Get()
  @Roles(...READERS)
  @ApiOperation({ summary: 'Danh mục vật liệu kèm tồn MỚI / TÁI SỬ DỤNG. ?include_inactive=true' })
  async list(@Query('include_inactive') inc?: string): Promise<Record<string, unknown>[]> {
    return (await this.service.list(inc === 'true')).map(toResponse);
  }

  @Get('savings')
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER)
  @ApiOperation({ summary: 'Tổng tiền tiết kiệm nhờ tái sử dụng + tỷ lệ dùng lại (cho Dashboard).' })
  savings(): ReturnType<PackagingMaterialsService['savingsSummary']> {
    return this.service.savingsSummary();
  }

  @Get('movements')
  @Roles(...READERS)
  @ApiOperation({ summary: 'Sổ cái vật liệu (mới -> cũ). ?material_code=BOX-M&limit=100' })
  async movements(@Query('material_code') code?: string, @Query('limit') limit?: string): Promise<Record<string, unknown>[]> {
    return (await this.service.listMovements(code, Number(limit) || 100)).map((m) => ({
      materialCode: m.material_code, condition: m.condition, type: m.type, delta: m.delta, savingVnd: m.saving_vnd,
      refType: m.ref_type, refId: m.ref_id, note: m.note, actorId: m.actor_id, createdAt: m.created_at,
    }));
  }

  @Get(':code')
  @Roles(...READERS)
  async get(@Param('code') code: string): Promise<Record<string, unknown>> {
    return toResponse(await this.service.get(code));
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Khai vật liệu. Thùng: đủ 3 cạnh (khớp gợi ý đóng gói). Đệm: match_material_type.' })
  async create(@Body() dto: CreatePackagingMaterialDto): Promise<Record<string, unknown>> {
    return toResponse(await this.service.create(dto));
  }

  @Patch(':code')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Sửa tên / đơn giá / tái sử dụng / số lần tối đa. KHÔNG sửa mã, loại, kích thước.' })
  async update(@Param('code') code: string, @Body() dto: UpdatePackagingMaterialDto): Promise<Record<string, unknown>> {
    return toResponse(await this.service.update(code, dto));
  }

  @Delete(':code')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Vô hiệu hóa (chặn nếu còn tồn).' })
  async deactivate(@Param('code') code: string): Promise<Record<string, unknown>> {
    return toResponse(await this.service.setActive(code, false));
  }

  @Post(':code/reactivate')
  @Roles(UserRole.ADMIN)
  async reactivate(@Param('code') code: string): Promise<Record<string, unknown>> {
    return toResponse(await this.service.setActive(code, true));
  }

  @Post(':code/purchase')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  @ApiOperation({ summary: 'Nhập vật liệu MỚI (ghi sổ cái).' })
  async purchase(@Param('code') code: string, @Body() dto: PurchasePackagingDto, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return toResponse(await this.service.purchase(code, dto, user.userId));
  }
}
