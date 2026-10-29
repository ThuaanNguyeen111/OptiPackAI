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
import { CarriersModule } from '../carriers/carriers.module';
import { PackingModule } from '../packing/packing.module';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { LiveCarrierService } from './live-carrier.service';
import { DemoRecipientService } from '../carriers/demo-recipient.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ShippingCarrier.name, schema: ShippingCarrierSchema },
      { name: ShippingSettings.name, schema: ShippingSettingsSchema },
      { name: PackingPlan.name, schema: PackingPlanSchema },
      { name: Order.name, schema: OrderSchema }, // C4 — người nhận/hàng của từng kiện gửi hãng
    ]),
    OrderGroupsModule,
    CarriersModule, // C4 (14/10/2026) — CARRIER_ADAPTER (GHN / mock theo CARRIER_MODE)
    PackingModule, // C6 (14/10/2026) — phương án thùng xếp vừa từng kiện (chỉ đọc)
  ],
  controllers: [ShippingController],
  providers: [ShippingService, LiveCarrierService, DemoRecipientService], // 28/10 — địa chỉ mô phỏng (chỉ đọc DB)
  exports: [ShippingService, LiveCarrierService],
})
export class ShippingModule {}
