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
import {
  PackagingStockMovement,
  PackagingStockMovementSchema,
} from './schemas/packaging-stock-movement.schema';
import { PackagingBoxService } from './packaging-box.service';
import { PackagingBoxController } from './packaging-box.controller';
import { PackingGuideAiService } from './packing-guide-ai.service';
import { PackagingBag, PackagingBagSchema } from './schemas/packaging-bag.schema';
import { PackagingBagService } from './packaging-bag.service';
import { PackagingBagController } from './packaging-bag.controller';
import { OrderGroupsModule } from '../order-groups/order-groups.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PackagingRecommendationDoc.name, schema: PackagingRecommendationSchema },
      { name: OrderGroup.name, schema: OrderGroupSchema },
      { name: PackagingBox.name, schema: PackagingBoxSchema },
      { name: PackagingBag.name, schema: PackagingBagSchema },
      { name: PackagingStockMovement.name, schema: PackagingStockMovementSchema },
    ]),
    NotificationsModule,
    OrderGroupsModule, // export OrderGroupsService — dùng findOrderGroupById/getPackableItemsForGroup/transitionFulfillmentStatus
  ],
  controllers: [PackagingController, PackagingPackController, PackagingBoxController, PackagingBagController],
  providers: [PackagingService, PackagingBoxService, PackagingBagService, PackingGuideAiService],
  exports: [PackagingService, PackagingBoxService, PackagingBagService],
})
export class PackagingModule {}
