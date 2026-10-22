import { Controller, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { MarketplaceStockPushService, type StockPushResult } from './marketplace-stock-push.service';

/** (21/10/2026) Đẩy tồn bán được sang AURELLE ngay, khỏi chờ cron 1 phút. */
@ApiTags('Marketplace Writeback')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('marketplace-writeback')
export class MarketplaceStockPushController {
  constructor(private readonly stockPush: MarketplaceStockPushService) {}

  @Post('stock/push')
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER)
  @ApiOperation({ summary: 'Đẩy tồn bán được của kho OptiPack sang website AURELLE (phương án A)' })
  @ApiQuery({ name: 'force', required: false, description: 'true = gửi lại mọi SKU kể cả số không đổi' })
  push(@Query('force') force?: string): Promise<StockPushResult> {
    return this.stockPush.pushAurelle({ force: force === 'true' });
  }
}
