import 'reflect-metadata';
import mongoose from 'mongoose';
import { reverseHexId } from '../src/modules/order-groups/utils/group-id-search.util';

/**
 * ===================================================================
 * BACKFILL 1 LẦN — 10/11/2026: ghi `id_reversed` cho nhóm đơn cũ
 * ===================================================================
 * Tìm nhóm đơn theo đuôi mã giờ dùng field `id_reversed` có index
 * (BE_MOBILE_CHECKLIST mục 9). Nhóm tạo sau khi deploy tự có field này;
 * script chỉ bổ sung cho nhóm CŨ. Chưa chạy thì vẫn tìm được (nhánh dự
 * phòng), chỉ chậm hơn.
 *
 * Mặc định CHẠY THỬ (chỉ đếm, không ghi). Thêm --apply để ghi thật.
 * Chỉ ghi đúng 1 field `id_reversed` với nhóm đang null / chưa có, không tăng
 * `__v`, không đổi field khác. Chạy lại nhiều lần an toàn.
 *   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/backfill-order-group-id-reversed.ts
 *   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/backfill-order-group-id-reversed.ts --apply
 * ===================================================================
 */
const BATCH_SIZE = 500;

async function run(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu MONGODB_URI');
  const apply = process.argv.includes('--apply');
  const conn = await mongoose.createConnection(uri).asPromise();
  try {
    const db = conn.db;
    if (!db) throw new Error('Không mở được database');
    const groups = db.collection('order_groups');
    const missing = { $or: [{ id_reversed: null }, { id_reversed: { $exists: false } }] };
    const todo = await groups.countDocuments(missing);
    console.log(`${String(todo)} nhóm đơn chưa có id_reversed.`);
    if (!apply) {
      console.log('Chạy thử: chưa ghi gì. Thêm --apply để ghi.');
      return;
    }

    let done = 0;
    for (;;) {
      const batch = await groups.find(missing, { projection: { _id: 1 } }).limit(BATCH_SIZE).toArray();
      if (batch.length === 0) break;
      await groups.bulkWrite(
        batch.map((g) => ({
          updateOne: {
            filter: { _id: g._id, ...missing },
            update: { $set: { id_reversed: reverseHexId(g._id.toHexString()) } },
          },
        })),
      );
      done += batch.length;
      console.log(`Đã ghi ${String(done)}/${String(todo)} nhóm...`);
    }
    console.log(`✅ Xong: ${String(done)} nhóm đơn.`);
  } finally {
    await conn.close();
  }
}

run().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
