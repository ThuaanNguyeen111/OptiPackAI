import {
  Controller,
  Get,
  Logger,
  Param,
  ParseEnumPipe,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { AppException } from '../../common/exceptions/app-exception';
import { MKT_ERROR_CODES } from './marketplace-integration.errors';

export interface ShopResponse {
  shopId: string;
  shopName: string | null;
  environment: 'sandbox' | 'production';
  isActive: boolean;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  lastPolledAt: string | null;
  connectedAt: string | null;
}

@ApiTags('Marketplace Integration')
@Controller('marketplace')
export class MarketplaceIntegrationController {
  private readonly logger = new Logger(MarketplaceIntegrationController.name);

  constructor(
    private readonly marketplaceIntegrationService: MarketplaceIntegrationService,
    private readonly configService: ConfigService,
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

  @Get(':platform/shops')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.STORE_OWNER)
  @ApiOperation({
    summary:
      'Danh sách shop đã kết nối OAuth của 1 sàn, đọc thật từ DB (không kèm token) — dùng cho màn Kết nối sàn',
  })
  @ApiParam({ name: 'platform', enum: MarketplacePlatform })
  async listShops(
    @Param('platform', new ParseEnumPipe(MarketplacePlatform))
    platform: MarketplacePlatform,
  ): Promise<{ shops: ShopResponse[] }> {
    const shops =
      await this.marketplaceIntegrationService.listShopsForDisplay(platform);
    return {
      shops: shops.map((shop) => ({
        shopId: shop.shop_id,
        shopName: shop.shop_name,
        environment: shop.environment,
        isActive: shop.is_active,
        accessTokenExpiresAt: shop.access_token_expires_at.toISOString(),
        refreshTokenExpiresAt: shop.refresh_token_expires_at.toISOString(),
        lastPolledAt: shop.last_polled_at?.toISOString() ?? null,
        connectedAt: shop.connected_at?.toISOString() ?? null,
      })),
    };
  }

  @Get(':platform/callback')
  @Redirect()
  @ApiOperation({
    summary:
      'Endpoint sàn TỰ ĐỘNG gọi lại sau khi seller Authorize — do trình duyệt điều hướng tới, KHÔNG mang Bearer token, nên KHÔNG đặt JwtAuthGuard ở đây (xem giải thích ở JSDoc class phía trên). Bảo mật dựa vào state một-lần-dùng. Redirect thẳng về FE (không trả JSON) — đúng spec FE đã chốt: thành công kèm shopId/shopName/connected=true, thất bại kèm error=<code>.',
  })
  @ApiParam({ name: 'platform', enum: MarketplacePlatform })
  async callback(
    @Param('platform', new ParseEnumPipe(MarketplacePlatform))
    platform: MarketplacePlatform,
    @Query() query: OAuthCallbackQueryDto,
  ): Promise<{ url: string }> {
    const frontendUrl = this.configService.get<string>(
      'CLIENT_MARKETPLACE_REDIRECT_CALLBACK',
      'http://localhost:5173/marketplace-oauth-success',
    );

    try {
      const shopDoc =
        await this.marketplaceIntegrationService.handleOAuthCallback(
          platform,
          query.code,
          query.state,
          query.shop_id,
        );

      // KHÔNG bao giờ trả token (kể cả đã mã hóa) qua query string — chỉ
      // thông tin hiển thị tối thiểu, đúng spec FE: shopId/shopName/connected.
      const params = new URLSearchParams({
        shopId: shopDoc.shop_id,
        shopName: shopDoc.shop_name ?? '',
        connected: 'true',
        platform,
      });
      return { url: `${frontendUrl}?${params.toString()}` };
    } catch (err: unknown) {
      const errorCode =
        err instanceof AppException
          ? err.errorCode
          : MKT_ERROR_CODES.SERVER_ERROR;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Marketplace OAuth callback (${platform}) thất bại → error=${errorCode}: ${message}`,
      );
      return {
        url: `${frontendUrl}?${new URLSearchParams({ error: errorCode, platform }).toString()}`,
      };
    }
  }
}
