import { MarketplaceSkuMapping, MarketplaceSkuMappingSchema } from '../master-skus/schemas/marketplace-sku-mapping.schema';
import { InventoryMovement, InventoryMovementSchema } from './schemas/inventory-movement.schema';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Warehouse, WarehouseSchema } from './schemas/warehouse.schema';
import { WarehouseZone, WarehouseZoneSchema } from './schemas/warehouse-zone.schema';
import { BinLocation, BinLocationSchema } from './schemas/bin-location.schema';
import { SkuBinAssignment, SkuBinAssignmentSchema } from './schemas/sku-bin-assignment.schema';
import { ProductMaster, ProductMasterSchema } from '../product-master/schemas/product-master.schema';
import { WarehouseService } from './warehouse.service';
import { WarehouseController } from './warehouse.controller';
import { OrderGroupsModule } from '../order-groups/order-groups.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InventoryMovement.name, schema: InventoryMovementSchema }, // K3
      { name: MarketplaceSkuMapping.name, schema: MarketplaceSkuMappingSchema }, // K4b
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: WarehouseZone.name, schema: WarehouseZoneSchema },
      { name: BinLocation.name, schema: BinLocationSchema },
      { name: SkuBinAssignment.name, schema: SkuBinAssignmentSchema },
      { name: ProductMaster.name, schema: ProductMasterSchema },
    ]),
    CategoriesModule, // K2 — kiểm tra danh mục/size khi tạo kệ, đăng ký ô
    OrderGroupsModule, // export OrderGroupsService — dùng getPackableItemsForGroup() cho picking-list
  ],
  controllers: [WarehouseController],
  providers: [WarehouseService],
  exports: [WarehouseService],
})
export class WarehouseModule {}
