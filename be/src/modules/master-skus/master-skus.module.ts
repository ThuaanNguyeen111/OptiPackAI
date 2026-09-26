import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Color, ColorSchema } from './schemas/color.schema';
import { MasterSku, MasterSkuSchema } from './schemas/master-sku.schema';
import { MarketplaceSkuMapping, MarketplaceSkuMappingSchema } from './schemas/marketplace-sku-mapping.schema';
import { ProductMaster, ProductMasterSchema } from '../product-master/schemas/product-master.schema';
import { CategoriesModule } from '../categories/categories.module';
import { MasterSkusService } from './master-skus.service';
import { ColorsController, MasterSkusController } from './master-skus.controller';

// K4a (27/09/2026). Phụ thuộc: categories (danh mục + thang size). Không vòng.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Color.name, schema: ColorSchema },
      { name: MasterSku.name, schema: MasterSkuSchema },
      { name: MarketplaceSkuMapping.name, schema: MarketplaceSkuMappingSchema },
      { name: ProductMaster.name, schema: ProductMasterSchema },
    ]),
    CategoriesModule,
  ],
  controllers: [ColorsController, MasterSkusController],
  providers: [MasterSkusService],
  exports: [MasterSkusService],
})
export class MasterSkusModule {}
