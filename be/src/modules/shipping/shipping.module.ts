import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrderGroupsModule } from '../order-groups/order-groups.module';
// Đăng ký LẠI schema kế hoạch đóng gói (KHÔNG import PackingModule) — cùng
// pattern cross-module đã dùng ở OrderGroupsModule, tránh vòng lặp import.
import { PackingPlan, PackingPlanSchema } from '../packing/schemas/packing-plan.schema';
import {
  ShippingCarrier,
  ShippingCarrierSchema,
} from './schemas/shipping-carrier.schema';
import {
  ShippingSettings,
  ShippingSettingsSchema,
} from './schemas/shipping-settings.schema';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ShippingCarrier.name, schema: ShippingCarrierSchema },
      { name: ShippingSettings.name, schema: ShippingSettingsSchema },
      { name: PackingPlan.name, schema: PackingPlanSchema },
    ]),
    OrderGroupsModule,
  ],
  controllers: [ShippingController],
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
