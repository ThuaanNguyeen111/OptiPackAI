import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  MarketplaceShop,
  MarketplaceShopDocument,
} from './schemas/marketplace-shop.schema';
import {
  MarketplaceOauthState,
  MarketplaceOauthStateDocument,
} from './schemas/marketplace-oauth-state.schema';
import { MarketplacePlatform } from './enums/platform.enum';
import {
  MARKETPLACE_ADAPTERS,
  MarketplaceAdapter,
} from './interfaces/marketplace-adapter.interface';
import {
  encryptToken,
  decryptToken,
} from './common/utils/token-encryption.util';
import { AppException } from '../../common/exceptions/app-exception';
import { MKT_ERROR_CODES } from './marketplace-integration.errors';

// TTL của OAuth state (10 phút) chỉ khai báo Ở SCHEMA (marketplace-oauth-state.schema.ts,
// `expireAfterSeconds: 600`) — 1 nguồn duy nhất, không lặp lại hằng số ở đây để tránh
// 2 nơi có thể lệch nhau nếu sau này chỉ sửa 1 chỗ.
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh sớm 5 phút trước khi hết hạn thật

@Injectable()
export class MarketplaceIntegrationService {
  private readonly logger = new Logger(MarketplaceIntegrationService.name);

  constructor(
    @InjectModel(MarketplaceShop.name)
    private readonly marketplaceShopModel: Model<MarketplaceShopDocument>,
    @InjectModel(MarketplaceOauthState.name)
    private readonly oauthStateModel: Model<MarketplaceOauthStateDocument>,
    @Inject(MARKETPLACE_ADAPTERS)
    private readonly adapters: Partial<
      Record<MarketplacePlatform, MarketplaceAdapter>
    >,
    private readonly configService: ConfigService,
  ) {}

  /**
   * ===================================================================
   * BƯỚC 1 CỦA LUỒNG CONNECT — TẠO URL + LƯU STATE (Mongo TTL, không Redis)
   * ===================================================================
   * ĐÃ ĐỔI từ Redis sang Mongo TTL collection sau khi phát hiện
   * RedisCacheService thật không có hàm chung — xem giải trình đầy đủ
   * trong marketplace-oauth-state.schema.ts.
   */
  async createConnectUrl(
    platform: MarketplacePlatform,
    adminUserId: string,
  ): Promise<string> {
    const adapter = this.getAdapter(platform);
    const state = randomUUID();

    await this.oauthStateModel.create({
      state,
      admin_user_id: adminUserId,
      platform,
    });

    return adapter.buildAuthorizationUrl(state);
  }

  /**
   * ===================================================================
   * BƯỚC 2 — XỬ LÝ CALLBACK, VERIFY STATE, LƯU SHOP
   * ===================================================================
   */
  async handleOAuthCallback(
    platform: MarketplacePlatform,
    code: string,
    state: string,
    shopIdFromQuery: string | undefined,
  ): Promise<MarketplaceShopDocument> {
    const stateRecord = await this.oauthStateModel.findOneAndDelete({ state });

    if (!stateRecord) {
      // Hết hạn (quá 10 phút, TTL Mongo đã tự xóa) HOẶC state giả mạo —
      // không phân biệt lý do cụ thể ra ngoài response (tránh lộ thông
      // tin cho kẻ tấn công).
      throw new AppException(
        MKT_ERROR_CODES.OAUTH_STATE_INVALID,
        'Phiên kết nối đã hết hạn hoặc không hợp lệ — vui lòng thử kết nối lại.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const adapter = this.getAdapter(platform);

    let tokenResult;
    try {
      tokenResult = await adapter.exchangeCodeForToken(code, shopIdFromQuery);
    } catch (error) {
      this.logger.error(
        `Đổi authorization code lấy token thất bại (${platform})`,
        error,
      );
      throw new AppException(
        MKT_ERROR_CODES.TOKEN_EXCHANGE_FAILED,
        `Không thể hoàn tất kết nối với ${platform} — vui lòng thử lại. Nếu lỗi lặp lại, liên hệ quản trị viên.`,
        HttpStatus.BAD_GATEWAY,
        { platform },
      );
    }

    const environment: 'sandbox' | 'production' = this.isSandboxEnvironment(
      platform,
    )
      ? 'sandbox'
      : 'production';

    const upsertData = {
      platform,
      shop_id: tokenResult.shopId,
      shop_name: tokenResult.shopName,
      shop_cipher: tokenResult.shopCipher,
      environment,
      access_token_encrypted: encryptToken(tokenResult.accessToken),
      refresh_token_encrypted: encryptToken(tokenResult.refreshToken),
      access_token_expires_at: tokenResult.accessTokenExpiresAt,
      refresh_token_expires_at: tokenResult.refreshTokenExpiresAt,
      connected_by: new Types.ObjectId(stateRecord.admin_user_id),
      is_active: true,
    };

    // upsert theo unique index (platform, shop_id, environment) —
    // Admin kết nối lại shop đã từng kết nối trước đó sẽ GHI ĐÈ, không
    // tạo bản ghi trùng.
    const shopDoc = await this.marketplaceShopModel.findOneAndUpdate(
      { platform, shop_id: tokenResult.shopId, environment },
      upsertData,
      { upsert: true, new: true },
    );

    this.logger.log(
      `Đã kết nối shop ${tokenResult.shopId} trên ${platform} thành công.`,
    );

    return shopDoc;
  }

  /**
   * ===================================================================
   * LẤY ACCESS TOKEN CÒN HIỆU LỰC — TỰ REFRESH NẾU SẮP HẾT HẠN
   * ===================================================================
   * Module `orders/` gọi hàm này trước MỖI lần gọi API sang sàn.
   */
  async getValidAccessToken(
    shopId: string,
    platform: MarketplacePlatform,
  ): Promise<string> {
    const shopDoc = await this.marketplaceShopModel
      .findOne({ platform, shop_id: shopId, is_active: true })
      .select('+access_token_encrypted +refresh_token_encrypted');

    if (!shopDoc) {
      throw new AppException(
        MKT_ERROR_CODES.SHOP_NOT_CONNECTED,
        `Shop ${shopId} (${platform}) chưa được kết nối hoặc đã bị ngắt kết nối.`,
        HttpStatus.UNAUTHORIZED,
        { shopId, platform },
      );
    }

    const willExpireSoon =
      shopDoc.access_token_expires_at.getTime() - Date.now() <
      TOKEN_REFRESH_BUFFER_MS;

    if (!willExpireSoon) {
      return decryptToken(shopDoc.access_token_encrypted);
    }

    return this.refreshShopToken(shopDoc);
  }

  private async refreshShopToken(
    shopDoc: MarketplaceShopDocument,
  ): Promise<string> {
    const adapter = this.getAdapter(shopDoc.platform);
    const plainRefreshToken = decryptToken(shopDoc.refresh_token_encrypted);

    try {
      const tokenResult = await adapter.refreshAccessToken(
        plainRefreshToken,
        shopDoc.shop_id,
      );

      shopDoc.access_token_encrypted = encryptToken(tokenResult.accessToken);
      shopDoc.refresh_token_encrypted = encryptToken(tokenResult.refreshToken);
      shopDoc.access_token_expires_at = tokenResult.accessTokenExpiresAt;
      shopDoc.refresh_token_expires_at = tokenResult.refreshTokenExpiresAt;
      await shopDoc.save();

      return tokenResult.accessToken;
    } catch (error) {
      // Refresh token cũng hết hạn/bị thu hồi → không tự phục hồi được nữa,
      // đánh dấu is_active=false để cron ngưng quét shop này (nhờ partial
      // index), cần Admin vào kết nối lại thủ công.
      this.logger.error(
        `Refresh token thất bại cho shop ${shopDoc.shop_id} (${shopDoc.platform}) — đánh dấu ngừng hoạt động.`,
        error,
      );
      shopDoc.is_active = false;
      await shopDoc.save();
      throw new AppException(
        MKT_ERROR_CODES.TOKEN_REFRESH_FAILED,
        `Không thể tự động gia hạn token cho shop ${shopDoc.shop_id} (${shopDoc.platform}) — cần Admin kết nối lại thủ công.`,
        HttpStatus.BAD_GATEWAY,
        { shopId: shopDoc.shop_id, platform: shopDoc.platform },
      );
    }
  }

  /**
   * `orders/` KHÔNG được inject thẳng Model<MarketplaceShopDocument> —
   * module đó không `MongooseModule.forFeature()` schema này (đúng quy
   * tắc Mongoose: module nào sở hữu schema, module đó đăng ký). Mọi
   * thao tác `orders/` cần trên dữ liệu shop đều đi qua 3 hàm public
   * này — giữ MarketplaceIntegrationService là "cửa duy nhất" vào
   * collection marketplace_shops, đúng tinh thần module đã tách từ đầu.
   */

  /**
   * Lấy thông tin 1 shop đã kết nối (KHÔNG kèm token — orders.service.ts
   * chỉ cần _id Mongo + last_polled_at để tính cửa sổ polling, việc lấy
   * access_token thật đã có getValidAccessToken() riêng ở trên).
   */
  async getConnectedShop(
    shopId: string,
    platform: MarketplacePlatform,
  ): Promise<MarketplaceShopDocument> {
    const shopDoc = await this.marketplaceShopModel.findOne({
      platform,
      shop_id: shopId,
      is_active: true,
    });

    if (!shopDoc) {
      throw new AppException(
        MKT_ERROR_CODES.SHOP_NOT_CONNECTED,
        `Shop ${shopId} (${platform}) chưa được kết nối hoặc đã bị ngắt kết nối.`,
        HttpStatus.UNAUTHORIZED,
        { shopId, platform },
      );
    }

    return shopDoc;
  }

  /**
   * Danh sách mọi shop ĐANG hoạt động của 1 sàn — dùng khi cron polling
   * (bước sau) cần quét TẤT CẢ shop đã connect, không chỉ 1 shop cụ thể.
   * Hiện tại (scope Lazada-only, 1 seller test) chỉ trả về 0-1 phần tử,
   * nhưng viết đúng dạng "danh sách" ngay từ đầu để không phải sửa lại
   * chữ ký hàm khi có nhiều shop thật.
   */
  async listConnectedShops(
    platform: MarketplacePlatform,
  ): Promise<MarketplaceShopDocument[]> {
    return this.marketplaceShopModel.find({ platform, is_active: true });
  }

  /**
   * Cập nhật mốc "lần poll gần nhất" sau khi orders.service.ts sync
   * thành công — lần poll SAU sẽ dùng mốc này làm `created_after`,
   * tránh kéo lại toàn bộ lịch sử đơn mỗi lần chạy.
   */
  async markShopPolled(
    shopMongoId: Types.ObjectId,
    polledAt: Date,
  ): Promise<void> {
    await this.marketplaceShopModel.updateOne(
      { _id: shopMongoId },
      { $set: { last_polled_at: polledAt } },
    );
  }

  /**
   * quét shop nào sắp hết hạn token nhờ ĐÚNG partial index đã khai báo.
   */
  async findShopsWithExpiringToken(): Promise<MarketplaceShopDocument[]> {
    return this.marketplaceShopModel
      .find({
        is_active: true,
        access_token_expires_at: {
          $lt: new Date(Date.now() + TOKEN_REFRESH_BUFFER_MS),
        },
      })
      .select('+access_token_encrypted +refresh_token_encrypted');
  }

  private getAdapter(platform: MarketplacePlatform): MarketplaceAdapter {
    const adapter = this.adapters[platform];

    if (!adapter) {
      throw new AppException(
        MKT_ERROR_CODES.ADAPTER_NOT_REGISTERED,
        `Chưa có adapter nào đăng ký cho platform "${platform}" — lỗi cấu hình hệ thống, không phải lỗi người dùng.`,
        HttpStatus.INTERNAL_SERVER_ERROR,
        { platform },
      );
    }

    return adapter;
  }

  /**
   * Đọc TRỰC TIẾP từ cùng biến env mà adapter dùng để chọn host —
   * tránh trường hợp lệch nhau: code gọi sang host sandbox nhưng field
   * environment trong Mongo lại ghi "production".
   */
  private isSandboxEnvironment(platform: MarketplacePlatform): boolean {
    switch (platform) {
      case MarketplacePlatform.TIKTOK:
        return (
          this.configService.get<boolean>('marketplace.tiktok.sandbox') === true
        );
      case MarketplacePlatform.LAZADA:
        return (
          this.configService.get<boolean>('marketplace.lazada.sandbox') === true
        );
      case MarketplacePlatform.TIKI:
        return (
          this.configService.get<boolean>('marketplace.tiki.sandbox') === true
        );
      default:
        return true;
    }
  }
}
