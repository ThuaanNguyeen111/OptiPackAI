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
  ): Promise<PackagingRecommendationDocument | null> {
    return this.packagingService.getActiveRecommendationOrNull(groupId);
  }

  @Post('generate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      '[TẠM — chỉ Admin] Tạo PackagingRecommendation bằng thuật toán fallback, dùng để test UC-04 khi chưa có AI thật (Package 3).',
  })
  async generate(@Param('groupId') groupId: string): Promise<PackagingRecommendationDocument> {
    return this.packagingService.generateFallbackRecommendation(groupId);
  }

  @Post('approve')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Duyệt gợi ý đóng gói đang chờ, kèm cân nặng THẬT đo được (UC-04 Approve).' })
  async approve(
    @Param('groupId') groupId: string,
    @Body() dto: ApprovePackagingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PackagingRecommendationDocument> {
    return this.packagingService.approve(
      groupId,
      user.userId,
      dto.actual_measured_weight_kg,
      dto.expected_group_version,
    );
  }

  @Post('adjust')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Điều chỉnh gợi ý đóng gói (đổi box_size/material_type) rồi duyệt (UC-04 Adjust).' })
  async adjust(
    @Param('groupId') groupId: string,
    @Body() dto: AdjustPackagingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PackagingRecommendationDocument> {
    return this.packagingService.adjust(groupId, user.userId, dto);
  }

  @Post('reject')
  @Roles(UserRole.PACKAGING_STAFF, UserRole.ADMIN)
  @ApiOperation({ summary: 'Từ chối hoàn toàn gợi ý — Order Group quay lại chờ tính toán lại (UC-04 Reject).' })
  async reject(@Param('groupId') groupId: string, @Body() dto: RejectPackagingDto): Promise<{ message: string }> {
    return this.packagingService.reject(groupId, dto.expected_group_version);
  }
}
