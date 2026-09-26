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
import { ReturnsController } from './returns.controller';

// G1 (27/09/2026). Phụ thuộc 1 chiều: shipments -> order-groups. OrderGroupsModule
// KHÔNG import module này (tránh vòng).
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Shipment.name, schema: ShipmentSchema },
      { name: ShipmentEvent.name, schema: ShipmentEventSchema },
      { name: ReturnRequest.name, schema: ReturnRequestSchema }, // G3
      { name: InventoryMovement.name, schema: InventoryMovementSchema }, // G4 — số lượng đã quét thật
    ]),
    OrderGroupsModule,
    WarehouseModule, // G3 — nhập lại hàng trả qua sổ cái (restockReturnedItem)
    PackagingMaterialsModule, // G4 — thu hồi vật liệu khi kiểm hàng hoàn
  ],
  controllers: [ShipmentsController, LegacyFulfillmentController, ReturnsController],
  providers: [ShipmentsService, ReturnsService],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
