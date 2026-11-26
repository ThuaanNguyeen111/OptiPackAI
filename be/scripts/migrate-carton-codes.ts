import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import mongoose from 'mongoose';
import { COLLECTIONS, renameCodes } from './migrate-rename-sample-codes';

/**
 * ===================================================================
 * AOFP-346 (27/11/2026, user chốt) — mã thùng carton CTN-xxx
 * ===================================================================
 * Mã thùng cũ chứa cỡ (BOX-S) hoặc kích thước (BOX-302015) nên đổi cỡ là mã nói
 * sai. Đổi 11 thùng BOX-* sang CTN-001… theo thể tích lòng nhỏ → lớn; thùng mới
 * sau này lấy số tiếp theo. Ghi thêm fefco_code = 0201 (thùng nắp gập) và số lớp
 * giấy (3 lớp; BOX-L, BOX-LT 5 lớp), đặt lại tên hiển thị theo thông số.
 *
 * Mã đổi ở MỌI chỗ lưu giá trị bằng đúng mã cũ (danh mục, sổ xuất nhập, kế hoạch,
 * đề xuất, trả hàng — dùng renameCodes của đợt 08/11). Câu chữ lịch sử có chứa mã
 * cũ giữ nguyên. Ghi trong 1 transaction; --apply ghi backup EJSON trước.
 *
 * Chạy:  npx ts-node -r dotenv/config scripts/migrate-carton-codes.ts                       (chạy thử)
 *        npx ts-node -r dotenv/config scripts/migrate-carton-codes.ts --apply <thư mục backup>
 * ===================================================================
 */

const FEFCO = '0201';
const FIVE_PLY = new Set(['BOX-L', 'BOX-LT']);

interface BoxDoc {
  _id: mongoose.Types.ObjectId;
  code: string;
  name: string;
  inner: { length_mm: number; width_mm: number; height_mm: number } | null;
}

export const cartonName = (inner: NonNullable<BoxDoc['inner']>, ply: number): string =>
  `Thùng carton ${FEFCO} · ${String(inner.length_mm)}×${String(inner.width_mm)}×${String(inner.height_mm)} mm lọt lòng · ${String(ply)} lớp`;

/** Bảng mã cũ → mới: thể tích lòng tăng dần (bằng nhau thì theo mã cũ), số bắt đầu sau CTN lớn nhất đang có. */
export function planCodes(boxes: BoxDoc[], existingCtn: string[]): Map<string, string> {
  let next = Math.max(0, ...existingCtn.map((c) => Number(c.slice(4)) || 0)) + 1;
  const vol = (b: BoxDoc): number => (b.inner ? b.inner.length_mm * b.inner.width_mm * b.inner.height_mm : Infinity);
  const sorted = [...boxes].sort((a, b) => vol(a) - vol(b) || a.code.localeCompare(b.code));
  const map = new Map<string, string>();
  for (const b of sorted) map.set(b.code, `CTN-${String(next++).padStart(3, '0')}`);
  return map;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const backupDir = apply ? (process.argv[process.argv.indexOf('--apply') + 1] ?? '') : '';
  if (apply && !backupDir) throw new Error('Thiếu thư mục backup sau --apply.');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu MONGODB_URI.');
  const conn = await mongoose.createConnection(uri).asPromise();
  const db = conn.db;
  if (!db) throw new Error('Không mở được database.');
  console.log(apply ? '== GHI THẬT ==' : '== CHẠY THỬ (thêm --apply <thư mục backup> để ghi) ==');

  const materials = db.collection('packaging_materials');
  const boxes = (await materials.find({ kind: 'box', code: /^BOX-/ }).toArray()) as unknown as BoxDoc[];
  const existingCtn = (await materials.find({ code: /^CTN-\d+$/ }).project({ code: 1 }).toArray()).map((d) => String(d.code));
  if (boxes.length === 0) {
    console.log('Không còn thùng BOX-* nào — đã migrate rồi.');
    await conn.close();
    return;
  }
  const map = planCodes(boxes, existingCtn);
  const codeMap = Object.fromEntries(map);
  for (const b of boxes) {
    const ply = FIVE_PLY.has(b.code) ? 5 : 3;
    console.log(`${b.code.padEnd(11)} → ${String(map.get(b.code))}  ${b.inner ? cartonName(b.inner, ply) : '(thiếu số đo lòng)'}`);
  }

  // Tính hết thay đổi trước, ghi sau (1 transaction).
  const changes: { name: string; docs: mongoose.mongo.Document[]; next: mongoose.mongo.Document[] }[] = [];
  for (const name of COLLECTIONS) {
    const docs: mongoose.mongo.Document[] = [];
    const next: mongoose.mongo.Document[] = [];
    for await (const doc of db.collection(name).find({})) {
      const renamed = renameCodes(doc, codeMap);
      if (renamed !== doc) {
        docs.push(doc);
        next.push(renamed as mongoose.mongo.Document);
      }
    }
    console.log(`${name}: ${String(docs.length)} tài liệu đổi mã`);
    changes.push({ name, docs, next });
  }
  for (const doc of changes.find((c) => c.name === 'packaging_materials')?.next ?? []) {
    const old = boxes.find((b) => String(b._id) === String(doc._id));
    if (!old?.inner) continue;
    const ply = FIVE_PLY.has(old.code) ? 5 : 3;
    Object.assign(doc, { fefco_code: FEFCO, ply, name: cartonName(old.inner, ply) });
  }

  if (apply) {
    mkdirSync(backupDir, { recursive: true });
    for (const c of changes) {
      if (c.docs.length === 0) continue;
      writeFileSync(join(backupDir, `${c.name}.json`), mongoose.mongo.BSON.EJSON.stringify(c.docs, undefined, 1, { relaxed: false }));
    }
    console.log(`Đã ghi backup: ${backupDir}`);
    const session = await conn.startSession();
    try {
      await session.withTransaction(async () => {
        for (const c of changes) {
          if (c.next.length === 0) continue;
          await db.collection(c.name).bulkWrite(
            c.next.map((d) => ({ replaceOne: { filter: { _id: d._id as mongoose.Types.ObjectId }, replacement: d } })),
            { session },
          );
        }
      });
    } finally {
      await session.endSession();
    }
    console.log('Đã ghi.');
  }
  await conn.close();
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
