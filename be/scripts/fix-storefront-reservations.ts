import mongoose, { Types } from 'mongoose';

/**
 * ===================================================================
 * SỬA SỐ GIỮ CHỖ TỒN WEBSITE AURELLE — 21/10/2026
 * ===================================================================
 * Trước 21/10/2026 mỗi lần đặt hàng `reserved_quantity += số lượng` nhưng KHÔNG
 * có bước trả lại (huỷ) hay trừ hẳn (giao) → số giữ chỗ chỉ tăng, "còn bán được"
 * giảm mãi. Code mới có `stock_state` trên từng đơn; script này đưa dữ liệu cũ về
 * đúng trạng thái đó rồi tính lại giữ chỗ:
 *   - Đơn đã huỷ                         → stock_state = released
 *   - Đơn đã gửi/giao/hoàn (hàng rời kho) → stock_state = deducted
 *     (KHÔNG trừ quantity_on_hand — tồn cũ do Admin nhập tay, không biết đã trừ hay chưa)
 *   - Đơn còn chờ (chưa rời kho)         → giữ nguyên reserved
 *   - reserved_quantity mỗi biến thể = tổng số lượng của các đơn còn reserved.
 *
 * Chỉ CẬP NHẬT, không xoá gì. Mặc định CHẠY THỬ (in chênh lệch). Thêm --apply để ghi.
 * Chạy lại an toàn.
 *   cd be
 *   npx ts-node -r dotenv/config scripts/fix-storefront-reservations.ts
 *   npx ts-node -r dotenv/config scripts/fix-storefront-reservations.ts --apply
 * ===================================================================
 */
const APPLY = process.argv.includes('--apply');
const LEFT_WAREHOUSE = ['shipped', 'delivered', 'failed_delivery', 'shipped_back', 'returned'];

interface OrderRow { _id: Types.ObjectId; status: string; fulfillment_status: string; stock_state?: string | null; order_number: string }
interface ItemRow { order_id: Types.ObjectId; variant_id: Types.ObjectId; quantity: number }
interface StockRow { _id: Types.ObjectId; variant_id: Types.ObjectId; reserved_quantity?: number; quantity_on_hand: number }

function targetStockState(order: Pick<OrderRow, 'status' | 'fulfillment_status' | 'stock_state'>): 'reserved' | 'deducted' | 'released' {
  if (order.stock_state === 'deducted' || order.stock_state === 'released') return order.stock_state;
  if (LEFT_WAREHOUSE.includes(order.fulfillment_status)) return 'deducted';
  if (order.status === 'cancelled') return 'released';
  return 'reserved';
}

async function run(): Promise<void> {
  for (const arg of process.argv.slice(2)) {
    if (arg !== '--apply') throw new Error(`Không hiểu tham số "${arg}" (chỉ nhận --apply).`);
  }
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/optipackai';
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Không lấy được kết nối database.');
  console.log(`Database: ${db.databaseName} — chế độ: ${APPLY ? 'GHI THẬT' : 'CHẠY THỬ (không ghi)'}`);

  const orders = await db.collection<OrderRow>('storefront_orders')
    .find({}, { projection: { status: 1, fulfillment_status: 1, stock_state: 1, order_number: 1 } })
    .toArray();
  const stillReserved = new Set<string>();
  let stateChanges = 0;
  for (const order of orders) {
    const target = targetStockState(order);
    if (target === 'reserved') stillReserved.add(order._id.toString());
    if ((order.stock_state ?? null) === target) continue;
    stateChanges += 1;
    console.log(`  Đơn ${order.order_number}: stock_state ${order.stock_state ?? '(trống)'} → ${target}`);
    if (APPLY) await db.collection('storefront_orders').updateOne({ _id: order._id }, { $set: { stock_state: target } });
  }

  const items = await db.collection<ItemRow>('storefront_order_items')
    .find({ order_id: { $in: [...stillReserved].map((id) => new Types.ObjectId(id)) } }, { projection: { order_id: 1, variant_id: 1, quantity: 1 } })
    .toArray();
  const expected = new Map<string, number>();
  for (const item of items) {
    const key = item.variant_id.toString();
    expected.set(key, (expected.get(key) ?? 0) + item.quantity);
  }

  const stocks = await db.collection<StockRow>('storefront_inventory_stocks').find({}).toArray();
  let stockChanges = 0;
  for (const stock of stocks) {
    const want = expected.get(stock.variant_id.toString()) ?? 0;
    if ((stock.reserved_quantity ?? 0) === want) continue;
    stockChanges += 1;
    console.log(`  Biến thể ${stock.variant_id.toString()}: giữ chỗ ${String(stock.reserved_quantity ?? 0)} → ${String(want)} (tồn ${String(stock.quantity_on_hand)})`);
    if (APPLY) await db.collection('storefront_inventory_stocks').updateOne({ _id: stock._id }, { $set: { reserved_quantity: want, updated_at: new Date() } });
  }

  console.log(`Xong: ${String(orders.length)} đơn (${String(stateChanges)} đổi stock_state), ${String(stocks.length)} dòng tồn (${String(stockChanges)} sửa giữ chỗ).`);
  if (!APPLY && (stateChanges || stockChanges)) console.log('Chạy lại với --apply để ghi.');
  await mongoose.disconnect();
}

run().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  await mongoose.disconnect();
  process.exit(1);
});
