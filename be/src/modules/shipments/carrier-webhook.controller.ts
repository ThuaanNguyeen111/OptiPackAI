import { Body, Controller, Headers, HttpCode, HttpStatus, Post, ValidationPipe } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ShipmentsService, type CarrierEventPayload } from './shipments.service';
import { GhnWebhookDto } from './dto/ghn-webhook.dto';
import { NoFeatureGate } from '../role-permissions/feature-scope';

/**
 * ===================================================================
 * C5 (14/10/2026) — WEBHOOK GHN (Order Status Callback) — PUBLIC, không JWT
 * ===================================================================
 * GHN KHÔNG ký request (developer.ghn.vn/en/docs/webhook/callback-order-status) →
 * bảo vệ bằng khoá bí mật `GHN_WEBHOOK_SECRET`, gửi qua header tự đặt
 * `X-OptiPack-Secret` khai trên Developer Portal. AOFP-324: bỏ `?secret=` (lộ trong log URL).
 * Trả 200 cho mọi sự kiện đã nhận (kể cả bỏ qua / trùng / cũ) — GHN bỏ hẳn sự kiện khi
 * nhận 4xx; lỗi tạm thời (DB, xung đột phiên bản) trả 5xx để GHN gửi lại.
 * `@SkipThrottle()` vì ThrottlerGuard gắn global (cùng cách marketplace-webhooks).
 * ===================================================================
 */
@ApiExcludeController()
@NoFeatureGate('Webhook hãng vận chuyển, xác thực bằng chữ ký')
@Controller('carriers')
export class CarrierWebhookController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post('ghn/webhook')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async ghn(
    // Tham số khai kiểu interface → pipe global bỏ qua; pipe này kiểm theo GhnWebhookDto và
    // GIỮ các trường lạ của GHN (pipe global có forbidNonWhitelisted sẽ trả 400 cho mọi sự kiện).
    @Body(new ValidationPipe({ expectedType: GhnWebhookDto, whitelist: false, forbidNonWhitelisted: false }))
    body: CarrierEventPayload,
    @Headers('x-optipack-secret') secret: string | undefined,
  ): Promise<{ ok: true; result: string }> {
    return this.shipmentsService.handleGhnWebhook(body, secret);
  }
}
