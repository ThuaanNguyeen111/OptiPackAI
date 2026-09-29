import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

// Re-export — mapper.ts/orders.service.ts/product-master.service.ts import
// các type Raw TỪ FILE NÀY (chưa đổi sau khi tách LazadaProtocolClient
// 29/09/2026) — giữ nguyên đường import cũ, không phải sửa 3 file đó.
export type {
  LazadaAddressRaw,
  LazadaGetOrdersFilter,
  LazadaOrderItemRaw,
  LazadaOrderRaw,
  LazadaProductRaw,
} from './lazada-protocol.client';

/**
 * ===================================================================
 * ADAPTER — LAZADA (Vietnam)
 * ===================================================================
 * 🔄 ĐÃ ĐỔI (29/09/2026) — logic ký request/gọi HTTP/retry/đổi token đã
 * chuyển sang `LazadaProtocolClient` DÙNG CHUNG (xem file đó), vì AURELLE
 * (AURELLE_MARKETPLACE_DESIGN.md) cố ý mô phỏng NGUYÊN VẸN giao thức
 * Lazada. File này giờ chỉ còn: cấu hình đúng host/khóa của Lazada,
 * `buildAuthorizationUrl` (domain riêng `auth.lazada.com`, KHÔNG dùng
 * chung với API nghiệp vụ), và `verifyWebhookSignature` (Lazada chưa
 * xác nhận cơ chế webhook — vẫn trả `false`, dùng polling).
 *
 * BỔ SUNG (28/08/2026) — Order API cho module `orders/`:
 *   ⚠️ ĐỘ TIN CẬY: khác với OAuth flow (đã xác nhận qua 4 nguồn độc lập),
 *   tên field trong response GetOrders/GetOrderItems dựa theo cấu trúc
 *   phổ biến của LazOP REST API ghi nhận qua SDK cộng đồng.
 * ===================================================================
 */
@Injectable()
export class LazadaAdapter implements MarketplaceAdapter {
  readonly platform = MarketplacePlatform.LAZADA;
  private readonly logger = new Logger(LazadaAdapter.name);
  private readonly client: LazadaProtocolClient;
  private readonly redirectUri: string;
  private readonly appKey: string;

  constructor(private readonly configService: ConfigService) {
    this.appKey = requireEnv(
      this.configService.get<string>('marketplace.lazada.appKey'),
      'LAZADA_APP_KEY',
    );
    const appSecret = requireEnv(
      this.configService.get<string>('marketplace.lazada.appSecret'),
      'LAZADA_APP_SECRET',
    );
    this.redirectUri = requireEnv(
      this.configService.get<string>('marketplace.lazada.redirectUri'),
      'LAZADA_REDIRECT_URI',
    );
    const apiBaseUrl = envOrDefault(
      this.configService.get<string>('marketplace.lazada.apiBaseUrl'),
      'https://api.lazada.vn/rest',
    );

    this.client = new LazadaProtocolClient({
      logLabel: 'Lazada',
      // Domain OAuth/token KHÁC domain API nghiệp vụ — cố định, Lazada
      // không cho override qua env (khác apiBaseUrl, có thể trỏ sandbox
      // nội bộ khi cần).
      authBaseUrl: 'https://api.lazada.com/rest',
      apiBaseUrl,
      appKey: this.appKey,
      appSecret,
    });
  }

  buildAuthorizationUrl(state: string): string {
    // KHÔNG cần ký ở bước này — chỉ cần app_key + redirect_uri + state.
    const params = new URLSearchParams({
      response_type: 'code',
      force_auth: 'true',
      redirect_uri: this.redirectUri,
      client_id: this.appKey,
      state,
    });

    return `https://auth.lazada.com/oauth/authorize?${params.toString()}`;
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

  verifyWebhookSignature(): boolean {
    // Lazada Open Platform hiện tại chủ yếu dùng cơ chế POLLING (gọi
    // GET /orders/get định kỳ) hơn là webhook đẩy — module orders/ sẽ
    // ưu tiên cron đối soát cho Lazada thay vì chờ webhook. Hàm này để
    // TRỐNG có chủ đích, giữ lại vì interface yêu cầu implement đủ,
    // không phải thiếu sót.
    this.logger.warn(
      'Lazada chưa xác nhận cơ chế webhook chính thức — dùng polling ở module orders/ thay thế.',
    );
    return false;
  }
}
