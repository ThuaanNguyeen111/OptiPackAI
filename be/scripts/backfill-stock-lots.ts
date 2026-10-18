import mongoose, { Types } from 'mongoose';
import { OPENING_LOT_CODE } from '../src/modules/warehouse/stock-lot.ledger';

/**
 * ===================================================================
 * BACKFILL 15/10/2026 — tạo LÔ TỒN ĐẦU KỲ cho tồn có trước khi theo dõi lô
 * ===================================================================
 * Từ 15/10/2026 lấy hàng trừ lô có ngày nhập CŨ NHẤT trước (FIFO). Tồn đã có trên
 * các ô trước ngày đó chưa có lô nào. Script tạo cho mỗi dòng tồn (> 0) đang thiếu
 * lô một lô `TON-DAU-KY` bằng phần chênh lệch, ngày nhập = lần nhập/gán sớm nhất
 * trong sổ cái (không có thì ngày tạo dòng tồn) → hàng cũ luôn được xuất trước.
 *
 * Không chạy script này hệ thống vẫn đúng: lần đầu dòng tồn bị trừ/cộng, sổ lô tự
 * bù lô tồn đầu kỳ. Chạy để màn "Tồn theo lô" và Picking List thấy ngay ngày nhập.
 *
 * Mặc định CHẠY THỬ (chỉ đếm). Thêm --apply để ghi. Chạy lại an toàn (chỉ bù phần thiếu).
 *   cd be
 *   npx ts-node -r dotenv/config scripts/backfill-stock-lots.ts
 *   npx ts-node -r dotenv/config scripts/backfill-stock-lots.ts --apply
 * ===================================================================
 */
const APPLY = process.argv.includes('--apply');
const BATCH = 200;

interface AssignmentRow {
  _id: Types.ObjectId;
  warehouse_id: Types.ObjectId;
  bin_location_id: Types.ObjectId;
  platform: string;
  shop_id: string;
  seller_sku: string;
  master_sku?: string | null;
  quantity_on_hand: number;
  created_at?: Date;
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

  const assignments = db.collection<AssignmentRow>('sku_bin_assignments');
  const lots = db.collection('stock_lots');
  const movements = db.collection('inventory_movements');

  let lastId: Types.ObjectId | null = null;
  let scanned = 0;
  let needing = 0;
  let units = 0;
  for (;;) {
    const rows: AssignmentRow[] = await assignments
      .find({ quantity_on_hand: { $gt: 0 }, ...(lastId ? { _id: { $gt: lastId } } : {}) })
      .sort({ _id: 1 })
      .limit(BATCH)
      .toArray();
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1]?._id ?? null;
    scanned += rows.length;

    const ids = rows.map((r) => r._id);
    const sums = await lots
      .aggregate<{ _id: Types.ObjectId; total: number }>([
        { $match: { assignment_id: { $in: ids } } },
        { $group: { _id: '$assignment_id', total: { $sum: '$quantity_remaining' } } },
      ])
      .toArray();
    const sumOf = new Map(sums.map((s) => [s._id.toString(), s.total]));
    const firsts = await movements
      .aggregate<{ _id: Types.ObjectId; first: Date }>([
        { $match: { assignment_id: { $in: ids }, type: { $in: ['assign_initial', 'receive'] } } },
        { $group: { _id: '$assignment_id', first: { $min: '$created_at' } } },
      ])
      .toArray();
    const firstOf = new Map(firsts.map((f) => [f._id.toString(), f.first]));

    const inserts = [];
    for (const row of rows) {
      const missing = row.quantity_on_hand - (sumOf.get(row._id.toString()) ?? 0);
      if (missing <= 0) continue;
      needing += 1;
      units += missing;
      const receivedAt = firstOf.get(row._id.toString()) ?? row.created_at ?? new Date();
      inserts.push({
        warehouse_id: row.warehouse_id,
        assignment_id: row._id,
        bin_location_id: row.bin_location_id,
        platform: row.platform,
        shop_id: row.shop_id,
        seller_sku: row.seller_sku,
        master_sku: row.master_sku ?? null,
        lot_code: OPENING_LOT_CODE,
        received_at: receivedAt,
        quantity_received: missing,
        quantity_remaining: missing,
        source: 'opening',
        receipt_id: null,
        note: 'Tồn có trước khi theo dõi lô (backfill 15/10/2026)',
        created_at: new Date(),
        updated_at: new Date(),
      });
      if (needing <= 5) console.log(`  ví dụ: ${row.seller_sku} @ ô ${row.bin_location_id.toString()} — thiếu ${String(missing)} (ngày nhập ${receivedAt.toISOString()})`);
    }
    if (APPLY && inserts.length > 0) await lots.insertMany(inserts);
  }

  console.log(`Đã quét ${String(scanned)} dòng tồn > 0. Cần bù lô: ${String(needing)} dòng, ${String(units)} đơn vị.`);
  console.log(APPLY ? '✅ Đã ghi lô tồn đầu kỳ.' : 'Chạy thử xong — thêm --apply để ghi.');
  await mongoose.disconnect();
}

run().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  await mongoose.disconnect();
  process.exit(1);
});
