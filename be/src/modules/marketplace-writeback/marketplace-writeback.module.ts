import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { Shipment, ShipmentSchema } from '../shipments/schemas/shipment.schema';
import { ReturnRequest, ReturnRequestSchema } from '../shipments/schemas/return-request.schema';
import { MarketplaceIntegrationModule } from '../marketplace-integration/marketplace-integration.module';
import {
  MarketplaceStatusOutbox,
  MarketplaceStatusOutboxSchema,
} from './schemas/status-outbox.schema';
import { MarketplaceWritebackService } from './marketplace-writeback.service';
import { MarketplaceWritebackScheduler } from './marketplace-writeback.scheduler';

// Chỉ ĐỌC Order/Shipment qua schema đăng ký lại (không import OrdersModule/ShipmentsModule
// → không vòng phụ thuộc). Việc GHI hàng đợi nằm ở order-groups và shipments.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MarketplaceStatusOutbox.name, schema: MarketplaceStatusOutboxSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Shipment.name, schema: ShipmentSchema },
      { name: ReturnRequest.name, schema: ReturnRequestSchema },
    ]),
    MarketplaceIntegrationModule,
  ],
  providers: [MarketplaceWritebackService, MarketplaceWritebackScheduler],
  exports: [MarketplaceWritebackService],
})
export class MarketplaceWritebackModule {}
