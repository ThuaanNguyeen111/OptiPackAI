import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  ProductMasterService,
  type CatalogSyncShopOutcome,
} from './product-master.service';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { ConfirmPackagingProfileDto } from './dto/confirm-packaging-profile.dto';
import { ListProductMasterQueryDto } from './dto/list-product-master-query.dto';
import { ProductMaster } from './schemas/product-master.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { UserRole } from '../../common/enums/user-role.enum';

export interface ProductMasterResponse {
  id: string;
  platform: string;
  shopId: string;
  sellerSku: string;
  packagingProfileStatus: 'needs_measurement' | 'ready';
  dimension: { lengthCm?: number; widthCm?: number; heightCm?: number; weightKg?: number } | null;
  marketplaceDimension: { lengthCm?: number; widthCm?: number; heightCm?: number; weightKg?: number } | null;
  isFragile: boolean | null;
  orientationRule: 'any' | 'upright_only' | null;
  maxStackLoadKg: number | null;
  productCategory: string | null;
  zipBagCode: string | null;
  zipBagFolded: boolean;
  /** (08/10/2026) Chỉ có ở PUT packaging-profile: túi zip nhỏ nhất còn vừa gói vừa đo (null = không túi nào vừa). */
  suggestedZipBagCode?: string | null;
  canFoldInHalf: boolean;
  profileConfirmedBy: string | null;
  profileConfirmedAt: Date | null;
  lastSyncedAt: Date;
}

type ProductMasterLike = ProductMaster & { _id: { toString(): string } };

function mapDimension(
  d: ProductMaster['dimension'],
): ProductMasterResponse['dimension'] {
  if (!d) return null;
  return {
    lengthCm: d.package_length_cm,
    widthCm: d.package_width_cm,
    heightCm: d.package_height_cm,
    weightKg: d.package_weight_kg,
  };
}

function toResponse(doc: ProductMasterLike): ProductMasterResponse {
  return {
    id: doc._id.toString(),
    platform: doc.platform,
    shopId: doc.shop_id,
    sellerSku: doc.seller_sku,
    packagingProfileStatus: doc.packaging_profile_status,
    dimension: mapDimension(doc.dimension),
    marketplaceDimension: mapDimension(doc.marketplace_dimension),
    isFragile: doc.is_fragile ?? null,
    orientationRule: doc.orientation_rule ?? null,
    maxStackLoadKg: doc.max_stack_load_kg ?? null,
    productCategory: doc.product_category ?? null,
    zipBagCode: doc.zip_bag_code ?? null,
    zipBagFolded: doc.zip_bag_folded ?? false,
    canFoldInHalf: doc.can_fold_in_half ?? false,
    profileConfirmedBy: doc.profile_confirmed_by ? doc.profile_confirmed_by.toString() : null,
    profileConfirmedAt: doc.profile_confirmed_at ?? null,
    lastSyncedAt: doc.last_synced_at,
  };
}

/**
 * ===================================================================
 * product-master.controller.ts — MỚI (21/09/2026, Bước 0 engine 3D)
 * ===================================================================
 * Trước đây KHÔNG có API nào đặt hồ sơ SKU sang `ready` → mọi lần
 * generate gợi ý đóng gói đều bị chặn 422. Kho/Admin đo thật rồi xác
 * nhận ở đây; `marketplaceDimension` (số khai báo từ Lazada) chỉ để
 * tham khảo khi đo.
 * ===================================================================
 */
@ApiTags('Product Master')
@ApiBearerAuth('JWT-auth')
@Controller('product-master')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductMasterController {
  constructor(private readonly productMasterService: ProductMasterService) {}

  @Get()
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách hồ sơ SKU (lọc status=needs_measurement để biết SKU cần đo).' })
  async list(@Query() query: ListProductMasterQueryDto): Promise<ProductMasterResponse[]> {
    const docs = await this.productMasterService.listProfiles({
      status: query.status,
      shopId: query.shop_id,
      search: query.search,
    });
    return docs.map((d) => toResponse(d as ProductMasterLike));
  }

  @Post('sync')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Đồng bộ NGAY catalog sản phẩm từ sàn vào Product Master (không chờ cron mỗi giờ). Mặc định chỉ lấy sản phẩm thay đổi từ lần trước; full=true lấy toàn bộ. Bỏ shop_id = mọi shop đang kết nối của mọi sàn hỗ trợ. Số đo sàn chỉ ghi vào marketplaceDimension, không đổi hồ sơ kho đã xác nhận.',
  })
  @ApiQuery({ name: 'shop_id', required: false })
  @ApiQuery({ name: 'platform', required: false, enum: MarketplacePlatform })
  @ApiQuery({ name: 'full', required: false, description: 'true = đồng bộ toàn bộ catalog' })
  async syncNow(
    @Query('shop_id') shopId?: string,
    @Query('platform') platform?: string,
    @Query('full') full?: string,
  ): Promise<{ results: CatalogSyncShopOutcome[] }> {
    const options = { full: full === 'true' };
    if (shopId) {
      const target = platform === MarketplacePlatform.AURELLE ? MarketplacePlatform.AURELLE : MarketplacePlatform.LAZADA;
      return {
        results: [{ ok: true, ...(await this.productMasterService.syncCatalogForShop(target, shopId, options)) }],
      };
    }
    return { results: await this.productMasterService.syncCatalogAllShops(options) };
  }

  @Get(':id')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF, UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Chi tiết 1 hồ sơ sản phẩm.' })
  async get(@Param('id') id: string): Promise<ProductMasterResponse> {
    return toResponse(await this.productMasterService.getProduct(id));
  }

  @Put(':id/packaging-profile')
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Kho/Admin xác nhận số đo thật sau gấp/bọc + quy cách xếp → hồ sơ chuyển ready.',
  })
  async confirmProfile(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmPackagingProfileDto,
  ): Promise<ProductMasterResponse> {
    const doc = await this.productMasterService.confirmPackagingProfile(id, user.userId, dto);
    const suggestedZipBagCode = await this.productMasterService.suggestZipBag({
      length_cm: dto.length_cm,
      width_cm: dto.width_cm,
      height_cm: dto.height_cm,
    });
    return { ...toResponse(doc), suggestedZipBagCode };
  }
}
