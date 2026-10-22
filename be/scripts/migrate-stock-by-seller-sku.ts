import mongoose, { Types } from 'mongoose';

/**
 * ===================================================================
 * CHUYỂN 21/10/2026 — TỒN KHOÁ THEO MÃ SKU, KHÔNG PHÂN BIỆT SÀN/SHOP
 * ===================================================================
 * Quy ước mới: mọi sàn dùng chung một mã SKU cho cùng một món; `master_sku` của dòng
 * tồn = chính mã SKU đã chuẩn hóa (cắt khoảng trắng + chữ HOA). Script này:
 *   1. gắn `master_sku` = mã chuẩn hóa cho mọi dòng tồn (sku_bin_assignments);
 *   2. đồng bộ `master_sku` trên stock_lots, inventory_movements, stock_reservations;
 *   3. đổi khóa giữ chỗ (stock_reservations.stock_key) sang "M:<mã chuẩn hóa>" và
 *      tính lại stock_reservation_totals từ các giữ chỗ đang hoạt động.
 * Nếu 2 dòng tồn sẽ trùng khóa (cùng kho + cùng ô + cùng mã SKU, khác sàn/shop) thì
 * KHÔNG tự gộp: script liệt kê và bỏ qua dòng đó để bạn xử lý tay (kiểm kê/chuyển ô).
 *
 * Mặc định CHẠY THỬ (chỉ đếm). Thêm --apply để ghi. Chạy lại an toàn.
 *   cd be
 *   npx ts-node -r dotenv/config scripts/migrate-stock-by-seller-sku.ts
 *   npx ts-node -r dotenv/config scripts/migrate-stock-by-seller-sku.ts --apply
 * ===================================================================
 */
const APPLY = process.argv.includes('--apply');

const normalize = (sku: string): string => sku.trim().toUpperCase();

interface AssignmentRow {
  _id: Types.ObjectId;
  warehouse_id: Types.ObjectId;
  bin_location_id: Types.ObjectId;
  platform: string;
  shop_id: string;
  seller_sku: string;
  master_sku?: string | null;
  quantity_on_hand: number;
}

async function run(): Promise<void> {
  for (const arg of process.argv.slice(2)) {
    if (arg !== '--apply') throw new Error(`Không hiểu tham số "${arg}" (chỉ nhận --apply).`);
  }
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/optipackai');
  const db = mongoose.connection.db;
  if (!db) throw new Error('Không lấy được kết nối database.');
  console.log(`Database: ${db.databaseName} — chế độ: ${APPLY ? 'GHI THẬT' : 'CHẠY THỬ (không ghi)'}`);

  // 1) Dòng tồn
  const assignments = db.collection<AssignmentRow>('sku_bin_assignments');
  const rows = await assignments.find({}).toArray();
  const groups = new Map<string, AssignmentRow[]>();
  for (const r of rows) {
    const key = `${String(r.warehouse_id)}|${normalize(r.seller_sku)}|${String(r.bin_location_id)}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const collisions = [...groups.values()].filter((g) => g.length > 1);
  const skipIds = new Set(collisions.flat().map((r) => String(r._id)));
  const toUpdate = rows.filter((r) => !skipIds.has(String(r._id)) && r.master_sku !== normalize(r.seller_sku));
  console.log(`Dòng tồn: ${String(rows.length)} — cần gắn nhãn: ${String(toUpdate.length)} — trùng khóa (bỏ qua, xử lý tay): ${String(collisions.length)} nhóm`);
  for (const g of collisions) {
    console.log('  TRÙNG:', g.map((r) => `${r.platform}/${r.shop_id}:${r.seller_sku} (tồn ${String(r.quantity_on_hand)})`).join('  +  '));
  }
  if (APPLY && toUpdate.length > 0) {
    await assignments.bulkWrite(
      toUpdate.map((r) => ({ updateOne: { filter: { _id: r._id }, update: { $set: { master_sku: normalize(r.seller_sku) } } } })),
    );
  }

  // 2) Sổ lô + sổ cái + giữ chỗ: đồng bộ master_sku theo seller_sku của chính dòng đó
  for (const name of ['stock_lots', 'inventory_movements', 'stock_reservations']) {
    const col = db.collection<{ _id: Types.ObjectId; seller_sku?: string; master_sku?: string | null }>(name);
    const docs = await col.find({ seller_sku: { $type: 'string' } }).project<{ _id: Types.ObjectId; seller_sku?: string; master_sku?: string | null }>({ seller_sku: 1, master_sku: 1 }).toArray();
    const need = docs.filter((d) => d.seller_sku && d.master_sku !== normalize(d.seller_sku));
    console.log(`${name}: ${String(docs.length)} dòng — cần đồng bộ master_sku: ${String(need.length)}`);
    if (APPLY && need.length > 0) {
      await col.bulkWrite(
        need.map((d) => ({ updateOne: { filter: { _id: d._id }, update: { $set: { master_sku: normalize(d.seller_sku ?? '') } } } })),
      );
    }
  }

  // 3) Khóa giữ chỗ + tổng giữ chỗ
  const reservations = db.collection<{ _id: Types.ObjectId; seller_sku: string; stock_key: string; status: string; quantity_reserved: number; order_group_id: Types.ObjectId }>('stock_reservations');
  const all = await reservations.find({}).toArray();
  const wrongKey = all.filter((r) => r.stock_key !== `M:${normalize(r.seller_sku)}`);
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const r of all) {
    const k = `${String(r.order_group_id)}|M:${normalize(r.seller_sku)}`;
    if (seen.has(k)) dupes.push(k);
    seen.add(k);
  }
  console.log(`Giữ chỗ: ${String(all.length)} — cần đổi khóa: ${String(wrongKey.length)} — sẽ trùng khóa trong cùng nhóm đơn: ${String(dupes.length)}`);
  if (dupes.length > 0) {
    console.log('  Có giữ chỗ trùng khóa trong cùng nhóm đơn — KHÔNG đổi khóa phần giữ chỗ, xử lý tay:', dupes.join(', '));
  } else if (APPLY && wrongKey.length > 0) {
    await reservations.bulkWrite(
      wrongKey.map((r) => ({ updateOne: { filter: { _id: r._id }, update: { $set: { stock_key: `M:${normalize(r.seller_sku)}` } } } })),
    );
    const sums = new Map<string, number>();
    for (const r of await reservations.find({ status: 'active' }).toArray()) {
      const k = `M:${normalize(r.seller_sku)}`;
      sums.set(k, (sums.get(k) ?? 0) + r.quantity_reserved);
    }
    const totals = db.collection<{ _id: string; reserved: number; touched_at: Date | null }>('stock_reservation_totals');
    await totals.deleteMany({});
    if (sums.size > 0) {
      await totals.insertMany([...sums.entries()].map(([k, reserved]) => ({ _id: k, reserved, touched_at: new Date() })));
    }
    console.log(`Đã tính lại stock_reservation_totals: ${String(sums.size)} khóa.`);
  }

  console.log(APPLY ? 'XONG.' : 'Chạy thử xong — thêm --apply để ghi thật.');
  await mongoose.disconnect();
}

run().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
