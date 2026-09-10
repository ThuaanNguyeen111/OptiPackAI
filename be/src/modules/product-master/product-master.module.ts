import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductMaster, ProductMasterSchema } from './schemas/product-master.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { ProductMasterService } from './product-master.service';
import { ProductMasterSyncScheduler } from './product-master-sync.scheduler';
import { MarketplaceIntegrationModule } from '../marketplace-integration/marketplace-integration.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductMaster.name, schema: ProductMasterSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
    MarketplaceIntegrationModule,
  ],
  providers: [ProductMasterService, ProductMasterSyncScheduler],
  exports: [ProductMasterService],
})
export class ProductMasterModule {}
