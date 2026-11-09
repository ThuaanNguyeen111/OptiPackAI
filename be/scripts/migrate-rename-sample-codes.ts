import mongoose from 'mongoose';

/**
 * ===================================================================
 * Đổi mã vật tư mẫu (08/11/2026): SAMPLE-L → BOX-L, DEMO-ZIP-S → ZIP-S,
 * SAMPLE-FOAM-CORNER → FOAM-CORNER...
 * ===================================================================
 * Duyệt các collection có lưu mã vật tư, thay mọi giá trị chuỗi BẰNG ĐÚNG
 * mã cũ (kể cả lồng trong mảng/object) bằng mã mới. Câu chữ có chứa mã cũ
 * (giải thích, nhật ký) giữ nguyên — đó là lịch sử.
 * Nếu mã mới đã tồn tại trong danh mục → dừng, không ghi gì.
 *
 * Chạy:  npx ts-node -r dotenv/config scripts/migrate-rename-sample-codes.ts           (chạy thử)
 *        npx ts-node -r dotenv/config scripts/migrate-rename-sample-codes.ts --apply   (ghi thật)
 * ===================================================================
 */

export const CODE_MAP: Record<string, string> = {
  'SAMPLE-S': 'BOX-S',
  'SAMPLE-M': 'BOX-M',
  'SAMPLE-L': 'BOX-L',
  'SAMPLE-LT': 'BOX-LT',
  'DEMO-ZIP-S': 'ZIP-S',
  'DEMO-ZIP-M': 'ZIP-M',
  'DEMO-ZIP-L': 'ZIP-L',
  'SAMPLE-FOAM-CORNER': 'FOAM-CORNER',
  'SAMPLE-DIVIDER': 'DIVIDER',
  'SAMPLE-AIR-PILLOW': 'AIR-PILLOW',
  'SAMPLE-BUBBLE-WRAP': 'BUBBLE-WRAP',
  'SAMPLE-FRAGILE-TAPE': 'FRAGILE-TAPE',
  'SAMPLE-KRAFT-PAPER': 'KRAFT-PAPER',
  'SAMPLE-TISSUE-PAPER': 'TISSUE-PAPER',
};

const CATALOGS = ['packaging_materials', 'packaging_bags'];
const COLLECTIONS = [
  ...CATALOGS,
  'packaging_movements',
  'product_master',
  'return_requests',
  'packing_plans',
  'packaging_recommendations',
  'packing_guide_examples',
];

/** Trả bản đã thay mã (cùng tham chiếu nếu không đổi gì). */
export function renameCodes(value: unknown): unknown {
  if (typeof value === 'string') return CODE_MAP[value] ?? value;
  if (Array.isArray(value)) {
    const next = value.map(renameCodes);
    return next.some((v, i) => v !== value[i]) ? next : value;
  }
  // Chỉ đi vào object thường — bỏ qua ObjectId, Date, Binary...
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const obj = value as Record<string, unknown>;
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      next[k] = renameCodes(v);
      if (next[k] !== v) changed = true;
    }
    return changed ? next : value;
  }
  return value;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu MONGODB_URI.');
  const conn = await mongoose.createConnection(uri).asPromise();
  const db = conn.db;
  if (!db) throw new Error('Không mở được database.');
  console.log(apply ? '== GHI THẬT ==' : '== CHẠY THỬ (thêm --apply để ghi) ==');

  for (const name of CATALOGS) {
    // Chỉ trùng khi CẢ mã cũ lẫn mã mới cùng tồn tại (chạy lại sau khi đã đổi xong thì bỏ qua).
    const present = new Set(
      (await db.collection(name).find({ code: { $in: [...Object.keys(CODE_MAP), ...Object.values(CODE_MAP)] } }).project({ code: 1 }).toArray()).map((d) => String(d.code)),
    );
    const clash = Object.entries(CODE_MAP).filter(([from, to]) => present.has(from) && present.has(to)).map(([, to]) => to);
    if (clash.length > 0) {
      await conn.close();
      throw new Error(`${name} có cả mã cũ lẫn mã mới: ${clash.join(', ')} — xử lý tay trước.`);
    }
  }

  for (const name of COLLECTIONS) {
    const col = db.collection(name);
    const ops: mongoose.mongo.AnyBulkWriteOperation[] = [];
    // shortcut: quét cả collection, ổn với DB đồ án; DB lớn thì lọc theo field cụ thể.
    for await (const doc of col.find({})) {
      const next = renameCodes(doc);
      if (next !== doc) ops.push({ replaceOne: { filter: { _id: doc._id }, replacement: next as mongoose.mongo.Document } });
    }
    console.log(`${name}: ${String(ops.length)} tài liệu cần đổi`);
    if (apply && ops.length > 0) await col.bulkWrite(ops);
  }
  await conn.close();
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
