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
import {
  PackingPlanController,
  PackingPlansController,
  PackingSettingsController,
} from './packing-plan.controller';
import { PackingSessionService } from './packing-session.service';
import { PackingSettingsService } from './packing-settings.service';
import { PackingReportService } from './packing-report.service';
import { PackerAssignmentService } from './packer-assignment.service';
import { PackingSettings, PackingSettingsSchema } from './schemas/packing-settings.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  MarketplaceSkuMapping,
  MarketplaceSkuMappingSchema,
} from '../master-skus/schemas/marketplace-sku-mapping.schema';
import { PackagingMaterialsModule } from '../packaging-materials/packaging-materials.module';

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
      // (05/10/2026) phiên đóng gói: cài đặt, giao người đóng, quét bằng SKU nội bộ.
      { name: PackingSettings.name, schema: PackingSettingsSchema },
      { name: User.name, schema: UserSchema },
      { name: MarketplaceSkuMapping.name, schema: MarketplaceSkuMappingSchema },
    ]),
    OrderGroupsModule,
    PackagingModule,
    PackagingMaterialsModule, // thu hồi thùng khi tháo kiện
    NotificationsModule,
  ],
  controllers: [PackingPlanController, PackingPlansController, PackingSettingsController],
  providers: [
    PackingPlanService,
    PackingJobService,
    PackingQueueService,
    PackingSessionService,
    PackingSettingsService,
    PackingReportService,
    PackerAssignmentService,
  ],
  exports: [PackingPlanService],
})
export class PackingModule {}
