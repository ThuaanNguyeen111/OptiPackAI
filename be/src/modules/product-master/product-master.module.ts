import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductMaster, ProductMasterSchema } from './schemas/product-master.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { PackagingBag, PackagingBagSchema } from '../packaging/schemas/packaging-bag.schema';
import { OrderGroup, OrderGroupSchema } from '../order-groups/schemas/order-group.schema';
import { PackingPlan, PackingPlanSchema } from '../packing/schemas/packing-plan.schema';
import { ProductMasterService } from './product-master.service';
import { ProductMasterSyncScheduler } from './product-master-sync.scheduler';
import { ProductMasterController } from './product-master.controller';
import { MarketplaceIntegrationModule } from '../marketplace-integration/marketplace-integration.module';
import { MasterSkusModule } from '../master-skus/master-skus.module';
import { ProductModelsModule } from '../product-models/product-models.module';
import { MarketplaceSkuMapping, MarketplaceSkuMappingSchema } from '../master-skus/schemas/marketplace-sku-mapping.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductMaster.name, schema: ProductMasterSchema },
      { name: Order.name, schema: OrderSchema },
      // Chỉ đọc để kiểm tra mã túi zip khi xác nhận hồ sơ — không import
      // PackagingModule (tránh vòng phụ thuộc module).
      { name: PackagingBag.name, schema: PackagingBagSchema },
      // 22/10/2026 — đo xong SKU thì gỡ cờ kẹt đóng gói của các nhóm đang chờ SKU đó
      // (chỉ cập nhật 2 collection, không import OrderGroupsModule/PackingModule).
      { name: OrderGroup.name, schema: OrderGroupSchema },
      { name: PackingPlan.name, schema: PackingPlanSchema },
      // 27/11/2026 — chỉ đọc: tìm dòng cùng SKU nội bộ để dùng chung hồ sơ kho.
      { name: MarketplaceSkuMapping.name, schema: MarketplaceSkuMappingSchema },
    ]),
    MarketplaceIntegrationModule,
    ProductModelsModule, // AOFP-352 — kiểm tra mô hình 3D khi xác nhận hồ sơ
    MasterSkusModule, // 22/10/2026 — tự nối SKU sàn trùng mã SKU nội bộ (MasterSkusModule không import ngược)
  ],
  controllers: [ProductMasterController],
  providers: [ProductMasterService, ProductMasterSyncScheduler],
  exports: [ProductMasterService],
})
export class ProductMasterModule {}
