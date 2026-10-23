import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityLog, ActivityLogSchema } from '../activity-log/schemas/activity-log.schema';
import { InventoryMovement, InventoryMovementSchema } from '../warehouse/schemas/inventory-movement.schema';
import { StockReceipt, StockReceiptSchema } from '../warehouse/schemas/stock-receipt.schema';
import { BinLocation, BinLocationSchema } from '../warehouse/schemas/bin-location.schema';
import { ShipmentEvent, ShipmentEventSchema } from '../shipments/schemas/shipment-event.schema';
import { Shipment, ShipmentSchema } from '../shipments/schemas/shipment.schema';
import { ReturnRequest, ReturnRequestSchema } from '../shipments/schemas/return-request.schema';
import { PackingPlan, PackingPlanSchema } from '../packing/schemas/packing-plan.schema';
import { PackagingMovement, PackagingMovementSchema } from '../packaging-materials/schemas/packaging-movement.schema';
import { LoginAuditLog, LoginAuditLogSchema } from '../auth/schemas/login-audit-log.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

// 23/10/2026 — CHỈ ĐỌC các collection lịch sử (đăng ký lại schema, không import module
// nghiệp vụ → không vòng phụ thuộc). Ghi sổ hoạt động nằm ở module nghiệp vụ.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ActivityLog.name, schema: ActivityLogSchema },
      { name: InventoryMovement.name, schema: InventoryMovementSchema },
      { name: StockReceipt.name, schema: StockReceiptSchema },
      { name: BinLocation.name, schema: BinLocationSchema },
      { name: ShipmentEvent.name, schema: ShipmentEventSchema },
      { name: Shipment.name, schema: ShipmentSchema },
      { name: ReturnRequest.name, schema: ReturnRequestSchema },
      { name: PackingPlan.name, schema: PackingPlanSchema },
      { name: PackagingMovement.name, schema: PackagingMovementSchema },
      { name: LoginAuditLog.name, schema: LoginAuditLogSchema },
      { name: User.name, schema: UserSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
  controllers: [HistoryController],
  providers: [HistoryService],
})
export class HistoryModule {}
