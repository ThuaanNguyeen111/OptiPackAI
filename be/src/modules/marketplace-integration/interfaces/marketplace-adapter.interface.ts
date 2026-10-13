import { MarketplacePlatform } from '../enums/platform.enum';
import type {
  LazadaGetOrdersFilter,
  LazadaOrderItemRaw,
  LazadaOrderRaw,
  LazadaProductRaw,
} from '../adapters/lazada-protocol.client';

/**
 * ===================================================================
 * 5. HỢP ĐỒNG CHUNG CHO ADAPTER TỪNG SÀN
 * ===================================================================
 * LÝ DO tồn tại: TikTok, Lazada, Tiki có luồng OAuth, cách ký request,
 * cách tính hạn token HOÀN TOÀN KHÁC NHAU (đã research kỹ từng sàn):
 *   - TikTok: tự ký HMAC riêng, GET cho 2 API token, hạn token = epoch
 *   - Lazada: tự ký HMAC riêng (path + sorted params, UPPERCASE hex),
 *     hạn token = số giây còn lại (khác hẳn TikTok)
 *   - Tiki: chuẩn OAuth2 THUẦN TÚY (Basic Auth header), KHÔNG cần tự ký
 *     gì cả — đơn giản nhất trong 3 sàn
 * Nếu viết if/else platform === '...' rải rác trong service, mỗi lần
 * thêm sàn mới phải sửa lại service ở nhiều chỗ — vi phạm Open/Closed
 * Principle.
 *
 * Với interface này: service chỉ nói chuyện với "1 adapter" thông
 * qua hợp đồng chung, không cần biết bên trong là sàn nào. Thêm sàn
 * mới = viết thêm 1 class implement interface này, KHÔNG đụng vào
 * service/controller đã có — đã tự chứng minh điều này khi đổi từ
 * Shopee sang Lazada+Tiki: chỉ cần xóa/thêm file adapter, service và
 * controller không sửa gì.
 * ===================================================================
 */

// Kết quả chuẩn hóa sau khi đổi authorization code lấy token —
// mỗi sàn trả về field tên khác nhau, adapter có nhiệm vụ "phiên dịch"
// về đúng 1 hình dạng chung này trước khi service lưu vào Mongo.
export interface OAuthTokenResult {
  shopId: string;
  shopName: string | null;
  shopCipher: string | null; // chỉ TikTok có giá trị, Lazada/Tiki luôn null
  sellerCode: string | null; // chỉ Tiki có giá trị (cần cho việc verify webhook checksum sau này)
  accessToken: string; // PLAIN — service sẽ mã hóa trước khi lưu, adapter không tự mã hóa
  refreshToken: string; // PLAIN
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

export interface MarketplaceAdapter {
  readonly platform: MarketplacePlatform;

  /**
   * Build URL để redirect người dùng (Admin) sang trang authorize
   * của sàn. `state` dùng để chống CSRF — verify lại khi callback về.
   */
  buildAuthorizationUrl(state: string): string;

  /**
   * Đổi authorization code (nhận được ở callback) lấy access/refresh
   * token thật. `shopId` không bắt buộc với cả 3 sàn hiện tại — TikTok
   * và Lazada đều tự trả shop info trong chính response đổi token
   * (TikTok cần gọi thêm API riêng — xem adapter cụ thể), Tiki xác
   * định seller qua chính access token.
   */
  exchangeCodeForToken(code: string, shopId?: string): Promise<OAuthTokenResult>;

  /**
   * Dùng refresh token (đã giải mã) để lấy access token mới —.
   */
  refreshAccessToken(refreshToken: string, shopId: string): Promise<OAuthTokenResult>;

  /**
   * Verify chữ ký webhook — dùng ở module `orders/` (bước sau), khai
   * báo sẵn ở đây vì đây là trách nhiệm CỦA ADAPTER (mỗi sàn ký khác
   * nhau), không phải trách nhiệm của module orders.
   *
   * `sellerCode` cần cho TIKI (checksum = hash(data + seller_code) theo
   * header X-Tiki-Checksum — đã xác nhận qua tài liệu chính thức).
   * TikTok/Lazada không dùng tham số này.
   */
  verifyWebhookSignature(rawBody: Buffer, headerSignature: string, sellerCode?: string): boolean;

  /**
   * ===================================================================
   * BỔ SUNG (29/09/2026) — nghiệp vụ đơn hàng/sản phẩm, TÙY CHỌN.
   * ===================================================================
   * KHÔNG bắt buộc mọi adapter implement (TikTok/Tiki hiện là code chết,
   * chưa cần) — chỉ Lazada và AURELLE (tương thích Lazada theo
   * AURELLE_MARKETPLACE_DESIGN.md) có 2 phương thức này. Kiểu dữ liệu
   * `LazadaXxxRaw` được tái dùng cho CẢ 2 sàn CÓ CHỦ ĐÍCH — AURELLE mô
   * phỏng NGUYÊN VẸN vỏ response Lazada, không phải vì mọi adapter tương
   * lai đều nên dùng type "Lazada". Sàn KHÔNG tương thích Lazada (VD
   * TikTok/Tiki thật) phải tự định nghĩa Raw type + hàm map riêng, KHÔNG
   * ép vào đây (đúng nguyên tắc Anti-Corruption Layer — mỗi sàn có
   * RawOrder riêng, orders.service.ts chỉ thấy MappedOrderFields chung).
   */
  getOrders?(
    accessToken: string,
    filter: LazadaGetOrdersFilter,
  ): Promise<LazadaOrderRaw[]>;
  getOrderItems?(
    accessToken: string,
    orderId: number,
  ): Promise<LazadaOrderItemRaw[]>;
  getProducts?(
    accessToken: string,
    sellerSkus: string[],
  ): Promise<LazadaProductRaw[]>;
  /** Đồng bộ CATALOG (không theo đơn) — phân trang, tùy chọn tăng dần. */
  listProductsPage?(
    accessToken: string,
    params: { updatedAfter: Date | null; offset: number; limit: number },
  ): Promise<{ products: LazadaProductRaw[]; total: number }>;

  /**
   * ===================================================================
   * BỔ SUNG (29/09/2026) — ghi ngược, TÙY CHỌN, CHỈ AURELLE có.
   * ===================================================================
   * Lazada KHÔNG có 3 phương thức này (seller tự giao hàng, không ghi
   * ngược Lazada — quyết định đã chốt, xem CLAUDE.md). AURELLE là sàn
   * TỰ XÂY của nhóm nên hỗ trợ ghi ngược trạng thái/tồn (Mục 7.6-7.8
   * AURELLE_MARKETPLACE_DESIGN.md) — orders.service.ts gọi qua dấu `?.`
   * (optional chaining), không throw nếu adapter không hỗ trợ.
   */
  acknowledgeOrder?(
    accessToken: string,
    orderId: string,
    partnerReference: string,
  ): Promise<void>;
  updateOrderStatus?(
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
  ): Promise<void>;
  updateSellableQuantity?(
    accessToken: string,
    updates: { itemId: string; skuId: string; sellerSku: string; sellableQuantity: number }[],
  ): Promise<{ sellerSku: string; success: boolean }[]>;
}

// DI token — dùng để inject đúng adapter theo platform trong service,
// tránh 2 adapter cùng field name gây nhầm lẫn trong constructor.
export const MARKETPLACE_ADAPTERS = 'MARKETPLACE_ADAPTERS';
