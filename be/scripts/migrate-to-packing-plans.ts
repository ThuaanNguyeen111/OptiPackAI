import { NestFactory } from '@nestjs/core';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Connection, Model, Types } from 'mongoose';
import { AppModule } from '../src/app.module';
import {
  PackingPlan,
  PackingPlanDocument,
  type PackingPlanStatus,
  type PlanOrder,
  type PlanParcel,
} from '../src/modules/packing/schemas/packing-plan.schema';
import { renumberParcels } from '../src/modules/packing/utils/parcels.util';

/**
 * ===================================================================
 * Chuyển `packaging_recommendations` (1 bản/đơn) → `packing_plans` (1 bản/nhóm)
 * ===================================================================
 *   npx ts-node -r tsconfig-paths/register scripts/migrate-to-packing-plans.ts           # chạy thử, KHÔNG ghi
 *   npx ts-node -r tsconfig-paths/register scripts/migrate-to-packing-plans.ts --apply   # ghi thật
 *
 * - Chỉ đọc các phương án cũ ĐANG HOẠT ĐỘNG (is_active: true), gom theo nhóm.
 * - Bỏ qua nhóm đã có kế hoạch mới đang hoạt động (chạy lại nhiều lần an toàn).
 * - Trạng thái: có kiện đã đóng → packed; mọi đơn đã duyệt → approved; còn lại → ready.
 * - Nhãn chứng minh luôn `heuristic` (engine cũ không chứng minh tối ưu).
 * - KHÔNG sửa/xóa collection cũ — giữ làm lịch sử.
 * ===================================================================
 */

interface LegacyDims {
  length_mm: number;
  width_mm: number;
  height_mm: number;
}
interface LegacyCarton {
  index: number;
  box_code: string;
  box_name: string | null;
  box_inner_mm: LegacyDims;
  box_outer_mm: LegacyDims;
  placements: Record<string, unknown>[];
  fill_ratio: number;
  items_weight_g: number;
  estimated_package_weight_g: number;
  volumetric_weight_g: number;
  materials: { type: string; code: string | null; name: string | null; unit: string | null; quantity: number; weight_g: number; cost_vnd: number }[];
  materials_weight_g: number;
  materials_cost_vnd: number;
  actual_measured_weight_kg: number | null;
  is_abnormal: boolean;
  packing_guide: Record<string, unknown> | null;
}
interface LegacyRec extends Partial<LegacyCarton> {
  _id: Types.ObjectId;
  order_group_id: Types.ObjectId;
  order_id: Types.ObjectId | null;
  platform_order_id: string | null;
  solution_status: 'ok' | 'no_fit';
  no_fit_reasons?: { item_key?: string; code?: string; reason: string }[];
  cartons?: LegacyCarton[];
  item_profiles?: { sku: string; product_category: string | null; zip_bag_code: string | null; zip_bag_folded: boolean }[];
  approval_status: string;
  approved_by?: Types.ObjectId | null;
  approved_at?: Date | null;
  packed_at?: Date | null;
  packed_by?: Types.ObjectId | null;
  engine_version?: string | null;
  computation_time_ms?: number;
  lower_bound_cartons?: number | null;
  estimated_shipping_cost_vnd?: number | null;
  packing_guide?: Record<string, unknown> | null;
  created_at?: Date;
}
interface BoxRow {
  code: string;
  tare_g: number;
  max_load_g: number;
  price_vnd: number | null;
}

function cartonsOf(rec: LegacyRec): LegacyCarton[] {
  if (rec.cartons && rec.cartons.length > 0) return rec.cartons;
  if (rec.solution_status !== 'ok' || !rec.box_code || !rec.box_inner_mm || !rec.box_outer_mm) return [];
  return [
    {
      index: 0,
      box_code: rec.box_code,
      box_name: rec.box_name ?? null,
      box_inner_mm: rec.box_inner_mm,
      box_outer_mm: rec.box_outer_mm,
      placements: rec.placements ?? [],
      fill_ratio: rec.fill_ratio ?? 0,
      items_weight_g: rec.items_weight_g ?? 0,
      estimated_package_weight_g: rec.estimated_package_weight_g ?? 0,
      volumetric_weight_g: rec.volumetric_weight_g ?? 0,
      materials: rec.materials ?? [],
      materials_weight_g: rec.materials_weight_g ?? 0,
      materials_cost_vnd: rec.materials_cost_vnd ?? 0,
      actual_measured_weight_kg: rec.actual_measured_weight_kg ?? null,
      is_abnormal: rec.is_abnormal ?? false,
      packing_guide: rec.packing_guide ?? null,
    },
  ];
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  void app.get(SchedulerRegistry).getCronJob('packing-plan-auto-compute').stop();
  const connection = app.get<Connection>(getConnectionToken());
  const planModel = app.get<Model<PackingPlanDocument>>(getModelToken(PackingPlan.name));

  const legacy = (await connection
    .collection('packaging_recommendations')
    .find({ is_active: true })
    .toArray()) as unknown as LegacyRec[];
  const boxes = new Map(
    ((await connection.collection('packaging_boxes').find({}).toArray()) as unknown as BoxRow[]).map((b) => [
      b.code,
      b,
    ]),
  );

  const byGroup = new Map<string, LegacyRec[]>();
  for (const rec of legacy) {
    const key = rec.order_group_id.toString();
    byGroup.set(key, [...(byGroup.get(key) ?? []), rec]);
  }

  let migrated = 0;
  let skipped = 0;
  for (const [groupId, recs] of byGroup) {
    const groupObjectId = new Types.ObjectId(groupId);
    if (await planModel.exists({ order_group_id: groupObjectId, is_active: true })) {
      skipped += 1;
      continue;
    }
    // Bản ghi cũ trước 21/09 (order_id null) không gắn được đơn → bỏ qua, ghi log.
    const usable = recs.filter((r) => r.order_id !== null);
    if (usable.length === 0) {
      console.log(`- Nhóm ${groupId}: chỉ có phương án rất cũ không có order_id — bỏ qua.`);
      skipped += 1;
      continue;
    }
    usable.sort((a, b) => (a.created_at?.getTime() ?? 0) - (b.created_at?.getTime() ?? 0));

    const parcels: PlanParcel[] = [];
    for (const rec of usable) {
      const orderId = rec.order_id;
      if (!orderId) continue;
      const cartons = cartonsOf(rec);
      for (const c of cartons) {
        const box = boxes.get(c.box_code);
        parcels.push({
          parcel_no: parcels.length + 1,
          order_id: orderId,
          platform_order_id: rec.platform_order_id,
          box: {
            code: c.box_code,
            name: c.box_name ?? c.box_code,
            inner_mm: c.box_inner_mm,
            outer_mm: c.box_outer_mm,
            tare_g: box?.tare_g ?? 0,
            max_load_g: box?.max_load_g ?? 0,
            price_vnd: box?.price_vnd ?? null,
          },
          placements: c.placements as unknown as PlanParcel['placements'],
          fill_ratio: c.fill_ratio,
          items_weight_g: c.items_weight_g,
          estimated_weight_g: c.estimated_package_weight_g,
          volumetric_weight_g: c.volumetric_weight_g,
          materials: c.materials.map((m) => ({
            type: m.type,
            code: m.code,
            name: m.name ?? m.type,
            unit: m.unit ?? 'cái',
            quantity: m.quantity,
            weight_g: m.weight_g,
            cost_vnd: m.cost_vnd,
          })),
          materials_weight_g: c.materials_weight_g,
          materials_cost_vnd: c.materials_cost_vnd,
          shipping_cost_vnd: cartons.length === 1 ? (rec.estimated_shipping_cost_vnd ?? null) : null,
          guide: (c.packing_guide as unknown as PlanParcel['guide']) ?? null,
          actual_weight_kg: c.actual_measured_weight_kg,
          is_abnormal: c.is_abnormal,
          materials_shortfall: [],
        });
      }
    }

    const packed = usable.some((r) => r.packed_at);
    const allApproved = usable.every((r) => r.approval_status === 'approved' || r.approval_status === 'adjusted');
    const status: PackingPlanStatus = packed ? 'packed' : allApproved ? 'approved' : 'ready';
    const orderIds = usable.flatMap((r) => (r.order_id ? [r.order_id] : []));
    const profiles = new Map(usable.flatMap((r) => r.item_profiles ?? []).map((p) => [p.sku, p]));

    const orders: PlanOrder[] = usable.flatMap((r) =>
      r.order_id
        ? [
            {
              order_id: r.order_id,
              platform_order_id: r.platform_order_id,
              status: r.solution_status === 'ok' ? ('ok' as const) : ('no_fit' as const),
              unplaced: (r.no_fit_reasons ?? []).map((n) => ({
                item_key: n.item_key ?? '-',
                code: n.code ?? 'NO_ARRANGEMENT',
                reason: n.reason,
              })),
              proof: 'heuristic' as const,
              lower_bound_parcels: r.lower_bound_cartons ?? 0,
              explanation: [`Chuyển từ phương án cũ (engine ${r.engine_version ?? 'legacy'}) — chưa chứng minh tối ưu.`],
              strategy: 'legacy',
              cp_sat: 'skipped' as const,
            },
          ]
        : [],
    );
    const doc = {
      order_group_id: groupObjectId,
      revision: 1,
      version: 1,
      is_active: true,
      status,
      orders,
      parcels: renumberParcels(parcels, orderIds),
      item_profiles: [...profiles.values()],
      adjustments: [],
      solver: {
        engine_version: usable[0]?.engine_version ?? 'legacy',
        computation_ms: usable.reduce((s, r) => s + (r.computation_time_ms ?? 0), 0),
        options: { exclude_box_codes: [] as string[], prefer: 'fewest_parcels' as const },
      },
      approved_by: allApproved ? (usable[0]?.approved_by ?? null) : null,
      approved_at: allApproved ? (usable[0]?.approved_at ?? null) : null,
      packed_by: packed ? (usable.find((r) => r.packed_by)?.packed_by ?? null) : null,
      packed_at: packed ? (usable.find((r) => r.packed_at)?.packed_at ?? null) : null,
    };
    console.log(
      `- Nhóm ${groupId}: ${String(usable.length)} đơn, ${String(parcels.length)} kiện → ${status}${apply ? '' : ' (chạy thử)'}`,
    );
    if (apply) await planModel.create(doc);
    migrated += 1;
  }

  console.log(
    `\n${apply ? 'Đã chuyển' : 'Sẽ chuyển'} ${String(migrated)} nhóm; bỏ qua ${String(skipped)} nhóm (đã có kế hoạch mới hoặc dữ liệu quá cũ).`,
  );
  if (!apply) console.log('Chạy lại với --apply để ghi thật.');
  await app.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
