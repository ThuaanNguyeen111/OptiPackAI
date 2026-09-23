import type { BoxSpec, Orientation, PackingUnit, Placement } from './types';
import { PRODUCT_CATEGORY_LABELS, ProductCategory } from '../../../common/enums/product-category.enum';

/**
 * ===================================================================
 * Hướng dẫn đóng gói từng bước — phần DỮ KIỆN (21/09/2026)
 * ===================================================================
 * Hàm thuần, không gọi DB/mạng. Engine đã quyết định món nào, ở đâu,
 * xoay ra sao, theo thứ tự nào (`placement.step`). File này chỉ đổi toạ
 * độ thành dữ kiện dễ hiểu cho người đóng hàng (góc nào, đặt lên món
 * nào, xoay thế nào) và dựng câu hướng dẫn mẫu.
 *
 * Mô hình ngôn ngữ (packing-guide-ai.service.ts) CHỈ được viết lại lời
 * từ các dữ kiện này — không được đổi vị trí/thứ tự. Khi không có API
 * key hoặc AI trả sai, dùng thẳng câu mẫu ở đây.
 *
 * Quy ước nhìn thùng: người đóng hàng đứng trước thùng. Trục x (chiều
 * dài thùng) chạy trái → phải, trục y (chiều rộng) chạy phía trước
 * (sát người) → phía sau, trục z hướng lên.
 * ===================================================================
 */

export interface GuideZipBag {
  code: string;
  name: string;
  /** true = gập đôi túi sau khi cho hàng vào. */
  folded: boolean;
}

/** Hồ sơ chụp từ SKU (loại sản phẩm + túi zip) — không ảnh hưởng hình học. */
export interface GuideItemProfile {
  product_category: string | null;
  zip_bag: GuideZipBag | null;
}

export interface GuideStepFacts {
  step: number;
  item_key: string;
  sku: string;
  /** Tên loại sản phẩm tiếng Việt, VD "áo thun"; null nếu chưa phân loại. */
  product_type: string | null;
  /** Túi zip phải cho món này vào TRƯỚC khi xếp; null = không dùng túi. */
  zip_bag: GuideZipBag | null;
  /** (22/09/2026) Engine gập đôi món này (theo chiều dài) để vừa thùng nhỏ hơn. */
  folded_in_half: boolean;
  is_fragile: boolean;
  /** true = hồ sơ kho cấm đặt vật khác lên trên món này. */
  no_stack_on_top: boolean;
  /** Vị trí theo mặt bằng thùng, VD "góc trái – phía trước". */
  position: string;
  /** Mô tả cách xoay món hàng. */
  orientation_hint: string;
  /** item_key các món nằm ngay bên dưới; rỗng = đặt sát đáy thùng. */
  rests_on: string[];
  size_mm: { dx: number; dy: number; dz: number };
}

export interface GuideStepText {
  step: number;
  instruction: string;
  tip: string | null;
}

export interface GuideText {
  summary: string;
  steps: GuideStepText[];
}

function third(start: number, size: number, total: number, labels: [string, string, string]): string {
  const center = start + size / 2;
  if (center < total / 3) return labels[0];
  if (center > (total * 2) / 3) return labels[2];
  return labels[1];
}

export function describePosition(p: Placement, box: BoxSpec): string {
  const horizontal = third(p.x, p.dx, box.inner.length_mm, ['bên trái', 'giữa', 'bên phải']);
  const depth = third(p.y, p.dy, box.inner.width_mm, ['phía trước', 'giữa', 'phía sau']);
  if (horizontal === 'giữa' && depth === 'giữa') return 'chính giữa thùng';
  if (horizontal === 'giữa') return `${depth}, chính giữa theo chiều ngang`;
  if (depth === 'giữa') return `${horizontal}, giữa theo chiều sâu`;
  return `góc ${horizontal.replace('bên ', '')} – ${depth}`;
}

export function describeOrientation(orientation: Orientation): string {
  switch (orientation) {
    case 'LWH':
      return 'để nguyên chiều như trên kệ, mặt trên hướng lên';
    case 'WLH':
      return 'xoay ngang 90°, vẫn giữ mặt trên hướng lên';
    case 'LHW':
    case 'HLW':
      return 'đặt nằm nghiêng, mặt bên áp xuống dưới';
    case 'WHL':
    case 'HWL':
      return 'dựng đứng, cạnh dài nhất hướng lên';
  }
}

function overlapsInPlan(a: Placement, b: Placement): boolean {
  return a.x < b.x + b.dx && b.x < a.x + a.dx && a.y < b.y + b.dy && b.y < a.y + a.dy;
}

function productTypeLabel(category: string | null | undefined): string | null {
  if (!category) return null;
  return (PRODUCT_CATEGORY_LABELS as Record<string, string | undefined>)[category] ?? null;
}

/**
 * Dựng dữ kiện cho từng bước theo đúng thứ tự `step` của engine.
 * `units` có thể thiếu (VD đơn đã đóng xong, không còn lượt lấy hàng) —
 * khi đó coi như không dễ vỡ và không có giới hạn chồng.
 */
export function describePackingSteps(
  placements: Placement[],
  box: BoxSpec,
  units: PackingUnit[] = [],
  profiles = new Map<string, GuideItemProfile>(),
): GuideStepFacts[] {
  const unitByKey = new Map(units.map((u) => [u.item_key, u]));
  const ordered = [...placements].sort((a, b) => a.step - b.step);
  return ordered.map((p, index) => {
    const unit = unitByKey.get(p.item_key);
    const below = ordered
      .slice(0, index)
      .filter((q) => q.z + q.dz === p.z && p.z > 0 && overlapsInPlan(p, q))
      .map((q) => q.item_key);
    const profile = profiles.get(p.sku);
    return {
      step: index + 1,
      item_key: p.item_key,
      sku: p.sku,
      product_type:
        profile?.product_category === ProductCategory.OTHER ? null : productTypeLabel(profile?.product_category),
      zip_bag: profile?.zip_bag ?? null,
      folded_in_half: p.folded === true,
      is_fragile: unit?.is_fragile ?? false,
      no_stack_on_top: unit ? unit.max_stack_load_g === null : false,
      position: describePosition(p, box),
      orientation_hint: describeOrientation(p.orientation),
      rests_on: below,
      size_mm: { dx: p.dx, dy: p.dy, dz: p.dz },
    };
  });
}

/** Câu hướng dẫn mẫu — dùng khi không có AI hoặc AI trả sai. */
export function buildTemplateGuide(
  facts: GuideStepFacts[],
  box: BoxSpec,
  fillRatio: number | null,
  bubbleWrapCount: number,
): GuideText {
  const steps = facts.map((f) => {
    const where = f.rests_on.length === 0 ? 'sát đáy thùng' : `lên trên ${f.rests_on.join(', ')}`;
    const itemName = f.product_type ? `${f.product_type} ${f.sku}` : `món ${f.sku}`;
    const actions: string[] = [];
    if (f.zip_bag) {
      actions.push(`Cho ${itemName} (${f.item_key}) vào túi zip ${f.zip_bag.name}${f.zip_bag.folded ? ', gập đôi túi' : ''}`);
    }
    if (f.folded_in_half) {
      actions.push(f.zip_bag ? 'gập đôi cả gói theo chiều dài' : `Gập đôi ${itemName} (${f.item_key}) theo chiều dài`);
    }
    if (f.is_fragile) {
      actions.push(actions.length > 0 ? 'bọc xốp hơi' : `Bọc xốp hơi ${itemName} (${f.item_key})`);
    }
    if (actions.length === 0) actions.push(`Lấy ${itemName} (${f.item_key})`);
    const tips: string[] = [];
    if (f.is_fragile) tips.push('Hàng dễ vỡ, bọc kín trước khi đặt.');
    if (f.no_stack_on_top) tips.push('Không đặt món nào đè lên món này.');
    if (f.zip_bag) tips.push('Vuốt hết không khí và kéo kín miệng túi trước khi xếp.');
    if (f.folded_in_half) tips.push('Gập đôi giúp dùng được thùng nhỏ hơn — ép phẳng nếp gập.');
    return {
      step: f.step,
      instruction: `${actions.join(', ')}, ${f.orientation_hint}, đặt ${where} ở ${f.position}.`,
      tip: tips.length > 0 ? tips.join(' ') : null,
    };
  });
  const bagCounts = new Map<string, number>();
  for (const f of facts) {
    if (f.zip_bag) bagCounts.set(f.zip_bag.name, (bagCounts.get(f.zip_bag.name) ?? 0) + 1);
  }
  const bags =
    bagCounts.size > 0
      ? ` Chuẩn bị ${[...bagCounts].map(([name, count]) => `${String(count)} túi zip ${name}`).join(', ')}.`
      : '';
  const fill = fillRatio === null ? '' : `, lấp đầy khoảng ${String(Math.round(fillRatio * 100))}% lòng thùng`;
  const wrap = bubbleWrapCount > 0 ? ` Chuẩn bị ${String(bubbleWrapCount)} tấm xốp hơi cho hàng dễ vỡ.` : '';
  return {
    summary: `Dùng thùng ${box.name} (${box.code}) cho ${String(facts.length)} món${fill}. Đặt theo đúng thứ tự dưới đây, món to và cứng nằm dưới.${bags}${wrap} Đếm lại đủ ${String(facts.length)} món trước khi dán thùng.`,
    steps,
  };
}
