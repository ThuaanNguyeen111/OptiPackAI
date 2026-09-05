import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import axios from 'axios';
import { MarketplacePlatform } from '../enums/platform.enum';
import { MarketplaceAdapter, OAuthTokenResult } from '../interfaces/marketplace-adapter.interface';
import { requireEnv, envOrDefault } from '../../../common/utils/env.util';




interface TikTokTokenResponseData {
  access_token: string;
  access_token_expire_in: number;
  refresh_token: string;
  refresh_token_expire_in: number;
  open_id: string;
  seller_name: string;
  seller_base_region: string;
  user_type: number;
  granted_scopes: string[];
}

interface TikTokTokenResponse {
  code: number;
  message: string;
  request_id: string;
  data?: TikTokTokenResponseData;
}

interface TikTokShopInfo {
  id: string;
  cipher: string;
  name: string | null;
}

interface TikTokShopsGetResponse {
  code: number;
  message: string;
  data?: {
    shops: { id: string; cipher: string; name?: string; region?: string; code?: string }[];
  };
}

@Injectable()
export class TikTokShopAdapter implements MarketplaceAdapter {
  readonly platform = MarketplacePlatform.TIKTOK;
  private readonly logger = new Logger(TikTokShopAdapter.name);

  private readonly appKey: string;
  private readonly appSecret: string;

  // 3 domain KHÁC NHAU — đây chính là điểm dễ nhầm nhất khi code TikTok.
  // Trong lúc chờ Partner registration review, trỏ 3 biến env này sang
  // mock server (xem /tools/tiktok-mock-server) — điền vào .env, để
  // trống thì tự dùng domain thật.
  private readonly authorizeBaseUrl: string;
  private readonly tokenBaseUrl: string;
  private readonly apiBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.appKey = requireEnv(
      this.configService.get<string>('marketplace.tiktok.appKey'),
      'TIKTOK_APP_KEY',
    );
    this.appSecret = requireEnv(
      this.configService.get<string>('marketplace.tiktok.appSecret'),
      'TIKTOK_APP_SECRET',
    );

    this.authorizeBaseUrl = envOrDefault(
      this.configService.get<string>('marketplace.tiktok.authorizeBaseUrl'),
      'https://services.tiktokshop.com',
    );
    this.tokenBaseUrl = envOrDefault(
      this.configService.get<string>('marketplace.tiktok.tokenBaseUrl'),
      'https://auth.tiktok-shops.com',
    );
    this.apiBaseUrl = envOrDefault(
      this.configService.get<string>('marketplace.tiktok.apiBaseUrl'),
      'https://open-api.tiktokglobalshop.com',
    );
  }

  buildAuthorizationUrl(state: string): string {
    // 6.1. KHÔNG cần ký (sign) ở bước này — chỉ cần app_key + state.
    // Redirect URL không truyền ở đây vì đã khai báo cố định trong
    // Partner Center lúc tạo app (App & Service → Basic Information).
    const params = new URLSearchParams({
      app_key: this.appKey,
      state, // service sẽ verify lại state này khi callback về (chống CSRF)
    });

    return `${this.authorizeBaseUrl}/open/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<OAuthTokenResult> {
    const tokenResponse = await axios.get<TikTokTokenResponse>(
      `${this.tokenBaseUrl}/api/v2/token/get`,
      {
        params: {
          app_key: this.appKey,
          app_secret: this.appSecret,
          auth_code: code,
          grant_type: 'authorized_code',
        },
      },
    );

    const tokenData = tokenResponse.data.data;

    if (!tokenData) {
      this.logger.error(
        `Đổi code lấy token TikTok thất bại: ${JSON.stringify(tokenResponse.data)}`,
      );
      throw new Error('Không đổi được authorization code lấy token từ TikTok Shop.');
    }

    // 6.3. BƯỚC BẮT BUỘC THÊM — access_token vừa nhận CHƯA gắn với shop
    // cụ thể nào, phải gọi thêm API này mới ra shop_id + shop_cipher.
    const shopInfo = await this.getAuthorizedShop(tokenData.access_token);

    return this.mapTokenResponse(tokenData, shopInfo);
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    const tokenResponse = await axios.get<TikTokTokenResponse>(
      `${this.tokenBaseUrl}/api/v2/token/refresh`,
      {
        params: {
          app_key: this.appKey,
          app_secret: this.appSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        },
      },
    );

    const tokenData = tokenResponse.data.data;

    if (!tokenData) {
      this.logger.error(`Refresh token TikTok thất bại: ${JSON.stringify(tokenResponse.data)}`);
      throw new Error('Không refresh được access token TikTok Shop.');
    }

    // Gọi lại ShopsGet mỗi lần refresh — tốn thêm 1 API call nhưng đảm
    // bảo shop_cipher luôn đúng, tránh trường hợp hiếm gặp cipher đổi.
    const shopInfo = await this.getAuthorizedShop(tokenData.access_token);

    return this.mapTokenResponse(tokenData, shopInfo);
  }

  verifyWebhookSignature(rawBody: Buffer, headerSignature: string): boolean {

    const expected = createHmac('sha256', this.appSecret)
      .update(this.appKey + rawBody.toString())
      .digest('hex');

    return expected === headerSignature;
  }


  private async getAuthorizedShop(accessToken: string): Promise<TikTokShopInfo> {
    const path = '/authorization/202309/shops';
    const timestamp = Math.floor(Date.now() / 1000);

    const baseParams: Record<string, string | number> = {
      app_key: this.appKey,
      timestamp,
    };

    const sign = this.generateApiSign(path, baseParams);

    const response = await axios.get<TikTokShopsGetResponse>(`${this.apiBaseUrl}${path}`, {
      params: { ...baseParams, sign },
      headers: { 'x-tts-access-token': accessToken },
    });

    const shops = response.data.data?.shops;

    if (!shops || shops.length === 0) {
      throw new Error(
        'Tài khoản seller này chưa authorize shop nào — không tìm thấy shop để kết nối.',
      );
    }

    // Giả định lấy shop ĐẦU TIÊN trong danh sách — nếu sau này 1 seller
    // quản lý NHIỀU shop và Admin cần chọn shop cụ thể, đây là chỗ cần
    // sửa lại để trả về cả danh sách cho FE hiển thị chọn, thay vì tự
    // động lấy phần tử [0]. Ghi chú lại để không quên khi mở rộng.
    const selectedShop = shops[0];

    // noUncheckedIndexedAccess (tsconfig strict): TypeScript KHÔNG tự
    // suy luận `shops[0]` chắc chắn tồn tại chỉ từ check `.length === 0`
    // ở trên — phải check tường minh lại lần nữa ngay tại chỗ dùng.
    if (!selectedShop) {
      throw new Error('Không lấy được shop đầu tiên từ danh sách shops trả về.');
    }

    return {
      id: selectedShop.id,
      cipher: selectedShop.cipher,
      name: selectedShop.name ?? null,
    };
  }


  private generateApiSign(path: string, params: Record<string, string | number>): string {
    const sortedEntries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
    const concatenated = sortedEntries.map(([key, value]) => `${key}${String(value)}`).join('');
    const signInput = `${this.appSecret}${path}${concatenated}${this.appSecret}`;

    return createHmac('sha256', this.appSecret).update(signInput).digest('hex');
  }

  /**
   * 6.7. "Phiên dịch" 2 response (token + shop info) về đúng 1 hình dạng
   * OAuthTokenResult chung mà service.ts mong đợi.
   */
  private mapTokenResponse(
    tokenData: TikTokTokenResponseData,
    shopInfo: TikTokShopInfo,
  ): OAuthTokenResult {
    return {
      shopId: shopInfo.id,
      shopName: shopInfo.name,
      shopCipher: shopInfo.cipher,
      sellerCode: null, // khái niệm này chỉ Tiki có
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,

      accessTokenExpiresAt: new Date(tokenData.access_token_expire_in * 1000),
      refreshTokenExpiresAt: new Date(tokenData.refresh_token_expire_in * 1000),
    };
  }
}
