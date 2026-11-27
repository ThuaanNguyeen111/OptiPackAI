import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductMaster, ProductMasterSchema } from '../product-master/schemas/product-master.schema';
import { ProductModelsController } from './product-models.controller';
import { ProductModelsService } from './product-models.service';
import { ProductModel, ProductModelSchema } from './schemas/product-model.schema';

/** AOFP-352 — thư viện mô hình 3D. Chỉ đọc product_master để đếm SKU đang dùng (không import ProductMasterModule). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductModel.name, schema: ProductModelSchema },
      { name: ProductMaster.name, schema: ProductMasterSchema },
    ]),
  ],
  controllers: [ProductModelsController],
  providers: [ProductModelsService],
  exports: [ProductModelsService],
})
export class ProductModelsModule {}
