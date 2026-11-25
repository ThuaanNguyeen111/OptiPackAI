import { strict as assert } from 'assert';
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import mongoose, { type Types } from 'mongoose';
import type { PackableItem } from '../src/common/interfaces/packaging.interface';
import type { BoxSpec } from '../src/modules/packaging/engine/types';

/**
 * ===================================================================
 * Xuất đơn thật thành bộ kiểm thử đóng gói (24/11/2026)
 * ===================================================================
 * CHỈ ĐỌC DB. Mỗi bài giải của kế hoạch mới nhất (1 đơn, hoặc nhiều đơn AURELLE cùng
 * người nhận — `share_group`) thành 1 case cùng định dạng `v1.jsonl`, `source: "production"`.
 * Số món lấy từ placements của kế hoạch; hồ sơ SKU lấy từ product_master HIỆN TẠI (không phải
 * lúc đóng). Bài có SKU chưa `ready` bị bỏ và được đếm.
 * Ẩn danh: không mã đơn, không shop, SKU và nhóm đơn đổi thành mã băm ngắn.
 * Chưa có túi niêm phong: `dataset:packing` chỉ giải bằng thùng carton.
 *
 * Chạy:  npx ts-node --transpile-only -r dotenv/config scripts/export-real-orders.ts [--out=...]
 * ===================================================================
 */

const DEFAULT_OUT = 'scripts/datasets/packing/real-v1.jsonl';

interface PlanRow {
  order_group_id: Types.ObjectId;
  solver?: { options?: { prefer?: string; fragile_cushion_mm?: number } };
  parcels: {
    order_id: Types.ObjectId;
    share_group?: string | null;
    placements: { sku: string }[];
  }[];
}

interface GroupRow {
  _id: Types.ObjectId;
  platform: string;
  shop_id: string;
}

interface ProfileRow {
  seller_sku: string;
  platform: string;
  shop_id: string;
  packaging_profile_status?: string;
  is_fragile?: boolean;
  orientation_rule?: 'any' | 'upright_only';
  max_stack_load_kg?: number | null;
  product_category?: string | null;
  zip_bag_code?: string | null;
  zip_bag_folded?: boolean;
  can_fold_in_half?: boolean;
  dimension?: {
    package_length_cm?: number;
    package_width_cm?: number;
    package_height_cm?: number;
    package_weight_kg?: number;
  };
}

interface MaterialRow {
  code: string;
  name: string;
  inner: { length_mm: number; width_mm: number; height_mm: number };
  outer: { length_mm: number; width_mm: number; height_mm: number };
  tare_g: number;
  max_load_g: number;
  unit_cost_vnd: number | null;
}

const hash = (prefix: string, value: string): string =>
  `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 8)}`;

/** 70/15/15 theo nhóm đơn (không theo kiện) — cùng nhóm luôn cùng split. */
function splitOf(groupKey: string): 'train' | 'validation' | 'test' {
  const n =
    parseInt(
      createHash('sha256').update(groupKey).digest('hex').slice(0, 8),
      16,
    ) % 100;
  return n < 70 ? 'train' : n < 85 ? 'validation' : 'test';
}

interface Skipped {
  not_ready: number;
  empty: number;
}

/** Kế hoạch → các case (mỗi share_group hoặc mỗi đơn một case); SKU chưa `ready` thì bỏ cả bài. */
function planCases(
  plan: PlanRow,
  group: GroupRow,
  profiles: Map<string, ProfileRow>,
  boxes: BoxSpec[],
  skipped: Skipped,
): unknown[] {
  const cases: unknown[] = [];
  const buckets = new Map<string, Map<string, number>>();
  for (const parcel of plan.parcels) {
    const key = parcel.share_group ?? parcel.order_id.toString();
    const counts = buckets.get(key) ?? new Map<string, number>();
    for (const p of parcel.placements)
      counts.set(p.sku, (counts.get(p.sku) ?? 0) + 1);
    buckets.set(key, counts);
  }
  for (const [bucketKey, counts] of [...buckets].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (counts.size === 0) {
      skipped.empty += 1;
      continue;
    }
    const items: PackableItem[] = [];
    for (const [sku, quantity] of [...counts].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const p = profiles.get(`${group.platform}|${group.shop_id}|${sku}`);
      const d = p?.dimension;
      if (
        p?.packaging_profile_status !== 'ready' ||
        !d?.package_length_cm ||
        !d.package_width_cm ||
        !d.package_height_cm ||
        d.package_weight_kg === undefined
      )
        break;
      items.push({
        sku: hash('SKU', `${group.shop_id}|${sku}`),
        quantity,
        length_cm: d.package_length_cm,
        width_cm: d.package_width_cm,
        height_cm: d.package_height_cm,
        weight_kg: d.package_weight_kg,
        is_fragile: p.is_fragile ?? false,
        orientation_rule: p.orientation_rule ?? 'any',
        max_stack_load_kg: p.max_stack_load_kg ?? null,
        product_category: p.product_category ?? null,
        zip_bag_code: p.zip_bag_code ?? null,
        zip_bag_folded: p.zip_bag_folded ?? false,
        can_fold_in_half: p.can_fold_in_half ?? false,
      });
    }
    if (items.length !== counts.size) {
      skipped.not_ready += 1;
      continue;
    }
    const groupKey = hash('GRP', plan.order_group_id.toString());
    const prefer =
      plan.solver?.options?.prefer === 'cheapest'
        ? 'cheapest'
        : 'fewest_parcels';
    cases.push({
      schema_version: 1,
      id: `${groupKey}-${hash('B', bucketKey).slice(2)}`,
      group_id: groupKey,
      source: 'production',
      split: splitOf(groupKey),
      generated_seed: 0,
      expected: { all_items_placed: true },
      input: {
        items,
        boxes,
        solver_options: {
          prefer,
          fragile_cushion_mm: plan.solver?.options?.fragile_cushion_mm ?? 0,
        },
      },
    });
  }
  return cases;
}

/** Tự kiểm không cần DB: gộp theo share_group, đếm số món, bỏ bài có SKU chưa ready, không lộ mã gốc. */
function selfCheck(): void {
  const oid = (h: string): Types.ObjectId =>
    new mongoose.Types.ObjectId(h.padStart(24, '0'));
  const group: GroupRow = {
    _id: oid('1'),
    platform: 'aurelle',
    shop_id: 'SHOP-1',
  };
  const ready = (sku: string): ProfileRow => ({
    seller_sku: sku,
    platform: 'aurelle',
    shop_id: 'SHOP-1',
    packaging_profile_status: 'ready',
    dimension: {
      package_length_cm: 30,
      package_width_cm: 20,
      package_height_cm: 2,
      package_weight_kg: 0.3,
    },
  });
  const profiles = new Map(
    [
      ready('AO-1'),
      ready('QUAN-1'),
      { ...ready('GIAY-1'), packaging_profile_status: 'needs_measurement' },
    ].map((p) => [`aurelle|SHOP-1|${p.seller_sku}`, p]),
  );
  const plan: PlanRow = {
    order_group_id: oid('1'),
    parcels: [
      {
        order_id: oid('a'),
        share_group: 'G1',
        placements: [{ sku: 'AO-1' }, { sku: 'AO-1' }],
      },
      {
        order_id: oid('b'),
        share_group: 'G1',
        placements: [{ sku: 'QUAN-1' }],
      },
      { order_id: oid('c'), placements: [{ sku: 'GIAY-1' }] },
    ],
  };
  const skipped = { not_ready: 0, empty: 0 };
  const out = planCases(plan, group, profiles, [], skipped);
  assert.equal(
    out.length,
    1,
    'đơn c có SKU chưa ready phải bị bỏ, đơn a+b gộp một bài',
  );
  assert.equal(skipped.not_ready, 1);
  const text = JSON.stringify(out);
  assert.match(text, /"quantity":2/);
  for (const secret of ['SHOP-1', 'AO-1', 'QUAN-1', oid('1').toString()])
    assert.ok(!text.includes(secret), `lộ ${secret}`);
}

async function main(): Promise<void> {
  selfCheck();
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu MONGODB_URI.');
  const out =
    process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? DEFAULT_OUT;
  await mongoose.connect(uri);
  const db = mongoose.connection;

  const materials = await db
    .collection('packaging_materials')
    .find({
      kind: 'box',
      is_active: true,
      inner: { $ne: null },
      outer: { $ne: null },
      tare_g: { $ne: null },
      max_load_g: { $ne: null },
    })
    .project<MaterialRow>({
      code: 1,
      name: 1,
      inner: 1,
      outer: 1,
      tare_g: 1,
      max_load_g: 1,
      unit_cost_vnd: 1,
    })
    .toArray();
  // Giống PackagingBoxService.listActiveSpecs: sàn cắt hạ = lòng thùng thấp nhất (ADR 0002).
  const floor = Math.min(...materials.map((m) => m.inner.height_mm));
  const boxes: BoxSpec[] = materials
    .map((m) => ({
      code: m.code,
      name: m.code,
      inner: {
        length_mm: m.inner.length_mm,
        width_mm: m.inner.width_mm,
        height_mm: m.inner.height_mm,
      },
      outer: {
        length_mm: m.outer.length_mm,
        width_mm: m.outer.width_mm,
        height_mm: m.outer.height_mm,
      },
      tare_g: m.tare_g,
      max_load_g: m.max_load_g,
      price_vnd: m.unit_cost_vnd,
      min_cut_height_mm: floor,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
  if (boxes.length === 0) throw new Error('Không có thùng đang dùng đủ số đo.');

  const plans = await db
    .collection<PlanRow>('packing_plans')
    .aggregate<PlanRow>([
      { $sort: { order_group_id: 1, revision: -1 } },
      { $group: { _id: '$order_group_id', plan: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$plan' } },
      {
        $project: {
          order_group_id: 1,
          'solver.options': 1,
          'parcels.order_id': 1,
          'parcels.share_group': 1,
          'parcels.placements.sku': 1,
        },
      },
      { $sort: { order_group_id: 1 } },
    ])
    .toArray();
  const groups = new Map(
    (
      await db
        .collection<GroupRow>('order_groups')
        .find({ _id: { $in: plans.map((p) => p.order_group_id) } })
        .project<GroupRow>({ platform: 1, shop_id: 1 })
        .toArray()
    ).map((g) => [g._id.toString(), g]),
  );
  const profiles = new Map(
    (
      await db
        .collection<ProfileRow>('product_master')
        .find({
          seller_sku: {
            $in: [
              ...new Set(
                plans.flatMap((p) =>
                  p.parcels.flatMap((q) => q.placements.map((x) => x.sku)),
                ),
              ),
            ],
          },
        })
        .toArray()
    ).map((p) => [`${p.platform}|${p.shop_id}|${p.seller_sku}`, p]),
  );

  const cases: unknown[] = [];
  const skipped = { no_group: 0, not_ready: 0, empty: 0 };
  for (const plan of plans) {
    const group = groups.get(plan.order_group_id.toString());
    if (!group) skipped.no_group += 1;
    else cases.push(...planCases(plan, group, profiles, boxes, skipped));
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${cases.map((c) => JSON.stringify(c)).join('\n')}\n`);
  console.log(
    JSON.stringify(
      {
        plans: plans.length,
        cases: cases.length,
        skipped,
        boxes: boxes.map((b) => b.code),
        out,
      },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  await mongoose.disconnect();
  process.exitCode = 1;
});
