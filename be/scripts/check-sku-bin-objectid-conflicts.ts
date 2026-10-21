import mongoose, { Types } from 'mongoose';

/**
 * 07/10/2026 — KIỂM TRA TRƯỚC khi chạy `migrate-objectid-fields.ts --apply` (CHỈ ĐỌC, không ghi gì).
 * Các dòng `sku_bin_assignments` đang lưu `warehouse_id` / `bin_location_id` dạng CHUỖI, khi đổi sang
 * ObjectId, có thể trùng với một dòng ObjectId sẵn có cùng (kho, ô, SKU) -> vi phạm index duy nhất,
 * lệnh ghi dòng đó sẽ lỗi E11000. Script in từng dòng chuỗi và cho biết có trùng hay không.
 *
 *   cd be
 *   npx ts-node -r dotenv/config scripts/check-sku-bin-objectid-conflicts.ts
 */
const HEX = /^[0-9a-fA-F]{24}$/;
type Row = Record<string, unknown> & { _id: Types.ObjectId };

async function run(): Promise<void> {
  await mongoose.connect(
    process.env.MONGODB_URI ?? 'mongodb://localhost:27017/optipackai',
  );
  const db = mongoose.connection.db;
  if (!db) throw new Error('Không lấy được kết nối database.');
  const coll = db.collection<Row>('sku_bin_assignments');
  const rows = await coll
    .find({
      $or: [
        { warehouse_id: { $type: 'string' } },
        { bin_location_id: { $type: 'string' } },
      ],
    })
    .toArray();
  let conflicts = 0;
  for (const r of rows) {
    const toId = (v: unknown): unknown =>
      typeof v === 'string' && HEX.test(v) ? new Types.ObjectId(v) : v;
    const warehouseId = toId(r.warehouse_id);
    const binId = toId(r.bin_location_id);
    const sameKey: Record<string, unknown>[] = [
      { platform: r.platform, shop_id: r.shop_id, seller_sku: r.seller_sku },
    ];
    if (typeof r.master_sku === 'string')
      sameKey.push({ master_sku: r.master_sku });
    const dup = await coll.findOne({
      _id: { $ne: r._id },
      warehouse_id: warehouseId,
      bin_location_id: binId,
      $or: sameKey,
    });
    const label = `${String(r.seller_sku)} | master ${typeof r.master_sku === 'string' ? r.master_sku : '-'} | tồn ${String(r.quantity_on_hand)} | id ${String(r._id)}`;
    if (dup) {
      conflicts += 1;
      console.log(
        `⚠️  TRÙNG: ${label}  <->  dòng ${String(dup._id)} (tồn ${String(dup.quantity_on_hand)})`,
      );
    } else {
      console.log(`   ok    : ${label}`);
    }
  }
  console.log(
    rows.length === 0
      ? '✅ Không có dòng tồn nào lưu id dạng chuỗi.'
      : conflicts === 0
        ? `✅ ${String(rows.length)} dòng, không dòng nào trùng — chạy --apply được.`
        : `❌ ${String(conflicts)}/${String(rows.length)} dòng trùng — gửi kết quả này trước khi chạy --apply.`,
  );
  await mongoose.disconnect();
}

run().catch(async (error: unknown) => {
  console.error('❌ Kiểm tra thất bại:', error);
  await mongoose.disconnect();
  process.exit(1);
});
