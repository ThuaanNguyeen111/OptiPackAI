import { MarketplacePlatform } from '../enums/platform.enum';

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
}

// DI token — dùng để inject đúng adapter theo platform trong service,
// tránh 2 adapter cùng field name gây nhầm lẫn trong constructor.
export const MARKETPLACE_ADAPTERS = 'MARKETPLACE_ADAPTERS';
