import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PackagingRecommendationDoc,
  PackagingRecommendationSchema,
} from './schemas/packaging-recommendation.schema';
import { OrderGroup, OrderGroupSchema } from '../order-groups/schemas/order-group.schema';
import { PackagingService } from './packaging.service';
import { PackagingController } from './packaging.controller';
import { OrderGroupsModule } from '../order-groups/order-groups.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PackagingRecommendationDoc.name, schema: PackagingRecommendationSchema },
      { name: OrderGroup.name, schema: OrderGroupSchema },
    ]),
    OrderGroupsModule, // export OrderGroupsService — dùng findOrderGroupById/getPackableItemsForGroup/transitionFulfillmentStatus
  ],
  controllers: [PackagingController],
  providers: [PackagingService],
  exports: [PackagingService],
})
export class PackagingModule {}
