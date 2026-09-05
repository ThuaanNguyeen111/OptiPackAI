import {
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { MarketplaceIntegrationService } from './marketplace-integration.service';
import { MarketplacePlatform } from './enums/platform.enum';
import { OAuthCallbackQueryDto } from './dto/oauth-callback-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-request.interface';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('Marketplace Integration')
@Controller('marketplace')
export class MarketplaceIntegrationController {
  constructor(
    private readonly marketplaceIntegrationService: MarketplaceIntegrationService,
  ) {}

  @Get(':platform/connect')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Tạo URL OAuth để Admin kết nối shop trên 1 sàn (tiktok | lazada | tiki)',
  })
  @ApiParam({ name: 'platform', enum: MarketplacePlatform })
  async connect(
    @Param('platform', new ParseEnumPipe(MarketplacePlatform))
    platform: MarketplacePlatform,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<{ authUrl: string }> {
    const authUrl = await this.marketplaceIntegrationService.createConnectUrl(
      platform,
      admin.userId,
    );

    return { authUrl };
  }

  @Get(':platform/callback')
  @ApiOperation({
    summary:
      'Endpoint sàn TỰ ĐỘNG gọi lại sau khi seller Authorize — do trình duyệt điều hướng tới, KHÔNG mang Bearer token, nên KHÔNG đặt JwtAuthGuard ở đây (xem giải thích ở JSDoc class phía trên). Bảo mật dựa vào state một-lần-dùng.',
  })
  @ApiParam({ name: 'platform', enum: MarketplacePlatform })
  async callback(
    @Param('platform', new ParseEnumPipe(MarketplacePlatform))
    platform: MarketplacePlatform,
    @Query() query: OAuthCallbackQueryDto,
  ): Promise<{
    platform: MarketplacePlatform;
    shopId: string;
    shopName: string | null;
    connected: true;
  }> {
    const shopDoc =
      await this.marketplaceIntegrationService.handleOAuthCallback(
        platform,
        query.code,
        query.state,
        query.shop_id,
      );

    // Trả về thông tin tối thiểu — KHÔNG bao giờ trả token (kể cả đã
    // mã hóa) ra response. Field token có select:false nên mặc định
    // đã không nằm trong shopDoc trả về đây.
    return {
      platform: shopDoc.platform,
      shopId: shopDoc.shop_id,
      shopName: shopDoc.shop_name,
      connected: true,
    };
  }
}
