import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PackagingMaterial, PackagingMaterialSchema } from './schemas/packaging-material.schema';
import { PackagingMovement, PackagingMovementSchema } from './schemas/packaging-movement.schema';
import { PackagingRecommendationDoc, PackagingRecommendationSchema } from '../packaging/schemas/packaging-recommendation.schema';
import { PackagingMaterialsService } from './packaging-materials.service';
import { PackagingMaterialsController } from './packaging-materials.controller';

// G4 (27/09/2026). KHÔNG import module nào khác (chỉ đọc schema gợi ý đóng gói)
// -> order-groups và shipments import được mà không sinh phụ thuộc vòng.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PackagingMaterial.name, schema: PackagingMaterialSchema },
      { name: PackagingMovement.name, schema: PackagingMovementSchema },
      { name: PackagingRecommendationDoc.name, schema: PackagingRecommendationSchema },
    ]),
  ],
  controllers: [PackagingMaterialsController],
  providers: [PackagingMaterialsService],
  exports: [PackagingMaterialsService],
})
export class PackagingMaterialsModule {}
