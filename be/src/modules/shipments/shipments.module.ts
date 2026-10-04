import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Shipment, ShipmentSchema } from './schemas/shipment.schema';
import { ShipmentsService } from './shipments.service';
import { ShipmentsController } from './shipments.controller';
import { OrderGroupsModule } from '../order-groups/order-groups.module';
import { ShippingModule } from '../shipping/shipping.module';

/**
 * MODULE MỚI (29/09/2026, Mục 9.5) — module lá (không export gì, không
 * ai khác trong hệ thống cần dùng ShipmentsService trực tiếp hiện tại).
 * Import OrderGroupsModule để lấy OrderGroupsService (findOrderGroupById,
 * transitionFulfillmentStatus) — module này KHÔNG bị import ngược lại
 * bởi OrderGroupsModule nên không có nguy cơ circular dependency.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Shipment.name, schema: ShipmentSchema },
    ]),
    OrderGroupsModule,
    ShippingModule,
  ],
  controllers: [ShipmentsController],
  providers: [ShipmentsService],
})
export class ShipmentsModule {}
