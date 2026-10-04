import type { PackableItem } from '../src/common/interfaces/packaging.interface';
import {
  dress,
  jacket,
  jean,
  sandal,
  shoebox,
  sunglasses,
  tee,
} from '../src/modules/packaging/engine/scenarios/order-scenarios';

/**
 * Bộ sinh đơn ngẫu nhiên dùng chung cho các benchmark đóng gói (seed cố định
 * → tái lập). Phân bố gần shop thật: đa số 1-3 món, đuôi dài tới 60.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATALOG: ((qty: number, sku: string) => PackableItem)[] = [
  (q, s) => tee(q, `TEE-${s}`),
  (q, s) => jean(q, `JEAN-${s}`),
  (q, s) => jacket(q, `JACKET-${s}`),
  (q, s) => dress(q, `DRESS-${s}`),
  (q, s) => shoebox(q, `SHOE-${s}`),
  (q, s) => sandal(q, `SANDAL-${s}`),
  (q, s) => sunglasses(q, `GLASSES-${s}`),
  (q, s) => shoebox(q, `SHOE-HEAVY-${s}`, 2.5),
];

export function pickUnitCount(rand: () => number): number {
  const r = rand();
  if (r < 0.6) return 1 + Math.floor(rand() * 3); // 1-3
  if (r < 0.9) return 4 + Math.floor(rand() * 5); // 4-8
  if (r < 0.98) return 9 + Math.floor(rand() * 12); // 9-20
  return 21 + Math.floor(rand() * 40); // 21-60
}

export function generateOrder(rand: () => number): PackableItem[] {
  const total = pickUnitCount(rand);
  const items = new Map<string, PackableItem>();
  let left = total;
  while (left > 0) {
    const maker = CATALOG[Math.floor(rand() * CATALOG.length)];
    if (!maker) break;
    const qty = Math.min(left, 1 + Math.floor(rand() * 3));
    const sku = String(Math.floor(rand() * 3));
    const item = maker(qty, sku);
    const existing = items.get(item.sku);
    if (existing) existing.quantity += qty;
    else items.set(item.sku, item);
    left -= qty;
  }
  return [...items.values()];
}

