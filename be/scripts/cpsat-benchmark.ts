import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { expandToUnits } from '../src/modules/packaging/engine/units';
import { sampleBoxes } from '../src/modules/packaging/engine/scenarios/order-scenarios';
import {
  CP_SAT_MAX_UNITS,
  httpCpSatChecker,
  solveOrder,
  upgradeWithCpSat,
} from '../src/modules/packing/solver';
import { generateOrder, mulberry32 } from './benchmark-orders';

/**
 * ===================================================================
 * ĐO PIPELINE ĐẦY ĐỦ: BRKGA → CP-SAT (service `packer/` phải đang chạy)
 * ===================================================================
 *   cd packer && .venv/Scripts/python -m uvicorn packer.main:app --port 8000
 *   npx ts-node --transpile-only scripts/cpsat-benchmark.ts --url=http://127.0.0.1:8000
 * In: tỷ lệ nhãn (toàn bộ và riêng đơn ≤ N_exact món), số đơn CP-SAT tìm
 * được phương án tốt hơn, số tổ hợp "unknown", độ trễ cả pipeline.
 * ===================================================================
 */

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const URL = arg('url', 'http://127.0.0.1:8000');
const ORDERS = Number(arg('orders', '300'));
const SEED = Number(arg('seed', '20260930'));
const MAX_UNITS = Number(arg('max-units', String(CP_SAT_MAX_UNITS)));
const DET_TIME = Number(arg('det-time', '2'));
const WALL = Number(arg('wall', '6'));
/** Số đơn đầu chạy lại để kiểm tra kết quả xác định. */
const DETERMINISM_SAMPLE = Number(arg('determinism', '40'));

function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))] ?? 0;
}

async function main(): Promise<void> {
  const checker = httpCpSatChecker(URL, 30_000);
  const rand = mulberry32(SEED);
  const labels: Record<string, number> = {};
  const smallLabels: Record<string, number> = {};
  const timesSmall: number[] = [];
  const timesAll: number[] = [];
  let improved = 0;
  let small = 0;
  let unresolved = 0;
  const unresolvedExamples: string[] = [];
  const fingerprints: { units: ReturnType<typeof expandToUnits>; print: string }[] = [];
  const run = async (
    units: ReturnType<typeof expandToUnits>,
  ): Promise<Awaited<ReturnType<typeof upgradeWithCpSat>>> =>
    upgradeWithCpSat(solveOrder(units, sampleBoxes()), units, checker, {
      maxUnits: MAX_UNITS,
      deterministicTimePerCombo: DET_TIME,
      wallTimeLimitS: WALL,
    });
  const printOf = (r: Awaited<ReturnType<typeof run>>): string =>
    JSON.stringify([r.proof, r.parcels.map((p) => [p.box.code, p.placements])]);

  for (let i = 0; i < ORDERS; i += 1) {
    const items = generateOrder(rand);
    const units = expandToUnits(items, { fragileCushionMm: 5 });
    const t = Date.now();
    const base = solveOrder(units, sampleBoxes());
    const res = await upgradeWithCpSat(base, units, checker, {
      maxUnits: MAX_UNITS,
      deterministicTimePerCombo: DET_TIME,
      wallTimeLimitS: WALL,
    });
    if (i < DETERMINISM_SAMPLE) fingerprints.push({ units, print: printOf(res) });
    const ms = Date.now() - t;
    timesAll.push(ms);
    labels[res.proof] = (labels[res.proof] ?? 0) + 1;
    const cost = (r: typeof res): number =>
      r.parcels.reduce((s, p) => s + (p.box.price_vnd ?? 0), 0);
    if (res.parcels.length < base.parcels.length || cost(res) < cost(base)) improved += 1;
    if (units.length <= MAX_UNITS) {
      small += 1;
      timesSmall.push(ms);
      smallLabels[res.proof] = (smallLabels[res.proof] ?? 0) + 1;
      if (res.proof === 'heuristic') {
        unresolved += 1;
        if (unresolvedExamples.length < 8)
          unresolvedExamples.push(
            `#${String(i)} (${String(units.length)} món): ${res.explanation.slice(-1).join(' ')}`,
          );
      }
    }
  }

  let mismatches = 0;
  for (const f of fingerprints) if (printOf(await run(f.units)) !== f.print) mismatches += 1;

  const report = {
    determinism: { checked: fingerprints.length, mismatches },
    orders: ORDERS,
    maxUnits: MAX_UNITS,
    detTimePerCombo: DET_TIME,
    labels,
    smallOrders: small,
    smallLabels,
    provenShareSmall: +(((small - unresolved) / Math.max(1, small)) * 100).toFixed(1),
    improvedByCpSat: improved,
    latencyMs: {
      allP95: percentile(timesAll, 95),
      allMax: Math.max(...timesAll),
      smallP95: percentile(timesSmall, 95),
      smallMax: Math.max(...timesSmall),
    },
    unresolvedExamples,
  };
  console.log(JSON.stringify(report, null, 2));
  const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 2));
  }
}

void main();
