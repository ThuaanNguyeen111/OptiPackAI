import mongoose, { Types } from 'mongoose';

/**
 * ===================================================================
 * KIỂM TRA PHIẾU TRẢ HÀNG MỞ TRÙNG — 21/10/2026 (chỉ ĐỌC, không ghi gì)
 * ===================================================================
 * Index mới `uniq_open_return_per_order` trên `return_requests` chỉ tạo được khi DB
 * KHÔNG có 2 phiếu đang mở (requested / awaiting_receipt / received) cùng nhóm đơn +
 * cùng đơn gốc (phiếu giả lập: cùng nhóm). Có trùng thì Mongoose báo lỗi tạo index lúc
 * khởi động và ràng buộc KHÔNG có hiệu lực. Script liệt kê các cặp trùng để xử lý tay
 * (hủy / từ chối phiếu thừa qua màn Trả hàng), sau đó khởi động lại backend.
 *   cd be
 *   npx ts-node -r dotenv/config scripts/check-open-return-duplicates.ts
 * ===================================================================
 */
interface DupRow {
  _id: { order_group_id: Types.ObjectId; source_order_id: Types.ObjectId | null };
  count: number;
  returns: { id: Types.ObjectId; rma_code: string; status: string; source: string }[];
}

async function run(): Promise<void> {
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/optipackai';
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Không kết nối được MongoDB.');

  const dups = await db.collection('return_requests').aggregate<DupRow>([
    { $match: { status: { $in: ['requested', 'awaiting_receipt', 'received'] }, source: { $in: ['simulated', 'marketplace'] } } },
    {
      $group: {
        _id: { order_group_id: '$order_group_id', source_order_id: { $ifNull: ['$source_order_id', null] } },
        count: { $sum: 1 },
        returns: { $push: { id: '$_id', rma_code: '$rma_code', status: '$status', source: '$source' } },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();

  if (dups.length === 0) {
    console.log('✅ Không có phiếu trả hàng mở trùng — index mới tạo được.');
  } else {
    console.log(`⚠️ ${String(dups.length)} nhóm có phiếu mở trùng (giữ 1, hủy/từ chối phần còn lại):`);
    for (const dup of dups) {
      console.log(`- Nhóm ${dup._id.order_group_id.toString()}${dup._id.source_order_id ? ` / đơn ${dup._id.source_order_id.toString()}` : ''}:`);
      for (const r of dup.returns) console.log(`    ${r.rma_code} (${r.status}, ${r.source}) id=${r.id.toString()}`);
    }
  }

  const indexes = await db.collection('return_requests').indexes();
  const created = indexes.some((index) => index.name === 'uniq_open_return_per_order');
  console.log(created ? 'Index uniq_open_return_per_order: ĐÃ có.' : 'Index uniq_open_return_per_order: CHƯA có (khởi động backend sau khi hết trùng).');
  await mongoose.disconnect();
}

run().catch(async (error: unknown) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
