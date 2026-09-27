import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MasterSkusService } from './master-skus.service';
import { ColorDocument } from './schemas/color.schema';
import { MasterSkuDocument } from './schemas/master-sku.schema';
import { MarketplaceSkuMappingDocument } from './schemas/marketplace-sku-mapping.schema';
import {
  CreateColorDto, CreateMappingDto, CreateMasterSkuDto, ReplaceMasterSkuDto, UpdateColorDto, UpdateMasterSkuDto,
} from './dto/master-sku.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { UserRole } from '../../common/enums/user-role.enum';

const READERS = [UserRole.ADMIN, UserRole.STORE_OWNER, UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF];

const colorRes = (c: ColorDocument): Record<string, unknown> => ({ code: c.code, name: c.name, hex: c.hex, isActive: c.is_active });
const skuRes = (s: MasterSkuDocument): Record<string, unknown> => ({
  masterSku: s.master_sku, categoryCode: s.category_code, modelNo: s.model_no, colorCode: s.color_code, size: s.size,
  name: s.name, gender: s.gender, lengthCm: s.length_cm, widthCm: s.width_cm, heightCm: s.height_cm, weightKg: s.weight_kg,
  isFragile: s.is_fragile, isActive: s.is_active, replacedBy: s.replaced_by,
});
const mapRes = (m: MarketplaceSkuMappingDocument): Record<string, unknown> => ({
  id: m._id.toString(), platform: m.platform, shopId: m.shop_id, sellerSku: m.seller_sku, masterSku: m.master_sku, createdAt: m.created_at ?? null,
});

@ApiTags('Colors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('colors')
export class ColorsController {
  constructor(private readonly service: MasterSkusService) {}

  @Get() @Roles(...READERS) @ApiOperation({ summary: '🆕 K4a — Danh mục màu chuẩn (dropdown). ?include_inactive=true' })
  async list(@Query('include_inactive') inc?: string): Promise<Record<string, unknown>[]> {
    return (await this.service.listColors(inc === 'true')).map(colorRes);
  }

  @Post() @Roles(UserRole.ADMIN) @ApiOperation({ summary: '🆕 K4a — Khai màu (mã 2-10 chữ hoa, khóa sau khi tạo).' })
  async create(@Body() dto: CreateColorDto): Promise<Record<string, unknown>> { return colorRes(await this.service.createColor(dto)); }

  @Patch(':code') @Roles(UserRole.ADMIN)
  async update(@Param('code') code: string, @Body() dto: UpdateColorDto): Promise<Record<string, unknown>> { return colorRes(await this.service.updateColor(code, dto)); }

  @Delete(':code') @Roles(UserRole.ADMIN) @ApiOperation({ summary: 'Vô hiệu hóa (chặn nếu còn SKU nội bộ dùng).' })
  async deactivate(@Param('code') code: string): Promise<Record<string, unknown>> { return colorRes(await this.service.setColorActive(code, false)); }

  @Post(':code/reactivate') @Roles(UserRole.ADMIN)
  async reactivate(@Param('code') code: string): Promise<Record<string, unknown>> { return colorRes(await this.service.setColorActive(code, true)); }
}

@ApiTags('Master SKUs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('master-skus')
export class MasterSkusController {
  constructor(private readonly service: MasterSkusService) {}

  @Get('unmapped-seller-skus') @Roles(UserRole.ADMIN, UserRole.STORE_OWNER)
  @ApiOperation({ summary: '🆕 K4a — SKU sàn đã đồng bộ về nhưng chưa nối SKU nội bộ (việc cần làm).' })
  unmapped(): ReturnType<MasterSkusService['listUnmappedSellerSkus']> { return this.service.listUnmappedSellerSkus(); }

  @Get('unpooled-stock') @Roles(UserRole.ADMIN, UserRole.STORE_OWNER)
  @ApiOperation({ summary: '🆕 K4b — Dòng tồn > 0 CHƯA tính theo SKU nội bộ: notMapped (cần nối) + mappedNotSynced (cần bấm đồng bộ).' })
  unpooled(): ReturnType<MasterSkusService['listUnpooledStock']> { return this.service.listUnpooledStock(); }

  @Post('sync-stock') @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '🆕 K4b — Gắn nhãn/gộp tồn cho MỌI liên kết (liên kết tạo trước K4b). Chạy lại nhiều lần an toàn.' })
  syncStock(@CurrentUser() user: AuthenticatedUser): ReturnType<MasterSkusService['syncStockForAllMappings']> { return this.service.syncStockForAllMappings(user.userId); }

  @Delete('mappings/:id') @Roles(UserRole.ADMIN) @ApiOperation({ summary: 'Bỏ nối 1 SKU sàn. 🔄 K4b: chặn nếu SKU nội bộ còn tồn gộp chung (MAP_HAS_POOLED_STOCK).' })
  async deleteMapping(@Param('id') id: string): Promise<{ success: true }> { await this.service.deleteMapping(id); return { success: true }; }

  @Get() @Roles(...READERS)
  @ApiOperation({ summary: '🆕 K4a — Danh sách SKU nội bộ. ?category_code&color_code&search&include_inactive&page&limit' })
  async list(
    @Query('category_code') categoryCode?: string, @Query('color_code') colorCode?: string, @Query('search') search?: string,
    @Query('include_inactive') inc?: string, @Query('page') page?: string, @Query('limit') limit?: string,
  ): Promise<{ items: Record<string, unknown>[]; total: number; page: number; limit: number }> {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 20));
    const { items, total } = await this.service.list({ categoryCode, colorCode, search, includeInactive: inc === 'true', page: p, limit: l });
    return { items: items.map(skuRes), total, page: p, limit: l };
  }

  @Get(':code') @Roles(...READERS)
  async get(@Param('code') code: string): Promise<Record<string, unknown>> { return skuRes(await this.service.get(code)); }

  @Post() @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '🆕 K4a — Tạo SKU nội bộ: hệ thống tự ghép mã {danh mục}-{mẫu}-{màu}-{size}, VD ATHUN-005-DEN-M.' })
  async create(@Body() dto: CreateMasterSkuDto, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return skuRes(await this.service.create(dto, user.userId));
  }

  @Patch(':code') @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Sửa tên/giới tính/kích thước/dễ vỡ. KHÔNG sửa mã và danh mục-mẫu-màu-size (dùng Thay thế).' })
  async update(@Param('code') code: string, @Body() dto: UpdateMasterSkuDto): Promise<Record<string, unknown>> {
    return skuRes(await this.service.update(code, dto));
  }

  @Delete(':code') @Roles(UserRole.ADMIN) @ApiOperation({ summary: 'Vô hiệu hóa (chặn nếu còn SKU sàn nối vào).' })
  async deactivate(@Param('code') code: string): Promise<Record<string, unknown>> { return skuRes(await this.service.setActive(code, false)); }

  @Post(':code/reactivate') @Roles(UserRole.ADMIN)
  async reactivate(@Param('code') code: string): Promise<Record<string, unknown>> { return skuRes(await this.service.setActive(code, true)); }

  @Post(':code/replace') @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '🆕 K4a — THAY THẾ SKU đặt sai: tạo SKU mới + chuyển liên kết sàn + khóa SKU cũ (replaced_by), 1 transaction.' })
  async replace(@Param('code') code: string, @Body() dto: ReplaceMasterSkuDto, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    const r = await this.service.replace(code, dto, user.userId);
    return { oldSku: skuRes(r.oldSku), newSku: skuRes(r.newSku), movedMappings: r.movedMappings };
  }

  @Get(':code/mappings') @Roles(...READERS)
  async listMappings(@Param('code') code: string): Promise<Record<string, unknown>[]> { return (await this.service.listMappings(code)).map(mapRes); }

  @Post(':code/mappings') @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '🆕 K4a — Nối 1 SKU sàn (phải đã đồng bộ về) vào SKU nội bộ này.' })
  async createMapping(@Param('code') code: string, @Body() dto: CreateMappingDto, @CurrentUser() user: AuthenticatedUser): Promise<Record<string, unknown>> {
    return mapRes(await this.service.createMapping(code, dto, user.userId));
  }
}
