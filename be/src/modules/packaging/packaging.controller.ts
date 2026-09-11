import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PackagingService } from './packaging.service';
import { ApprovePackagingDto } from './dto/approve-packaging.dto';
import { AdjustPackagingDto } from './dto/adjust-packaging.dto';
import { RejectPackagingDto } from './dto/reject-packaging.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { PackagingRecommendationDocument } from './schemas/packaging-recommendation.schema';
import { UserRole } from '../../common/enums/user-role.enum';

// BỔ SUNG (2026-09-10) — Điểm yếu #9 (CLAUDE.md): trước đây trả THẲNG
// Document ra ngoài (snake_case, lộ `_id`/`__v` thô) — KHÁC hẳn
// `order-groups.controller.ts` đã map cẩn thận. Sửa cho nhất quán,
// đúng Rule #22 (Canonical schema) — cùng pattern `toResponse()` đã
// chứng minh đúng ở order-groups.
interface PackagingRecommendationResponse {
  id: string;
  orderGroupId: string;
  boxSize: { lengthCm: number; widthCm: number; heightCm: number };
  materialType: string;
  materialQuantity: number;
  estimatedShippingCostVnd: number;
  computationTimeMs: number;
  fallbackUsed: boolean;
  approvalStatus: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  actualMeasuredWeightKg: number | null;
  isAbnormal: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toResponse(doc: PackagingRecommendationDocument): PackagingRecommendationResponse {
  return {
    id: doc._id.toString(),
    orderGroupId: doc.order_group_id.toString(),
    boxSize: {
      lengthCm: doc.box_size.length_cm,
      widthCm: doc.box_size.width_cm,
      heightCm: doc.box_size.height_cm,
    },
    materialType: doc.material_type,
    materialQuantity: doc.material_quantity,
    estimatedShippingCostVnd: doc.estimated_shipping_cost_vnd,
    computationTimeMs: doc.computation_time_ms,
    fallbackUsed: doc.fallback_used,
    approvalStatus: doc.approval_status,
    approvedBy: doc.approved_by ? doc.approved_by.toString() : null,
    approvedAt: doc.approved_at,
    actualMeasuredWeightKg: doc.actual_measured_weight_kg,
    isAbnormal: doc.is_abnormal,
    createdAt: doc.created_at ?? new Date(0),
    updatedAt: doc.updated_at ?? new Date(0),
  };
}


/**
 * ===================================================================
 * packaging.controller.ts — MỚI (2026-09-09), UC-04 (Report 1)
 * ===================================================================
 * `generate` KHÔNG thuộc UC-04 chính thức (đó là việc của AI thật,
 * Package 3) — đây là API TẠM để dùng fallback algorithm, MỞ KHÓA test
 * toàn bộ luồng ngay (xem packaging.service.ts, fallback-packaging.util.ts).
 * Gắn @Roles(ADMIN) — chỉ dev/admin gọi để test, KHÔNG phải hành vi
 * nghiệp vụ thật (Packaging Staff không tự "generate" gợi ý, họ chỉ
 * duyệt gợi ý đã có).
 * ===================================================================
 */
@ApiTags('Packaging')
@ApiBearerAuth('JWT-auth')
@Controller('order-groups/:groupId/packaging')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PackagingController {
  constructor(private readonly packagingService: PackagingService) {}

  @Get()
  @Roles(UserRole.PACKAGING_STAFF, UserRole.WAREHOUSE_STAFF, UserRole.SHIPPING_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Chi tiết PackagingRecommendation hiện tại của group (dù đã Approve/Adjust hay còn Pending) — trả null nếu chưa từng generate.',
  })
  async getCurrent(
    @Param('groupId') groupId: string,
  ): Promise<PackagingRecommendationResponse | null> {
    const doc = await this.packagingService.getActiveRecommendationOrNull(groupId);
    return doc ? toResponse(doc) : null;
  }

  @Post('generate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      '[TẠM — chỉ Admin] Tạo PackagingRecommendation bằng thuật toán fallback, dùng để test UC-04 khi chưa có AI thật (Package 3).',
  })
  async generate(@Param('groupId') groupId: string): Promise<PackagingRecommendationResponse> {
    const doc = await this.packagingService.generateFallbackRecommendation(groupId);
    return toResponse(doc);
  }

  @Post('approve')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Duyệt gợi ý đóng gói đang chờ, kèm cân nặng THẬT đo được (UC-04 Approve).' })
  async approve(
    @Param('groupId') groupId: string,
    @Body() dto: ApprovePackagingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PackagingRecommendationResponse> {
    const doc = await this.packagingService.approve(
      groupId,
      user.userId,
      dto.actual_measured_weight_kg,
      dto.expected_group_version,
    );
    return toResponse(doc);
  }

  @Post('adjust')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Điều chỉnh gợi ý đóng gói (đổi box_size/material_type) rồi duyệt (UC-04 Adjust).' })
  async adjust(
    @Param('groupId') groupId: string,
    @Body() dto: AdjustPackagingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PackagingRecommendationResponse> {
    const doc = await this.packagingService.adjust(groupId, user.userId, dto);
    return toResponse(doc);
  }

  @Post('reject')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Từ chối hoàn toàn gợi ý — Order Group quay lại chờ tính toán lại (UC-04 Reject).' })
  async reject(@Param('groupId') groupId: string, @Body() dto: RejectPackagingDto): Promise<{ message: string }> {
    return this.packagingService.reject(groupId, dto.expected_group_version);
  }
}
