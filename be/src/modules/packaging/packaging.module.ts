import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PackagingRecommendationDoc,
  PackagingRecommendationSchema,
} from './schemas/packaging-recommendation.schema';
import {
  OrderGroup,
  OrderGroupSchema,
} from '../order-groups/schemas/order-group.schema';
import { PackagingService } from './packaging.service';
import { PackagingController } from './packaging.controller';
import { OrderGroupsModule } from '../order-groups/order-groups.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: PackagingRecommendationDoc.name,
        schema: PackagingRecommendationSchema,
      },
      { name: OrderGroup.name, schema: OrderGroupSchema },
    ]),
    OrderGroupsModule, // export OrderGroupsService — dùng findOrderGroupById/getPackableItemsForGroup/transitionFulfillmentStatus
    // BỔ SUNG (21/09/2026, báo cáo thật từ FE) — generate()/reject() giờ
    // gọi NotificationsService (thông báo Packaging Staff/Admin) — thiếu
    // import này thì Nest KHÔNG inject được, app CRASH ngay lúc khởi
    // động (DI error), không phải lỗi runtime âm thầm.
    NotificationsModule,
  ],
  controllers: [PackagingController],
  providers: [PackagingService],
  exports: [PackagingService],
})
export class PackagingModule {}
