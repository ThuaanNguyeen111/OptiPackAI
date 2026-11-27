import { strict as assert } from 'assert';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { expandToUnits } from '../src/modules/packaging/engine/units';
import { sampleBoxes } from '../src/modules/packaging/engine/scenarios/order-scenarios';
import type { BoxSpec } from '../src/modules/packaging/engine/types';
import type { PackableItem } from '../src/common/interfaces/packaging.interface';
import { compareObjective, objectiveOf, validatePlan, solveOrder, SOLVER_VERSION } from '../src/modules/packing/solver';
import { uncutBox } from '../src/modules/packing/solver/objective';
import type { SolveOptions } from '../src/modules/packing/solver';
import { generateOrder, mulberry32 } from './benchmark-orders';

type Split = 'train' | 'validation' | 'test';

interface PackingCase {
  schema_version: 1;
  id: string;
  group_id: string;
  source: 'synthetic';
  split: Split;
  generated_seed: number;
  expected: { all_items_placed: true };
  input: {
    items: PackableItem[];
    boxes: BoxSpec[];
    solver_options: Pick<SolveOptions, 'prefer' | 'maxEvaluations' | 'seed'> & {
      fragile_cushion_mm: number;
    };
  };
}

interface CaseResult {
  id: string;
  split: Split;
  valid: boolean;
  status: string;
  unplaced: number;
  parcels: number;
  lower_bound_gap: number | null;
  packaging_cost_vnd: number;
  computation_ms: number;
  proof: string;
  problems: string[];
  /** Kiện xếp lại vào MỘT thùng khác cho kết quả tốt hơn (chỉ khi chạy dò). */
  better_box: string[];
}

interface SplitMetrics {
  cases: number;
  valid_pct: number;
  all_items_placed_pct: number;
  avg_parcels: number;
  avg_lower_bound_gap: number;
  avg_packaging_cost_vnd: number;
  p95_computation_ms: number;
}

interface EvaluationReport {
  schema_version: 1;
  solver_version: string;
  dataset_cases: number;
  passed: number;
  failed: number;
  /** Ca có kiện đổi được sang thùng tốt hơn (chỉ khi chạy dò). */
  better_box_cases: number;
  /** Ca gắn nhãn optimal_* mà dò vẫn tìm ra thùng tốt hơn — phải = 0. */
  proof_contradictions: number;
  by_split: Record<Split, SplitMetrics>;
  cases: CaseResult[];
}

const SPLITS: Split[] = ['train', 'validation', 'test'];
const DEFAULT_OUTPUT = 'scripts/datasets/packing/v1.jsonl';
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const nonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function validateCase(value: unknown, line: number): PackingCase {
  if (!isRecord(value) || value.schema_version !== 1 || typeof value.id !== 'string')
    throw new Error(`Dòng ${String(line)}: schema_version/id không hợp lệ.`);
  if (
    typeof value.group_id !== 'string' ||
    value.source !== 'synthetic' ||
    !SPLITS.includes(value.split as Split) ||
    typeof value.generated_seed !== 'number' ||
    !Number.isInteger(value.generated_seed) ||
    !isRecord(value.expected) ||
    value.expected.all_items_placed !== true ||
    !isRecord(value.input) ||
    !Array.isArray(value.input.items) ||
    !Array.isArray(value.input.boxes) ||
    !isRecord(value.input.solver_options)
  ) {
    throw new Error(`Dòng ${String(line)}: case không đúng schema packing v1.`);
  }

  for (const item of value.input.items) {
    if (
      !isRecord(item) ||
      typeof item.sku !== 'string' ||
      typeof item.quantity !== 'number' ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0 ||
      !positive(item.length_cm) ||
      !positive(item.width_cm) ||
      !positive(item.height_cm) ||
      !nonNegative(item.weight_kg)
    ) {
      throw new Error(`Dòng ${String(line)}: hồ sơ món không hợp lệ.`);
    }
  }
  for (const box of value.input.boxes) {
    if (
      !isRecord(box) ||
      typeof box.code !== 'string' ||
      !isRecord(box.inner) ||
      !isRecord(box.outer) ||
      !positive(box.inner.length_mm) ||
      !positive(box.inner.width_mm) ||
      !positive(box.inner.height_mm) ||
      !positive(box.outer.length_mm) ||
      !positive(box.outer.width_mm) ||
      !positive(box.outer.height_mm) ||
      !nonNegative(box.tare_g) ||
      !positive(box.max_load_g) ||
      (box.price_vnd !== null && !nonNegative(box.price_vnd))
    ) {
      throw new Error(`Dòng ${String(line)}: thông số thùng không hợp lệ.`);
    }
  }

  const options = value.input.solver_options;
  if (
    !nonNegative(options.fragile_cushion_mm) ||
    (options.prefer !== undefined && options.prefer !== 'fewest_parcels' && options.prefer !== 'cheapest') ||
    (options.maxEvaluations !== undefined && !positive(options.maxEvaluations)) ||
    (options.seed !== undefined && !Number.isInteger(options.seed))
  ) {
    throw new Error(`Dòng ${String(line)}: solver_options không hợp lệ.`);
  }
  return value as unknown as PackingCase;
}

function generateDataset(total: number, seed: number): PackingCase[] {
  if (!Number.isInteger(total) || total < 7) throw new Error('--orders phải là số nguyên ≥ 7.');
  if (!Number.isInteger(seed)) throw new Error('--seed phải là số nguyên.');

  const trainCount = Math.floor(total * 0.7);
  const validationCount = Math.floor(total * 0.15);
  const counts: Record<Split, number> = {
    train: trainCount,
    validation: validationCount,
    test: total - trainCount - validationCount,
  };
  const cases: PackingCase[] = [];
  SPLITS.forEach((split, splitIndex) => {
    const splitSeed = seed + splitIndex;
    const rand = mulberry32(splitSeed);
    for (let index = 0; index < counts[split]; index += 1) {
      cases.push({
        schema_version: 1,
        id: `SYN-${split}-${String(splitSeed)}-${String(index + 1).padStart(4, '0')}`,
        group_id: `synthetic-seed-${String(splitSeed)}`,
        source: 'synthetic',
        split,
        generated_seed: splitSeed,
        expected: { all_items_placed: true },
        input: {
          items: generateOrder(rand),
          boxes: sampleBoxes(),
          solver_options: { prefer: 'fewest_parcels', fragile_cushion_mm: 5 },
        },
      });
    }
  });
  return cases;
}

function readDataset(path: string): PackingCase[] {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => validateCase(JSON.parse(line) as unknown, index + 1));
}

/**
 * Dò bỏ sót (audit 20/11/2026): xếp lại từng kiện vào từng thùng khác trong
 * danh mục; kiện mới tốt hơn theo mục tiêu bậc = bộ giải chọn thùng chưa tốt.
 */
function probeBetterBox(
  units: ReturnType<typeof expandToUnits>,
  boxes: BoxSpec[],
  result: ReturnType<typeof solveOrder>,
  prefer: SolveOptions['prefer'],
): string[] {
  const byKey = new Map(units.map((unit) => [unit.item_key, unit]));
  const found: string[] = [];
  result.parcels.forEach((parcel, index) => {
    const own = parcel.placements
      .map((placement) => byKey.get(placement.item_key))
      .filter((unit): unit is NonNullable<typeof unit> => unit !== undefined);
    const current = objectiveOf([parcel], 0);
    const code = uncutBox(parcel.box).code;
    for (const box of boxes) {
      if (box.code === code) continue;
      const alone = solveOrder(own, [box], { ...(prefer && { prefer }), maxEvaluations: 2000 });
      if (alone.status === 'ok' && alone.parcels.length === 1 && compareObjective(alone.objective, current, prefer) < 0) {
        found.push(`kiện ${String(index + 1)}: ${code} → ${box.code}`);
        break;
      }
    }
  });
  return found;
}

function runCase(testCase: PackingCase, probe = false): CaseResult {
  const options = testCase.input.solver_options;
  const units = expandToUnits(testCase.input.items, {
    fragileCushionMm: options.fragile_cushion_mm,
  });
  const started = Date.now();
  const result = solveOrder(units, testCase.input.boxes, {
    ...(options.prefer && { prefer: options.prefer }),
    ...(options.maxEvaluations && { maxEvaluations: options.maxEvaluations }),
    ...(options.seed !== undefined && { seed: options.seed }),
  });
  const elapsed = Date.now() - started;
  const placedKeys = units
    .map((unit) => unit.item_key)
    .filter((key) => !result.unplaced.some((unit) => unit.item_key === key));
  const problems = validatePlan(result.parcels, placedKeys);
  const valid = problems.length === 0 && result.unplaced.length === 0;
  return {
    id: testCase.id,
    split: testCase.split,
    valid,
    status: result.status,
    unplaced: result.unplaced.length,
    parcels: result.parcels.length,
    lower_bound_gap: result.unplaced.length === 0 ? result.parcels.length - result.lower_bound_parcels : null,
    packaging_cost_vnd: result.objective.packaging_cost_vnd,
    computation_ms: Math.max(elapsed, result.stats.computation_ms),
    proof: result.proof,
    problems,
    better_box: probe ? probeBetterBox(units, testCase.input.boxes, result, options.prefer) : [],
  };
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.ceil((p / 100) * sorted.length) - 1] ?? 0;
}

function evaluate(cases: PackingCase[], probe = false): EvaluationReport {
  const results = cases.map((testCase) => runCase(testCase, probe));
  const bySplit = Object.fromEntries(
    SPLITS.map((split) => {
      const rows = results.filter((row) => row.split === split);
      const complete = rows.filter((row) => row.unplaced === 0);
      return [
        split,
        {
          cases: rows.length,
          valid_pct: rows.length ? Math.round((rows.filter((row) => row.valid).length / rows.length) * 1000) / 10 : 0,
          all_items_placed_pct: rows.length ? Math.round((complete.length / rows.length) * 1000) / 10 : 0,
          avg_parcels: complete.length ? Math.round((complete.reduce((sum, row) => sum + row.parcels, 0) / complete.length) * 100) / 100 : 0,
          avg_lower_bound_gap: complete.length
            ? Math.round((complete.reduce((sum, row) => sum + (row.lower_bound_gap ?? 0), 0) / complete.length) * 100) / 100
            : 0,
          avg_packaging_cost_vnd: complete.length
            ? Math.round(complete.reduce((sum, row) => sum + row.packaging_cost_vnd, 0) / complete.length)
            : 0,
          p95_computation_ms: percentile(rows.map((row) => row.computation_ms), 95),
        },
      ];
    }),
  ) as Record<Split, SplitMetrics>;
  return {
    schema_version: 1,
    solver_version: SOLVER_VERSION,
    dataset_cases: cases.length,
    passed: results.filter((row) => row.valid).length,
    failed: results.filter((row) => !row.valid).length,
    better_box_cases: results.filter((row) => row.better_box.length > 0).length,
    proof_contradictions: results.filter((row) => row.proof !== 'heuristic' && row.better_box.length > 0).length,
    by_split: bySplit,
    cases: results,
  };
}

function writeJsonl(path: string, cases: PackingCase[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${cases.map((testCase) => JSON.stringify(testCase)).join('\n')}\n`);
}

function selfCheck(): void {
  const first = generateDataset(20, 20261117);
  const second = generateDataset(20, 20261117);
  assert.deepEqual(first, second, 'same seed must generate the same cases');
  assert.deepEqual(
    Object.fromEntries(SPLITS.map((split) => [split, first.filter((row) => row.split === split).length])),
    { train: 14, validation: 3, test: 3 },
  );
  const report = evaluate(first, true);
  assert.equal(report.failed, 0, 'generated cases must satisfy the solver validator and place all items');
  assert.equal(
    report.proof_contradictions,
    0,
    `optimal proof label contradicted by a better single-box repack: ${JSON.stringify(report.cases.filter((row) => row.proof !== 'heuristic' && row.better_box.length > 0).map((row) => [row.id, row.better_box]))}`,
  );
}

function main(): void {
  const command = process.argv[2] ?? 'help';
  if (command === 'check') {
    selfCheck();
    console.log('packing dataset self-check passed');
    return;
  }
  if (command === 'generate') {
    const cases = generateDataset(Number(arg('orders', '300')), Number(arg('seed', '20261117')));
    const output = arg('out', DEFAULT_OUTPUT) ?? DEFAULT_OUTPUT;
    writeJsonl(output, cases);
    console.log(`Đã ghi ${String(cases.length)} case vào ${output}`);
    console.log(JSON.stringify(Object.fromEntries(SPLITS.map((split) => [split, cases.filter((row) => row.split === split).length]))));
    return;
  }
  if (command === 'evaluate') {
    const input = arg('input');
    if (!input) throw new Error('Thiếu --input=<file.jsonl>.');
    const report = evaluate(readDataset(input), process.argv.includes('--probe'));
    const output = arg('report');
    if (output) {
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(
      JSON.stringify(
        {
          solver_version: report.solver_version,
          dataset_cases: report.dataset_cases,
          passed: report.passed,
          failed: report.failed,
          better_box_cases: report.better_box_cases,
          proof_contradictions: report.proof_contradictions,
          by_split: report.by_split,
          ...(output ? { report: output } : {}),
        },
        null,
        2,
      ),
    );
    if (report.failed > 0 || report.proof_contradictions > 0) process.exitCode = 1;
    return;
  }
  console.log(
    [
      'Packing dataset pipeline (offline; no DB access)',
      '  npm.cmd run dataset:packing -- generate --orders=300 --seed=20261117',
      '  npm.cmd run dataset:packing -- evaluate --input=scripts/datasets/packing/v1.jsonl --report=scripts/datasets/packing/results-v1.json [--probe]',
      '  npm.cmd run dataset:packing -- check',
    ].join('\n'),
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
