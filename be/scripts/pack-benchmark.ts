import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { expandToUnits } from '../src/modules/packaging/engine/units';
import { lowerBoundCartons } from '../src/modules/packaging/engine/lower-bound';
import { generateOrder, mulberry32 } from './benchmark-orders';
import {
  sampleBoxes,
  solve,
} from '../src/modules/packaging/engine/scenarios/order-scenarios';

/**
 * ===================================================================
 * BENCHMARK THUẬT TOÁN ĐÓNG GÓI (30/09/2026, Milestone 1)
 * ===================================================================
 * Sinh N đơn ngẫu nhiên (seed cố định → tái lập) theo phân bố gần shop
 * thật (đa số 1-3 món, đuôi dài tới 60), chạy qua `solve()` rồi in bảng:
 * thời gian p50/p95/max, % ok, số kiện, độ lấp đầy, chi phí thùng.
 *
 *   npx ts-node scripts/pack-benchmark.ts                     # in bảng
 *   npx ts-node scripts/pack-benchmark.ts --out=scripts/benchmark-results/baseline.json
 *   npx ts-node scripts/pack-benchmark.ts --compare=scripts/benchmark-results/baseline.json
 *
 * Tùy chọn: --orders=300 --seed=20260930
 * Không kết nối DB, không cần server.
 * ===================================================================
 */

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

type NumericMetric =
  | 'orders'
  | 'okPct'
  | 'noFitPct'
  | 'multiPct'
  | 'avgCartons'
  | 'avgFillRatio'
  | 'avgBoxCostVnd'
  | 'avgCostPerOrderVnd'
  | 'avgGapToLowerBound'
  | 'atLowerBoundPct'
  | 'timeP50Ms'
  | 'timeP95Ms'
  | 'timeMaxMs';

interface Metrics {
  orders: number;
  okPct: number;
  noFitPct: number;
  multiPct: number;
  avgCartons: number;
  avgFillRatio: number;
  avgBoxCostVnd: number;
  avgCostPerOrderVnd: number;
  /** Số kiện thực tế − cận dưới (thể tích/cân); 0 = chắc chắn tối ưu về số kiện. */
  avgGapToLowerBound: number;
  /** % đơn ok đạt đúng cận dưới (= tối ưu số kiện, có chứng minh). */
  atLowerBoundPct: number;
  timeP50Ms: number;
  timeP95Ms: number;
  timeMaxMs: number;
  byBucket: Record<
    string,
    { orders: number; okPct: number; avgCartons: number; p95Ms: number }
  >;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[Math.max(0, idx)] ?? 0;
}

const round = (n: number, d = 2): number => Math.round(n * 10 ** d) / 10 ** d;
const avg = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

function bucketOf(units: number): string {
  if (units <= 3) return '1-3';
  if (units <= 8) return '4-8';
  if (units <= 20) return '9-20';
  return '21+';
}

/** Đệm quanh món dễ vỡ (mm mỗi mặt) — mặc định như production (--cushion=0 để so với bản cũ). */
const cushion = Number(arg('cushion', '5'));

function run(orders: number, seed: number): Metrics {
  const rand = mulberry32(seed);
  const boxes = sampleBoxes();
  const times: number[] = [];
  const cartonCounts: number[] = [];
  const fills: number[] = [];
  const costs: number[] = [];
  const orderCosts: number[] = [];
  const gaps: number[] = [];
  let ok = 0;
  let multi = 0;
  const buckets = new Map<
    string,
    { n: number; ok: number; cartons: number[]; times: number[] }
  >();

  for (let i = 0; i < orders; i += 1) {
    const items = generateOrder(rand);
    const unitCount = items.reduce((s, it) => s + it.quantity, 0);
    const started = Date.now();
    const outcome = solve(items, boxes, { fragileCushionMm: cushion });
    const ms = Date.now() - started;
    times.push(ms);

    const b = buckets.get(bucketOf(unitCount)) ?? {
      n: 0,
      ok: 0,
      cartons: [],
      times: [],
    };
    b.n += 1;
    b.times.push(ms);
    if (outcome.status === 'ok') {
      ok += 1;
      b.ok += 1;
      b.cartons.push(outcome.cartons.length);
      cartonCounts.push(outcome.cartons.length);
      gaps.push(
        outcome.cartons.length -
          lowerBoundCartons(
            expandToUnits(items, { fragileCushionMm: cushion }),
            boxes,
          ),
      );
      if (outcome.cartons.length > 1) multi += 1;
      let orderCost = 0;
      for (const c of outcome.cartons) {
        fills.push(c.fill_ratio);
        const cost = (c.box.price_vnd ?? 0) + c.materials_cost_vnd;
        costs.push(cost);
        orderCost += cost;
      }
      orderCosts.push(orderCost);
    }
    buckets.set(bucketOf(unitCount), b);
  }

  const sortedTimes = [...times].sort((a, b) => a - b);
  const byBucket: Metrics['byBucket'] = {};
  for (const [name, b] of buckets) {
    byBucket[name] = {
      orders: b.n,
      okPct: round((b.ok / b.n) * 100, 1),
      avgCartons: round(avg(b.cartons)),
      p95Ms: percentile(
        [...b.times].sort((x, y) => x - y),
        95,
      ),
    };
  }
  return {
    orders,
    okPct: round((ok / orders) * 100, 1),
    noFitPct: round(((orders - ok) / orders) * 100, 1),
    multiPct: round((multi / orders) * 100, 1),
    avgCartons: round(avg(cartonCounts)),
    avgFillRatio: round(avg(fills), 3),
    avgBoxCostVnd: Math.round(avg(costs)),
    avgCostPerOrderVnd: Math.round(avg(orderCosts)),
    avgGapToLowerBound: round(avg(gaps)),
    atLowerBoundPct: round(
      (gaps.filter((g) => g <= 0).length / Math.max(1, gaps.length)) * 100,
      1,
    ),
    timeP50Ms: percentile(sortedTimes, 50),
    timeP95Ms: percentile(sortedTimes, 95),
    timeMaxMs: sortedTimes.at(-1) ?? 0,
    byBucket,
  };
}

function printTable(current: Metrics, baseline?: Metrics): void {
  const rows: [string, NumericMetric][] = [
    ['Số đơn', 'orders'],
    ['% đóng được (ok)', 'okPct'],
    ['% no_fit', 'noFitPct'],
    ['% cần nhiều kiện', 'multiPct'],
    ['Số kiện TB / đơn ok', 'avgCartons'],
    ['Độ lấp đầy TB', 'avgFillRatio'],
    ['Chi phí thùng+vật tư TB / kiện (VND)', 'avgBoxCostVnd'],
    ['Chi phí thùng+vật tư TB / ĐƠN (VND)', 'avgCostPerOrderVnd'],
    ['Khoảng cách TB tới cận dưới (kiện)', 'avgGapToLowerBound'],
    ['% đơn đạt cận dưới (tối ưu số kiện)', 'atLowerBoundPct'],
    ['Thời gian p50 (ms)', 'timeP50Ms'],
    ['Thời gian p95 (ms)', 'timeP95Ms'],
    ['Thời gian max (ms)', 'timeMaxMs'],
  ];
  console.log(
    '\nChỉ số'.padEnd(42) +
      'Hiện tại'.padStart(12) +
      (baseline ? 'Baseline'.padStart(12) : ''),
  );
  for (const [label, key] of rows) {
    const cur = String(current[key]);
    const base = baseline ? String(baseline[key]).padStart(12) : '';
    console.log(label.padEnd(41) + cur.padStart(12) + base);
  }
  console.log('\nTheo cỡ đơn (số món):');
  for (const name of ['1-3', '4-8', '9-20', '21+']) {
    const b = current.byBucket[name];
    if (!b) continue;
    console.log(
      `  ${name.padEnd(6)} ${String(b.orders).padStart(4)} đơn | ok ${String(b.okPct).padStart(5)}% | ${String(b.avgCartons).padStart(4)} kiện TB | p95 ${String(b.p95Ms).padStart(5)} ms`,
    );
  }
}

const orders = Number(arg('orders', '300'));
const seed = Number(arg('seed', '20260930'));
const current = run(orders, seed);

const comparePath = arg('compare');
let baseline: Metrics | undefined;
if (comparePath && existsSync(comparePath))
  baseline = JSON.parse(readFileSync(comparePath, 'utf-8')) as Metrics;
printTable(current, baseline);

const outPath = arg('out');
if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(current, null, 2));
  console.log(`\nĐã lưu ${outPath}`);
}
