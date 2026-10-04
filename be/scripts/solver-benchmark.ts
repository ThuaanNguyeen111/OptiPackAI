import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { expandToUnits } from '../src/modules/packaging/engine/units';
import { packIntoMultipleCartons } from '../src/modules/packaging/engine/multi-carton-packer';
import {
  item,
  sampleBoxes,
  shoebox,
  sunglasses,
  tee,
  jean,
} from '../src/modules/packaging/engine/scenarios/order-scenarios';
import { solveOrder } from '../src/modules/packing/solver';
import type { PackableItem } from '../src/common/interfaces/packaging.interface';
import { generateOrder, mulberry32, pickUnitCount } from './benchmark-orders';

/**
 * ===================================================================
 * SO SÁNH ENGINE CŨ (ep-3d-v3) vs BỘ GIẢI MỚI (BRKGA + EMS) — từng đơn
 * ===================================================================
 *   npx ts-node --transpile-only scripts/solver-benchmark.ts
 *   npx ts-node --transpile-only scripts/solver-benchmark.ts --orders=1000 --stratified
 *   ... --out=scripts/benchmark-results/solver-v1.json
 * So theo bậc: món không xếp được → số kiện → giá thùng. In thắng/hòa/thua,
 * tỷ lệ nhãn chứng minh, độ trễ theo cỡ đơn, kiểm tra xác định (chạy 2 lần),
 * và bộ ca đối kháng. Không dùng vật tư (để hai engine so cùng thước đo).
 * ===================================================================
 */

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  return process.argv.includes(`--${name}`) ? 'true' : fallback;
}

const ORDERS = Number(arg('orders', '300'));
const SEED = Number(arg('seed', '20260930'));
const CUSHION = Number(arg('cushion', '5'));
const STRATIFIED = arg('stratified') === 'true';

interface Score {
  unplaced: number;
  parcels: number;
  cost: number;
}

const bucketOf = (n: number): string =>
  n <= 3 ? '1-3' : n <= 8 ? '4-8' : n <= 20 ? '9-20' : '21+';

function scoreOld(items: PackableItem[]): Score & { ms: number } {
  const t = Date.now();
  const plan = packIntoMultipleCartons(
    expandToUnits(items, { fragileCushionMm: CUSHION }),
    sampleBoxes(),
  );
  return {
    unplaced: plan.unplaced.length,
    parcels: plan.cartons.length,
    cost: plan.cartons.reduce((s, c) => s + (c.box.price_vnd ?? 0), 0),
    ms: Date.now() - t,
  };
}

function runNew(items: PackableItem[]): ReturnType<typeof solveOrder> {
  return solveOrder(
    expandToUnits(items, { fragileCushionMm: CUSHION }),
    sampleBoxes(),
  );
}

function cmp(a: Score, b: Score): number {
  return a.unplaced - b.unplaced || a.parcels - b.parcels || a.cost - b.cost;
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))] ?? 0;
}

/** Đơn phân tầng: đảm bảo đủ đơn lớn để đo (≥ 100 đơn 9-20 và 21+ khi --stratified). */
function buildOrders(): PackableItem[][] {
  const rand = mulberry32(SEED);
  const orders: PackableItem[][] = [];
  for (let i = 0; i < ORDERS; i += 1) orders.push(generateOrder(rand));
  if (!STRATIFIED) return orders;
  const count = (lo: number, hi: number): number =>
    orders.filter((o) => {
      const n = o.reduce((s, it) => s + it.quantity, 0);
      return n >= lo && n <= hi;
    }).length;
  let guard = 0;
  while ((count(9, 20) < 100 || count(21, 60) < 100) && guard < 100_000) {
    guard += 1;
    const o = generateOrder(rand);
    const n = o.reduce((s, it) => s + it.quantity, 0);
    if ((n >= 9 && n <= 20 && count(9, 20) < 100) || (n >= 21 && count(21, 60) < 100))
      orders.push(o);
  }
  void pickUnitCount;
  return orders;
}

const ADVERSARIAL: { name: string; items: PackableItem[] }[] = [
  { name: 'Áo vắt qua 2 hộp giày', items: [shoebox(2), tee(1)] },
  { name: 'Toàn hàng dễ vỡ', items: [sunglasses(6)] },
  { name: 'Chỉ vừa khi gập', items: [item('LONG', [52, 20, 2], 0.4, { qty: 1, category: 'trousers', stackKg: 5, fold: true })] },
  { name: '8 hộp giày không chồng được', items: [shoebox(8)] },
  { name: '200 món nhỏ', items: [item('CUBE', [6, 6, 6], 0.05, { qty: 200, stackKg: 5 })] },
  { name: 'Áo + quần + giày + kính', items: [tee(5), jean(3), shoebox(2), sunglasses(2)] },
];

const orders = buildOrders();
let wins = 0;
let ties = 0;
let losses = 0;
const lossExamples: string[] = [];
const labels: Record<string, number> = {};
const strategies: Record<string, number> = {};
const newMs = new Map<string, number[]>();
const oldMs: number[] = [];
let parcelsOld = 0;
let parcelsNew = 0;
let costOld = 0;
let costNew = 0;

for (const [i, items] of orders.entries()) {
  const n = items.reduce((s, it) => s + it.quantity, 0);
  const old = scoreOld(items);
  oldMs.push(old.ms);
  const res = runNew(items);
  const neu: Score = {
    unplaced: res.unplaced.length,
    parcels: res.parcels.length,
    cost: res.parcels.reduce((s, p) => s + (p.box.price_vnd ?? 0), 0),
  };
  const c = cmp(neu, old);
  if (c < 0) wins += 1;
  else if (c === 0) ties += 1;
  else {
    losses += 1;
    if (lossExamples.length < 10)
      lossExamples.push(
        `#${String(i)} (${String(n)} món): mới ${String(neu.parcels)} kiện/${String(neu.cost)}đ vs cũ ${String(old.parcels)}/${String(old.cost)}đ — ${items.map((it) => `${it.sku}x${String(it.quantity)}`).join(' ')}`,
      );
  }
  labels[res.proof] = (labels[res.proof] ?? 0) + 1;
  strategies[res.strategy] = (strategies[res.strategy] ?? 0) + 1;
  const list = newMs.get(bucketOf(n)) ?? [];
  list.push(res.stats.computation_ms);
  newMs.set(bucketOf(n), list);
  if (old.unplaced === 0) {
    parcelsOld += old.parcels;
    costOld += old.cost;
  }
  if (neu.unplaced === 0) {
    parcelsNew += neu.parcels;
    costNew += neu.cost;
  }
}

// Xác định: chạy lại 50 đơn đầu, so toàn bộ tọa độ.
let deterministic = true;
for (const items of orders.slice(0, 50)) {
  const a = JSON.stringify(runNew(items).parcels.map((p) => [p.box.code, p.placements]));
  const b = JSON.stringify(runNew(items).parcels.map((p) => [p.box.code, p.placements]));
  if (a !== b) deterministic = false;
}

const adversarial = ADVERSARIAL.map((c) => {
  const old = scoreOld(c.items);
  const res = runNew(c.items);
  return {
    name: c.name,
    old: `${String(old.parcels)} kiện / ${String(old.cost)}đ${old.unplaced ? ` / ${String(old.unplaced)} sót` : ''}`,
    new: `${String(res.parcels.length)} kiện / ${String(res.parcels.reduce((s, p) => s + (p.box.price_vnd ?? 0), 0))}đ${res.unplaced.length ? ` / ${String(res.unplaced.length)} sót` : ''}`,
    proof: res.proof,
    ms: res.stats.computation_ms,
  };
});

const all = [...newMs.values()].flat();
const report = {
  orders: orders.length,
  wins,
  ties,
  losses,
  avgParcels: { old: +(parcelsOld / orders.length).toFixed(3), new: +(parcelsNew / orders.length).toFixed(3) },
  avgBoxCost: { old: Math.round(costOld / orders.length), new: Math.round(costNew / orders.length) },
  proofLabels: labels,
  strategies,
  latencyMs: {
    oldP95: percentile(oldMs, 95),
    newP50: percentile(all, 50),
    newP95: percentile(all, 95),
    newMax: Math.max(...all),
    byBucket: Object.fromEntries(
      [...newMs.entries()].map(([k, v]) => [k, { n: v.length, p95: percentile(v, 95), max: Math.max(...v) }]),
    ),
  },
  deterministic,
  lossExamples,
  adversarial,
};
console.log(JSON.stringify(report, null, 2));
const out = arg('out');
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2));
}
