import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { MarketplacePlatform } from '../enums/platform.enum';
import {
  MarketplaceAdapter,
  OAuthTokenResult,
} from '../interfaces/marketplace-adapter.interface';
import { requireEnv, envOrDefault } from '../../../common/utils/env.util';
import {
  LazadaProtocolClient,
  type LazadaGetOrdersFilter,
  type LazadaOrderItemRaw,
  type LazadaOrderRaw,
  type LazadaProductRaw,
} from './lazada-protocol.client';
import { AppException } from '../../../common/exceptions/app-exception';
import { MKT_ERROR_CODES } from '../marketplace-integration.errors';

/**
 * Vỏ response chung của Open API mở rộng (không thuộc phần "tương thích
 * Lazada" — 3 API AURELLE tự thêm: acknowledge/status-update/stock-update).
 * Vẫn giữ `{code, data, request_id}` — Mục 7.1 AURELLE_MARKETPLACE_DESIGN.md.
 */
interface AurelleEnvelope<T> {
  code: string;
  message?: string;
  data: T;
  request_id?: string;
}

/** Mục 7.7 — response `data.results[]`. */
interface AurelleStockUpdateResult {
  SkuId: string;
  SellerSku: string;
  success: boolean;
  SellableQuantity: number;
}

/**
 * ===================================================================
 * ADAPTER — AURELLE (sàn thứ 2, tự xây, tương thích Lazada)
 * ===================================================================
 * Theo AURELLE_MARKETPLACE_DESIGN.md Mục 9.1: `getOrders`/`getOrderItems`/
 * `getProducts`/`exchangeCodeForToken`/`refreshAccessToken` DÙNG CHUNG
 * `LazadaProtocolClient` với `LazadaAdapter` — CHỈ khác cấu hình (host,
 * khóa) và 3 phần RIÊNG: `verifyWebhookSignature` (có thật, khác Lazada
 * luôn trả false), `acknowledgeOrder`/`updateOrderStatus`/
 * `updateSellableQuantity` (ghi ngược — Lazada không có, "seller tự giao
 * hàng" nên không ghi ngược Lazada, quyết định đã chốt trong CLAUDE.md).
 *
 * ⚠️ CHƯA TỰ GỌI THỬ bằng AURELLE thật (module đó do nhóm khác dựng,
 * xem Mục 12 kế hoạch triển khai — Giai đoạn 1 "AURELLE: dựng BE" là
 * việc CỦA HỌ). Trước khi tin tưởng adapter này chạy đúng, chạy
 * `scripts/aurelle-conformance.ts` (Mục 14) nhắm vào AURELLE BE thật.
 * ===================================================================
 */
@Injectable()
export class AurelleAdapter implements MarketplaceAdapter {
  readonly platform = MarketplacePlatform.AURELLE;
  private readonly logger = new Logger(AurelleAdapter.name);
  private readonly client: LazadaProtocolClient;
  private readonly redirectUri: string;
  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly authPageBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.appKey = requireEnv(
      this.configService.get<string>('marketplace.aurelle.appKey'),
      'AURELLE_APP_KEY',
    );
    this.appSecret = requireEnv(
      this.configService.get<string>('marketplace.aurelle.appSecret'),
      'AURELLE_APP_SECRET',
    );
    this.redirectUri = requireEnv(
      this.configService.get<string>('marketplace.aurelle.redirectUri'),
      'AURELLE_REDIRECT_URI',
    );
    this.authPageBaseUrl = envOrDefault(
      this.configService.get<string>('marketplace.aurelle.authPageBaseUrl'),
      'http://localhost:4000',
    );
    const authApiBaseUrl = envOrDefault(
      this.configService.get<string>('marketplace.aurelle.authApiBaseUrl'),
      'http://localhost:4000/rest',
    );
    const apiBaseUrl = envOrDefault(
      this.configService.get<string>('marketplace.aurelle.apiBaseUrl'),
      'http://localhost:4000/rest',
    );

    this.client = new LazadaProtocolClient({
      logLabel: 'Aurelle',
      authBaseUrl: authApiBaseUrl,
      apiBaseUrl,
      appKey: this.appKey,
      appSecret: this.appSecret,
    });
  }

  buildAuthorizationUrl(state: string): string {
    // Mục 7.2 — cùng tham số Lazada, trang authorize nằm ở host RIÊNG
    // (KHÔNG /rest), khác host API nghiệp vụ.
    const params = new URLSearchParams({
      response_type: 'code',
      force_auth: 'true',
      redirect_uri: this.redirectUri,
      client_id: this.appKey,
      state,
    });

    return `${this.authPageBaseUrl}/oauth/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<OAuthTokenResult> {
    return this.client.exchangeCodeForToken(code);
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    return this.client.refreshAccessToken(refreshToken);
  }

  async getOrders(
    accessToken: string,
    filter: LazadaGetOrdersFilter,
  ): Promise<LazadaOrderRaw[]> {
    return this.client.getOrders(accessToken, filter);
  }

  async getOrderItems(
    accessToken: string,
    orderId: number,
  ): Promise<LazadaOrderItemRaw[]> {
    return this.client.getOrderItems(accessToken, orderId);
  }

  async getProducts(
    accessToken: string,
    sellerSkus: string[],
  ): Promise<LazadaProductRaw[]> {
    return this.client.getProducts(accessToken, sellerSkus);
  }

  /**
   * Mục 8.1 — chữ ký webhook nằm trong header `Authorization`, CÔNG THỨC
   * KHÁC chữ ký request thường (không sort tham số, không cần path):
   *   UPPER(HEX(HMAC_SHA256(app_secret, app_key + RAW_BODY)))
   * So sánh bằng `timingSafeEqual` — tránh timing attack dò từng ký tự
   * chữ ký đúng (khác so sánh `===` chuỗi thường).
   */
  verifyWebhookSignature(rawBody: Buffer, headerSignature: string): boolean {
    const expected = createHmac('sha256', this.appSecret)
      .update(Buffer.concat([Buffer.from(this.appKey, 'utf8'), rawBody]))
      .digest('hex')
      .toUpperCase();

    const expectedBuf = Buffer.from(expected, 'utf8');
    const actualBuf = Buffer.from(headerSignature, 'utf8');
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
  }

  /**
   * Mục 7.6 — báo AURELLE đã lưu đơn thành công, sàn chuyển
   * `occupied_quantity` sang cho OptiPack. An toàn gọi lại nhiều lần.
   */
  async acknowledgeOrder(
    accessToken: string,
    orderId: string,
    partnerReference: string,
  ): Promise<void> {
    const data = await this.client.callSignedApiPost<AurelleEnvelope<{ order_id: number }>>(
      '/order/acknowledge',
      {
        access_token: accessToken,
        order_id: orderId,
        partner_reference: partnerReference,
      },
    );
    if (data.code !== '0') {
      this.logger.warn(
        `Acknowledge đơn AURELLE ${orderId} thất bại (không chặn sync): ${JSON.stringify(data)}`,
      );
    }
  }

  /**
   * Mục 7.8 — ghi trạng thái đơn ngược lên AURELLE (packed/shipped/
   * delivered/...). Best-effort ở phía gọi (orders.service.ts/outbox) —
   * hàm này chỉ throw khi request thật sự lỗi, KHÔNG throw khi AURELLE
   * trả `code !== '0'` (log + trả về, để caller tự quyết định retry).
   */
  async updateOrderStatus(
    accessToken: string,
    input: {
      orderId: string;
      status: string;
      eventTime: Date;
      trackingCode?: string;
      tripCode?: string;
      reason?: string;
      idempotencyKey: string;
    },
  ): Promise<void> {
    const params: Record<string, string | number> = {
      access_token: accessToken,
      order_id: input.orderId,
      status: input.status,
      event_time: input.eventTime.toISOString(),
      idempotency_key: input.idempotencyKey,
    };
    if (input.trackingCode) params.tracking_code = input.trackingCode;
    if (input.tripCode) params.trip_code = input.tripCode;
    if (input.reason) params.reason = input.reason;

    const data = await this.client.callSignedApiPost<AurelleEnvelope<{ order_id: number; status: string }>>(
      '/order/status/update',
      params,
    );
    if (data.code !== '0') {
      this.logger.warn(
        `Ghi trạng thái "${input.status}" cho đơn AURELLE ${input.orderId} thất bại: ${JSON.stringify(data)}`,
      );
      throw new AppException(
        MKT_ERROR_CODES.SERVER_ERROR,
        `AURELLE từ chối cập nhật trạng thái đơn ${input.orderId}: ${data.message ?? 'không rõ lý do'}`,
        HttpStatus.BAD_GATEWAY,
        { orderId: input.orderId, status: input.status },
      );
    }
  }

  /**
   * Mục 7.7 — cập nhật tồn bán được. `payload` là JSON (Lazada dùng XML
   * cho cùng API `UpdateSellableQuantity`, đồng thời CHƯA có quyền gọi —
   * KHÔNG implement trong lazada.adapter.ts) nhưng vẫn ký theo ĐÚNG công
   * thức chung — `payload` chỉ là 1 tham số string trong bộ params được ký.
   */
  async updateSellableQuantity(
    accessToken: string,
    updates: { itemId: string; skuId: string; sellerSku: string; sellableQuantity: number }[],
  ): Promise<{ sellerSku: string; success: boolean }[]> {
    // Mục 7.7 — `payload` là JSON (khác XML của Lazada), nhưng vẫn CHỈ là
    // 1 tham số trong bộ params được ký theo đúng công thức chung — không
    // cần đường POST riêng, dùng chung callSignedApiPost.
    const payload = JSON.stringify({
      Request: {
        Product: {
          Skus: {
            Sku: updates.map((u) => ({
              ItemId: u.itemId,
              SkuId: u.skuId,
              SellerSku: u.sellerSku,
              SellableQuantity: u.sellableQuantity,
            })),
          },
        },
      },
    });

    const data = await this.client.callSignedApiPost<
      AurelleEnvelope<{ results: AurelleStockUpdateResult[] }>
    >('/product/stock/sellable/update', {
      access_token: accessToken,
      payload,
    });

    if (data.code !== '0') {
      this.logger.warn(
        `Cập nhật tồn bán được trên AURELLE thất bại: ${JSON.stringify(data)}`,
      );
      throw new AppException(
        MKT_ERROR_CODES.SERVER_ERROR,
        `AURELLE từ chối cập nhật tồn: ${data.message ?? 'không rõ lý do'}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    return data.data.results.map((r) => ({
      sellerSku: r.SellerSku,
      success: r.success,
    }));
  }
}
