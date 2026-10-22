import { normalizeSellerSku } from './master-skus.service';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';

/**
 * ===================================================================
 * 21/10/2026 — TỒN KHO KHOÁ THEO MÃ SKU, KHÔNG PHÂN BIỆT SÀN/SHOP.
 * ===================================================================
 * Quy ước: mọi sàn dùng CHUNG một mã SKU cho cùng một món (Lazada, AURELLE,
 * sàn khác...). Tồn tính chung theo mã đã chuẩn hóa (cắt khoảng trắng + chữ HOA).
 * Không còn bảng quy đổi SKU sàn -> SKU nội bộ: `master_sku` của dòng tồn luôn
 * bằng chính mã SKU đã chuẩn hóa, nên toàn bộ logic gộp tồn/giữ chỗ/chọn ô có
 * sẵn vẫn chạy nguyên, chỉ thay nguồn của khoá.
 * Sàn nào bắt buộc đặt mã khác thì phải đặt lại mã trên sàn cho trùng.
 * Hàm thuần nhận model (giữ chữ ký cũ cho các nơi gọi) — dùng được ở warehouse lẫn
 * order-groups mà KHÔNG phải import module của nhau.
 * ===================================================================
 */
export function resolveMasterSkus(
  _mappingModel: unknown,
  _platform: MarketplacePlatform,
  _shopId: string,
  sellerSkus: string[],
): Promise<Map<string, string>> {
  return Promise.resolve(new Map(sellerSkus.map((sku) => [sku, normalizeSellerSku(sku)])));
}

/** Khớp seller_sku không phân biệt hoa/thường (tránh lệch chuỗi lúc gán ô vs đơn sàn). */
export function sellerSkuEqualsIgnoreCase(sellerSku: string): RegExp {
  const escaped = sellerSku.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Bộ lọc KHỚP CHÍNH XÁC dùng cho `findOneAndUpdate(..., { upsert: true })` — chỉ gồm
 * điều kiện so sánh bằng (MongoDB chỉ chép điều kiện bằng cấp trên vào dòng mới;
 * `$or`/regex không được chép). Dòng mới luôn mang `master_sku` = mã SKU chuẩn hóa.
 */
export function stockUpsertFilterFor(
  _masterSku: string | undefined,
  _platform: string,
  _shopId: string,
  sellerSku: string,
): Record<string, unknown> {
  return { master_sku: normalizeSellerSku(sellerSku) };
}

/**
 * Bộ lọc tồn kho cho 1 SKU — CHỈ dùng để TÌM / TRỪ / CỘNG dòng đã có (không upsert).
 * Dòng đã gắn nhãn theo mã SKU, hoặc dòng cũ chưa gắn nhãn (master_sku null) cùng mã SKU
 * — không phân biệt sàn/shop.
 */
export function stockFilterFor(
  _masterSku: string | undefined,
  _platform: string,
  _shopId: string,
  sellerSku: string,
): Record<string, unknown> {
  return {
    $or: [{ master_sku: normalizeSellerSku(sellerSku) }, { seller_sku: sellerSkuEqualsIgnoreCase(sellerSku), master_sku: null }],
  };
}

/** Các nhánh $or để lấy dòng tồn cho Picking List (1 query cho nhiều SKU). */
export function stockAssignmentOrBranches(
  _platform: string,
  _shopId: string,
  sellerSkus: string[],
): Record<string, unknown>[] {
  const norms = [...new Set(sellerSkus.map(normalizeSellerSku))];
  const branches: Record<string, unknown>[] = [];
  if (norms.length > 0) branches.push({ master_sku: { $in: norms } });
  // Dòng cũ chưa gắn nhãn (trước khi chạy script chuyển) — vẫn tìm được theo mã SKU.
  for (const sku of sellerSkus) branches.push({ seller_sku: sellerSkuEqualsIgnoreCase(sku), master_sku: null });
  return branches;
}

/** Khóa tồn kho dạng chuỗi — dùng cho giữ chỗ (K5) và gom nhóm. */
export function stockKeyOf(_masterSku: string | undefined, _platform: string, _shopId: string, sellerSku: string): string {
  return `M:${normalizeSellerSku(sellerSku)}`;
}
