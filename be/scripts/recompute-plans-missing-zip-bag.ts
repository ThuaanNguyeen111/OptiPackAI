import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { FLAT_CATEGORIES } from '../src/modules/packaging/engine/units';
import { PackingPlanService } from '../src/modules/packing/packing-plan.service';
import { PackingPlan, PackingPlanDocument } from '../src/modules/packing/schemas/packing-plan.schema';

/**
 * ===================================================================
 * TÍNH LẠI 1 LẦN — 16/11/2026: kế hoạch tính trước AOFP-301 thiếu túi zip cho quần áo
 * ===================================================================
 * Kế hoạch đang `ready` có món quần áo mà `item_profiles.zip_bag_code` = null → gọi đúng
 * luồng "Tính lại" (PackingPlanService.recompute) rồi CHỜ CP-SAT xong (không chạy nền,
 * vì script thoát ngay sau đó). Kế hoạch đã duyệt / đang đóng / đã đóng không đụng tới.
 *
 *   npx ts-node -r dotenv/config scripts/recompute-plans-missing-zip-bag.ts           (chạy thử)
 *   npx ts-node -r dotenv/config scripts/recompute-plans-missing-zip-bag.ts --apply   (ghi thật)
 * ===================================================================
 */
async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const planModel = app.get<Model<PackingPlanDocument>>(getModelToken(PackingPlan.name));
  const service = app.get(PackingPlanService);

  const plans = await planModel
    .find({
      is_active: true,
      status: 'ready',
      item_profiles: { $elemMatch: { zip_bag_code: null, product_category: { $in: [...FLAT_CATEGORIES] } } },
    })
    .select('order_group_id version')
    .lean();
  console.log(`${plans.length} kế hoạch cần tính lại${apply ? '' : ' (chạy thử — thêm --apply để ghi)'}.`);

  let failed = 0;
  for (const p of plans) {
    const groupId = p.order_group_id.toString();
    if (!apply) {
      console.log(`  - nhóm ${groupId}`);
      continue;
    }
    try {
      const { plan, tasks } = await service.recompute(groupId, { expected_version: p.version });
      await service.runCpSat(tasks);
      const fresh = await planModel.findById(plan._id).select('item_profiles').lean();
      const bags = fresh?.item_profiles.map((i) => `${i.sku}=${i.zip_bag_code ?? '—'}`).join(', ');
      console.log(`  ✓ nhóm ${groupId}: ${bags ?? ''}`);
    } catch (error: unknown) {
      failed += 1;
      console.log(`  ✗ nhóm ${groupId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await app.close();
  if (failed > 0) process.exitCode = 1;
}

void run();
