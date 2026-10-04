import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { OrderGroupsModule } from '../order-groups/order-groups.module';
import { PackingPlan, PackingPlanSchema } from '../packing/schemas/packing-plan.schema';
import { Shipment, ShipmentSchema } from '../shipments/schemas/shipment.schema';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

/** Module lá: đăng ký lại schema cần đọc (không import module khác → không vòng phụ thuộc). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: PackingPlan.name, schema: PackingPlanSchema },
      { name: Shipment.name, schema: ShipmentSchema },
    ]),
    OrderGroupsModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
