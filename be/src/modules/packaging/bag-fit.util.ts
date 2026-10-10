/**
 * Kiểm túi zip có vừa món không (08/10/2026) — hàm thuần.
 *
 * Gói đã đo (sau khi bọc/gập) có 3 cạnh; sắp xếp a ≥ b ≥ t (t = độ dày). Túi
 * trải phẳng W×L bọc quanh gói: nửa chu vi mặt cắt (b + t) phải lọt chiều rộng
 * túi cộng lề, còn chiều dài gói (a) cộng độ dày và phần mép khoá kéo phải lọt
 * chiều dài túi. Thử cả hai chiều xoay của túi. Lề là số khởi đầu chưa hiệu
 * chỉnh — chỉnh lại khi kho có dữ liệu thật.
 */
export const BAG_WIDTH_MARGIN_MM = 10;
export const BAG_LENGTH_MARGIN_MM = 30;

export interface BagSize {
  width_mm: number;
  length_mm: number;
}

export interface PackageSizeCm {
  length_cm: number;
  width_cm: number;
  height_cm: number;
}

/** Ba cạnh gói theo mm, sắp giảm dần: [a, b, t]. */
export function packageEdgesMm(p: PackageSizeCm): [number, number, number] {
  const edges = [p.length_cm, p.width_cm, p.height_cm].map((cm) => Math.ceil(Math.round(cm * 10 * 1000) / 1000));
  edges.sort((x, y) => y - x);
  return [edges[0] ?? 0, edges[1] ?? 0, edges[2] ?? 0];
}

export function bagFits(pkg: PackageSizeCm, bag: BagSize): boolean {
  const [a, b, t] = packageEdgesMm(pkg);
  const need = { width: b + t + BAG_WIDTH_MARGIN_MM, length: a + t + BAG_LENGTH_MARGIN_MM };
  return (
    (need.width <= bag.width_mm && need.length <= bag.length_mm) ||
    (need.width <= bag.length_mm && need.length <= bag.width_mm)
  );
}

/** Túi nhỏ nhất (theo diện tích) còn vừa gói; null nếu không túi nào vừa. */
export function suggestSmallestBag<T extends BagSize>(pkg: PackageSizeCm, bags: T[]): T | null {
  let best: T | null = null;
  for (const bag of bags) {
    if (!bagFits(pkg, bag)) continue;
    if (best === null || bag.width_mm * bag.length_mm < best.width_mm * best.length_mm) best = bag;
  }
  return best;
}
