import { Body, Controller, Headers, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ShipmentsService, type CarrierEventPayload } from './shipments.service';

/**
 * ===================================================================
 * C5 (14/10/2026) — WEBHOOK GHN (Order Status Callback) — PUBLIC, không JWT
 * ===================================================================
 * GHN KHÔNG ký request (developer.ghn.vn/en/docs/webhook/callback-order-status) →
 * bảo vệ bằng khoá bí mật `GHN_WEBHOOK_SECRET`, gửi qua header tự đặt
 * `X-OptiPack-Secret` (khai trên Developer Portal) hoặc query `?secret=`.
 * Trả 200 cho mọi sự kiện đã nhận (kể cả bỏ qua / trùng) — GHN bỏ hẳn sự kiện khi
 * nhận 4xx; chỉ lỗi tạm thời (DB) mới ném 5xx để GHN gửi lại.
 * `@SkipThrottle()` vì ThrottlerGuard gắn global (cùng cách marketplace-webhooks).
 * ===================================================================
 */
@ApiExcludeController()
@Controller('carriers')
export class CarrierWebhookController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post('ghn/webhook')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async ghn(
    @Body() body: CarrierEventPayload,
    @Headers('x-optipack-secret') headerSecret: string | undefined,
    @Query('secret') querySecret: string | undefined,
  ): Promise<{ ok: true; result: string }> {
    return this.shipmentsService.handleGhnWebhook(body, headerSecret ?? querySecret);
  }
}
