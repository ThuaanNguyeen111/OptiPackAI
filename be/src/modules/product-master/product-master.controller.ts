import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  ProductMasterService,
  type CatalogSyncShopOutcome,
} from './product-master.service';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { ConfirmPackagingProfileDto } from './dto/confirm-packaging-profile.dto';
import { ListProductMasterQueryDto, RetireProductMasterDto } from './dto/list-product-master-query.dto';
import { ProductMaster } from './schemas/product-master.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import { resolveOuterRequirement, type OuterRequirement } from '../../common/enums/outer-requirement.enum';
import { Features } from '../role-permissions/feature-scope';

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
  /** (13/11/2026) Chỉ có ở response xác nhận hồ sơ: cảnh báo không chặn (vd độ dày lệch GSM). */
  warnings?: string[];
  /** AOFP-224 — giá trị kho đặt (null = theo loại) và giá trị engine áp thật. */
  outerRequirement: OuterRequirement | null;
  effectiveOuterRequirement: OuterRequirement;
  canFoldInHalf: boolean;
  fabricGsm: number | null;
  profileConfirmedBy: string | null;
  profileConfirmedAt: Date | null;
  lastSyncedAt: Date;
  /** 22/10/2026 — sàn báo ngừng bán ('inactive') / Admin đánh dấu ngừng dùng. */
  marketplaceStatus: 'active' | 'inactive' | null;
  retired: boolean;
  /**
   * 27/11/2026 — chỉ ở danh sách gộp (mặc định): mọi dòng sàn của cùng 1 hàng. Dòng trả về là dòng
   * đại diện; xác nhận số đo / ngừng dùng trên `id` đại diện tự áp cho cả nhóm.
   */
  platforms?: {
    id: string;
    platform: string;
    shopId: string;
    sellerSku: string;
    packagingProfileStatus: 'needs_measurement' | 'ready';
    retired: boolean;
  }[];
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
    fabricGsm: doc.fabric_gsm ?? null,
    outerRequirement: doc.outer_requirement ?? null,
    effectiveOuterRequirement: resolveOuterRequirement({
      is_fragile: doc.is_fragile ?? false,
      outer_requirement: doc.outer_requirement ?? null,
      product_category: doc.product_category ?? null,
    }),
    profileConfirmedBy: doc.profile_confirmed_by ? doc.profile_confirmed_by.toString() : null,
    profileConfirmedAt: doc.profile_confirmed_at ?? null,
    lastSyncedAt: doc.last_synced_at,
    marketplaceStatus: doc.marketplace_status ?? null,
    retired: doc.retired === true,
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
@Features('inventory', 'picking', 'packing', 'orders', 'order_groups', 'packaging_rules')
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
      includeRetired: query.include_retired === 'true',
    });
    if (query.group === 'false') return docs.map((d) => toResponse(d as ProductMasterLike));
    // 27/11/2026 — 1 dòng / hàng thật (Lazada + AURELLE cùng SKU không còn hiện 2 dòng).
    const groups = await this.productMasterService.groupSameProduct(docs as ProductMasterLike[]);
    return groups.map(({ representative, members }) => ({
      ...toResponse(representative),
      platforms: members.map((m) => ({
        id: m._id.toString(),
        platform: m.platform,
        shopId: m.shop_id,
        sellerSku: m.seller_sku,
        packagingProfileStatus: m.packaging_profile_status,
        retired: m.retired === true,
      })),
    }));
  }

  @Patch(':id/retire')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      '22/10/2026 — Đánh dấu SKU sàn NGỪNG DÙNG (retired=true) hoặc dùng lại (false). Ẩn khỏi "SKU chưa gán", "Chưa đo", "SKU chưa nối", đẩy tồn; không xoá hồ sơ.',
  })
  async retire(@Param('id') id: string, @Body() dto: RetireProductMasterDto): Promise<ProductMasterResponse> {
    const doc = await this.productMasterService.setRetired(id, dto.retired, dto.only_this === true);
    return toResponse(doc.toObject());
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
    const { product: doc, warnings } = await this.productMasterService.confirmPackagingProfile(id, user.userId, dto);
    const suggestedZipBagCode = await this.productMasterService.suggestZipBag({
      length_cm: dto.length_cm,
      width_cm: dto.width_cm,
      height_cm: doc.dimension?.package_height_cm ?? dto.height_cm ?? 0,
    });
    return { ...toResponse(doc), suggestedZipBagCode, warnings };
  }
}
