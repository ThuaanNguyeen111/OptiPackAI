import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { OrderGroupsModule } from '../order-groups/order-groups.module';
import { PackingPlan, PackingPlanSchema } from '../packing/schemas/packing-plan.schema';
import { Shipment, ShipmentSchema } from '../shipments/schemas/shipment.schema';
import { ShippingSettings, ShippingSettingsSchema } from '../shipping/schemas/shipping-settings.schema';
import { Warehouse, WarehouseSchema } from '../warehouse/schemas/warehouse.schema';
import { BinLocation, BinLocationSchema } from '../warehouse/schemas/bin-location.schema';
import { WarehouseZone, WarehouseZoneSchema } from '../warehouse/schemas/warehouse-zone.schema';
import { MasterSku, MasterSkuSchema } from '../master-skus/schemas/master-sku.schema';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

/** Module lá: đăng ký lại schema cần đọc; chỉ import module không phụ thuộc ngược lại Documents. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: PackingPlan.name, schema: PackingPlanSchema },
      { name: Shipment.name, schema: ShipmentSchema },
      { name: ShippingSettings.name, schema: ShippingSettingsSchema },
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: BinLocation.name, schema: BinLocationSchema },
      { name: WarehouseZone.name, schema: WarehouseZoneSchema },
      { name: MasterSku.name, schema: MasterSkuSchema },
    ]),
    OrderGroupsModule,
    WarehouseModule, // (21/10/2026) picking list in + phiếu nhập dùng lại WarehouseService (không vòng: Warehouse không import Documents)
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
