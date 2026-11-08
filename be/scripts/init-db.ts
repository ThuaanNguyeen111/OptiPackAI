import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import {
  buildCollectionSpecs,
  loadSchemasFromDir,
  renderMongoshScript,
} from '../src/common/schemas/db-init-script';

/**
 * ===================================================================
 * Database script MongoDB — sinh từ schema Mongoose (Review 2, BM02 F06)
 * ===================================================================
 * Mặc định: ghi file be/db/init-db.mongosh.js (không đụng database).
 *   npx ts-node -r tsconfig-paths/register scripts/init-db.ts
 *
 * --apply: chạy thẳng lên MONGODB_URI — tạo collection còn thiếu (kèm
 * validator ở chế độ 'warn') và tạo index còn thiếu. Collection đã có
 * KHÔNG bị đổi validator, không xóa gì.
 *   npx ts-node -r tsconfig-paths/register -r dotenv/config scripts/init-db.ts --apply
 * ===================================================================
 */

const SRC_DIR = path.resolve(__dirname, '../src');
const OUT_FILE = path.resolve(__dirname, '../db/init-db.mongosh.js');

async function main(): Promise<void> {
  const specs = buildCollectionSpecs(loadSchemasFromDir(SRC_DIR));
  const indexCount = specs.reduce((n, s) => n + s.indexes.length, 0);

  if (!process.argv.includes('--apply')) {
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, renderMongoshScript(specs) + '\n', 'utf8');
    console.log(
      `Đã ghi ${path.relative(process.cwd(), OUT_FILE)}: ${String(specs.length)} collection, ${String(indexCount)} index.`,
    );
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu MONGODB_URI');
  const conn = await mongoose.createConnection(uri).asPromise();
  try {
    const db = conn.db;
    if (!db) throw new Error('Không mở được database');
    const existing = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray()).map(
        (c) => c.name,
      ),
    );
    for (const spec of specs) {
      if (!existing.has(spec.name)) {
        await db.createCollection(spec.name, {
          validator: spec.validator,
          validationLevel: 'moderate',
          validationAction: 'warn',
        });
        console.log(`+ collection ${spec.name}`);
      }
      for (const [keys, options] of spec.indexes) {
        try {
          await db
            .collection(spec.name)
            .createIndex(keys as mongoose.mongo.IndexSpecification, options);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`! ${spec.name} ${JSON.stringify(keys)}: ${message}`);
        }
      }
    }
    console.log(
      `Xong: ${String(specs.length)} collection, ${String(indexCount)} index.`,
    );
  } finally {
    await conn.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
