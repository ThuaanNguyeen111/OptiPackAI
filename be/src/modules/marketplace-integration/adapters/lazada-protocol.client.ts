import { Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import axios from 'axios';
import type { OAuthTokenResult } from '../interfaces/marketplace-adapter.interface';

/**
 * ===================================================================
 * LazadaProtocolClient — giao thức HTTP DÙNG CHUNG (29/09/2026)
 * ===================================================================
 * Tách khỏi `lazada.adapter.ts` — theo AURELLE_MARKETPLACE_DESIGN.md
 * Mục 3: Open API của AURELLE cố ý dùng CÙNG đường dẫn, cách ký request
 * (path + tham số sắp alphabet, HMAC-SHA256(app_secret) hex CHỮ HOA),
 * vỏ response (`{code, data, request_id}`) và tên trường với Lazada
 * Open Platform — để adapter thứ 2 (AurelleAdapter) TÁI DÙNG class này
 * nguyên vẹn, không copy-paste lại logic ký/gọi HTTP/retry.
 *
 * KHÔNG @Injectable() — mỗi adapter tự `new LazadaProtocolClient(cấu
 * hình của MÌNH)` trong constructor, tránh NestJS singleton chia sẻ
 * nhầm app_key/app_secret giữa 2 sàn khác nhau.
 *
 * Nếu sau này có sàn thứ 3 KHÔNG tương thích Lazada (tên trường/vỏ
 * response khác) — sàn đó viết adapter riêng, KHÔNG ép dùng class này
 * (đây là điểm khác biệt so với `MarketplaceAdapter` interface: class
 * này là 1 lựa chọn triển khai cụ thể, không phải hợp đồng bắt buộc).
 * ===================================================================
 */

export interface LazadaProtocolConfig {
  /** Tên sàn cho log, VD 'Lazada' | 'Aurelle' — KHÔNG dùng để rẽ nhánh logic. */
  logLabel: string;
  /** Base URL cho 2 API POST đổi/làm mới token (đã gồm /rest nếu sàn cần). */
  authBaseUrl: string;
  /** Base URL cho API nghiệp vụ GET đã ký (đã gồm /rest nếu sàn cần). */
  apiBaseUrl: string;
  appKey: string;
  appSecret: string;
}

// Hình dạng response THẬT của Lazada cho auth/token/create + auth/token/refresh
// (đã xác nhận qua 4 nguồn cộng đồng độc lập khớp nhau). AURELLE cố ý mô
// phỏng ĐÚNG hình dạng này (xem AURELLE_MARKETPLACE_DESIGN.md Mục 3).
export interface LazadaTokenResponse {
  code: string; // '0' = thành công, khác '0' = lỗi
  message?: string;
  access_token: string;
  refresh_token: string;
  expires_in: number; // SỐ GIÂY CÒN LẠI — khác epoch của TikTok
  refresh_expires_in: number;
  account: string;

  country_user_info: {
    country: string;
    user_id: string;
    seller_id: string;
    short_code: string;
  }[];
}

// Địa chỉ giao hàng — dùng chung cho address_shipping/address_billing.
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
  price: string; // trả dạng STRING, không phải number — PHẢI parseFloat khi lưu
  items_count: number;
  address_shipping: LazadaAddressRaw;
  address_billing?: LazadaAddressRaw;
  payment_method?: string;
  remarks?: string;
  national_registration_number?: string; // dữ liệu NHẠY CẢM — Advanced Tasks: Request sensitive data access
  // Luồng "chờ seller xác nhận hủy đơn" (O6): field ĐÃ CÓ SẴN trong
  // response GetOrders/GetOrder thật. Trả dạng STRING "true"/"false" cho
  // 2 field boolean này, số giây epoch cho cancel_trigger_time — giữ
  // nguyên kiểu string ở tầng Raw, convert đúng kiểu khi map.
  need_cancel_confirm?: string;
  is_cancel_pending?: string;
  cancel_trigger_time?: number;
  reverse_order_id?: string;
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

interface LazadaProductSkuRaw {
  SellerSku: string;
  ShopSku?: string;
  package_length?: string; // trả STRING, không phải number (giống item_price ở Order)
  package_width?: string;
  package_height?: string;
  package_weight?: string;
  product_weight?: string;
  quantity?: number;
}

export interface LazadaProductRaw {
  item_id: string;
  skus: LazadaProductSkuRaw[];
}

interface LazadaGetProductsResponse {
  code: string;
  message?: string;
  data: {
    total_products: string;
    products: LazadaProductRaw[];
  };
}

// Tham số lọc cho GetOrders — sync theo cửa sổ thời gian (dùng cho polling
// định kỳ ở orders.service.ts, tránh kéo lại TOÀN BỘ lịch sử đơn mỗi lần chạy).
//
// CỐ Ý dùng `updatedAfter` (map sang param `update_after`), KHÔNG dùng
// `createdAfter`/`created_after` — đã xác nhận qua field reference đầy
// đủ của Lazada GetOrders: `created_after` chỉ bắt được đơn MỚI TẠO,
// bỏ sót đơn ĐÃ TỪNG sync trước đó nhưng vừa ĐỔI TRẠNG THÁI. `update_after`
// là superset đúng nghĩa cho cả 2 trường hợp.
export interface LazadaGetOrdersFilter {
  updatedAfter: Date;
  updatedBefore?: Date;
  offset?: number;
  limit?: number; // giới hạn tối đa 100/lần gọi
}

/**
 * 02/10/2026 — Fulfillment API `Pack` (POST /order/fulfill/pack). Hình dạng theo
 * tài liệu chính thức Lazada (cập nhật 09/08/2022). Lazada trả `success` là
 * boolean hoặc chuỗi "true"/"false" tùy ví dụ — đọc bằng parseLazadaBoolean().
 */
export interface LazadaPackRequest {
  pack_order_list: { order_id: number; order_item_list: number[] }[];
  delivery_type: 'dropship';
  shipping_allocate_type: string;
  shipment_provider_code?: string;
}

export interface LazadaPackItemResultRaw {
  order_item_id?: string | number;
  msg?: string;
  item_err_code?: string | number;
  tracking_number?: string;
  shipment_provider?: string;
  package_id?: string;
  retry?: string | boolean;
}

export interface LazadaPackResponse {
  code: string;
  message?: string;
  result?: {
    success?: boolean | string;
    error_code?: string;
    error_msg?: string;
    data?: {
      pack_order_list?: {
        order_id?: string | number;
        order_item_list?: LazadaPackItemResultRaw[];
      }[];
    };
  };
}

export function parseLazadaBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

/**
 * 04/10/2026 — định dạng ngày cho GetProducts (`update_after`…):
 * `YYYY-MM-DDTHH:mm:ss+0000` — đúng mẫu tài liệu Lazada. `toISOString()`
 * (`...000Z`) bị GetProducts từ chối với `E017 Invalid Date Format`
 * (GetOrders thì vẫn nhận — không đổi chỗ đó).
 */
export function toLazadaProductDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, '+0000');
}

export class LazadaProtocolClient {
  private readonly logger: Logger;

  // Retry với exponential backoff — CHỈ retry lỗi CÓ THỂ TỰ HẾT (mạng,
  // 5xx, 429 rate-limit), KHÔNG retry lỗi 4xx do sai tham số.
  private static readonly MAX_RETRIES = 3;
  private static readonly BASE_DELAY_MS = 500;

  constructor(private readonly config: LazadaProtocolConfig) {
    this.logger = new Logger(`LazadaProtocolClient(${config.logLabel})`);
  }

  /**
   * POST /auth/token/create — đổi authorization code lấy token.
   */
  async exchangeCodeForToken(code: string): Promise<OAuthTokenResult> {
    const path = '/auth/token/create';
    const timestamp = Date.now(); // MILLISECONDS — đã xác nhận qua ví dụ thật

    const params: Record<string, string | number> = {
      app_key: this.config.appKey,
      code,
      sign_method: 'sha256',
      timestamp,
    };

    const data = await this.callSignedPost<LazadaTokenResponse>(path, params);

    if (data.code !== '0') {
      this.logger.error(
        `Đổi code lấy token thất bại: ${JSON.stringify(data)}`,
      );
      throw new Error(
        `${this.config.logLabel} trả lỗi khi đổi token: ${data.message ?? 'không rõ lý do'}`,
      );
    }

    return this.mapTokenResponse(data);
  }

  /**
   * POST /auth/token/refresh — làm mới token bằng refresh_token.
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    const path = '/auth/token/refresh';
    const timestamp = Date.now();

    const params: Record<string, string | number> = {
      app_key: this.config.appKey,
      refresh_token: refreshToken,
      sign_method: 'sha256',
      timestamp,
    };

    const data = await this.callSignedPost<LazadaTokenResponse>(path, params);

    if (data.code !== '0') {
      this.logger.error(`Refresh token thất bại: ${JSON.stringify(data)}`);
      throw new Error(
        `${this.config.logLabel} trả lỗi khi refresh token: ${data.message ?? 'không rõ lý do'}`,
      );
    }

    return this.mapTokenResponse(data);
  }

  /**
   * GetOrders — lấy danh sách đơn hàng trong 1 khoảng thời gian, CHỈ
   * thông tin cấp đơn (chưa có sản phẩm bên trong).
   */
  async getOrders(
    accessToken: string,
    filter: LazadaGetOrdersFilter,
  ): Promise<LazadaOrderRaw[]> {
    const path = '/orders/get';
    const extraParams: Record<string, string | number> = {
      access_token: accessToken,
      update_after: filter.updatedAfter.toISOString(),
      offset: filter.offset ?? 0,
      limit: filter.limit ?? 100,
    };

    if (filter.updatedBefore) {
      extraParams.update_before = filter.updatedBefore.toISOString();
    }

    const data = await this.callSignedGet<LazadaGetOrdersResponse>(
      path,
      extraParams,
    );

    if (data.code !== '0') {
      this.logger.error(`GetOrders thất bại: ${JSON.stringify(data)}`);
      throw new Error(
        `${this.config.logLabel} trả lỗi khi lấy danh sách đơn: ${data.message ?? 'không rõ lý do'}`,
      );
    }

    return data.data.orders;
  }

  /**
   * GetOrderItems — lấy danh sách SẢN PHẨM của 1 đơn cụ thể. Không có
   * API batch đáng tin cậy — gọi lặp cho từng order_id.
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
        `GetOrderItems thất bại (order_id=${String(orderId)}): ${JSON.stringify(data)}`,
      );
      throw new Error(
        `${this.config.logLabel} trả lỗi khi lấy chi tiết sản phẩm đơn ${String(orderId)}: ${data.message ?? 'không rõ lý do'}`,
      );
    }

    return data.data;
  }

  /**
   * GetProducts — tra theo LÔ (batch ≤50 SKU/lần), khớp trực tiếp với
   * SellerSku đã lưu sẵn trong orders.items[].sku.
   */
  async getProducts(
    accessToken: string,
    sellerSkus: string[],
  ): Promise<LazadaProductRaw[]> {
    const path = '/products/get';
    const extraParams: Record<string, string | number> = {
      access_token: accessToken,
      filter: 'live',
      limit: 50,
      sku_seller_list: JSON.stringify(sellerSkus),
    };

    const data = await this.callSignedGet<LazadaGetProductsResponse>(
      path,
      extraParams,
    );

    if (data.code !== '0') {
      this.logger.error(`GetProducts thất bại: ${JSON.stringify(data)}`);
      throw new Error(
        `${this.config.logLabel} trả lỗi khi lấy danh sách sản phẩm: ${data.message ?? 'không rõ lý do'}`,
      );
    }

    return data.data.products;
  }

  private isRetryableError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;
    if (!error.response) return true; // lỗi mạng (timeout, DNS...) — không có response
    const status = error.response.status;
    return status === 429 || status >= 500;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Helper DÙNG CHUNG cho POST đã ký của 2 API token (khác các API
   * nghiệp vụ GET — không có access_token trong params, body form-urlencoded).
   * Trước đây `exchangeCodeForToken`/`refreshAccessToken` mỗi hàm tự lặp
   * lại logic build body + axios.post — gom vào đây, chỉ 1 chỗ.
   */
  async callSignedPost<T>(
    path: string,
    params: Record<string, string | number>,
  ): Promise<T> {
    return this.post<T>(this.config.authBaseUrl, path, params);
  }

  /**
   * 04/10/2026 — GetProducts theo CATALOG (không lọc sku_seller_list), phân
   * trang offset/limit, tùy chọn `update_after` để đồng bộ tăng dần. Trang
   * rỗng: Lazada có thể bỏ hẳn `data` hoặc `products`.
   */
  async listProductsPage(
    accessToken: string,
    params: { updatedAfter: Date | null; offset: number; limit: number },
  ): Promise<{ products: LazadaProductRaw[]; total: number }> {
    const extraParams: Record<string, string | number> = {
      access_token: accessToken,
      filter: 'all',
      limit: params.limit,
      offset: params.offset,
    };
    if (params.updatedAfter) {
      extraParams.update_after = toLazadaProductDate(params.updatedAfter);
    }
    const data = await this.callSignedGet<{
      code: string;
      message?: string;
      data?: { total_products?: string; products?: LazadaProductRaw[] };
    }>('/products/get', extraParams);
    if (data.code !== '0') {
      this.logger.error(`GetProducts (catalog) thất bại: ${JSON.stringify(data)}`);
      throw new Error(
        `${this.config.logLabel} trả lỗi khi lấy danh sách sản phẩm: ${data.message ?? 'không rõ lý do'}`,
      );
    }
    const products = Array.isArray(data.data?.products) ? data.data.products : [];
    const total = Number(data.data?.total_products ?? 0);
    return { products, total: Number.isFinite(total) ? total : 0 };
  }

  /**
   * Pack — 02/10/2026. ĐÁNH DẤU "ĐÃ ĐÓNG GÓI" TRÊN SHOP THẬT (API GHI).
   * Chỉ được gọi qua LazadaPackSyncService (kiểm tra cầu dao
   * LAZADA_WRITE_APIS_ENABLED trước). Tối đa 20 đơn / request. KHÔNG tự
   * retry (`callSignedApiPost` không retry): gửi lại khi chưa biết lần trước
   * có tới sàn hay chưa có thể gây thao tác trùng.
   */
  async packOrders(
    accessToken: string,
    request: LazadaPackRequest,
  ): Promise<LazadaPackResponse> {
    const data = await this.callSignedApiPost<LazadaPackResponse>(
      '/order/fulfill/pack',
      { access_token: accessToken, packReq: JSON.stringify(request) },
    );
    if (data.code !== '0') {
      this.logger.error(`Pack thất bại: ${JSON.stringify(data)}`);
      throw new Error(
        `${this.config.logLabel} trả lỗi khi đóng gói: ${data.message ?? 'không rõ lý do'}`,
      );
    }
    return data;
  }

  /**
   * BỔ SUNG (29/09/2026) — POST đã ký sang API NGHIỆP VỤ (`apiBaseUrl`,
   * không phải `authBaseUrl`) — AURELLE dùng cho các API ghi ngược (Mục
   * 7.6/7.8 AURELLE_MARKETPLACE_DESIGN.md: `POST /order/acknowledge`,
   * `POST /order/status/update`). Lazada không gọi hàm này (không có
   * API ghi ngược nào được implement).
   */
  async callSignedApiPost<T>(
    path: string,
    params: Record<string, string | number>,
  ): Promise<T> {
    return this.post<T>(this.config.apiBaseUrl, path, {
      ...params,
      app_key: this.config.appKey,
      sign_method: 'sha256',
      timestamp: Date.now(),
    });
  }

  private async post<T>(
    baseUrl: string,
    path: string,
    params: Record<string, string | number>,
  ): Promise<T> {
    const sign = this.generateSign(path, params);
    const response = await axios.post<T>(
      `${baseUrl}${path}`,
      new URLSearchParams({ ...toStringRecord(params), sign }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    return response.data;
  }

  /**
   * Helper DÙNG CHUNG cho mọi API nghiệp vụ GET đã ký — retry với
   * exponential backoff (xem giải thích ở đầu class).
   */
  async callSignedGet<T>(
    path: string,
    extraParams: Record<string, string | number>,
  ): Promise<T> {
    const timestamp = Date.now();
    const params: Record<string, string | number> = {
      app_key: this.config.appKey,
      sign_method: 'sha256',
      timestamp,
      ...extraParams,
    };
    const sign = this.generateSign(path, params);

    let lastError: unknown;
    for (let attempt = 0; attempt <= LazadaProtocolClient.MAX_RETRIES; attempt++) {
      try {
        const response = await axios.get<T>(`${this.config.apiBaseUrl}${path}`, {
          params: { ...params, sign },
        });
        return response.data;
      } catch (error) {
        lastError = error;
        if (
          attempt === LazadaProtocolClient.MAX_RETRIES ||
          !this.isRetryableError(error)
        ) {
          throw error;
        }
        const backoffMs = LazadaProtocolClient.BASE_DELAY_MS * Math.pow(2, attempt);
        this.logger.warn(
          `callSignedGet ${path} lỗi tạm thời (lần ${String(attempt + 1)}/${String(LazadaProtocolClient.MAX_RETRIES + 1)}), thử lại sau ${String(backoffMs)}ms.`,
        );
        await this.delay(backoffMs);
      }
    }
    // Không bao giờ tới đây thật sự (throw đã xảy ra ở nhánh trên khi
    // hết lượt retry) — chỉ để TypeScript control-flow analysis hài lòng.
    throw lastError;
  }

  /**
   * Công thức ký ĐÃ XÁC MINH qua 4 nguồn độc lập khớp nhau (Lazada) và
   * lại được chính AURELLE_MARKETPLACE_DESIGN.md Mục 7.1 xác nhận dùng
   * NGUYÊN VẸN cho AURELLE:
   *   1. Sắp xếp TẤT CẢ tham số (trừ "sign") theo alphabet
   *   2. Nối path + (key + value) của từng tham số, KHÔNG dấu phân cách
   *   3. HMAC-SHA256(app_secret, chuỗi_trên) → hex → CHỮ HOA (UPPERCASE)
   */
  generateSign(path: string, params: Record<string, string | number>): string {
    const sortedEntries = Object.entries(params).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const stringToSign =
      path +
      sortedEntries.map(([key, value]) => `${key}${String(value)}`).join('');

    return createHmac('sha256', this.config.appSecret)
      .update(stringToSign)
      .digest('hex')
      .toUpperCase();
  }

  /**
   * "Phiên dịch" response token — LƯU Ý expires_in là SỐ GIÂY CÒN LẠI.
   */
  mapTokenResponse(data: LazadaTokenResponse): OAuthTokenResult {
    const now = Date.now();
    const userInfo = data.country_user_info[0];

    if (!userInfo) {
      throw new Error(
        `Response token ${this.config.logLabel} không có country_user_info — không xác định được shop.`,
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
