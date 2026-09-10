import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrderGroup, OrderGroupSchema } from './schemas/order-group.schema';
// Đăng ký LẠI schema Order đã có (KHÔNG import OrdersModule để tránh
// circular dependency — OrdersModule tương lai có thể cần import
// ngược OrderGroupsModule khi nối UC-04). Mongoose cho phép nhiều
// module cùng forFeature() 1 schema, cùng trỏ 1 collection thật.
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { ProductMaster, ProductMasterSchema } from '../product-master/schemas/product-master.schema';
import { OrderGroupsService } from './order-groups.service';
import { OrderGroupBackfillScheduler } from './order-group-backfill.scheduler';
import { OrderGroupsController } from './order-groups.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrderGroup.name, schema: OrderGroupSchema },
      { name: Order.name, schema: OrderSchema },
      { name: ProductMaster.name, schema: ProductMasterSchema },
    ]),
  ],
  controllers: [OrderGroupsController],
  providers: [OrderGroupsService, OrderGroupBackfillScheduler],
  exports: [OrderGroupsService],
})
export class OrderGroupsModule {}
