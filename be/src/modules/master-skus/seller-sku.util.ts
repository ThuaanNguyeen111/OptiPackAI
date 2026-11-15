/**
 * Chuẩn hoá SKU sàn để so khớp: bỏ khoảng trắng 2 đầu + viết hoa.
 * Tách khỏi master-skus.service.ts (10/11/2026, BE-5) để schema `sku_bin_assignments`
 * dùng được trong hook mà không kéo cả service (tránh import vòng).
 */
export function normalizeSellerSku(sku: string): string {
  return sku.trim().toUpperCase();
}
