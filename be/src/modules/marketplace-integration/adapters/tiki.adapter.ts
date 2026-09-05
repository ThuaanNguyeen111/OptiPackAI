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

// Hình dạng response CHUẨN OAuth2 của Tiki — tên field seller_id/seller_name/
// seller_code CHƯA xác nhận 100% qua response thật (độ tin cậy trung bình,
// ghi rõ trong SETUP_NOTES.md), các field access_token/refresh_token/expires_in
// là chuẩn OAuth2 nên chắc chắn đúng.
interface TikiTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // SỐ GIÂY CÒN LẠI — chuẩn OAuth2
  token_type?: string;
  seller_id?: number | string;
  seller_name?: string;
  seller_code?: string;
}

@Injectable()
export class TikiAdapter implements MarketplaceAdapter {
  readonly platform = MarketplacePlatform.TIKI;
  private readonly logger = new Logger(TikiAdapter.name);

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  private readonly authorizeBaseUrl: string;
  private readonly tokenUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.clientId = requireEnv(
      this.configService.get<string>('marketplace.tiki.clientId'),
      'TIKI_CLIENT_ID',
    );
    this.clientSecret = requireEnv(
      this.configService.get<string>('marketplace.tiki.clientSecret'),
      'TIKI_CLIENT_SECRET',
    );
    this.redirectUri = requireEnv(
      this.configService.get<string>('marketplace.tiki.redirectUri'),
      'TIKI_REDIRECT_URI',
    );

    this.authorizeBaseUrl = envOrDefault(
      this.configService.get<string>('marketplace.tiki.authorizeBaseUrl'),
      'https://id.tiki.vn',
    );
    this.tokenUrl = envOrDefault(
      this.configService.get<string>('marketplace.tiki.tokenUrl'),
      'https://api.tiki.vn/sc/oauth2/token',
    );
  }

  private basicAuthHeader(): string {
    return `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`;
  }

  buildAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state,
    });

    return `${this.authorizeBaseUrl}/oauth2/auth?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<OAuthTokenResult> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
    });

    try {
      const response = await axios.post<TikiTokenResponse>(
        this.tokenUrl,
        body.toString(),
        {
          headers: {
            Authorization: this.basicAuthHeader(),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      return this.mapTokenResponse(response.data);
    } catch (error) {
      this.logger.error(
        'Đổi authorization code lấy token Tiki thất bại',
        error,
      );
      throw error; // service.ts (cấp trên) sẽ bọc lại thành AppException có error_code
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
    });

    try {
      const response = await axios.post<TikiTokenResponse>(
        this.tokenUrl,
        body.toString(),
        {
          headers: {
            Authorization: this.basicAuthHeader(),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      return this.mapTokenResponse(response.data);
    } catch (error) {
      this.logger.error('Refresh token Tiki thất bại', error);
      throw error; // service.ts (cấp trên) sẽ bọc lại thành AppException có error_code
    }
  }

  verifyWebhookSignature(
    rawBody: Buffer,
    headerSignature: string,
    sellerCode?: string,
  ): boolean {
    if (!sellerCode) {
      throw new Error(
        'verifyWebhookSignature của Tiki bắt buộc phải truyền sellerCode.',
      );
    }

    const message = rawBody.toString() + sellerCode;
    const expected = createHmac('sha256', this.clientSecret)
      .update(message)
      .digest('base64');

    return expected === headerSignature;
  }

  private mapTokenResponse(data: TikiTokenResponse): OAuthTokenResult {
    const now = Date.now();

    return {
      shopId: data.seller_id !== undefined ? String(data.seller_id) : 'unknown',
      shopName: data.seller_name ?? null,
      shopCipher: null,
      sellerCode: data.seller_code ?? null,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessTokenExpiresAt: new Date(now + data.expires_in * 1000),
      refreshTokenExpiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000),
    };
  }
}
