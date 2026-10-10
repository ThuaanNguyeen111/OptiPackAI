import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductMaster, ProductMasterSchema } from './schemas/product-master.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { PackagingBag, PackagingBagSchema } from '../packaging/schemas/packaging-bag.schema';
import { ProductMasterService } from './product-master.service';
import { ProductMasterSyncScheduler } from './product-master-sync.scheduler';
import { ProductMasterController } from './product-master.controller';
import { MarketplaceIntegrationModule } from '../marketplace-integration/marketplace-integration.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductMaster.name, schema: ProductMasterSchema },
      { name: Order.name, schema: OrderSchema },
      // Chỉ đọc để kiểm tra mã túi zip khi xác nhận hồ sơ — không import
      // PackagingModule (tránh vòng phụ thuộc module).
      { name: PackagingBag.name, schema: PackagingBagSchema },
    ]),
    MarketplaceIntegrationModule,
  ],
  controllers: [ProductMasterController],
  providers: [ProductMasterService, ProductMasterSyncScheduler],
  exports: [ProductMasterService],
})
export class ProductMasterModule {}
