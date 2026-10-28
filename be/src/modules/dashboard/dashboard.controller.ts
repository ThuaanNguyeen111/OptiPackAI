import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { DashboardService, type DashboardSummary } from './dashboard.service';

/** 28/10/2026 — Số liệu Bảng điều khiển (chỉ đọc). FE tự chọn cách hiển thị. */
@ApiTags('Dashboard')
@ApiBearerAuth('JWT-auth')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @Roles(UserRole.STORE_OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Bảng điều khiển: việc cần xử lý ngay, doanh thu (đặt hàng + đã giao, so kỳ trước, theo sàn, theo ngày giờ VN), giao hàng, chi phí ship + bao bì, trả hàng, đơn hỏa tốc đúng hạn, kho thiếu/hết hàng, vật tư dưới mức đặt lại. ?from&to ISO (mặc định 30 ngày, tối đa 366), ?platform (lazada | aurelle | …).',
  })
  async summary(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('platform') platform?: string,
  ): Promise<{ summary: DashboardSummary }> {
    return { summary: await this.dashboard.summary(from, to, platform) };
  }
}
