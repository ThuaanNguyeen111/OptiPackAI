import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PackagingRecommendationDoc,
  PackagingRecommendationSchema,
} from './schemas/packaging-recommendation.schema';
import { OrderGroup, OrderGroupSchema } from '../order-groups/schemas/order-group.schema';
import { PackagingService } from './packaging.service';
import { PackagingController, PackagingPackController } from './packaging.controller';
import { PackagingBox, PackagingBoxSchema } from './schemas/packaging-box.schema';
import { PackagingBoxService } from './packaging-box.service';
import { PackagingBoxController } from './packaging-box.controller';
import { OrderGroupsModule } from '../order-groups/order-groups.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PackagingRecommendationDoc.name, schema: PackagingRecommendationSchema },
      { name: OrderGroup.name, schema: OrderGroupSchema },
      { name: PackagingBox.name, schema: PackagingBoxSchema },
    ]),
    NotificationsModule,
    OrderGroupsModule, // export OrderGroupsService — dùng findOrderGroupById/getPackableItemsForGroup/transitionFulfillmentStatus
  ],
  controllers: [PackagingController, PackagingPackController, PackagingBoxController],
  providers: [PackagingService, PackagingBoxService],
  exports: [PackagingService, PackagingBoxService],
})
export class PackagingModule {}
