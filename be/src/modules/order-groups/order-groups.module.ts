import {
  StockReservation,
  StockReservationSchema,
  StockReservationTotal,
  StockReservationTotalSchema,
} from './schemas/stock-reservation.schema';
import { StockReservationService } from './stock-reservation.service';
import { StockAvailabilityController } from './stock-availability.controller';
import {
  MarketplaceSkuMapping,
  MarketplaceSkuMappingSchema,
} from '../master-skus/schemas/marketplace-sku-mapping.schema';
import { PackagingMaterialsModule } from '../packaging-materials/packaging-materials.module';
import {
  InventoryMovement,
  InventoryMovementSchema,
} from '../warehouse/schemas/inventory-movement.schema';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrderGroup, OrderGroupSchema } from './schemas/order-group.schema';
// Đăng ký LẠI schema Order đã có (KHÔNG import OrdersModule để tránh
// circular dependency — OrdersModule tương lai có thể cần import
// ngược OrderGroupsModule khi nối UC-04). Mongoose cho phép nhiều
// module cùng forFeature() 1 schema, cùng trỏ 1 collection thật.
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import {
  ProductMaster,
  ProductMasterSchema,
} from '../product-master/schemas/product-master.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  SkuBinAssignment,
  SkuBinAssignmentSchema,
} from '../warehouse/schemas/sku-bin-assignment.schema';
import { PickEvent, PickEventSchema } from './schemas/pick-event.schema';
import { OrderGroupsService } from './order-groups.service';
import { OrderGroupBackfillScheduler } from './order-group-backfill.scheduler';
import { OrderGroupsController } from './order-groups.controller';
import { StaffAssignmentService } from './staff-assignment.service';
import { StaffAssignmentController } from './staff-assignment.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { ExpressOrderSlaScheduler } from './express-order-sla.scheduler';
import { LazadaPackSyncService } from './lazada-pack-sync.service';
import { MarketplaceIntegrationModule } from '../marketplace-integration/marketplace-integration.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrderGroup.name, schema: OrderGroupSchema },
      { name: Order.name, schema: OrderSchema },
      { name: ProductMaster.name, schema: ProductMasterSchema },
      { name: User.name, schema: UserSchema },
      { name: SkuBinAssignment.name, schema: SkuBinAssignmentSchema },
      { name: PickEvent.name, schema: PickEventSchema },
      { name: InventoryMovement.name, schema: InventoryMovementSchema }, // K3 — pick-item ghi sổ cái
      { name: MarketplaceSkuMapping.name, schema: MarketplaceSkuMappingSchema }, // K4b
      { name: StockReservation.name, schema: StockReservationSchema }, // K5
      { name: StockReservationTotal.name, schema: StockReservationTotalSchema }, // K5
    ]),
    NotificationsModule,
    PackagingMaterialsModule, // G4 — pack trừ vật liệu đóng gói
    MarketplaceIntegrationModule, // 02/10/2026 — báo "đã đóng gói" lên Lazada (không vòng: module này không import ngược)
  ],
  controllers: [
    OrderGroupsController,
    StaffAssignmentController,
    StockAvailabilityController,
  ],
  providers: [
    OrderGroupsService,
    OrderGroupBackfillScheduler,
    StaffAssignmentService,
    ExpressOrderSlaScheduler,
    StockReservationService,
    LazadaPackSyncService,
  ],
  exports: [OrderGroupsService, StaffAssignmentService],
})
export class OrderGroupsModule {}
