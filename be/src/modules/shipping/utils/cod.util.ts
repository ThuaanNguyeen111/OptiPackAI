import { MarketplacePlatform } from '../../marketplace-integration/enums/platform.enum';

/**
 * AOFP-319 — tiền hãng phải thu hộ của 1 đơn: đơn COD thu đủ `total_amount`, đơn đã trả trước = 0.
 * AURELLE chỉ có COD nên đơn đồng bộ trước khi lưu `payment_method` (null) vẫn tính là COD.
 * 26/11/2026 — đơn giao thiếu: trừ phần thiếu (`short_shipped_amount`), phí ship giữ nguyên.
 */
export function codAmountOf(order: {
  platform: string;
  payment_method?: string | null;
  total_amount: number;
  short_shipped_amount?: number | null;
}): number {
  const method = order.payment_method?.trim().toUpperCase() ?? (order.platform === (MarketplacePlatform.AURELLE as string) ? 'COD' : '');
  return method === 'COD' ? amountAfterShortage(order) : 0;
}

/** 26/11/2026 — số tiền đơn sau khi trừ phần kho giao thiếu (không âm). */
export function amountAfterShortage(order: { total_amount: number; short_shipped_amount?: number | null }): number {
  return Math.max(0, Math.round(order.total_amount - (order.short_shipped_amount ?? 0)));
}

/**
 * AOFP-319 — mỗi đơn thu COD đúng 1 lần, ở kiện có số nhỏ nhất chứa đơn đó. Trả mảng cùng thứ
 * tự `parcels`: phần tử i = các đơn thu tiền ở kiện i (rỗng = kiện không thu).
 */
export function codOrderIdsPerParcel(parcels: { parcelNo?: number; orderIds: string[] }[]): string[][] {
  const byNo = parcels.map((_, i) => i).sort((a, b) => (parcels[a]?.parcelNo ?? a) - (parcels[b]?.parcelNo ?? b));
  const seen = new Set<string>();
  const out = parcels.map((): string[] => []);
  for (const i of byNo) {
    for (const id of parcels[i]?.orderIds ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      out[i]?.push(id);
    }
  }
  return out;
}
