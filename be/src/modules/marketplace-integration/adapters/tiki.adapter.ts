import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, type Method } from 'axios';
import { MarketplacePlatform } from '../enums/platform.enum';
import {
  MarketplaceAdapter,
  OAuthTokenResult,
} from '../interfaces/marketplace-adapter.interface';
import { envOrDefault } from '../../../common/utils/env.util';
import type {
  TikiDropshipLabelsRaw,
  TikiOrderListRaw,
  TikiOrderRaw,
  TikiPullResult,
  TikiQueueRaw,
  TikiSellerInventoriesRaw,
  TikiSellerRaw,
  TikiSubscriptionRaw,
  TikiTokenResponse,
} from './tiki.types';

/** Lỗi gọi Tiki — giữ HTTP status + danh sách `errors` Tiki trả (body `{ errors: [...] }`). */
export class TikiApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly errors: string[],
  ) {
    super(message);
  }
}

/** Refresh token "giả" lưu vào marketplace_shops (cột bắt buộc) — app Inhouse KHÔNG có refresh token. */
export const TIKI_CLIENT_CREDENTIALS_MARKER = 'client_credentials';
const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;

/**
 * ===================================================================
 * TIKI — 🔄 VIẾT LẠI 31/10/2026 cho app INHOUSE (trước: luồng OAuth authorization_code
 * qua id.tiki.vn, viết theo suy đoán, CHƯA từng chạy).
 * ===================================================================
 * Đã đọc doc open.tiki.vn + gọi thử thật trên shop "OptiPackAI Test Shop" (seller 365980):
 * - App Inhouse gắn đúng 1 shop, nhà bán đồng ý kết nối trên Seller Center → lấy token bằng
 *   `client_credentials` (Basic AppID:Secret), KHÔNG có trang đăng nhập, KHÔNG redirect,
 *   KHÔNG refresh token (hết hạn thì xin lại). Thực tế `expires_in` = 1.295.999 giây (15 ngày).
 * - Mọi API: `https://api.tiki.vn/integration/...` + `Authorization: Bearer`. (Doc ghi
 *   header `tiki-api` cho GET /sellers/me — gọi thử bị "Missing Authorization header".)
 * - Lỗi: body `{ errors: [...] }`; 429 = quá 200 request/giây/nhà bán; không thử lại 4xx khác.
 * Thiếu biến môi trường KHÔNG làm sập app (adapter đăng ký chung) — chỉ báo lỗi khi dùng.
 * ===================================================================
 */
@Injectable()
export class TikiAdapter implements MarketplaceAdapter {
  readonly platform = MarketplacePlatform.TIKI;
  private readonly logger = new Logger(TikiAdapter.name);

  static readonly MAX_RETRIES = 2;
  static readonly BASE_DELAY_MS = 500;

  private readonly tokenUrl: string;
  private readonly apiBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.tokenUrl = envOrDefault(this.configService.get<string>('marketplace.tiki.tokenUrl'), 'https://api.tiki.vn/sc/oauth2/token');
    this.apiBaseUrl = envOrDefault(this.configService.get<string>('marketplace.tiki.apiBaseUrl'), 'https://api.tiki.vn/integration');
  }

  private credentials(): { clientId: string; clientSecret: string } {
    const clientId = this.configService.get<string>('marketplace.tiki.clientId');
    const clientSecret = this.configService.get<string>('marketplace.tiki.clientSecret');
    if (!clientId || !clientSecret) {
      throw new TikiApiError('Chưa cấu hình TIKI_CLIENT_ID / TIKI_CLIENT_SECRET trong be/.env.', null, []);
    }
    return { clientId, clientSecret };
  }

  // ---------------------------------------------------------------- kết nối

  /** App Inhouse không có trang đăng nhập — dùng `connectDirect()`. */
  buildAuthorizationUrl(): string {
    throw new TikiApiError('Tiki (app Inhouse) không dùng trang đăng nhập OAuth — kết nối bằng App ID + Secret.', null, []);
  }

  exchangeCodeForToken(): Promise<OAuthTokenResult> {
    return Promise.reject(new TikiApiError('Tiki (app Inhouse) không dùng authorization code.', null, []));
  }

  /** Kết nối thẳng: lấy token client_credentials + đọc thông tin nhà bán (id, tên). */
  async connectDirect(): Promise<OAuthTokenResult> {
    const token = await this.requestToken();
    const seller = await this.getSeller(token.access_token);
    return this.toTokenResult(token, String(seller.id), seller.name);
  }

  /** Không có refresh token: "gia hạn" = xin token client_credentials mới. */
  async refreshAccessToken(_refreshToken: string, shopId: string): Promise<OAuthTokenResult> {
    const token = await this.requestToken();
    return this.toTokenResult(token, shopId, null);
  }

  /** Tiki dùng event queue (kéo về), không có webhook đẩy tới OptiPack. */
  verifyWebhookSignature(): boolean {
    return false;
  }

  private async requestToken(): Promise<TikiTokenResponse> {
    const { clientId, clientSecret } = this.credentials();
    try {
      const res = await axios.post<TikiTokenResponse>(
        this.tokenUrl,
        new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 15_000,
        },
      );
      if (!res.data.access_token) throw new TikiApiError('Tiki không trả access_token.', res.status, []);
      return res.data;
    } catch (error) {
      throw this.toTikiError(error, 'Lấy token Tiki (client_credentials)');
    }
  }

  private toTokenResult(token: TikiTokenResponse, shopId: string, shopName: string | null): OAuthTokenResult {
    const now = Date.now();
    return {
      shopId,
      shopName,
      shopCipher: null,
      sellerCode: null,
      accessToken: token.access_token,
      refreshToken: TIKI_CLIENT_CREDENTIALS_MARKER,
      accessTokenExpiresAt: new Date(now + token.expires_in * 1000),
      refreshTokenExpiresAt: new Date(now + TEN_YEARS_MS),
    };
  }

  // ---------------------------------------------------------------- nhà bán / kho

  getSeller(accessToken: string): Promise<TikiSellerRaw> {
    return this.call<TikiSellerRaw>(accessToken, 'GET', '/v2/sellers/me');
  }

  getSellerInventories(accessToken: string, tikiWarehouseCodes: string[]): Promise<TikiSellerInventoriesRaw> {
    return this.call<TikiSellerInventoriesRaw>(accessToken, 'GET', '/v2/seller-inventories', { tiki_warehouse_codes: tikiWarehouseCodes.join(',') });
  }

  // ---------------------------------------------------------------- đơn

  /** Danh sách đơn theo ngày TẠO (doc: lọc theo ngày cập nhật đã bỏ — dùng event queue cho thay đổi). */
  listOrders(
    accessToken: string,
    params: { createdFrom: string; page: number; limit: number; fulfillmentTypes?: string[]; excludeStatuses?: readonly string[] },
  ): Promise<TikiOrderListRaw> {
    const query: Record<string, string> = {
      page: String(params.page),
      limit: String(params.limit),
      created_from_date: params.createdFrom,
      order_by: 'created_at|asc',
    };
    if (params.fulfillmentTypes?.length) query.fulfillment_type = `in|${params.fulfillmentTypes.join(',')}`;
    if (params.excludeStatuses?.length) query.status = `nin|${params.excludeStatuses.join(',')}`;
    return this.call<TikiOrderListRaw>(accessToken, 'GET', '/v2/orders', query);
  }

  getOrder(accessToken: string, code: string): Promise<TikiOrderRaw> {
    return this.call<TikiOrderRaw>(accessToken, 'GET', `/v2/orders/${encodeURIComponent(code)}`);
  }

  /** Dropship: xác nhận CẢ đơn đủ hàng (`seller_confirmed`) hoặc không (`seller_canceled`). Tiki tự chọn giờ lấy hàng từ 10/07/2023. */
  async dropshipConfirmAvailable(
    accessToken: string,
    code: string,
    confirmationStatus: 'seller_confirmed' | 'seller_canceled',
    sellerInventoryId: number,
  ): Promise<void> {
    await this.call<unknown>(accessToken, 'POST', `/v2/orders/${encodeURIComponent(code)}/dropship/confirm-available`, undefined, {
      confirmation_status: confirmationStatus,
      seller_inventory_id: sellerInventoryId,
    });
  }

  /** Nhãn dropship: `shipping_label_url` dán ngoài kiện, `shipping_stamp_url` bỏ trong kiện (HTML). */
  getDropshipLabels(accessToken: string, code: string): Promise<TikiDropshipLabelsRaw> {
    return this.call<TikiDropshipLabelsRaw>(accessToken, 'GET', `/v2/orders/${encodeURIComponent(code)}/dropship/labels`, { format: 'html' });
  }

  // ---------------------------------------------------------------- event queue (v1)

  async listQueues(accessToken: string): Promise<TikiQueueRaw[]> {
    const res = await this.call<TikiQueueRaw[] | { data?: TikiQueueRaw[] }>(accessToken, 'GET', '/v1/queues');
    return Array.isArray(res) ? res : (res.data ?? []);
  }

  createQueue(accessToken: string, name: string): Promise<TikiQueueRaw> {
    return this.call<TikiQueueRaw>(accessToken, 'POST', '/v1/queues', undefined, { name });
  }

  async listSubscriptions(accessToken: string, queueCode: string): Promise<TikiSubscriptionRaw[]> {
    const res = await this.call<TikiSubscriptionRaw[] | { data?: TikiSubscriptionRaw[] }>(accessToken, 'GET', `/v1/queues/${encodeURIComponent(queueCode)}/subscriptions`);
    return Array.isArray(res) ? res : (res.data ?? []);
  }

  createSubscription(accessToken: string, queueCode: string, eventType: string): Promise<TikiSubscriptionRaw> {
    return this.call<TikiSubscriptionRaw>(accessToken, 'POST', `/v1/queues/${encodeURIComponent(queueCode)}/subscriptions`, undefined, { event_type: eventType });
  }

  /** Kéo tối đa 100 sự kiện; gửi `ack_id` của lần trước để không nhận lại sự kiện cũ. */
  pullEvents(accessToken: string, queueCode: string, ackId: string | null): Promise<TikiPullResult> {
    return this.call<TikiPullResult>(accessToken, 'POST', `/v1/queues/${encodeURIComponent(queueCode)}/events/pull`, undefined, { ack_id: ackId });
  }

  async ackEvents(accessToken: string, queueCode: string, ackId: string): Promise<void> {
    await this.call<unknown>(accessToken, 'POST', `/v1/queues/${encodeURIComponent(queueCode)}/events/ack`, undefined, { ack_id: ackId });
  }

  // ---------------------------------------------------------------- HTTP

  /** Thử lại lỗi mạng / 429 / 5xx (tối đa 2 lần, 500ms → 1s); lỗi 4xx khác ném ngay. */
  private async call<T>(
    accessToken: string,
    method: Method,
    path: string,
    params?: Record<string, string>,
    body?: unknown,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await axios.request<T>({
          method,
          url: `${this.apiBaseUrl}${path}`,
          params,
          data: body,
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          timeout: 20_000,
        });
        return res.data;
      } catch (error) {
        const status = error instanceof AxiosError ? (error.response?.status ?? null) : null;
        const retryable = status === null || status === 429 || status >= 500;
        if (!retryable || attempt >= TikiAdapter.MAX_RETRIES) throw this.toTikiError(error, `${method} ${path}`);
        const delay = TikiAdapter.BASE_DELAY_MS * 2 ** attempt;
        this.logger.warn(`Tiki ${method} ${path} lỗi tạm thời (${String(status ?? 'mạng')}), thử lại sau ${String(delay)}ms.`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private toTikiError(error: unknown, action: string): TikiApiError {
    if (error instanceof TikiApiError) return error;
    if (error instanceof AxiosError) {
      const status = error.response?.status ?? null;
      const data = error.response?.data as { errors?: unknown; error_description?: unknown; message?: unknown } | undefined;
      const errors = Array.isArray(data?.errors) ? data.errors.map(String) : [];
      const detail = errors.join('; ') || (typeof data?.error_description === 'string' ? data.error_description : '') || (typeof data?.message === 'string' ? data.message : '') || error.message;
      return new TikiApiError(`${action} thất bại (${String(status ?? 'mạng')}): ${detail}`, status, errors);
    }
    return new TikiApiError(`${action} thất bại: ${error instanceof Error ? error.message : String(error)}`, null, []);
  }
}
