import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Category, CategorySchema } from './schemas/category.schema';
import { BinLocation, BinLocationSchema } from '../warehouse/schemas/bin-location.schema';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
      // Đăng ký lại schema kệ (KHÔNG import WarehouseModule) — kho phụ thuộc
      // danh mục, nếu danh mục cũng import kho sẽ thành vòng phụ thuộc.
      { name: BinLocation.name, schema: BinLocationSchema },
    ]),
  ],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
