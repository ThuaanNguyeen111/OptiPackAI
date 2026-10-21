import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { Shipment, ShipmentSchema } from '../shipments/schemas/shipment.schema';
import { ReturnRequest, ReturnRequestSchema } from '../shipments/schemas/return-request.schema';
import { MarketplaceIntegrationModule } from '../marketplace-integration/marketplace-integration.module';
import { OrderGroupsModule } from '../order-groups/order-groups.module';
import { ProductMaster, ProductMasterSchema } from '../product-master/schemas/product-master.schema';
import { MarketplaceStockPushService } from './marketplace-stock-push.service';
import { MarketplaceStockPushController } from './marketplace-stock-push.controller';
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
      { name: ProductMaster.name, schema: ProductMasterSchema }, // 21/10/2026 — danh sách SKU để đẩy tồn
    ]),
    MarketplaceIntegrationModule,
    OrderGroupsModule, // 21/10/2026 — StockReservationService (tồn khả dụng); order-groups không import ngược module này
  ],
  controllers: [MarketplaceStockPushController],
  providers: [MarketplaceWritebackService, MarketplaceWritebackScheduler, MarketplaceStockPushService],
  exports: [MarketplaceWritebackService],
})
export class MarketplaceWritebackModule {}
