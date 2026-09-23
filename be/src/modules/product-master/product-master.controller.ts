import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductMasterService } from './product-master.service';
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
  @Roles(UserRole.WAREHOUSE_STAFF, UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách hồ sơ SKU (lọc status=needs_measurement để biết SKU cần đo).' })
  async list(@Query() query: ListProductMasterQueryDto): Promise<ProductMasterResponse[]> {
    const docs = await this.productMasterService.listProfiles({
      status: query.status,
      shopId: query.shop_id,
    });
    return docs.map((d) => toResponse(d as ProductMasterLike));
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
    return toResponse(doc);
  }
}
