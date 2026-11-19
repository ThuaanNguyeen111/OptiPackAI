import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { MarketplaceWritebackService, type FailedWritebackRow } from './marketplace-writeback.service';

/** AOFP-330 — Admin xem các dòng báo website đã dừng (failed) và gửi lại. */
@ApiTags('Marketplace Writeback')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/writeback')
export class MarketplaceWritebackController {
  constructor(private readonly writeback: MarketplaceWritebackService) {}

  @Get('failed')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Các dòng báo trạng thái lên website đã dừng sau 8 lần lỗi (mới nhất trước, tối đa 100).' })
  async failed(): Promise<{ rows: FailedWritebackRow[] }> {
    return { rows: await this.writeback.listFailed() };
  }

  @Post(':id/retry')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Gửi lại 1 dòng đã dừng: về pending, đếm lượt lại từ 0, cron gửi trong ≤ 1 phút. 404 nếu dòng không còn failed.' })
  retry(@Param('id') id: string): Promise<{ id: string; state: 'pending' }> {
    return this.writeback.retry(id);
  }
}
