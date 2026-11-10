import 'reflect-metadata';
import mongoose from 'mongoose';

/**
 * ===================================================================
 * 1 LẦN — 10/11/2026 (BE-3): thay index `orders.consolidated_group_id_1`
 * ===================================================================
 * Index cũ là partial `{ is_consolidated: true }` nên mọi truy vấn theo nhóm
 * (`find({ consolidated_group_id })`, không lọc is_consolidated) KHÔNG dùng được,
 * MongoDB quét cả bảng orders. Schema mới khai index thường cùng tên
 * `consolidated_group_id_1`; MongoDB không tự thay index trùng tên khác tuỳ chọn
 * (app khởi động sẽ ghi lỗi IndexOptionsConflict) → script này xoá index cũ rồi tạo lại.
 *
 * Mặc định CHẠY THỬ (chỉ in index hiện tại). Thêm --apply để thay. Chạy lại an toàn
 * (index đã đúng thì không làm gì). Chạy trong thư mục be/:
 *   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/rebuild-orders-group-index.ts
 *   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/rebuild-orders-group-index.ts --apply
 * ===================================================================
 */
const INDEX_NAME = 'consolidated_group_id_1';

async function run(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu MONGODB_URI');
  const apply = process.argv.includes('--apply');
  const conn = await mongoose.createConnection(uri).asPromise();
  try {
    const db = conn.db;
    if (!db) throw new Error('Không mở được database');
    const orders = db.collection('orders');
    const current = (await orders.indexes()).find((i) => i.name === INDEX_NAME);
    if (current && !current.partialFilterExpression) {
      console.log(`✅ Index ${INDEX_NAME} đã là index thường — không cần làm gì.`);
      return;
    }
    console.log(
      current
        ? `Index ${INDEX_NAME} đang partial ${JSON.stringify(current.partialFilterExpression)} → cần thay.`
        : `Chưa có index ${INDEX_NAME} → cần tạo.`,
    );
    if (!apply) {
      console.log('Chạy thử: chưa đổi gì. Thêm --apply để thay.');
      return;
    }
    if (current) await orders.dropIndex(INDEX_NAME);
    await orders.createIndex({ consolidated_group_id: 1 }, { name: INDEX_NAME });
    console.log(`✅ Đã tạo lại ${INDEX_NAME} (index thường).`);
  } finally {
    await conn.close();
  }
}

run().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
