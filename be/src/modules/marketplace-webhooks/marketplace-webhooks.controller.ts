import { Body, Controller, Headers, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AppException } from '../../common/exceptions/app-exception';
import { MKT_ERROR_CODES } from '../marketplace-integration/marketplace-integration.errors';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import {
  MarketplaceWebhooksService,
  type MarketplaceWebhookPayload,
} from './marketplace-webhooks.service';

/**
 * ===================================================================
 * marketplace-webhooks.controller.ts — MỚI (29/09/2026, Giai đoạn 3)
 * ===================================================================
 * PUBLIC (không JwtAuthGuard) — AURELLE gọi trực tiếp, không có Bearer
 * token; bảo mật dựa vào chữ ký HMAC trong header Authorization (Mục 8.1),
 * KHÔNG phải JWT — cùng triết lý với OAuth callback (state token 1 lần
 * thay vì JWT). `@SkipThrottle()` vì ThrottlerGuard gắn global
 * (app.module.ts) — webhook cần bỏ qua giới hạn, retry của AURELLE
 * (tối đa 5 lần/6 giờ) không nên bị chặn bởi rate limit chung.
 * ===================================================================
 */
@ApiExcludeController() // Không expose lên Swagger — endpoint nội bộ cho AURELLE, không phải API cho FE.
@Controller('marketplace/webhooks')
export class MarketplaceWebhooksController {
  constructor(private readonly webhooksService: MarketplaceWebhooksService) {}

  @Post(':platform')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Param('platform') platformParam: string,
    @Headers('authorization') headerSignature: string | undefined,
    @Body() body: MarketplaceWebhookPayload,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: boolean }> {
    const platform = this.parsePlatform(platformParam);
    const rawBody = req.rawBody;
    if (!rawBody) {
      // Không nên xảy ra khi rawBody:true đã bật global (main.ts) — nhưng
      // phòng thủ rõ ràng thay vì để verifyWebhookSignature nhận Buffer rỗng.
      throw new AppException(
        MKT_ERROR_CODES.SERVER_ERROR,
        'Không đọc được raw body của webhook.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return this.webhooksService.handleWebhook(platform, rawBody, headerSignature, body);
  }

  private parsePlatform(value: string): MarketplacePlatform {
    const values = Object.values(MarketplacePlatform) as string[];
    if (!values.includes(value)) {
      throw new AppException(
        MKT_ERROR_CODES.ADAPTER_NOT_REGISTERED,
        `Sàn "${value}" không được hỗ trợ.`,
        HttpStatus.BAD_REQUEST,
        { platform: value },
      );
    }
    return value as MarketplacePlatform;
  }
}
