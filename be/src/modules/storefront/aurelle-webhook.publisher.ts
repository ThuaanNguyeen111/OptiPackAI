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
    this.send('order_status_changed', publicOrderId, {
      trade_order_id: String(publicOrderId),
      order_status: orderStatus,
      status_update_time: Math.floor(Date.now() / 1000),
    });
  }

  /** 20/10/2026 — khách gửi yêu cầu trả hàng: OptiPack kéo phiếu qua Open API (`/reverse/orders/get`). */
  notifyReturnRequested(publicOrderId: number, returnId: string): void {
    this.send('return_requested', publicOrderId, {
      trade_order_id: String(publicOrderId),
      return_id: returnId,
      status_update_time: Math.floor(Date.now() / 1000),
    });
  }

  /** 21/10/2026 — khách tự hủy yêu cầu trả hàng: OptiPack kéo lại để hủy phiếu bên kho. */
  notifyReturnCanceled(publicOrderId: number, returnId: string): void {
    this.send('return_canceled', publicOrderId, {
      trade_order_id: String(publicOrderId),
      return_id: returnId,
      status_update_time: Math.floor(Date.now() / 1000),
    });
  }

  /**
   * 22/10/2026 — Admin website vừa thêm/đổi biến thể: báo đối tác kéo hồ sơ SKU ngay
   * (OptiPack tự nối SKU trùng mã SKU nội bộ và đẩy tồn kho của mình sang).
   */
  notifyProductsChanged(sellerSkus: string[]): void {
    if (sellerSkus.length === 0) return;
    this.logger.log(`Báo đối tác ${String(sellerSkus.length)} SKU vừa lưu: ${sellerSkus.slice(0, 5).join(', ')}${sellerSkus.length > 5 ? ', …' : ''}`);
    this.send('product_updated', 0, { seller_skus: sellerSkus, status_update_time: Math.floor(Date.now() / 1000) });
  }

  private send(messageType: string, publicOrderId: number, data: Record<string, unknown>): void {
    const config = this.configService.get<AurelleWebhookConfig>('storefront.aurelleWebhook');
    if (!config?.url || !config.appKey || !config.appSecret) {
      this.logger.debug('Bỏ qua webhook AURELLE — thiếu URL hoặc app key/secret.');
      return;
    }
    const body = JSON.stringify({
      message_id: randomUUID(),
      seller_id: config.sellerId,
      message_type: messageType,
      timestamp: Date.now(),
      data,
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
          `Gửi webhook ${messageType} đơn ${String(publicOrderId)} thất bại (${message}) — cron sẽ đồng bộ bù.`,
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
