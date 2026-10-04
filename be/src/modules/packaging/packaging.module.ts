import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PackingPlan, PackingPlanSchema } from '../packing/schemas/packing-plan.schema';
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

/**
 * Danh mục thùng / túi zip / vật tư chèn + tồn kho + hướng dẫn AI.
 * (04/10/2026) Luồng phương án cũ (`packaging_recommendations`, route
 * `order-groups/:id/packaging/*`) đã chuyển sang module `packing/`
 * (`packing_plans`). Schema PackingPlan đăng ký ở đây CHỈ để tính giữ chỗ
 * thùng (listAvailability) — không import PackingModule (tránh vòng).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PackingPlan.name, schema: PackingPlanSchema },
      { name: PackagingBox.name, schema: PackagingBoxSchema },
      { name: PackagingBag.name, schema: PackagingBagSchema },
      { name: PackagingStockMovement.name, schema: PackagingStockMovementSchema },
      { name: PackagingMaterial.name, schema: PackagingMaterialSchema },
      { name: PackagingMaterialMovement.name, schema: PackagingMaterialMovementSchema },
      { name: PackagingMaterialRules.name, schema: PackagingMaterialRulesSchema },
    ]),
  ],
  controllers: [
    PackagingBoxController,
    PackagingBagController,
    PackagingMaterialController,
  ],
  providers: [
    PackagingBoxService,
    PackagingBagService,
    PackagingMaterialService,
    PackingGuideAiService,
  ],
  exports: [PackagingBoxService, PackagingBagService, PackagingMaterialService, PackingGuideAiService],
})
export class PackagingModule {}
