import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PackagingService } from './packaging.service';
import { ApprovePackagingDto } from './dto/approve-packaging.dto';
import { AdjustPackagingDto } from './dto/adjust-packaging.dto';
import { RejectPackagingDto } from './dto/reject-packaging.dto';
import { PackGroupDto } from './dto/pack-group.dto';
import { PackingGuideDto } from './dto/packing-guide.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { PackagingRecommendationDocument } from './schemas/packaging-recommendation.schema';
import { UserRole } from '../../common/enums/user-role.enum';

interface DimensionsMmResponse {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

export interface PlacementResponse {
  itemKey: string;
  sku: string;
  step: number;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  orientation: string;
  /** (22/09/2026) Gập đôi món này trước khi đặt. */
  folded: boolean;
}

/** MỚI (21/09/2026) — lời hướng dẫn từng bước cho animation 3D. */
export interface PackingGuideResponse {
  source: 'ai' | 'template';
  model: string | null;
  fallbackReason: string | null;
  summary: string;
  steps: { step: number; instruction: string; tip: string | null }[];
  generatedAt: Date;
}

/**
 * Response camelCase (Điểm yếu #9). 🔄 ĐÃ ĐỔI (21/09/2026): mỗi phần tử
 * là phương án của MỘT ĐƠN, kèm tọa độ xếp (mm, trục z hướng lên) cho
 * animation 3D. `boxSize` (cm) giữ cho client cũ.
 */
export interface PackagingRecommendationResponse {
  id: string;
  orderGroupId: string;
  orderId: string | null;
  platformOrderId: string | null;
  solutionStatus: 'ok' | 'no_fit';
  noFitReasons: { boxCode: string; reason: string }[];
  boxCode: string | null;
  boxName: string | null;
  boxSize: { lengthCm: number; widthCm: number; heightCm: number } | null;
  boxInnerMm: DimensionsMmResponse | null;
  boxOuterMm: DimensionsMmResponse | null;
  placements: PlacementResponse[];
  /** (21/09/2026) Loại sản phẩm + túi zip theo SKU — FE chọn hình 3D. */
  itemProfiles: { sku: string; productCategory: string | null; zipBagCode: string | null; zipBagFolded: boolean }[];
  materials: { type: string; quantity: number }[];
  materialType: string;
  materialQuantity: number;
  estimatedShippingCostVnd: number | null;
  itemsWeightG: number | null;
  estimatedPackageWeightG: number | null;
  volumetricWeightG: number | null;
  fillRatio: number | null;
  computationTimeMs: number;
  engineVersion: string | null;
  fallbackUsed: boolean;
  approvalStatus: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  adjustmentReason: string | null;
  adjustmentNote: string | null;
  adjustedFromBoxCode: string | null;
  actualMeasuredWeightKg: number | null;
  packedAt: Date | null;
  isAbnormal: boolean;
  packingGuide: PackingGuideResponse | null;
  /** (22/09/2026) Thùng vừa hơn nhưng kho đã hết lúc tính phương án. */
  preferredBoxOutOfStock: string | null;
  /** (21/09/2026) Lý do Packaging Staff từ chối phương án, null nếu chưa bị từ chối. */
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapDims(d: { length_mm: number; width_mm: number; height_mm: number } | null): DimensionsMmResponse | null {
  return d ? { lengthMm: d.length_mm, widthMm: d.width_mm, heightMm: d.height_mm } : null;
}

export function toRecommendationResponse(doc: PackagingRecommendationDocument): PackagingRecommendationResponse {
  return {
    id: doc._id.toString(),
    orderGroupId: doc.order_group_id.toString(),
    orderId: doc.order_id ? doc.order_id.toString() : null,
    platformOrderId: doc.platform_order_id,
    solutionStatus: doc.solution_status,
    noFitReasons: doc.no_fit_reasons.map((r) => ({ boxCode: r.box_code, reason: r.reason })),
    boxCode: doc.box_code,
    boxName: doc.box_name,
    boxSize: doc.box_size
      ? { lengthCm: doc.box_size.length_cm, widthCm: doc.box_size.width_cm, heightCm: doc.box_size.height_cm }
      : null,
    boxInnerMm: mapDims(doc.box_inner_mm),
    boxOuterMm: mapDims(doc.box_outer_mm),
    placements: doc.placements.map((p) => ({
      itemKey: p.item_key,
      sku: p.sku,
      step: p.step,
      x: p.x,
      y: p.y,
      z: p.z,
      dx: p.dx,
      dy: p.dy,
      dz: p.dz,
      orientation: p.orientation,
      folded: p.folded,
    })),
    itemProfiles: doc.item_profiles.map((p) => ({
      sku: p.sku,
      productCategory: p.product_category,
      zipBagCode: p.zip_bag_code,
      zipBagFolded: p.zip_bag_folded,
    })),
    materials: doc.materials.map((m) => ({ type: m.type, quantity: m.quantity })),
    materialType: doc.material_type,
    materialQuantity: doc.material_quantity,
    estimatedShippingCostVnd: doc.estimated_shipping_cost_vnd,
    itemsWeightG: doc.items_weight_g,
    estimatedPackageWeightG: doc.estimated_package_weight_g,
    volumetricWeightG: doc.volumetric_weight_g,
    fillRatio: doc.fill_ratio,
    computationTimeMs: doc.computation_time_ms,
    engineVersion: doc.engine_version,
    fallbackUsed: doc.fallback_used,
    approvalStatus: doc.approval_status,
    approvedBy: doc.approved_by ? doc.approved_by.toString() : null,
    approvedAt: doc.approved_at,
    adjustmentReason: doc.adjustment_reason,
    adjustmentNote: doc.adjustment_note,
    adjustedFromBoxCode: doc.adjusted_from_box_code,
    actualMeasuredWeightKg: doc.actual_measured_weight_kg,
    packedAt: doc.packed_at,
    isAbnormal: doc.is_abnormal,
    packingGuide: doc.packing_guide
      ? {
          source: doc.packing_guide.source,
          model: doc.packing_guide.model,
          fallbackReason: doc.packing_guide.fallback_reason,
          summary: doc.packing_guide.summary,
          steps: doc.packing_guide.steps.map((st) => ({ step: st.step, instruction: st.instruction, tip: st.tip })),
          generatedAt: doc.packing_guide.generated_at,
        }
      : null,
    preferredBoxOutOfStock: doc.preferred_box_out_of_stock,
    rejectionReason: doc.rejection_reason ?? null,
    createdAt: doc.created_at ?? new Date(0),
    updatedAt: doc.updated_at ?? new Date(0),
  };
}

export interface PackagingPlanResponse {
  orderGroupId: string;
  recommendations: PackagingRecommendationResponse[];
}

/**
 * ===================================================================
 * packaging.controller.ts — UC-04 (Report 1)
 * ===================================================================
 * `generate` vẫn chỉ Admin (trigger tự động là BE-5). Từ 21/09/2026
 * generate chạy engine greedy 3D + validator cho TỪNG ĐƠN trong group.
 * ===================================================================
 */
@ApiTags('Packaging')
@ApiBearerAuth('JWT-auth')
@Controller('order-groups/:groupId/packaging')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PackagingController {
  constructor(private readonly packagingService: PackagingService) {}

  private async plan(groupId: string): Promise<PackagingPlanResponse> {
    const docs = await this.packagingService.listActiveRecommendations(groupId);
    return { orderGroupId: groupId, recommendations: docs.map(toRecommendationResponse) };
  }

  @Get()
  @Roles(
    UserRole.PACKAGING_STAFF,
    UserRole.WAREHOUSE_STAFF,
    UserRole.SHIPPING_COORDINATOR,
    UserRole.STORE_OWNER,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary:
      'Phương án đóng gói hiện tại của group — mỗi đơn 1 phần tử, kèm tọa độ xếp 3D (mm). Mảng rỗng nếu chưa generate.',
  })
  async getCurrent(@Param('groupId') groupId: string): Promise<PackagingPlanResponse> {
    return this.plan(groupId);
  }

  @Post('generate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      '[Admin] picked -> pending_approval: chia hàng đã quét về từng đơn, engine greedy 3D + validator chọn thùng trong danh mục. Không thùng nào hợp lệ → solutionStatus = no_fit.',
  })
  async generate(@Param('groupId') groupId: string): Promise<PackagingPlanResponse> {
    await this.packagingService.generateRecommendations(groupId);
    return this.plan(groupId);
  }

  @Post('approve')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Chốt phương án cho mọi đơn (pending_approval -> approved_for_packing). Bị chặn nếu còn đơn no_fit. Không còn nhập cân ở đây.',
  })
  async approve(
    @Param('groupId') groupId: string,
    @Body() dto: ApprovePackagingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PackagingPlanResponse> {
    await this.packagingService.approve(groupId, user.userId, dto.expected_group_version);
    return this.plan(groupId);
  }

  @Post('adjust')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Đổi thùng cho 1 đơn (chọn box_code trong danh mục) — engine xếp lại, validator phải chấp nhận (không vừa → 422). Group vẫn chờ approve.',
  })
  async adjust(
    @Param('groupId') groupId: string,
    @Body() dto: AdjustPackagingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PackagingPlanResponse> {
    await this.packagingService.adjust(groupId, user.userId, dto);
    return this.plan(groupId);
  }

  @Post(':recommendationId/guide')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  // Mỗi lần regenerate là 1 lần gọi OpenAI có tính phí — giới hạn tần suất.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Hướng dẫn đóng gói từng bước cho 1 đơn (đi kèm animation 3D). Engine quyết định vị trí/thứ tự; OpenAI viết lời. Thiếu OPENAI_API_KEY hoặc AI trả sai → câu mẫu (source = template). Đã có thì trả bản lưu, trừ khi regenerate = true.',
  })
  async guide(
    @Param('groupId') groupId: string,
    @Param('recommendationId') recommendationId: string,
    @Body() dto: PackingGuideDto,
  ): Promise<PackagingRecommendationResponse> {
    const doc = await this.packagingService.getOrCreatePackingGuide(groupId, recommendationId, dto.regenerate ?? false);
    return toRecommendationResponse(doc);
  }

  @Post('reject')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Từ chối toàn bộ phương án — group quay lại picked để tính lại, không cần lấy lại hàng (UC-04 Reject).',
  })
  async reject(@Param('groupId') groupId: string, @Body() dto: RejectPackagingDto): Promise<{ message: string }> {
    return this.packagingService.reject(groupId, dto.expected_group_version, dto.rejection_reason);
  }
}

/**
 * `POST /order-groups/:groupId/fulfillment/pack` — giữ URL cũ nhưng
 * chuyển xử lý sang module packaging (cần phương án + cân từng kiện).
 */
@ApiTags('Order Groups')
@ApiBearerAuth('JWT-auth')
@Controller('order-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PackagingPackController {
  constructor(private readonly packagingService: PackagingService) {}

  @Post(':groupId/fulfillment/pack')
  // 🔄 (21/09/2026, từ `main`) Mở thêm PACKAGING_STAFF — chính người đóng
  // gói vật lý, trước đây bị 403 dù đúng vai trò.
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Đã đóng gói xong (approved_for_packing -> packed): nhập cân THẬT từng kiện (mỗi đơn 1 kiện). Lệch > 20% so với ước tính (hàng + bì) → isAbnormal + thông báo Store Owner.',
  })
  async pack(
    @Param('groupId') groupId: string,
    @Body() dto: PackGroupDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ fulfillmentStatus: string; version: number; recommendations: PackagingRecommendationResponse[] }> {
    const result = await this.packagingService.pack(groupId, user.userId, dto);
    return {
      fulfillmentStatus: result.fulfillmentStatus,
      version: result.version,
      recommendations: result.recommendations.map(toRecommendationResponse),
    };
  }
}
