import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHmac, randomUUID } from 'crypto';

interface AurelleWebhookConfig {
  url: string;
  appKey?: string;
  appSecret?: string;
  sellerId: string;
}

/**
 * Website AURELLE báo "đơn vừa đổi" cho ứng dụng đối tác đã kết nối bằng
 * app key (Mục 8.1 AURELLE_MARKETPLACE_DESIGN.md):
 *   header Authorization = UPPER(HEX(HMAC_SHA256(app_secret, app_key + raw_body)))
 * Bên nhận (OptiPack) chỉ dùng webhook để kích hoạt 1 lượt GetOrders —
 * dữ liệu đơn vẫn lấy qua Open API, nên webhook mất thì cron 10 phút bù.
 * Fire-and-forget: lỗi gửi KHÔNG làm hỏng việc đặt hàng.
 */
@Injectable()
export class AurelleWebhookPublisher {
  private readonly logger = new Logger(AurelleWebhookPublisher.name);

  constructor(private readonly configService: ConfigService) {}

  notifyOrderChanged(publicOrderId: number, orderStatus: string): void {
    const config = this.configService.get<AurelleWebhookConfig>('storefront.aurelleWebhook');
    if (!config?.url || !config.appKey || !config.appSecret) {
      this.logger.debug('Bỏ qua webhook AURELLE — thiếu URL hoặc app key/secret.');
      return;
    }
    const body = JSON.stringify({
      message_id: randomUUID(),
      seller_id: config.sellerId,
      message_type: 'order_status_changed',
      timestamp: Date.now(),
      data: {
        trade_order_id: String(publicOrderId),
        order_status: orderStatus,
        status_update_time: Math.floor(Date.now() / 1000),
      },
    });
    const signature = signAurelleWebhook(config.appKey, config.appSecret, body);

    void axios
      .post(config.url, body, {
        headers: { 'Content-Type': 'application/json', Authorization: signature },
        timeout: 5000,
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Gửi webhook đơn ${String(publicOrderId)} thất bại (${message}) — cron 10 phút sẽ đồng bộ bù.`,
        );
      });
  }
}

export function signAurelleWebhook(appKey: string, appSecret: string, rawBody: string): string {
  return createHmac('sha256', appSecret)
    .update(Buffer.concat([Buffer.from(appKey, 'utf8'), Buffer.from(rawBody, 'utf8')]))
    .digest('hex')
    .toUpperCase();
}
