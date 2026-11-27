import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { PackingPlanService } from '../src/modules/packing/packing-plan.service';
import { PackingPlan, PackingPlanDocument } from '../src/modules/packing/schemas/packing-plan.schema';

/**
 * ===================================================================
 * AOFP-347 (27/11/2026) — tính lại kế hoạch `ready` theo danh mục thùng mới
 * ===================================================================
 * Kế hoạch không tự tính lại khi danh mục đổi. Gọi đúng luồng "Tính lại"
 * (PackingPlanService.recompute) rồi CHỜ CP-SAT xong cho mọi kế hoạch đang
 * `ready`. Kế hoạch đã duyệt / đang đóng / đã đóng không đụng tới. In thùng +
 * lấp đầy trước → sau để đối chiếu.
 *
 *   npx ts-node -r dotenv/config scripts/recompute-ready-plans.ts           (chạy thử)
 *   npx ts-node -r dotenv/config scripts/recompute-ready-plans.ts --apply   (ghi thật)
 * ===================================================================
 */
type Parcels = { parcels: { box: { code: string }; fill_ratio: number }[] } | null;
const describe = (p: Parcels): string =>
  (p?.parcels ?? []).map((q) => `${q.box.code} ${String(Math.round(q.fill_ratio * 100))}%`).join(' + ') || '—';

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const planModel = app.get<Model<PackingPlanDocument>>(getModelToken(PackingPlan.name));
  const service = app.get(PackingPlanService);

  const plans = await planModel.find({ is_active: true, status: 'ready' }).select('order_group_id version parcels.box.code parcels.fill_ratio').lean();
  console.log(`${String(plans.length)} kế hoạch ready${apply ? '' : ' (chạy thử — thêm --apply để ghi)'}.`);

  let failed = 0;
  for (const p of plans) {
    const groupId = p.order_group_id.toString();
    const before = describe(p);
    if (!apply) {
      console.log(`  - nhóm ${groupId}: ${before}`);
      continue;
    }
    try {
      const { plan, tasks } = await service.recompute(groupId, { expected_version: p.version });
      await service.runCpSat(tasks);
      const fresh = await planModel.findById(plan._id).select('parcels.box.code parcels.fill_ratio').lean();
      console.log(`  ✓ nhóm ${groupId}: ${before}  →  ${describe(fresh)}`);
    } catch (error: unknown) {
      failed += 1;
      console.log(`  ✗ nhóm ${groupId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await app.close();
  if (failed > 0) process.exitCode = 1;
}

void run();
