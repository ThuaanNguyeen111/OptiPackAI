import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import type { PackableItem } from '../src/common/interfaces/packaging.interface';
import { expandToUnits } from '../src/modules/packaging/engine/units';
import type { BoxSpec } from '../src/modules/packaging/engine/types';
import { solveOrder } from '../src/modules/packing/solver';
import {
  DEFAULT_CHARGE_RULE,
  DEFAULT_FEE_ESTIMATE,
  estimateFeeVnd,
  uncutBox,
} from '../src/modules/packing/solver/objective';
import type { SolvePreference } from '../src/modules/packing/solver/types';

/**
 * ===================================================================
 * Mô phỏng danh mục thùng (24/11/2026)
 * ===================================================================
 * Không đọc DB. Chạy lại bộ giải cho mọi đơn trong một dataset (mặc định đơn thật
 * `real-v1.jsonl`) với từng phương án danh mục thùng, giả định đủ tồn, rồi so tổng kiện,
 * cân tính cước, cước ước tính (biểu cước phẳng) và tiền thùng.
 *
 *   npx ts-node --transpile-only scripts/simulate-box-catalog.ts [--input=...jsonl] [--scenarios=...json]
 *
 * File phương án (tuỳ chọn), mỗi phần tử: { "name": "...", "remove": ["BOX-S"],
 *   "add": [{ "code": "BOX-X", "inner_mm": [L, W, H], "wall_mm": 3, "tare_g": 180, "price_vnd": 4000 }] }
 * Thiếu tare_g/price_vnd thì ước theo đường khớp bì/giá theo diện tích bìa của danh mục.
 * Cước GHN thật phụ thuộc tuyến — so **cân tính cước** đáng tin hơn so tiền cước.
 * ===================================================================
 */

interface DatasetCase {
  id: string;
  input: {
    items: PackableItem[];
    boxes: BoxSpec[];
    solver_options: { prefer?: SolvePreference; fragile_cushion_mm: number };
  };
}

interface AddBox {
  code: string;
  inner_mm: [number, number, number];
  wall_mm?: number;
  tare_g?: number;
  price_vnd?: number;
  max_load_g?: number;
}

interface Scenario {
  name: string;
  remove?: string[];
  add?: AddBox[];
}

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const surfaceM2 = (o: BoxSpec['outer']): number =>
  (2 *
    (o.length_mm * o.width_mm +
      o.length_mm * o.height_mm +
      o.width_mm * o.height_mm)) /
  1e6;
const volume = (o: BoxSpec['inner']): number =>
  o.length_mm * o.width_mm * o.height_mm;

/** Khớp y = a + b·x (bình phương tối thiểu); 1 điểm thì tỉ lệ thẳng. */
function fitLine(points: [number, number][]): (x: number) => number {
  const n = points.length;
  const mx = points.reduce((s, [x]) => s + x, 0) / n;
  const my = points.reduce((s, [, y]) => s + y, 0) / n;
  const sxx = points.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  if (n < 2 || sxx === 0) return (x) => (mx > 0 ? (my * x) / mx : my);
  const slope = points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / sxx;
  return (x) => my + slope * (x - mx);
}

/** Thùng mới: bì và giá chưa cho thì theo đường khớp "bì/giá theo diện tích bìa" của danh mục; tải theo thùng gần thể tích nhất. */
export function makeBox(spec: AddBox, catalog: BoxSpec[]): BoxSpec {
  const [l, w, h] = spec.inner_mm;
  const wall = spec.wall_mm ?? 3;
  const inner = { length_mm: l, width_mm: w, height_mm: h };
  const outer = {
    length_mm: l + 2 * wall,
    width_mm: w + 2 * wall,
    height_mm: h + 2 * wall,
  };
  if (
    catalog.length === 0 &&
    (spec.tare_g === undefined ||
      spec.price_vnd === undefined ||
      spec.max_load_g === undefined)
  )
    throw new Error(
      `Thùng ${spec.code}: danh mục trống, phải cho đủ tare_g, price_vnd, max_load_g.`,
    );
  const area = surfaceM2(outer);
  // shortcut: bì và giá ước theo diện tích bìa — thay bằng số cân/báo giá thật trước khi quyết mua.
  const tare = fitLine(catalog.map((b) => [surfaceM2(b.outer), b.tare_g]));
  const price = fitLine(
    catalog.map((b) => [surfaceM2(b.outer), b.price_vnd ?? 0]),
  );
  const near = [...catalog].sort(
    (a, b) =>
      Math.abs(volume(a.inner) - volume(inner)) -
      Math.abs(volume(b.inner) - volume(inner)),
  )[0];
  return {
    code: spec.code,
    name: spec.code,
    inner,
    outer,
    tare_g: spec.tare_g ?? Math.max(1, Math.round(tare(area))),
    price_vnd:
      spec.price_vnd ?? Math.max(0, Math.round(price(area) / 100) * 100),
    max_load_g: spec.max_load_g ?? near?.max_load_g ?? 10000,
    ...(near?.min_cut_height_mm !== undefined && {
      min_cut_height_mm: near.min_cut_height_mm,
    }),
  };
}

function defaultScenarios(catalog: BoxSpec[]): Scenario[] {
  return [
    { name: 'hiện tại' },
    ...catalog.map((b) => ({ name: `bỏ ${b.code}`, remove: [b.code] })),
    {
      name: 'thêm 42×32×25 (giữa M và L)',
      add: [{ code: 'SIM-ML', inner_mm: [420, 320, 250] }],
    },
    {
      name: 'thêm 35×25×10 (M thấp)',
      add: [{ code: 'SIM-MT', inner_mm: [350, 250, 100] }],
    },
    {
      name: 'thêm 30×20×15',
      add: [{ code: 'SIM-SM', inner_mm: [300, 200, 150] }],
    },
    {
      name: 'thêm 50×40×12 (LT thấp)',
      add: [{ code: 'SIM-LF', inner_mm: [500, 400, 120] }],
    },
  ];
}

interface Totals {
  parcels: number;
  billable_g: number;
  fee_vnd: number;
  box_vnd: number;
  unplaced: number;
  usage: Map<string, number>;
  perCase: Map<string, string>;
}

function run(cases: DatasetCase[], boxes: BoxSpec[]): Totals {
  const t: Totals = {
    parcels: 0,
    billable_g: 0,
    fee_vnd: 0,
    box_vnd: 0,
    unplaced: 0,
    usage: new Map(),
    perCase: new Map(),
  };
  for (const c of cases) {
    const units = expandToUnits(c.input.items, {
      fragileCushionMm: c.input.solver_options.fragile_cushion_mm,
    });
    const r = solveOrder(units, boxes, {
      prefer: c.input.solver_options.prefer,
      seed: 1,
    });
    t.unplaced += r.unplaced.length;
    for (const p of r.parcels) {
      const code = uncutBox(p.box).code;
      t.parcels += 1;
      t.billable_g += p.billable_weight_g;
      t.fee_vnd += estimateFeeVnd(
        p.billable_weight_g,
        DEFAULT_CHARGE_RULE.billingStepG,
        DEFAULT_FEE_ESTIMATE,
      );
      t.box_vnd += p.box.price_vnd ?? 0;
      t.usage.set(code, (t.usage.get(code) ?? 0) + 1);
    }
    t.perCase.set(
      c.id,
      r.parcels
        .map((p) => `${uncutBox(p.box).code}:${String(p.billable_weight_g)}`)
        .join('+'),
    );
  }
  return t;
}

function main(): void {
  const input = arg('input') ?? 'scripts/datasets/packing/real-v1.jsonl';
  const cases = readFileSync(input, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as DatasetCase);
  const catalog = cases[0]?.input.boxes ?? [];
  if (catalog.length === 0) throw new Error('Dataset trống.');
  // Tự kiểm: đường khớp ước lại thùng đang có lệch ≤ 30% bì và giá.
  for (const own of catalog) {
    const echo = makeBox(
      {
        code: 'ECHO',
        inner_mm: [
          own.inner.length_mm,
          own.inner.width_mm,
          own.inner.height_mm,
        ],
        wall_mm: (own.outer.length_mm - own.inner.length_mm) / 2,
      },
      catalog,
    );
    assert.ok(
      Math.abs(echo.tare_g - own.tare_g) <= 0.3 * own.tare_g,
      `bì ước của ${own.code} lệch quá 30%`,
    );
    assert.ok(
      Math.abs((echo.price_vnd ?? 0) - (own.price_vnd ?? 0)) <=
        0.3 * (own.price_vnd ?? 0) + 100,
      `giá ước của ${own.code} lệch quá 30%`,
    );
  }

  const scenarioFile = arg('scenarios');
  const scenarios = scenarioFile
    ? (JSON.parse(readFileSync(scenarioFile, 'utf8')) as Scenario[])
    : defaultScenarios(catalog);
  const results: { name: string; boxes: BoxSpec[]; t: Totals }[] = [];
  for (const s of scenarios) {
    const boxes = [
      ...catalog.filter((b) => !s.remove?.includes(b.code)),
      ...(s.add ?? []).map((a) => makeBox(a, catalog)),
    ];
    results.push({ name: s.name, boxes, t: run(cases, boxes) });
  }
  const base = results[0]?.t;
  if (!base) return;
  console.log(
    `${String(cases.length)} đơn từ ${input}; thùng: ${catalog.map((b) => b.code).join(', ')}`,
  );
  for (const r of results)
    for (const b of r.boxes.filter((x) => x.code.startsWith('SIM-')))
      console.log(
        `  ${r.name}: ${b.code} lòng ${String(b.inner.length_mm / 10)}×${String(b.inner.width_mm / 10)}×${String(b.inner.height_mm / 10)} cm, bì ước ${String(b.tare_g)} g, giá ước ${String(b.price_vnd)}đ`,
      );
  console.table(
    results.map(({ name, t }) => ({
      phuong_an: name,
      kien: t.parcels,
      chua_xep: t.unplaced,
      can_tinh_cuoc_kg: t.billable_g / 1000,
      cuoc_uoc_vnd: t.fee_vnd,
      tien_thung_vnd: t.box_vnd,
      tong_vnd: t.fee_vnd + t.box_vnd,
      chenh_vnd: t.fee_vnd + t.box_vnd - (base.fee_vnd + base.box_vnd),
      don_doi: [...t.perCase].filter(([id, v]) => base.perCase.get(id) !== v)
        .length,
      dung_thung: [...t.usage]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([c, n]) => `${c}×${String(n)}`)
        .join(' '),
    })),
  );
}

main();
