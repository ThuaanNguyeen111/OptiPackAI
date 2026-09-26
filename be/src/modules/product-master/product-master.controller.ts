import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProductMasterService } from './product-master.service';
import { UpdateProductMasterDto } from './dto/update-product-master.dto';
import { PackageDimension, ProductMasterDocument } from './schemas/product-master.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { UserRole } from '../../common/enums/user-role.enum';

interface ProductMasterResponse {
  id: string;
  platform: string;
  shopId: string;
  sellerSku: string;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  weightKg: number | null;
  isFragile: boolean;
  manualOverride: boolean;
  manualOverrideAt: Date | null;
  lastSyncedAt: Date;
}

function toResponse(doc: ProductMasterDocument): ProductMasterResponse {
  // Dữ liệu chèn tay/hỏng có thể thiếu `dimension` (đã gặp thật 19/09) — trả null
  // thay vì làm sập API; FE hiện "chưa có kích thước" để Admin nhập tay.
  const dim = doc.dimension as PackageDimension | undefined;
  return {
    id: doc._id.toString(),
    platform: doc.platform,
    shopId: doc.shop_id,
    sellerSku: doc.seller_sku,
    lengthCm: dim?.package_length_cm ?? null,
    widthCm: dim?.package_width_cm ?? null,
    heightCm: dim?.package_height_cm ?? null,
    weightKg: dim?.package_weight_kg ?? null,
    isFragile: doc.is_fragile,
    manualOverride: doc.manual_override === true,
    manualOverrideAt: doc.manual_override_at ?? null,
    lastSyncedAt: doc.last_synced_at,
  };
}

/**
 * K1 (26/09/2026) — Product Master trước đây KHÔNG có controller nào.
 * Xem: Admin, Store Owner, Packaging Staff (cần biết kích thước khi đóng gói).
 * Sửa tay: Admin, Store Owner. Sửa xong -> manual_override=true -> cron đồng
 * bộ 3h sáng KHÔNG ghi đè nữa.
 */
@ApiTags('Product Master')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('product-master')
export class ProductMasterController {
  constructor(private readonly productMasterService: ProductMasterService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER, UserRole.PACKAGING_STAFF)
  @ApiOperation({ summary: '🆕 K1 — Danh sách sản phẩm (kích thước/cân nặng dùng cho gợi ý đóng gói).' })
  @ApiQuery({ name: 'shop_id', required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Tìm theo seller_sku, không phân biệt hoa/thường' })
  @ApiQuery({ name: 'manual_only', required: false, description: 'true = chỉ SKU đã sửa tay' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Query('shop_id') shopId?: string,
    @Query('search') search?: string,
    @Query('manual_only') manualOnly?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{ items: ProductMasterResponse[]; total: number; page: number; limit: number }> {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 20));
    const { items, total } = await this.productMasterService.listProducts({
      shopId,
      search,
      manualOnly: manualOnly === 'true',
      page: p,
      limit: l,
    });
    return { items: items.map(toResponse), total, page: p, limit: l };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER, UserRole.PACKAGING_STAFF)
  @ApiOperation({ summary: '🆕 K1 — Chi tiết 1 sản phẩm.' })
  async get(@Param('id') id: string): Promise<ProductMasterResponse> {
    return toResponse(await this.productMasterService.getProduct(id));
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER)
  @ApiOperation({
    summary: '🆕 K1 — Sửa tay kích thước/cân nặng/dễ vỡ. Sau khi sửa, cron đồng bộ KHÔNG ghi đè nữa (manualOverride=true).',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductMasterDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductMasterResponse> {
    return toResponse(await this.productMasterService.updateProduct(id, dto, user.userId));
  }
}
