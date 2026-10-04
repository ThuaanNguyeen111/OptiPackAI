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
import {
  PackagingMaterial,
  PackagingMaterialSchema,
} from './schemas/packaging-material.schema';
import {
  PackagingMaterialMovement,
  PackagingMaterialMovementSchema,
} from './schemas/packaging-material-movement.schema';
import {
  PackagingMaterialRules,
  PackagingMaterialRulesSchema,
} from './schemas/packaging-material-rules.schema';
import { PackagingMaterialService } from './packaging-material.service';
import { PackagingMaterialController } from './packaging-material.controller';
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
      { name: PackagingBox.name, schema: PackagingBoxSchema },
      { name: PackagingBag.name, schema: PackagingBagSchema },
      { name: PackagingStockMovement.name, schema: PackagingStockMovementSchema },
      { name: PackagingMaterial.name, schema: PackagingMaterialSchema },
      { name: PackagingMaterialMovement.name, schema: PackagingMaterialMovementSchema },
      { name: PackagingMaterialRules.name, schema: PackagingMaterialRulesSchema },
    ]),
    NotificationsModule,
    // generate()/reject()/pack() gọi NotificationsService (Packaging Staff /
    // Admin / Store Owner) — thiếu import này thì Nest không inject được,
    // app CRASH ngay lúc khởi động (tsc/eslint/jest đều không bắt).
    OrderGroupsModule, // export OrderGroupsService — findOrderGroupById/allocatePickedItemsToOrders/transitionFulfillmentStatus
  ],
  controllers: [
    PackagingController,
    PackagingPackController,
    PackagingBoxController,
    PackagingBagController,
    PackagingMaterialController,
  ],
  providers: [
    PackagingService,
    PackagingBoxService,
    PackagingBagService,
    PackagingMaterialService,
    PackingGuideAiService,
  ],
  exports: [PackagingService, PackagingBoxService, PackagingBagService, PackagingMaterialService],
})
export class PackagingModule {}
