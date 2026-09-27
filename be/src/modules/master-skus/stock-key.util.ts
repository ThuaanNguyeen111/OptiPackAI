import { Model } from 'mongoose';
import { MarketplaceSkuMappingDocument } from './schemas/marketplace-sku-mapping.schema';
import { normalizeSellerSku } from './master-skus.service';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';

/**
 * ===================================================================
 * K4b (27/09/2026) — "ĐƯỜNG LÙI": tra SKU sàn -> SKU nội bộ (nếu đã nối).
 * ===================================================================
 * Mọi chỗ đụng tới tồn kho (quét hàng, Picking List, gán ô, chuyển ô, nhập
 * lại hàng hoàn, giữ chỗ K5) đều đi qua đây:
 *   - SKU sàn ĐÃ NỐI  -> tìm tồn theo { master_sku }  (chung mọi sàn/shop)
 *   - SKU sàn CHƯA NỐI -> tìm tồn theo { platform, shop_id, seller_sku } như trước K4b
 * Nhờ vậy bật K4b lúc nào cũng an toàn: nối tới đâu, tồn gộp tới đó.
 * Hàm thuần nhận model — dùng được ở cả warehouse lẫn order-groups mà KHÔNG
 * phải import module của nhau (tránh phụ thuộc vòng).
 * ===================================================================
 */
export async function resolveMasterSkus(
  mappingModel: Model<MarketplaceSkuMappingDocument>,
  platform: MarketplacePlatform,
  shopId: string,
  sellerSkus: string[],
): Promise<Map<string, string>> {
  if (sellerSkus.length === 0) return new Map();
  const normalized = sellerSkus.map(normalizeSellerSku);
  const rows = await mappingModel
    .find({ platform, shop_id: shopId, seller_sku_normalized: { $in: normalized } })
    .select('seller_sku_normalized master_sku')
    .lean();
  const byNorm = new Map(rows.map((r) => [r.seller_sku_normalized, r.master_sku]));
  const out = new Map<string, string>();
  for (const sku of sellerSkus) {
    const m = byNorm.get(normalizeSellerSku(sku));
    if (m) out.set(sku, m);
  }
  return out;
}

/** Bộ lọc tồn kho cho 1 SKU sàn: theo SKU nội bộ nếu đã nối, ngược lại theo SKU sàn. */
export function stockFilterFor(
  masterSku: string | undefined,
  platform: string,
  shopId: string,
  sellerSku: string,
): Record<string, unknown> {
  return masterSku
    ? { master_sku: masterSku }
    : { platform, shop_id: shopId, seller_sku: sellerSku, master_sku: null }; // null khớp cả dòng cũ không có field
}

/** Khóa tồn kho dạng chuỗi — dùng cho giữ chỗ (K5) và gom nhóm. */
export function stockKeyOf(masterSku: string | undefined, platform: string, shopId: string, sellerSku: string): string {
  return masterSku ? `M:${masterSku}` : `S:${platform}|${shopId}|${normalizeSellerSku(sellerSku)}`;
}
