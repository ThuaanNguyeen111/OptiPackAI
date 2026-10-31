import { orientedDims } from './units';
import type { MailerSpec, Orientation, PackingUnit, Placement } from './types';

/**
 * ===================================================================
 * Túi niêm phong — kiểm vừa túi (AOFP-224, 31/10/2026) — hàm thuần
 * ===================================================================
 * docs/PACKAGING_STANDARD.md §4.3. Các món `mailer_ok` nằm CHỒNG PHẲNG
 * trong túi (mặt lớn nằm ngang). Chồng hàng có mặt đáy a ≥ b (lớn nhất của
 * các món) và độ dày t = tổng độ dày. Túi rộng W × dài L bọc quanh chồng
 * theo nửa chu vi mặt cắt — cùng nguyên lý `bag-fit.util.ts` của túi zip:
 *   b + t + lề_rộng ≤ W  và  a + t + lề_dài ≤ L   (thử cả 2 chiều xoay túi)
 * kèm t ≤ dày tối đa và tổng cân ≤ tải túi. Đơn vị mm / g.
 * ===================================================================
 */

export interface MailerFitOptions {
  widthMarginMm: number;
  lengthMarginMm: number;
  maxThicknessMm: number;
}

/** Số khởi đầu (giả định — kho chỉnh trong packing_settings). */
export const DEFAULT_MAILER_FIT: MailerFitOptions = {
  widthMarginMm: 20,
  lengthMarginMm: 30,
  maxThicknessMm: 80,
};

/** Một món đã đặt nằm phẳng: hướng xoay + 3 cạnh sau xoay (dx ≥ dy, dz = độ dày). */
export interface FlatUnit {
  unit: PackingUnit;
  orientation: Orientation;
  dx: number;
  dy: number;
  dz: number;
}

export interface MailerStack {
  items: FlatUnit[];
  /** Cạnh dài / cạnh ngắn mặt đáy lớn nhất của chồng. */
  a: number;
  b: number;
  /** Tổng độ dày. */
  t: number;
  weight_g: number;
}

/**
 * Hướng nằm phẳng nhất trong các hướng món được phép: độ dày nhỏ nhất, rồi
 * cạnh dài nằm theo trục x. Quần áo chỉ có hướng đứng (LWH/WLH) → giữ nguyên
 * độ dày đã đo.
 */
export function flattest(unit: PackingUnit): FlatUnit {
  let best: FlatUnit | null = null;
  for (const orientation of unit.orientations) {
    const [dx, dy, dz] = orientedDims(unit, orientation);
    if (dx < dy) continue;
    if (best === null || dz < best.dz) best = { unit, orientation, dx, dy, dz };
  }
  if (best !== null) return best;
  // Mọi hướng đều có dx < dy (chỉ xảy ra khi danh sách hướng hẹp) — lấy hướng đầu.
  const orientation = unit.orientations[0] ?? 'LWH';
  const [dx, dy, dz] = orientedDims(unit, orientation);
  return { unit, orientation, dx, dy, dz };
}

/** Xếp chồng: mặt đáy lớn nằm dưới (ổn định, món nhỏ không bị kẹp giữa). */
export function stackOf(units: readonly PackingUnit[]): MailerStack {
  const items = units
    .map(flattest)
    .sort((p, q) => q.dx * q.dy - p.dx * p.dy || p.unit.item_key.localeCompare(q.unit.item_key));
  return {
    items,
    a: items.reduce((m, f) => Math.max(m, f.dx), 0),
    b: items.reduce((m, f) => Math.max(m, f.dy), 0),
    t: items.reduce((s, f) => s + f.dz, 0),
    weight_g: items.reduce((s, f) => s + f.unit.weight_g, 0),
  };
}

export function mailerFits(
  stack: Pick<MailerStack, 'a' | 'b' | 't' | 'weight_g'>,
  mailer: Pick<MailerSpec, 'width_mm' | 'length_mm' | 'max_load_g'>,
  options: MailerFitOptions = DEFAULT_MAILER_FIT,
): boolean {
  if (stack.t > options.maxThicknessMm || stack.weight_g > mailer.max_load_g) return false;
  const needW = stack.b + stack.t + options.widthMarginMm;
  const needL = stack.a + stack.t + options.lengthMarginMm;
  return (
    (needW <= mailer.width_mm && needL <= mailer.length_mm) ||
    (needW <= mailer.length_mm && needL <= mailer.width_mm)
  );
}

/**
 * Kích thước tính cước của túi đã nhồi (mm): túi ôm sát chồng hàng, không
 * tính phần túi thừa — dài a + 10, rộng b + 10, cao t + 5 (giả định §4.3).
 */
export function filledMailerDims(stack: Pick<MailerStack, 'a' | 'b' | 't'>): {
  length_mm: number;
  width_mm: number;
  height_mm: number;
} {
  return { length_mm: stack.a + 10, width_mm: stack.b + 10, height_mm: stack.t + 5 };
}

/** Tọa độ chồng phẳng trong túi: căn góc (0,0), món lớn dưới cùng, thứ tự = thứ tự đặt. */
export function stackPlacements(stack: MailerStack): Placement[] {
  let z = 0;
  return stack.items.map((f, i) => {
    const p: Placement = {
      item_key: f.unit.item_key,
      sku: f.unit.sku,
      step: i + 1,
      x: 0,
      y: 0,
      z,
      dx: f.dx,
      dy: f.dy,
      dz: f.dz,
      orientation: f.orientation,
      folded: f.unit.folded === true,
    };
    z += f.dz;
    return p;
  });
}
