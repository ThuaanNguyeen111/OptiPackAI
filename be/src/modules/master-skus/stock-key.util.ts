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

/** Khớp seller_sku không phân biệt hoa/thường (tránh lệch chuỗi lúc gán ô vs đơn sàn). */
export function sellerSkuEqualsIgnoreCase(sellerSku: string): RegExp {
  const escaped = sellerSku.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Bộ lọc tồn kho cho 1 SKU sàn.
 * - Chưa nối: theo platform + shop_id + seller_sku (master_sku null).
 * - Đã nối: ưu tiên dòng gộp { master_sku }, ĐỒNG THỜI fallback dòng chưa gắn nhãn
 *   (master_sku null, đúng shop) — case Admin nhập tồn trước khi sync-stock / tạo mapping.
 *   Không fallback = Picking List «CHƯA GÁN» + pick-item 409 dù Admin thấy còn hàng.
 */
export function stockFilterFor(
  masterSku: string | undefined,
  platform: string,
  shopId: string,
  sellerSku: string,
): Record<string, unknown> {
  const unpooled: Record<string, unknown> = {
    platform,
    shop_id: shopId,
    seller_sku: sellerSkuEqualsIgnoreCase(sellerSku),
    master_sku: null, // null khớp cả dòng cũ không có field
  };
  if (!masterSku) return unpooled;
  return {
    $or: [{ master_sku: masterSku }, unpooled],
  };
}

/**
 * Các nhánh $or để lấy assignment cho Picking List (1 query cho nhiều SKU).
 * Gồm: (1) SKU chưa nối theo seller_sku, (2) tồn đã gộp theo master_sku,
 * (3) SKU đã nối nhưng tồn còn unpooled (chưa sync-stock).
 */
export function stockAssignmentOrBranches(
  platform: string,
  shopId: string,
  sellerSkus: string[],
  masters: Map<string, string>,
): Record<string, unknown>[] {
  const branches: Record<string, unknown>[] = [];
  const unmapped = sellerSkus.filter((s) => !masters.has(s));
  const mapped = sellerSkus.filter((s) => masters.has(s));
  const masterValues = [...new Set(masters.values())];

  if (unmapped.length > 0) {
    branches.push({
      platform,
      shop_id: shopId,
      seller_sku: { $in: unmapped },
      master_sku: null,
    });
    // Case-insensitive: từng SKU (tránh lệch hoa/thường so với $in exact).
    for (const sku of unmapped) {
      branches.push({
        platform,
        shop_id: shopId,
        seller_sku: sellerSkuEqualsIgnoreCase(sku),
        master_sku: null,
      });
    }
  }
  if (masterValues.length > 0) {
    branches.push({ master_sku: { $in: masterValues } });
  }
  // Fallback unpooled cho SKU đã nối (Admin nhập tồn trước khi gắn nhãn master).
  for (const sku of mapped) {
    branches.push({
      platform,
      shop_id: shopId,
      seller_sku: sellerSkuEqualsIgnoreCase(sku),
      master_sku: null,
    });
  }
  return branches;
}

/** Khóa tồn kho dạng chuỗi — dùng cho giữ chỗ (K5) và gom nhóm. */
export function stockKeyOf(masterSku: string | undefined, platform: string, shopId: string, sellerSku: string): string {
  return masterSku ? `M:${masterSku}` : `S:${platform}|${shopId}|${normalizeSellerSku(sellerSku)}`;
}
