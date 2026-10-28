import { User, UserSchema } from '../users/schemas/user.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { OrderGroup, OrderGroupSchema } from '../order-groups/schemas/order-group.schema';
import { ProductMaster, ProductMasterSchema } from '../product-master/schemas/product-master.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { ShipmentSlaScheduler } from './shipment-sla.scheduler';
import { PackagingMaterialsModule } from '../packaging-materials/packaging-materials.module';
import { InventoryMovement, InventoryMovementSchema } from '../warehouse/schemas/inventory-movement.schema';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Shipment, ShipmentSchema } from './schemas/shipment.schema';
import { ShipmentEvent, ShipmentEventSchema } from './schemas/shipment-event.schema';
import { ShipmentsService } from './shipments.service';
import { ShipmentsController } from './shipments.controller';
import { LegacyFulfillmentController } from './legacy-fulfillment.controller';
import { OrderGroupsModule } from '../order-groups/order-groups.module';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { ReturnRequest, ReturnRequestSchema } from './schemas/return-request.schema';
import { ReturnsService } from './returns.service';
import { ReturnsMarketplaceSyncService } from './returns-marketplace-sync.service';
import { MarketplaceIntegrationModule } from '../marketplace-integration/marketplace-integration.module';
import { ReturnsController } from './returns.controller';
import { ShippingModule } from '../shipping/shipping.module';
import { CarrierWebhookEvent, CarrierWebhookEventSchema } from './schemas/carrier-webhook-event.schema';
import { CarrierWebhookController } from './carrier-webhook.controller';
import {
  MarketplaceStatusOutbox,
  MarketplaceStatusOutboxSchema,
} from '../marketplace-writeback/schemas/status-outbox.schema';
import { ActivityLog, ActivityLogSchema } from '../activity-log/schemas/activity-log.schema';

// G1 (27/09/2026). Phụ thuộc 1 chiều: shipments -> order-groups. OrderGroupsModule
// KHÔNG import module này (tránh vòng).
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Shipment.name, schema: ShipmentSchema },
      { name: ShipmentEvent.name, schema: ShipmentEventSchema },
      { name: ReturnRequest.name, schema: ReturnRequestSchema }, // G3
      { name: InventoryMovement.name, schema: InventoryMovementSchema }, // G4 — số lượng đã quét thật
      { name: Order.name, schema: OrderSchema }, // đổi hàng — đơn thay thế
      { name: OrderGroup.name, schema: OrderGroupSchema }, // đổi hàng — gắn nhãn nhóm đơn thay thế
      { name: ProductMaster.name, schema: ProductMasterSchema }, // đổi hàng — kiểm hàng đổi sang
      { name: CarrierWebhookEvent.name, schema: CarrierWebhookEventSchema }, // C5 — chống xử lý trùng sự kiện hãng
      { name: MarketplaceStatusOutbox.name, schema: MarketplaceStatusOutboxSchema }, // 20/10/2026 — ghi ngược trạng thái
      { name: ActivityLog.name, schema: ActivityLogSchema }, // 23/10/2026 — sổ hoạt động (lịch sử phiếu trả hàng)
      { name: User.name, schema: UserSchema }, // 29/10/2026 — shipper của shop (hỏa tốc tự giao), chỉ đọc
    ]),
    OrderGroupsModule,
    WarehouseModule, // G3 — nhập lại hàng trả qua sổ cái (restockReturnedItem)
    PackagingMaterialsModule, // G4 — thu hồi vật liệu khi kiểm hàng hoàn
    NotificationsModule, // thông báo giao thất bại / hoàn về / trễ hạn / yêu cầu trả hàng
    ShippingModule, // gộp thi_dev — báo giá hãng/dịch vụ + ghi cước lên kế hoạch đóng gói
    MarketplaceIntegrationModule, // 20/10/2026 — kéo yêu cầu trả hàng của khách từ sàn (AURELLE)
  ],
  controllers: [ShipmentsController, LegacyFulfillmentController, ReturnsController, CarrierWebhookController],
  providers: [ShipmentsService, ReturnsService, ReturnsMarketplaceSyncService, ShipmentSlaScheduler],
  exports: [ShipmentsService, ReturnsMarketplaceSyncService],
})
export class ShipmentsModule {}
