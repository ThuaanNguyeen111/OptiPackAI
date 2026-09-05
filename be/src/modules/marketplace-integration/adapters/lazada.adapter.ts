import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import axios from 'axios';
import { MarketplacePlatform } from '../enums/platform.enum';
import {
  MarketplaceAdapter,
  OAuthTokenResult,
} from '../interfaces/marketplace-adapter.interface';
import { requireEnv, envOrDefault } from '../../../common/utils/env.util';

/**
 * ===================================================================
 * ADAPTER — LAZADA (Vietnam)
 * ===================================================================
 * ĐÃ SỬA (đối chiếu be.zip thật):
 *   - Đọc config qua ConfigService namespace "marketplace.lazada.*".
 *   - Định nghĩa RÕ interface response Lazada thay vì `any` — bắt buộc
 *     để qua được `npm run lint` (project bật ESLint strictTypeChecked).
 *
 * BỔ SUNG (28/08/2026) — Order API cho module `orders/`:
 *   getOrders() + getOrderItems() dùng ĐÚNG công thức ký `generateSign()`
 *   đã có sẵn (path + sorted params, HMAC-SHA256 UPPERCASE) — Lazada
 *   dùng CHUNG 1 công thức ký cho auth/* VÀ mọi API nghiệp vụ khác,
 *   chỉ khác domain gọi tới (api.lazada.com cho auth, api.lazada.vn
 *   cho nghiệp vụ) và có thêm tham số access_token trong params được ký.
 *   ⚠️ ĐỘ TIN CẬY: khác với OAuth flow (đã xác nhận qua 4 nguồn độc lập),
 *   tên field trong response GetOrders/GetOrderItems dưới đây dựa theo
 *   cấu trúc phổ biến của LazOP REST API ghi nhận qua SDK cộng đồng —
 *   CHƯA tự gọi thử bằng access_token thật để đối chiếu 1:1. Đây là
 *   ĐIỂM DUY NHẤT trong patch này chưa ở mức "đã xác nhận" như phần OAuth.
 *   Việc đầu tiên cần làm khi có access_token thật: gọi thử
 *   POST /orders/lazada/sync-now (xem orders.controller.ts) và so khớp
 *   response thật với 2 interface Raw dưới đây — sai field nào chỉ cần
 *   sửa ĐÚNG interface + hàm mapOrder()/mapOrderItem(), không ảnh hưởng
 *   phần còn lại của hệ thống (điểm cách ly lỗi là lý do interface Raw
 *   luôn tách riêng khỏi schema Mongo nội bộ).
 * ===================================================================
 */

// Hình dạng response THẬT của Lazada cho auth/token/create + auth/token/refresh
// (đã xác nhận qua 4 nguồn cộng đồng độc lập khớp nhau).
interface LazadaTokenResponse {
  code: string; // '0' = thành công, khác '0' = lỗi
  message?: string;
  access_token: string;
  refresh_token: string;
  expires_in: number; // SỐ GIÂY CÒN LẠI — khác epoch của TikTok
  refresh_expires_in: number;
  account: string;
  // SỬA (01/09/2026) — tên field ĐÚNG đã xác nhận qua response thật khi
  // test authorize live: "country_user_info", KHÔNG PHẢI
  // "country_user_info_list" như đoán ban đầu (gây lỗi "Cannot read
  // properties of undefined (reading '0')" ở mapTokenResponse bên dưới).
  country_user_info: {
    country: string;
    user_id: string;
    seller_id: string;
    short_code: string;
  }[];
}

// Địa chỉ giao hàng — dùng chung cho address_shipping/address_billing.
// ⚠️ Xem cảnh báo độ tin cậy ở đầu file — cần đối chiếu response thật.
// EXPORT vì orders.service.ts cần type này để map sang Order schema nội bộ.
export interface LazadaAddressRaw {
  first_name: string;
  last_name: string;
  phone: string;
  phone2?: string;
  address1: string;
  address2?: string;
  address3?: string;
  address4?: string;
  address5?: string;
  city: string;
  country: string;
  post_code?: string;
}

// 1 phần tử trong response GetOrders — CHỈ chứa thông tin cấp ĐƠN HÀNG
// (khách hàng, tổng tiền, trạng thái tổng quát) — CHƯA có danh sách sản
// phẩm bên trong, phải gọi GetOrderItems riêng cho từng order_id.
export interface LazadaOrderRaw {
  order_id: number;
  order_number: string;
  statuses: string[]; // 1 đơn có thể có NHIỀU trạng thái con cùng lúc (multi-package)
  created_at: string; // ISO 8601
  updated_at: string;
  price: string; // Lazada trả dạng STRING, không phải number — PHẢI parseFloat khi lưu
  items_count: number;
  address_shipping: LazadaAddressRaw;
  address_billing?: LazadaAddressRaw;
  payment_method?: string;
  remarks?: string;
  national_registration_number?: string; // dữ liệu NHẠY CẢM — Advanced Tasks: Request sensitive data access
}

interface LazadaGetOrdersResponse {
  code: string;
  message?: string;
  data: {
    count: number;
    orders: LazadaOrderRaw[];
  };
}

// 1 phần tử trong response GetOrderItems — CHI TIẾT SẢN PHẨM trong 1 đơn.
export interface LazadaOrderItemRaw {
  order_item_id: number;
  order_id: number;
  sku: string;
  name: string;
  variation?: string;
  shop_sku?: string;
  item_price: string; // STRING — giống price ở LazadaOrderRaw
  paid_price: string;
  status: string; // "pending" | "canceled" | "ready_to_ship" | ... — xem OrderStatus enum + mapLazadaStatus()
  shipping_type?: string;
  tracking_code?: string;
  package_id?: string;
}

interface LazadaGetOrderItemsResponse {
  code: string;
  message?: string;
  data: LazadaOrderItemRaw[];
}

// Tham số lọc cho GetOrders — sync theo cửa sổ thời gian (dùng cho polling
// định kỳ ở orders.service.ts, tránh kéo lại TOÀN BỘ lịch sử đơn mỗi lần chạy).
export interface LazadaGetOrdersFilter {
  createdAfter: Date;
  createdBefore?: Date;
  offset?: number;
  limit?: number; // Lazada giới hạn tối đa 100/lần gọi
}

@Injectable()
export class LazadaAdapter implements MarketplaceAdapter {
  readonly platform = MarketplacePlatform.LAZADA;
  private readonly logger = new Logger(LazadaAdapter.name);

  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly redirectUri: string;

  private readonly authApiBaseUrl = 'https://api.lazada.com/rest';
  // Domain gọi API NGHIỆP VỤ (khác domain OAuth ở trên) — api.lazada.vn
  // là domain đúng cho seller Việt Nam. Cho phép override qua env
  // LAZADA_API_BASE_URL (đã khai sẵn trong marketplace.config.ts) phòng
  // trường hợp cần trỏ sang sandbox/mock server sau này.
  private readonly apiBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.appKey = requireEnv(
      this.configService.get<string>('marketplace.lazada.appKey'),
      'LAZADA_APP_KEY',
    );
    this.appSecret = requireEnv(
      this.configService.get<string>('marketplace.lazada.appSecret'),
      'LAZADA_APP_SECRET',
    );
    this.redirectUri = requireEnv(
      this.configService.get<string>('marketplace.lazada.redirectUri'),
      'LAZADA_REDIRECT_URI',
    );
    this.apiBaseUrl = envOrDefault(
      this.configService.get<string>('marketplace.lazada.apiBaseUrl'),
      'https://api.lazada.vn/rest',
    );
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
    const path = '/auth/token/create';
    const timestamp = Date.now(); // Lazada dùng MILLISECONDS, khác Shopee/TikTok dùng giây — đã xác nhận qua ví dụ thật

    const params: Record<string, string | number> = {
      app_key: this.appKey,
      code,
      sign_method: 'sha256',
      timestamp,
    };
    const sign = this.generateSign(path, params);

    const response = await axios.post<LazadaTokenResponse>(
      `${this.authApiBaseUrl}${path}`,
      new URLSearchParams({ ...toStringRecord(params), sign }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    if (response.data.code !== '0') {
      this.logger.error(
        `Đổi code lấy token Lazada thất bại: ${JSON.stringify(response.data)}`,
      );
      throw new Error(
        `Lazada trả lỗi khi đổi token: ${response.data.message ?? 'không rõ lý do'}`,
      );
    }

    return this.mapTokenResponse(response.data);
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    const path = '/auth/token/refresh';
    const timestamp = Date.now();

    const params: Record<string, string | number> = {
      app_key: this.appKey,
      refresh_token: refreshToken,
      sign_method: 'sha256',
      timestamp,
    };
    const sign = this.generateSign(path, params);

    const response = await axios.post<LazadaTokenResponse>(
      `${this.authApiBaseUrl}${path}`,
      new URLSearchParams({ ...toStringRecord(params), sign }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    if (response.data.code !== '0') {
      this.logger.error(
        `Refresh token Lazada thất bại: ${JSON.stringify(response.data)}`,
      );
      throw new Error(
        `Lazada trả lỗi khi refresh token: ${response.data.message ?? 'không rõ lý do'}`,
      );
    }

    return this.mapTokenResponse(response.data);
  }

  /**
   * GetOrders — lấy danh sách đơn hàng trong 1 khoảng thời gian, CHỈ
   * thông tin cấp đơn (chưa có sản phẩm bên trong). orders.service.ts
   * gọi hàm này định kỳ (polling), truyền createdAfter = last_polled_at
   * của shop để chỉ lấy đơn MỚI, không kéo lại toàn bộ lịch sử mỗi lần.
   */
  async getOrders(
    accessToken: string,
    filter: LazadaGetOrdersFilter,
  ): Promise<LazadaOrderRaw[]> {
    const path = '/orders/get';
    const extraParams: Record<string, string | number> = {
      access_token: accessToken,
      created_after: filter.createdAfter.toISOString(),
      offset: filter.offset ?? 0,
      limit: filter.limit ?? 100,
    };

    if (filter.createdBefore) {
      extraParams.created_before = filter.createdBefore.toISOString();
    }

    const data = await this.callSignedGet<LazadaGetOrdersResponse>(
      path,
      extraParams,
    );

    if (data.code !== '0') {
      this.logger.error(`GetOrders Lazada thất bại: ${JSON.stringify(data)}`);
      throw new Error(
        `Lazada trả lỗi khi lấy danh sách đơn: ${data.message ?? 'không rõ lý do'}`,
      );
    }

    return data.data.orders;
  }

  /**
   * GetOrderItems — lấy danh sách SẢN PHẨM của 1 đơn cụ thể. Lazada KHÔNG
   * có API "GetMultipleOrderItems" đáng tin cậy bằng GetOrderItems từng
   * đơn 1 — orders.service.ts gọi lặp cho từng order_id mới lấy từ
   * getOrders() ở trên (đã cân nhắc rate limit, xem ghi chú ở service).
   */
  async getOrderItems(
    accessToken: string,
    orderId: number,
  ): Promise<LazadaOrderItemRaw[]> {
    const path = '/order/items/get';
    const extraParams: Record<string, string | number> = {
      access_token: accessToken,
      order_id: orderId,
    };

    const data = await this.callSignedGet<LazadaGetOrderItemsResponse>(
      path,
      extraParams,
    );

    if (data.code !== '0') {
      this.logger.error(
        `GetOrderItems Lazada thất bại (order_id=${String(orderId)}): ${JSON.stringify(data)}`,
      );
      throw new Error(
        `Lazada trả lỗi khi lấy chi tiết sản phẩm đơn ${String(orderId)}: ${data.message ?? 'không rõ lý do'}`,
      );
    }

    return data.data;
  }

  /**
   * Helper DÙNG CHUNG cho mọi API nghiệp vụ GET đã ký (khác 2 API token
   * ở exchangeCodeForToken/refreshAccessToken — 2 hàm đó POST + không có
   * access_token trong params). Gom vào 1 chỗ để KHÔNG lặp lại logic
   * build params + gọi generateSign() + axios.get ở mỗi API nghiệp vụ
   * mới thêm sau này (GetProducts, UpdatePriceQuantity... sẽ theo cùng 1
   * khuôn khi cần).
   */
  private async callSignedGet<T>(
    path: string,
    extraParams: Record<string, string | number>,
  ): Promise<T> {
    const timestamp = Date.now();
    const params: Record<string, string | number> = {
      app_key: this.appKey,
      sign_method: 'sha256',
      timestamp,
      ...extraParams,
    };
    const sign = this.generateSign(path, params);

    const response = await axios.get<T>(`${this.apiBaseUrl}${path}`, {
      params: { ...params, sign },
    });

    return response.data;
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

  /**
   * Công thức ký ĐÃ XÁC MINH qua 4 nguồn độc lập khớp nhau:
   *   1. Sắp xếp TẤT CẢ tham số (trừ "sign") theo alphabet
   *   2. Nối path + (key + value) của từng tham số, KHÔNG dấu phân cách
   *   3. HMAC-SHA256(app_secret, chuỗi_trên) → hex → CHỮ HOA (UPPERCASE)
   * Khác TikTok: KHÔNG bọc app_secret ở đầu/cuối chuỗi, chỉ path + params.
   */
  private generateSign(
    path: string,
    params: Record<string, string | number>,
  ): string {
    // Dùng Object.entries thay vì Object.keys + index động — với
    // noUncheckedIndexedAccess (tsconfig strict), params[key] sẽ có
    // kiểu "string | number | undefined" dù thực tế luôn tồn tại,
    // Object.entries tránh được vấn đề này hoàn toàn.
    const sortedEntries = Object.entries(params).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const stringToSign =
      path +
      sortedEntries.map(([key, value]) => `${key}${String(value)}`).join('');

    return createHmac('sha256', this.appSecret)
      .update(stringToSign)
      .digest('hex')
      .toUpperCase();
  }

  /**
   * "Phiên dịch" response Lazada — LƯU Ý expires_in là SỐ GIÂY CÒN LẠI
   * (khác epoch của TikTok). Lazada trả shop info ngay trong response
   * token qua `country_user_info` — không cần gọi thêm API riêng
   * như TikTok phải làm.
   */
  private mapTokenResponse(data: LazadaTokenResponse): OAuthTokenResult {
    const now = Date.now();
    const userInfo = data.country_user_info[0];

    if (!userInfo) {
      throw new Error(
        'Response token Lazada không có country_user_info — không xác định được shop.',
      );
    }

    return {
      shopId: userInfo.seller_id,
      shopName: data.account,
      shopCipher: null, // khái niệm này chỉ TikTok có
      sellerCode: null, // khái niệm này chỉ Tiki có
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessTokenExpiresAt: new Date(now + data.expires_in * 1000),
      refreshTokenExpiresAt: new Date(now + data.refresh_expires_in * 1000),
    };
  }
}

// Helper nhỏ — URLSearchParams cần value dạng string, params gốc có number (timestamp)
function toStringRecord(
  params: Record<string, string | number>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of Object.keys(params)) {
    result[key] = String(params[key]);
  }
  return result;
}
