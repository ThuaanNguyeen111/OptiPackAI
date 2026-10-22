/**
 * ===================================================================
 * Giữ chỗ tồn của website AURELLE (21/10/2026)
 * ===================================================================
 * Đặt hàng → `reserved_quantity += số lượng`. Khách huỷ thì trả lại (cổng
 * huỷ nguyên tử trong StorefrontOrdersService.cancel, đánh dấu `released`).
 * Trước đây khi hàng đã RỜI KHO (OptiPack báo shipped/delivered/...) không ai
 * trừ → số giữ chỗ chỉ tăng, "còn bán được" giảm mãi. Mỗi đơn nay có
 * `stock_state`:
 *   reserved ──(hàng rời kho)──► deducted   (bớt giữ chỗ + bớt tồn thực)
 *   reserved ──(khách huỷ)────► released   (chỉ bớt giữ chỗ)
 * Đổi `stock_state` TRƯỚC bằng điều kiện "còn reserved" → gọi lại nhiều lần,
 * hai nơi cùng gọi cũng chỉ trừ 1 lần. Dùng thao tác driver gốc để mock Open
 * API (cổng 4000, ngoài Nest) dùng chung được.
 * ===================================================================
 */

export type OrderStockState = 'reserved' | 'deducted' | 'released' | 'restocked';

/**
 * 22/10/2026 — Website chỉ bán SKU có tồn do kho OptiPack quản (`stock_source = 'optipack'`,
 * OptiPack đẩy số sang) → không còn chuyện website nhận đơn mà kho không có hàng. Tắt bằng
 * `STOREFRONT_REQUIRE_OPTIPACK_STOCK=false` (demo website độc lập không có OptiPack).
 */
export function requireOptipackStock(): boolean {
  return process.env.STOREFRONT_REQUIRE_OPTIPACK_STOCK !== 'false';
}

/** 22/10/2026 — số còn bán được của 1 biến thể (0 khi SKU chưa do kho OptiPack quản và đang bật quy tắc trên). */
export function sellableQuantity(
  variant: { stock_source?: string | null } | null | undefined,
  stock: { quantity_on_hand?: number; reserved_quantity?: number } | null | undefined,
): number {
  if (requireOptipackStock() && variant?.stock_source !== 'optipack') return 0;
  return Math.max(0, (stock?.quantity_on_hand ?? 0) - (stock?.reserved_quantity ?? 0));
}

type Doc = Record<string, unknown>;

/** Tối thiểu cần của 3 collection (driver gốc hoặc `model.collection`). */
export interface StockSettleCollections {
  orders: { updateOne(filter: Doc, update: Doc): Promise<{ modifiedCount: number }> };
  items: { find(filter: Doc): { toArray(): Promise<unknown[]> } };
  stocks: { updateOne(filter: Doc, update: Doc[]): Promise<unknown> };
}

interface StockLine { variant_id: unknown; quantity: number; short_quantity?: number | null }

/** 22/10/2026 — số đơn vị thực sự rời kho của 1 dòng (trừ phần kho báo giao thiếu). */
function shippedUnits(line: StockLine): number {
  return Math.max(0, line.quantity - (line.short_quantity ?? 0));
}

/** Đơn chưa từng có `stock_state` (đặt trước 21/10/2026) coi như đang giữ chỗ. */
const STILL_RESERVED = { $in: ['reserved', null] };

/**
 * Trừ hẳn phần giữ chỗ của 1 đơn khi hàng đã rời kho. Trả `true` nếu lần gọi
 * này thực sự trừ, `false` nếu đơn đã được xử lý trước đó (deducted/released).
 */
export async function deductOrderStock(cols: StockSettleCollections, orderId: unknown): Promise<boolean> {
  const flipped = await cols.orders.updateOne(
    { _id: orderId, stock_state: STILL_RESERVED },
    { $set: { stock_state: 'deducted' } },
  );
  if (flipped.modifiedCount !== 1) return false;
  const lines = (await cols.items.find({ order_id: orderId }).toArray()) as StockLine[];
  for (const line of lines) {
    // Phần giao thiếu đã được nhả giữ chỗ lúc kho báo (releaseShortStock) → chỉ trừ phần giao thật.
    const units = shippedUnits(line);
    if (units === 0) continue;
    const minus = (field: string): Doc => ({ $max: [0, { $subtract: [`$${field}`, units] }] });
    await cols.stocks.updateOne(
      { variant_id: line.variant_id },
      [{ $set: { reserved_quantity: minus('reserved_quantity'), quantity_on_hand: minus('quantity_on_hand'), updated_at: new Date() } }],
    );
  }
  return true;
}

/**
 * 22/10/2026 — Hàng bị hoàn về kho (giao thất bại → `returned`): cộng lại tồn website đúng
 * phần đã trừ lúc rời kho. Chỉ 1 lần (deducted → restocked). Với SKU kho OptiPack quản,
 * lượt đẩy tồn kế tiếp vẫn ghi đè bằng số của kho — phép cộng này chỉ để SKU website tự quản không mất số.
 */
export async function restockReturnedOrder(cols: StockSettleCollections, orderId: unknown): Promise<boolean> {
  const flipped = await cols.orders.updateOne(
    { _id: orderId, stock_state: 'deducted' },
    { $set: { stock_state: 'restocked' } },
  );
  if (flipped.modifiedCount !== 1) return false;
  const lines = (await cols.items.find({ order_id: orderId }).toArray()) as StockLine[];
  for (const line of lines) {
    const units = shippedUnits(line);
    if (units === 0) continue;
    await cols.stocks.updateOne(
      { variant_id: line.variant_id },
      [{ $set: { quantity_on_hand: { $add: ['$quantity_on_hand', units] }, updated_at: new Date() } }],
    );
  }
  return true;
}

/**
 * 22/10/2026 — Nhả giữ chỗ của đơn còn đang giữ (người bán hủy). Khác khách hủy ở chỗ gọi từ
 * Open API (mock) — cùng quy tắc đổi trạng thái trước để chỉ nhả 1 lần.
 */
export async function releaseOrderStock(cols: StockSettleCollections, orderId: unknown): Promise<boolean> {
  const flipped = await cols.orders.updateOne(
    { _id: orderId, stock_state: { $in: ['reserved', null] } },
    { $set: { stock_state: 'released' } },
  );
  if (flipped.modifiedCount !== 1) return false;
  const lines = (await cols.items.find({ order_id: orderId }).toArray()) as StockLine[];
  for (const line of lines) {
    const units = shippedUnits(line);
    if (units === 0) continue;
    await cols.stocks.updateOne(
      { variant_id: line.variant_id },
      [{ $set: { reserved_quantity: { $max: [0, { $subtract: ['$reserved_quantity', units] }] }, updated_at: new Date() } }],
    );
  }
  return true;
}

/** 22/10/2026 — nhả giữ chỗ cho phần kho báo giao thiếu (đơn vẫn đang giữ chỗ phần còn lại). */
export async function releaseShortStock(
  cols: StockSettleCollections,
  shorts: { variant_id: unknown; units: number }[],
): Promise<void> {
  for (const s of shorts) {
    if (s.units <= 0) continue;
    await cols.stocks.updateOne(
      { variant_id: s.variant_id },
      [{ $set: { reserved_quantity: { $max: [0, { $subtract: ['$reserved_quantity', s.units] }] }, updated_at: new Date() } }],
    );
  }
}
