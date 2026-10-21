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

export type OrderStockState = 'reserved' | 'deducted' | 'released';

type Doc = Record<string, unknown>;

/** Tối thiểu cần của 3 collection (driver gốc hoặc `model.collection`). */
export interface StockSettleCollections {
  orders: { updateOne(filter: Doc, update: Doc): Promise<{ modifiedCount: number }> };
  items: { find(filter: Doc): { toArray(): Promise<unknown[]> } };
  stocks: { updateOne(filter: Doc, update: Doc[]): Promise<unknown> };
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
  const lines = (await cols.items.find({ order_id: orderId }).toArray()) as { variant_id: unknown; quantity: number }[];
  for (const line of lines) {
    const minus = (field: string): Doc => ({ $max: [0, { $subtract: [`$${field}`, line.quantity] }] });
    await cols.stocks.updateOne(
      { variant_id: line.variant_id },
      [{ $set: { reserved_quantity: minus('reserved_quantity'), quantity_on_hand: minus('quantity_on_hand'), updated_at: new Date() } }],
    );
  }
  return true;
}
