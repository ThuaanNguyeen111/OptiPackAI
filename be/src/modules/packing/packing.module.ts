import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrderGroup, OrderGroupSchema } from '../order-groups/schemas/order-group.schema';
import { OrderGroupsModule } from '../order-groups/order-groups.module';
import { PackagingModule } from '../packaging/packaging.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PackingPlan, PackingPlanSchema } from './schemas/packing-plan.schema';
import { PackingPlanService } from './packing-plan.service';
import { PackingJobService } from './packing-job.service';
import { PackingQueueService } from './packing-queue.service';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { PackingPlanController, PackingPlansController } from './packing-plan.controller';

/**
 * Kế hoạch đóng gói (04/10/2026, làm lại): bộ giải BRKGA + CP-SAT, kế hoạch
 * 1/nhóm, tự tính khi lấy hàng xong. Danh mục thùng/túi/vật tư + hướng dẫn AI
 * vẫn ở PackagingModule (dùng lại, không đổi).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PackingPlan.name, schema: PackingPlanSchema },
      { name: OrderGroup.name, schema: OrderGroupSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
    OrderGroupsModule,
    PackagingModule,
    NotificationsModule,
  ],
  controllers: [PackingPlanController, PackingPlansController],
  providers: [PackingPlanService, PackingJobService, PackingQueueService],
  exports: [PackingPlanService],
})
export class PackingModule {}
