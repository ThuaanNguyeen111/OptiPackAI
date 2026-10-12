import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ProcessedWebhookEvent,
  ProcessedWebhookEventDocument,
} from '../../common/schemas/processed-webhook-event.schema';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import {
  MARKETPLACE_ADAPTERS,
  MarketplaceAdapter,
} from '../marketplace-integration/interfaces/marketplace-adapter.interface';
import { MarketplaceIntegrationService } from '../marketplace-integration';
import { MKT_ERROR_CODES } from '../marketplace-integration/marketplace-integration.errors';
import { OrdersService } from '../orders/orders.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { AppException } from '../../common/exceptions/app-exception';

/** Vỏ payload webhook AURELLE — đúng Mục 8.1 AURELLE_MARKETPLACE_DESIGN.md. */
export interface MarketplaceWebhookPayload {
  message_id: string;
  seller_id: string;
  message_type: string;
  timestamp: number;
  data: {
    trade_order_id: string;
    order_status?: string;
    status_update_time?: number;
  };
}

const REPLAY_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * ===================================================================
 * marketplace-webhooks.service.ts — MỚI (29/09/2026, Giai đoạn 3)
 * ===================================================================
 * Đúng phạm vi cột OptiPack ở Mục 12: "Endpoint webhook, rawBody, lưu
 * message_id" — KHÔNG làm outbox (Giai đoạn 4). Nối lại hạ tầng đã có
 * sẵn nhưng chưa ai gọi: `ProcessedWebhookEvent` (idempotency),
 * `AurelleAdapter.verifyWebhookSignature()`, `OrdersService.syncSingleOrder()`.
 * ===================================================================
 */
@Injectable()
export class MarketplaceWebhooksService {
  private readonly logger = new Logger(MarketplaceWebhooksService.name);

  constructor(
    @InjectModel(ProcessedWebhookEvent.name)
    private readonly processedEventModel: Model<ProcessedWebhookEventDocument>,
    @Inject(MARKETPLACE_ADAPTERS)
    private readonly adapters: Partial<Record<MarketplacePlatform, MarketplaceAdapter>>,
    private readonly marketplaceIntegrationService: MarketplaceIntegrationService,
    private readonly ordersService: OrdersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async handleWebhook(
    platform: MarketplacePlatform,
    rawBody: Buffer,
    headerSignature: string | undefined,
    body: MarketplaceWebhookPayload,
  ): Promise<{ received: boolean }> {
    const adapter = this.adapters[platform];
    if (!adapter || !headerSignature || !adapter.verifyWebhookSignature(rawBody, headerSignature)) {
      throw new AppException(
        MKT_ERROR_CODES.WEBHOOK_SIGNATURE_INVALID,
        'Chữ ký webhook không hợp lệ.',
        HttpStatus.UNAUTHORIZED,
        { platform },
      );
    }

    if (Math.abs(Date.now() - body.timestamp) > REPLAY_TOLERANCE_MS) {
      throw new AppException(
        MKT_ERROR_CODES.WEBHOOK_SIGNATURE_INVALID,
        'Webhook bị từ chối — lệch thời gian quá 5 phút so với server (khả năng replay).',
        HttpStatus.UNAUTHORIZED, // cùng status với lỗi chữ ký sai — cả 2 đều là "không tin request này", nhất quán 401
        { platform },
      );
    }

    // Rule #17 (CLAUDE.md, ĐÃ SỬA đúng thứ tự) — thử create() TRƯỚC, dựa
    // vào unique index {platform, event_id}; trùng khóa = đã xử lý rồi,
    // im lặng bỏ qua (KHÔNG phải lỗi, đúng bản chất at-least-once của webhook).
    try {
      await this.processedEventModel.create({
        platform,
        event_id: body.message_id,
      });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        this.logger.log(
          `Webhook ${platform} message_id=${body.message_id} đã xử lý trước đó — bỏ qua.`,
        );
        return { received: true };
      }
      throw error;
    }

    await this.dispatch(platform, body);
    return { received: true };
  }

  private async dispatch(
    platform: MarketplacePlatform,
    body: MarketplaceWebhookPayload,
  ): Promise<void> {
    switch (body.message_type) {
      case 'order_status_changed':
      case 'order_updated':
        await this.handleOrderChanged(platform, body);
        return;
      case 'authorization_revoked':
        await this.handleAuthorizationRevoked(platform, body);
        return;
      default:
        // Tương thích ngược — AURELLE có thể thêm message_type mới sau
        // này, ack bình thường thay vì fail cả webhook.
        this.logger.warn(
          `Webhook ${platform}: message_type "${body.message_type}" chưa được xử lý — đã ack, bỏ qua.`,
        );
    }
  }

  private async handleOrderChanged(
    platform: MarketplacePlatform,
    body: MarketplaceWebhookPayload,
  ): Promise<void> {
    const shopId = body.seller_id;
    try {
      await this.marketplaceIntegrationService.getConnectedShop(shopId, platform);
    } catch (error) {
      if (error instanceof AppException && error.errorCode === MKT_ERROR_CODES.SHOP_NOT_CONNECTED) {
        // Shop không còn kết nối — retry của AURELLE không giúp ích gì,
        // ack 200 để họ dừng gửi lại thay vì hao phí 5 lần retry vô ích.
        this.logger.warn(
          `Webhook ${platform}: shop ${shopId} không kết nối — ack, bỏ qua.`,
        );
        return;
      }
      throw error;
    }

    await this.ordersService.syncSingleOrder(platform, shopId, body.data.trade_order_id);
  }

  private async handleAuthorizationRevoked(
    platform: MarketplacePlatform,
    body: MarketplaceWebhookPayload,
  ): Promise<void> {
    this.logger.warn(
      `Webhook ${platform}: shop ${body.seller_id} vừa thu hồi quyền truy cập (authorization_revoked).`,
    );
    const title = `Shop đã thu hồi quyền kết nối — ${platform}`;
    const message = `Shop ${body.seller_id} (${platform}) vừa thu hồi quyền truy cập của OptiPackAI. Các lượt đồng bộ đơn hàng/sản phẩm cho shop này sẽ thất bại cho tới khi kết nối lại.`;
    await this.notificationsService.notify({
      recipientRole: UserRole.STORE_OWNER,
      type: NotificationType.CONNECTION_LOST,
      severity: 'critical',
      title,
      message,
      relatedEntityType: 'marketplace_shop',
      relatedEntityId: body.seller_id,
    });
    await this.notificationsService.notify({
      recipientRole: UserRole.ADMIN,
      type: NotificationType.CONNECTION_LOST,
      severity: 'critical',
      title,
      message,
      relatedEntityType: 'marketplace_shop',
      relatedEntityId: body.seller_id,
    });
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}
