import type { BoxSpec, PackingUnit } from '../../packaging/engine/types';
import { DEFAULT_CHARGE_RULE, MIN_BOX_CUT_MM, billableWeightG, uncutBox, type ChargeRule } from './objective';
import type { ProofLabel, SolvedParcel, Variant } from './types';

/**
 * ===================================================================
 * Chứng minh "tối ưu toàn cục" (optimal_global) bằng ĐIỀU KIỆN CẦN
 * ===================================================================
 * Mục tiêu "ít kiện trước" so theo bậc: số kiện → cân tính cước → giá thùng.
 * Phương án k kiện, tổng cước B, tổng giá thùng C là tối ưu (trên 3 bậc đó)
 * nếu MỌI tổ hợp thùng (còn tồn) CÓ THỂ tốt hơn đều vi phạm một điều kiện cần.
 * "Có thể tốt hơn" = ít kiện hơn (từ cận dưới), hoặc k kiện mà cận dưới cước
 * < B, hoặc cận dưới cước = B và giá < C. Cận dưới cước mỗi thùng = cước của
 * thùng rỗng (bì) với cân quy đổi ở chiều cao cắt hạ thấp nhất có thể; cả tổ
 * hợp còn ≥ cước của tổng cân hàng + bì. (Audit 20/11/2026, F2: trước đây chỉ
 * xét giá thùng nên thùng to giá rẻ được gắn nhãn tối ưu dù cước cao hơn.)
 * Điều kiện cần (không vừa, thể tích, cân, diện tích sàn) đúng với MỌI cách
 * xếp nên kết luận không phụ thuộc mô hình. Tổ hợp chưa loại được → CP-SAT
 * trả lời → nhãn heuristic. Vật tư không thuộc phần chứng minh.
 * ===================================================================
 */

/** Trần số tổ hợp duyệt — vượt thì không kết luận (heuristic). */
const MAX_MULTISETS = 5000;

export interface ProofResult {
  label: ProofLabel;
  explanation: string[];
  /** Tổ hợp có thể tốt hơn chưa loại được — đầu vào cho CP-SAT, sắp theo (số kiện, cận dưới cước, giá). */
  openCandidates: BoxSpec[][];
}

const innerVol = (b: BoxSpec): number =>
  b.inner.length_mm * b.inner.width_mm * b.inner.height_mm;
const unitVol = (u: PackingUnit): number =>
  u.length_mm * u.width_mm * u.height_mm;
/** Giá thùng đúng như mục tiêu tính (`objectiveOf`: chưa nhập giá = 0). */
const price = (b: BoxSpec): number => b.price_vnd ?? 0;
const sumPrice = (combo: BoxSpec[]): number => combo.reduce((s, b) => s + price(b), 0);

/** Mức cần vượt để tốt hơn: số kiện, tổng cước (g), tổng giá thùng. */
export interface ProofTarget {
  parcels: number;
  billable_g: number;
  box_price_vnd: number;
}

export interface ComboBound {
  /** Cận dưới cước (g) của 1 thùng (dù chứa phần nào của đơn, hoặc cả đơn khi `holdsAll`). */
  floorG: (b: BoxSpec, holdsAll?: boolean) => number;
  /** Cận dưới tổng cước (g) của cả tổ hợp khi chứa đủ đơn. */
  billableLb: (combo: BoxSpec[]) => number;
  /** Tổ hợp này CÓ THỂ tốt hơn mục tiêu `t` không (theo luật bậc "ít kiện trước"). */
  canBeat: (combo: BoxSpec[], t: ProofTarget) => boolean;
  /**
   * Tổ hợp cùng số kiện với `t`: lòng mỗi thùng sau cắt cao tối đa bao nhiêu (mm)
   * thì tổng cước mới có thể tốt hơn `t` (các thùng khác lấy cước thấp nhất có thể);
   * null ở thùng nào = không chiều cao nào đủ.
   */
  beatHeights: (combo: BoxSpec[], t: ProofTarget) => (number | null)[];
  /**
   * Tổ hợp ≥ 2 thùng cùng số kiện với `t`: chia ngân sách cước thành trần cho từng
   * thùng (tổng còn tốt hơn `t`); mỗi cách chia = tổ hợp thùng đã hạ lòng và hạ tải
   * sao cho cước từng thùng ≤ trần. Phương án tốt hơn nào cũng vừa một cách chia và
   * cách xếp nào vừa một cách chia cũng tốt hơn. [] = không cách nào; null = quá nhiều.
   */
  billSplits: (combo: BoxSpec[], t: ProofTarget) => BoxSpec[][] | null;
}

/** Trần số cách chia cước còn lại sau kiểm tra nhanh (mỗi cách = 1 tổ hợp gửi CP-SAT). */
const MAX_BILL_SPLITS = 8;
/** Trần số cách chia trước khi gộp hoán vị — dừng duyệt sớm để không nổ tổ hợp. */
const MAX_RAW_SPLITS = 200;

/** Cận dưới cước cho đơn này — dùng chung cho chứng minh nhanh và cho CP-SAT khi nhận phương án mới. */
export function comboBound(
  units: PackingUnit[],
  variants: Variant[][],
  charge: ChargeRule = DEFAULT_CHARGE_RULE,
): ComboBound {
  const minTop = Math.min(...variants.flat().map((v) => v.dz));
  const itemsG = units.reduce((s, u) => s + u.weight_g, 0);
  const itemsVol = units.reduce((s, u) => s + unitVol(u), 0);
  // Thùng chứa cả đơn: chồng hàng cao ít nhất món "thấp nhất có thể" cao nhất.
  const allTop = Math.max(...variants.map((vs) => Math.min(...vs.map((v) => v.dz))));
  /** `holdsAll` = thùng chứa cả đơn → chồng hàng còn cao ít nhất thể tích ÷ diện tích sàn. */
  const floorG = (cut: BoxSpec, holdsAll = false): number => {
    // Thùng đã hạ chiều cao (ứng viên của beatHeight) vẫn cắt được từ thùng gốc.
    const b = uncutBox(cut);
    let outerH = b.outer.height_mm;
    if (b.kind !== 'mailer') {
      // Giống cutBoxToLoad, với chồng hàng thấp nhất có thể.
      const top = holdsAll
        ? Math.max(allTop, itemsVol / (b.inner.length_mm * b.inner.width_mm))
        : minTop;
      const lowest = Math.min(
        b.inner.height_mm,
        Math.max(Math.ceil(top / 10) * 10, b.min_cut_height_mm ?? 0),
      );
      const saved = b.inner.height_mm - lowest;
      if (saved >= MIN_BOX_CUT_MM) outerH -= saved;
    }
    const volG = Math.ceil(
      ((b.outer.length_mm * b.outer.width_mm * outerH) / 1000 / charge.volumetricDivisor) * 1000,
    );
    return billableWeightG(b.tare_g, volG, charge.billingStepG);
  };
  const billableLb = (combo: BoxSpec[]): number =>
    Math.max(
      combo.reduce((s, b) => s + floorG(b, combo.length === 1), 0),
      billableWeightG(itemsG + combo.reduce((s, b) => s + b.tare_g, 0), 0, charge.billingStepG),
    );
  const canBeat = (combo: BoxSpec[], t: ProofTarget): boolean => {
    if (combo.length !== t.parcels) return combo.length < t.parcels;
    const lb = billableLb(combo);
    return lb < t.billable_g || (lb === t.billable_g && sumPrice(combo) < t.box_price_vnd);
  };
  const billAt = (b: BoxSpec, h: number, actualG: number): number => {
    const outerH = b.outer.height_mm - (b.inner.height_mm - h);
    const volG = Math.ceil(((b.outer.length_mm * b.outer.width_mm * outerH) / 1000 / charge.volumetricDivisor) * 1000);
    return billableWeightG(actualG, volG, charge.billingStepG);
  };
  /** Lòng sau cắt có thể có, cao → thấp: nguyên thùng, rồi bội 10 mm (≥ min_cut) khi bỏ được ≥ MIN_BOX_CUT_MM. */
  const allowedHeights = (b: BoxSpec): number[] => {
    if (b.kind === 'mailer') return [b.inner.height_mm]; // túi không cắt hạ
    const out = [b.inner.height_mm];
    const floor = Math.max(10, b.min_cut_height_mm ?? 0);
    for (let h = Math.floor((b.inner.height_mm - MIN_BOX_CUT_MM) / 10) * 10; h >= floor; h -= 10) out.push(h);
    if (floor % 10 !== 0 && b.inner.height_mm - floor >= MIN_BOX_CUT_MM) out.push(floor);
    return out;
  };
  const heightWithin = (b: BoxSpec, maxBill: number, actualG: number): number | null =>
    allowedHeights(b).find((h) => billAt(b, h, actualG) <= maxBill) ?? null;
  const billSplits = (combo: BoxSpec[], t: ProofTarget): BoxSpec[][] | null => {
    const step = charge.billingStepG;
    if (step <= 0) return null;
    const maxBill = Math.floor((sumPrice(combo) < t.box_price_vnd ? t.billable_g : t.billable_g - 1) / step) * step;
    const lightest = Math.min(...units.map((u) => u.weight_g));
    const bases = combo.map((box) => uncutBox(box));
    // Cước thấp nhất mỗi thùng: chồng hàng thấp nhất, chỉ có bì thùng.
    const mins = bases.map((b) => billAt(b, [...allowedHeights(b)].reverse().find((h) => h >= minTop) ?? b.inner.height_mm, b.tare_g));
    const raw: number[][] = [];
    const walk = (i: number, left: number, caps: number[]): void => {
      if (raw.length > MAX_RAW_SPLITS) return;
      const restMin = mins.slice(i + 1).reduce((s, m) => s + m, 0);
      const min = mins[i] ?? 0;
      // Thùng cuối nhận hết phần còn lại — mức thấp hơn bị bộ này bao.
      if (i === combo.length - 1) {
        if (left >= min) raw.push([...caps, left]);
        return;
      }
      for (let cap = min; cap <= left - restMin; cap += step) walk(i + 1, left - cap, [...caps, cap]);
    };
    walk(0, maxBill, []);
    if (raw.length > MAX_RAW_SPLITS) return null;
    // Thùng cùng mã đổi chỗ được: sắp trần cước giảm dần trong từng mã rồi bỏ trùng.
    const canon = raw.map((caps) => {
      const out = [...caps];
      for (const code of new Set(combo.map((b) => b.code))) {
        const idx = combo.flatMap((b, i) => (b.code === code ? [i] : []));
        const sorted = idx.map((i) => caps[i] ?? 0).sort((x, y) => y - x);
        idx.forEach((i, j) => (out[i] = sorted[j] ?? 0));
      }
      return out;
    });
    const unique = [...new Map(canon.map((caps) => [caps.join(','), caps])).values()];
    const splits = unique.flatMap((caps) => {
      const boxes = bases.map((b, i) => {
        const cap = caps[i] ?? 0;
        const h = heightWithin(b, cap, b.tare_g) ?? b.inner.height_mm;
        // Cước thùng ≤ trần ⇔ lòng ≤ h (quy đổi thể tích) và hàng ≤ trần − bì (cân thật).
        return { ...loweredBox(b, h), max_load_g: Math.min(b.max_load_g, cap - b.tare_g), catalog_max_load_g: b.max_load_g };
      });
      // Thùng nào cũng phải chứa được ít nhất 1 món.
      return boxes.every((b) => b.max_load_g >= lightest) ? [boxes] : [];
    });
    return splits;
  };
  const beatHeights = (combo: BoxSpec[], t: ProofTarget): (number | null)[] => {
    const maxBill = sumPrice(combo) < t.box_price_vnd ? t.billable_g : t.billable_g - 1;
    const floors = combo.map((b) => floorG(b));
    const floorSum = floors.reduce((s, f) => s + f, 0);
    return combo.map((box, i) => {
      const b = uncutBox(box);
      // Nhiều thùng: chưa biết thùng này chứa món nào, cận dưới cân thật chỉ là bì thùng.
      const actualG = combo.length === 1 ? itemsG + b.tare_g : b.tare_g;
      return heightWithin(b, maxBill - (floorSum - (floors[i] ?? 0)), actualG);
    });
  };
  return { floorG, billableLb, canBeat, beatHeights, billSplits };
}

/** Thùng `b` hạ lòng còn `h` mm (dạng thùng cắt hạ: uncutBox trả lại thùng gốc). */
export function loweredBox(b: BoxSpec, h: number): BoxSpec {
  const base = uncutBox(b);
  if (h >= base.inner.height_mm) return base;
  const saved = base.inner.height_mm - h;
  return {
    ...base,
    inner: { ...base.inner, height_mm: h },
    outer: { ...base.outer, height_mm: base.outer.height_mm - saved },
    cut_from: { inner_height_mm: base.inner.height_mm, outer_height_mm: base.outer.height_mm },
  };
}

/** Trần số món để chạy kiểm từng cặp (O(n²·biến thể²)). */
const PAIR_CHECK_MAX_UNITS = 40;

/**
 * Điều kiện cần khi MỌI món chung 1 thùng: mỗi cặp món phải hoặc chồng được
 * (tổng chiều cao ≤ lòng thùng), hoặc đặt cạnh nhau theo một trục sàn. Cặp nào
 * không cách nào đặt chung → thùng không chứa được đơn.
 */
const fittingIn = (vs: Variant[], box: BoxSpec): Variant[] =>
  vs.filter((v) => v.dx <= box.inner.length_mm && v.dy <= box.inner.width_mm && v.dz <= box.inner.height_mm);

/** Hai món (đã lọc hướng vừa thùng) đặt chung được: chồng lên nhau hoặc cạnh nhau theo một trục sàn. */
function pairFits(fa: Variant[], fb: Variant[], box: BoxSpec): boolean {
  const { length_mm: L, width_mm: W, height_mm: H } = box.inner;
  return fa.some((a) =>
    fb.some(
      (b) =>
        a.dz + b.dz <= H ||
        (a.dx + b.dx <= L && Math.max(a.dy, b.dy) <= W) ||
        (a.dy + b.dy <= W && Math.max(a.dx, b.dx) <= L),
    ),
  );
}

function pairReject(units: PackingUnit[], variants: Variant[][], box: BoxSpec): string | null {
  if (units.length > PAIR_CHECK_MAX_UNITS) return null;
  const fitting = variants.map((vs) => fittingIn(vs, box));
  for (let i = 0; i < units.length; i += 1)
    for (let j = i + 1; j < units.length; j += 1) {
      const ok = pairFits(fitting[i] ?? [], fitting[j] ?? [], box);
      if (!ok) return `món ${units[i]?.sku ?? ''} và ${units[j]?.sku ?? ''} không thể đặt chung (không chồng được, không đặt cạnh nhau được)`;
    }
  return null;
}

/** Trần số bước duyệt khi chia món vào thùng — quá thì bỏ cuộc (không loại). */
const ASSIGN_MAX_NODES = 5_000;

/**
 * Điều kiện cần cho tổ hợp nhiều thùng: phải có cách giao MỖI món cho một thùng
 * sao cho món vừa thùng, tổng thể tích ≤ lòng, tổng cân ≤ tải, và từng cặp món
 * cùng thùng đặt chung được. Không có cách nào → tổ hợp không chứa được đơn.
 */
function assignReject(units: PackingUnit[], variants: Variant[][], combo: BoxSpec[]): string | null {
  if (units.length > PAIR_CHECK_MAX_UNITS) return null;
  const items = units
    .map((u, i) => ({ u, vol: unitVol(u), fit: combo.map((b) => (u.weight_g <= b.max_load_g ? fittingIn(variants[i] ?? [], b) : [])) }))
    .sort((x, y) => y.vol - x.vol);
  // `kind`: thùng giống hệt nhau — món vào thùng trống chỉ thử thùng trống đầu tiên cùng loại.
  const bins = combo.map((box) => ({
    box,
    vol: innerVol(box),
    load: box.max_load_g,
    kind: `${box.code}|${String(box.inner.height_mm)}|${String(box.max_load_g)}`,
    members: [] as typeof items,
  }));
  const state = { nodes: 0, gaveUp: false };
  const place = (k: number): boolean => {
    const item = items[k];
    if (!item) return true;
    if ((state.nodes += 1) > ASSIGN_MAX_NODES) {
      state.gaveUp = true;
      return true;
    }
    const tried = new Set<string>();
    for (const [b, bin] of bins.entries()) {
      const fb = item.fit[b] ?? [];
      if (fb.length === 0 || item.vol > bin.vol || item.u.weight_g > bin.load) continue;
      if (bin.members.length === 0) {
        if (tried.has(bin.kind)) continue;
        tried.add(bin.kind);
      }
      if (!bin.members.every((m) => pairFits(fb, m.fit[b] ?? [], bin.box))) continue;
      bin.vol -= item.vol;
      bin.load -= item.u.weight_g;
      bin.members.push(item);
      const ok = place(k + 1);
      bin.members.pop();
      bin.vol += item.vol;
      bin.load += item.u.weight_g;
      if (ok) return true;
    }
    return false;
  };
  if (place(0) || state.gaveUp) return null;
  return 'không có cách chia món vào các thùng thoả thể tích, tải và từng cặp món đặt chung';
}

function fits(variants: Variant[], u: PackingUnit, box: BoxSpec): boolean {
  return (
    u.weight_g <= box.max_load_g &&
    variants.some(
      (v) =>
        v.dx <= box.inner.length_mm &&
        v.dy <= box.inner.width_mm &&
        v.dz <= box.inner.height_mm,
    )
  );
}

/** Lý do tổ hợp KHÔNG THỂ chứa đơn (điều kiện cần bị vi phạm), hoặc null nếu chưa loại được. */
export function cheapReject(
  units: PackingUnit[],
  variants: Variant[][],
  combo: BoxSpec[],
): string | null {
  for (const [i, u] of units.entries()) {
    if (!combo.some((b) => fits(variants[i] ?? [], u, b)))
      return `món ${u.sku} không vừa thùng nào trong tổ hợp`;
  }
  const vol = units.reduce((s, u) => s + unitVol(u), 0);
  if (vol > combo.reduce((s, b) => s + innerVol(b), 0))
    return 'tổng thể tích hàng vượt tổng lòng thùng';
  const weight = units.reduce((s, u) => s + u.weight_g, 0);
  if (weight > combo.reduce((s, b) => s + b.max_load_g, 0))
    return 'tổng cân hàng vượt tổng tải thùng';
  const lightest = Math.min(...units.map((u) => u.weight_g));
  const nonBearing = units.every(
    (u) =>
      u.is_fragile ||
      u.max_stack_load_g === null ||
      u.max_stack_load_g < lightest,
  );
  if (nonBearing) {
    const footprint = units.reduce(
      (s, _u, i) =>
        s + Math.min(...(variants[i] ?? []).map((v) => v.dx * v.dy)),
      0,
    );
    const floor = combo.reduce(
      (s, b) => s + b.inner.length_mm * b.inner.width_mm,
      0,
    );
    if (footprint > floor)
      return 'mọi món không chịu được tải đè và tổng diện tích đáy vượt diện tích sàn';
  }
  const [only] = combo;
  if (combo.length === 1 && only) return pairReject(units, variants, only);
  return assignReject(units, variants, combo);
}

/**
 * Liệt kê tổ hợp (multiset) k thùng, tôn trọng tồn, có tổng `key` ≤ `limit`
 * (`key` ≥ 0, cộng được; sắp tăng dần để cắt nhánh). null nếu vượt trần.
 */
function multisets(
  boxes: BoxSpec[],
  k: number,
  key: (b: BoxSpec) => number,
  limit: number,
  stock: Map<string, number> | undefined,
): BoxSpec[][] | null {
  const sorted = [...boxes].sort((a, b) => key(a) - key(b) || a.code.localeCompare(b.code));
  const out: BoxSpec[][] = [];
  // Cờ trong object: TS không theo dõi được phép gán bên trong hàm lồng.
  const state = { overflow: false };
  const walk = (start: number, picked: BoxSpec[], total: number): void => {
    if (state.overflow) return;
    if (picked.length === k) {
      out.push([...picked]);
      if (out.length > MAX_MULTISETS) state.overflow = true;
      return;
    }
    for (let i = start; i < sorted.length; i += 1) {
      const b = sorted[i];
      if (!b) continue;
      // Tổng tối thiểu khi lấp phần còn lại bằng chính thùng này (đã sắp tăng dần).
      if (total + key(b) * (k - picked.length) > limit) break;
      const usedSame = picked.filter((x) => x.code === b.code).length;
      if (stock && usedSame + 1 > (stock.get(b.code) ?? 0)) continue;
      picked.push(b);
      walk(i, picked, total + key(b));
      picked.pop();
    }
  };
  walk(0, [], 0);
  return state.overflow ? null : out;
}

/** Số dòng "tổ hợp X bị loại" tối đa đưa vào lời giải thích (còn lại gộp thành 1 dòng đếm). */
const MAX_REJECT_LINES = 6;

export function proveOptimality(
  units: PackingUnit[],
  variants: Variant[][],
  boxes: BoxSpec[],
  stock: Map<string, number> | undefined,
  chosen: SolvedParcel[],
  lowerBound: number,
  charge: ChargeRule = DEFAULT_CHARGE_RULE,
): ProofResult {
  const k = chosen.length;
  const explanation: string[] = [];
  if (k === 0) return { label: 'heuristic', explanation, openCandidates: [] };
  const target: ProofTarget = {
    parcels: k,
    billable_g: chosen.reduce((s, p) => s + p.billable_weight_g, 0),
    box_price_vnd: sumPrice(chosen.map((p) => p.box)),
  };
  const bound = comboBound(units, variants, charge);
  const combos: BoxSpec[][] = [];
  for (let size = Math.max(1, lowerBound); size <= k; size += 1) {
    // Ít kiện hơn: mọi tổ hợp; đủ k kiện: chỉ tổ hợp có tổng cận dưới cước ≤ B.
    const found =
      size < k
        ? multisets(boxes, size, () => 0, 0, stock)
        : multisets(boxes, size, bound.floorG, target.billable_g, stock);
    if (found === null || combos.length + found.length > MAX_MULTISETS) {
      explanation.push('Quá nhiều tổ hợp thùng tốt hơn cần kiểm tra — không chứng minh.');
      return { label: 'heuristic', explanation, openCandidates: [] };
    }
    combos.push(...found.filter((c) => bound.canBeat(c, target)));
  }
  combos.sort(
    (a, b) =>
      a.length - b.length || bound.billableLb(a) - bound.billableLb(b) || sumPrice(a) - sumPrice(b),
  );
  if (lowerBound >= k) {
    explanation.push(
      `Không thể dùng ít hơn ${String(k)} kiện (cận dưới theo thể tích, cân và diện tích sàn).`,
    );
  }
  const open: BoxSpec[][] = [];
  let rejected = 0;
  for (const combo of combos) {
    const name = combo.map((b) => b.code).join(' + ');
    const splits = combo.length > 1 && combo.length === target.parcels ? bound.billSplits(combo, target) : null;
    const alive: BoxSpec[][] | null = splits ? [] : null;
    for (const c of splits ?? []) {
      if (cheapReject(units, variants, c)) continue;
      alive?.push(c);
      if ((alive?.length ?? 0) > MAX_BILL_SPLITS) break;
    }
    // Còn quá nhiều cách chia sau kiểm tra nhanh → gửi CP-SAT không kịp, dùng cách hạ từng thùng.
    if (alive && alive.length <= MAX_BILL_SPLITS) {
      if (alive.length > 0) {
        open.push(...alive);
        continue;
      }
      rejected += 1;
      if (rejected <= MAX_REJECT_LINES)
        explanation.push(`${name}: không thể — không cách cắt hạ nào vừa hàng mà tổng cước xuống được bậc dưới.`);
      continue;
    }
    let check = combo;
    let prefix = '';
    if (combo.length === target.parcels) {
      // Cùng số kiện: chỉ tốt hơn khi chồng hàng đủ thấp để cắt hạ xuống bậc cước dưới.
      const hs = bound.beatHeights(combo, target);
      if (hs.some((h) => h === null)) {
        rejected += 1;
        if (rejected <= MAX_REJECT_LINES)
          explanation.push(`${combo.map((b) => b.code).join(' + ')}: không thể — cắt hạ thấp nhất vẫn không xuống được bậc cước dưới.`);
        continue;
      }
      check = combo.map((b, i) => loweredBox(b, hs[i] ?? b.inner.height_mm));
      const cuts = check.flatMap((b) =>
        b.cut_from ? [`${combo.length > 1 ? `${b.code} ` : ''}≤ ${String(b.inner.height_mm / 10)} cm`] : [],
      );
      if (cuts.length > 0) prefix = `chỉ tốt hơn nếu cắt còn ${cuts.join(', ')}, mà `;
    }
    const reason = cheapReject(units, variants, check);
    if (!reason) {
      open.push(check);
      continue;
    }
    rejected += 1;
    if (rejected <= MAX_REJECT_LINES)
      explanation.push(`${combo.map((b) => b.code).join(' + ')}: không thể — ${prefix}${reason}.`);
  }
  if (rejected > MAX_REJECT_LINES)
    explanation.push(`… và ${String(rejected - MAX_REJECT_LINES)} tổ hợp khác cũng bị loại.`);
  if (open.length > 0) {
    explanation.push(
      `${String(open.length)} tổ hợp có thể tốt hơn chưa loại được bằng kiểm tra nhanh (vd ${open[0]?.map((b) => b.code).join(' + ') ?? ''}).`,
    );
    return { label: 'heuristic', explanation, openCandidates: open };
  }
  explanation.push(
    'Mọi tổ hợp ít kiện hơn, cước thấp hơn hoặc cùng cước mà rẻ hơn đều không thể chứa đơn → tối ưu về số kiện, cân tính cước và giá thùng.',
  );
  return { label: 'optimal_global', explanation, openCandidates: [] };
}
