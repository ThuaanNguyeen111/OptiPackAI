import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrderGroup, OrderGroupSchema } from './schemas/order-group.schema';
// Đăng ký LẠI schema Order đã có (KHÔNG import OrdersModule để tránh
// circular dependency — OrdersModule tương lai có thể cần import
// ngược OrderGroupsModule khi nối UC-04). Mongoose cho phép nhiều
// module cùng forFeature() 1 schema, cùng trỏ 1 collection thật.
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import {
  ProductMaster,
  ProductMasterSchema,
} from '../product-master/schemas/product-master.schema';
// Đăng ký LẠI schema PackagingRecommendationDoc đã có (module packaging/) —
// CÙNG pattern cross-module đã áp dụng cho Order/ProductMaster ở trên,
// tránh vòng lặp import PackagingModule <-> OrderGroupsModule (packaging/
// phụ thuộc order-groups/ để đọc dữ liệu picking). Chỉ dùng để nhả giữ chỗ
// (is_active: false) khi 1 nhóm tự động hủy (N1) — xem cancelIfAllOrdersUnfulfillable().
import {
  PackagingRecommendationDoc,
  PackagingRecommendationSchema,
} from '../packaging/schemas/packaging-recommendation.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  SkuBinAssignment,
  SkuBinAssignmentSchema,
} from '../warehouse/schemas/sku-bin-assignment.schema';
import { PickEvent, PickEventSchema } from './schemas/pick-event.schema';
import {
  ReturnReceipt,
  ReturnReceiptSchema,
} from './schemas/return-receipt.schema';
import { OrderReturnsService } from './order-returns.service';
import { OrderReturnsController } from './order-returns.controller';
import { OrderGroupsService } from './order-groups.service';
import { OrderGroupBackfillScheduler } from './order-group-backfill.scheduler';
import { OrderGroupsController } from './order-groups.controller';
import { StaffAssignmentService } from './staff-assignment.service';
import { StaffAssignmentController } from './staff-assignment.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { ExpressOrderSlaScheduler } from './express-order-sla.scheduler';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrderGroup.name, schema: OrderGroupSchema },
      { name: Order.name, schema: OrderSchema },
      { name: ProductMaster.name, schema: ProductMasterSchema },
      { name: User.name, schema: UserSchema },
      { name: SkuBinAssignment.name, schema: SkuBinAssignmentSchema },
      { name: PickEvent.name, schema: PickEventSchema },
      { name: ReturnReceipt.name, schema: ReturnReceiptSchema },
      {
        name: PackagingRecommendationDoc.name,
        schema: PackagingRecommendationSchema,
      },
    ]),
    NotificationsModule,
  ],
  controllers: [
    OrderGroupsController,
    StaffAssignmentController,
    OrderReturnsController,
  ],
  providers: [
    OrderGroupsService,
    OrderReturnsService,
    OrderGroupBackfillScheduler,
    StaffAssignmentService,
    ExpressOrderSlaScheduler,
  ],
  exports: [OrderGroupsService, StaffAssignmentService],
})
export class OrderGroupsModule {}
