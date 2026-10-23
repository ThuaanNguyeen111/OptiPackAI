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
// Đăng ký LẠI schema PackingPlan (module packing/) — cùng pattern cross-module
// như Order/ProductMaster, tránh vòng import PackingModule <-> OrderGroupsModule.
// Chỉ dùng để vô hiệu kế hoạch khi đơn bị hủy (cancel / invalidate).
import { PackingPlan, PackingPlanSchema } from '../packing/schemas/packing-plan.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  SkuBinAssignment,
  SkuBinAssignmentSchema,
} from '../warehouse/schemas/sku-bin-assignment.schema';
import { PickEvent, PickEventSchema } from './schemas/pick-event.schema';
// (05/10/2026) tra mã ô cho thông báo "trả hàng về kệ".
import { BinLocation, BinLocationSchema } from '../warehouse/schemas/bin-location.schema';
import { StockLot, StockLotSchema } from '../warehouse/schemas/stock-lot.schema';
import { Warehouse, WarehouseSchema } from '../warehouse/schemas/warehouse.schema';
import {
  MarketplaceStatusOutbox,
  MarketplaceStatusOutboxSchema,
} from '../marketplace-writeback/schemas/status-outbox.schema';
import { ActivityLog, ActivityLogSchema } from '../activity-log/schemas/activity-log.schema';
import { OrderGroupsService } from './order-groups.service';
import { OrderGroupBackfillScheduler } from './order-group-backfill.scheduler';
import { OrderGroupsController } from './order-groups.controller';
import { StaffAssignmentService } from './staff-assignment.service';
import { StaffAssignmentController } from './staff-assignment.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { ExpressOrderSlaScheduler } from './express-order-sla.scheduler';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrderGroup.name, schema: OrderGroupSchema },
      { name: Order.name, schema: OrderSchema },
      { name: ProductMaster.name, schema: ProductMasterSchema },
      { name: User.name, schema: UserSchema },
      { name: SkuBinAssignment.name, schema: SkuBinAssignmentSchema },
      { name: BinLocation.name, schema: BinLocationSchema },
      { name: PickEvent.name, schema: PickEventSchema },
      { name: PackingPlan.name, schema: PackingPlanSchema },
      { name: InventoryMovement.name, schema: InventoryMovementSchema }, // K3 — pick-item ghi sổ cái
      { name: MarketplaceSkuMapping.name, schema: MarketplaceSkuMappingSchema }, // K4b
      { name: StockReservation.name, schema: StockReservationSchema }, // K5
      { name: StockReservationTotal.name, schema: StockReservationTotalSchema }, // K5
      { name: StockLot.name, schema: StockLotSchema }, // 15/10/2026 — lô hàng FIFO
      { name: Warehouse.name, schema: WarehouseSchema }, // 21/10/2026 — chọn kho giữ chỗ cho nhóm đơn
      { name: MarketplaceStatusOutbox.name, schema: MarketplaceStatusOutboxSchema }, // 20/10/2026 — ghi ngược trạng thái
      { name: ActivityLog.name, schema: ActivityLogSchema }, // 23/10/2026 — sổ hoạt động (lịch sử)
    ]),
    NotificationsModule,
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
  ],
  exports: [OrderGroupsService, StaffAssignmentService, StockReservationService], // 21/10/2026 — đẩy tồn sang AURELLE
})
export class OrderGroupsModule {}
