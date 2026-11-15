import type { PackableItem } from '../../../common/interfaces/packaging.interface';
import { FLAT_CATEGORIES } from '../../packaging/engine/units';
import { suggestSmallestBag, type BagSize } from '../../packaging/bag-fit.util';
import type { PackingPlan } from '../schemas/packing-plan.schema';

export function toItemProfiles(
  items: PackableItem[],
  bags: (BagSize & { code: string })[],
): PackingPlan['item_profiles'] {
  const seen = new Map<string, PackingPlan['item_profiles'][number]>();
  for (const i of items) {
    if (seen.has(i.sku)) continue;
    // (16/11/2026, user chốt) Quần áo luôn vào túi zip (PACKAGING_STANDARD §4); hồ sơ trống túi → túi nhỏ nhất vừa gói.
    const autoBag =
      !i.zip_bag_code && FLAT_CATEGORIES.has(i.product_category ?? '') ? (suggestSmallestBag(i, bags)?.code ?? null) : null;
    seen.set(i.sku, {
      sku: i.sku,
      product_category: i.product_category ?? null,
      zip_bag_code: i.zip_bag_code ?? autoBag,
      zip_bag_folded: i.zip_bag_folded ?? false,
    });
  }
  return [...seen.values()];
}
