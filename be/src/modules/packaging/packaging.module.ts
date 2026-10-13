import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PackingPlan, PackingPlanSchema } from '../packing/schemas/packing-plan.schema';
import { PackagingBoxService } from './packaging-box.service';
import { PackagingBoxController } from './packaging-box.controller';
import { PackingGuideAiService } from './packing-guide-ai.service';
import { PackagingBag, PackagingBagSchema } from './schemas/packaging-bag.schema';
import { PackagingBagService } from './packaging-bag.service';
import { PackagingBagController } from './packaging-bag.controller';
// Kho vật tư CHUNG (gộp main + thi_dev 04/10/2026) — thùng + vật tư chèn.
import {
  PackagingMaterial,
  PackagingMaterialSchema,
} from '../packaging-materials/schemas/packaging-material.schema';
import {
  PackagingMovement,
  PackagingMovementSchema,
} from '../packaging-materials/schemas/packaging-movement.schema';
import { PackagingMaterialsModule } from '../packaging-materials/packaging-materials.module';
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
      { name: PackagingBag.name, schema: PackagingBagSchema },
      { name: PackagingMaterial.name, schema: PackagingMaterialSchema },
      { name: PackagingMovement.name, schema: PackagingMovementSchema },
      { name: PackagingMaterialRules.name, schema: PackagingMaterialRulesSchema },
    ]),
    PackagingMaterialsModule, // trừ tồn/nhập hàng dùng chung (consumeForParcels, stockInById)
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
