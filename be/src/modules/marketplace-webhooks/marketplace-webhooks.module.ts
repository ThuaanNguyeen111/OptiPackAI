import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ProcessedWebhookEvent,
  ProcessedWebhookEventSchema,
} from '../../common/schemas/processed-webhook-event.schema';
import { MarketplaceIntegrationModule } from '../marketplace-integration/marketplace-integration.module';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ShipmentsModule } from '../shipments/shipments.module';
import { MarketplaceWebhooksController } from './marketplace-webhooks.controller';
import { MarketplaceWebhooksService } from './marketplace-webhooks.service';

/**
 * ===================================================================
 * MODULE MỚI (29/09/2026, Giai đoạn 3 — AURELLE_MARKETPLACE_DESIGN.md)
 * ===================================================================
 * Đăng ký LẦN ĐẦU `ProcessedWebhookEvent` (schema có sẵn từ lâu, chưa
 * module nào forFeature() nó — xác nhận qua grep toàn bộ src/ trước khi
 * viết module này). Không cycle: MarketplaceIntegrationModule/OrdersModule/
 * NotificationsModule không import ngược lại module này.
 * ===================================================================
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProcessedWebhookEvent.name, schema: ProcessedWebhookEventSchema },
    ]),
    MarketplaceIntegrationModule,
    OrdersModule,
    NotificationsModule,
    ShipmentsModule, // 20/10/2026 — kéo yêu cầu trả hàng khi webhook return_requested tới
  ],
  controllers: [MarketplaceWebhooksController],
  providers: [MarketplaceWebhooksService],
})
export class MarketplaceWebhooksModule {}
