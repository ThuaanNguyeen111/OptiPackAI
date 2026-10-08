import { mongo, Types } from 'mongoose';

type Db = mongo.Db;
type AnyBulkWriteOperation<T extends mongo.Document> = mongo.AnyBulkWriteOperation<T>;
import { OBJECT_ID_FIELDS, OBJECT_ID_HEX } from './objectid-fields';

/**
 * 07/10/2026 — Lõi của `scripts/migrate-objectid-fields.ts` (tách ra đây để có unit test).
 * Chuyển các giá trị id đang lưu dạng chuỗi sang ObjectId cho mọi field trong
 * OBJECT_ID_FIELDS. Xem mô tả đầy đủ ở đầu file script.
 */
export interface MigrateOptions {
  /** false = chạy thử, chỉ đếm, không ghi. */
  apply: boolean;
  /** true = giá trị không phải id (vd "201171264532") cũng ghi null; false = giữ nguyên. */
  nullInvalid: boolean;
}

export interface FieldReport {
  path: string;
  converted: number;
  emptied: number;
  invalid: number;
  invalidSamples: string[];
}

type RawDoc = Record<string, unknown> & { _id: unknown };

function classify(value: string): 'hex' | 'empty' | 'invalid' {
  if (OBJECT_ID_HEX.test(value)) return 'hex';
  if (value.trim() === '') return 'empty';
  return 'invalid';
}

async function migrateTopLevel(db: Db, collection: string, field: string, opts: MigrateOptions): Promise<FieldReport> {
  const coll = db.collection<RawDoc>(collection);
  const report: FieldReport = { path: `${collection}.${field}`, converted: 0, emptied: 0, invalid: 0, invalidSamples: [] };
  const cursor = coll.find({ [field]: { $type: 'string' } }, { projection: { [field]: 1 } });
  const ops: AnyBulkWriteOperation<RawDoc>[] = [];
  for await (const doc of cursor) {
    const value = doc[field] as string;
    const kind = classify(value);
    if (kind === 'hex') {
      report.converted += 1;
      ops.push({ updateOne: { filter: { _id: doc._id, [field]: value }, update: { $set: { [field]: new Types.ObjectId(value) } } } });
    } else if (kind === 'empty') {
      report.emptied += 1;
      ops.push({ updateOne: { filter: { _id: doc._id, [field]: value }, update: { $set: { [field]: null } } } });
    } else {
      report.invalid += 1;
      if (report.invalidSamples.length < 5) report.invalidSamples.push(value);
      if (opts.nullInvalid) ops.push({ updateOne: { filter: { _id: doc._id, [field]: value }, update: { $set: { [field]: null } } } });
    }
  }
  if (opts.apply && ops.length > 0) {
    for (let i = 0; i < ops.length; i += 500) await coll.bulkWrite(ops.slice(i, i + 500), { ordered: false });
  }
  return report;
}

async function migrateArray(db: Db, collection: string, array: string, fields: string[], opts: MigrateOptions): Promise<FieldReport[]> {
  const coll = db.collection<RawDoc>(collection);
  const reports = new Map<string, FieldReport>(
    fields.map((f) => [f, { path: `${collection}.${array}[].${f}`, converted: 0, emptied: 0, invalid: 0, invalidSamples: [] }]),
  );
  const filter = { $or: fields.map((f) => ({ [`${array}.${f}`]: { $type: 'string' } })) };
  const cursor = coll.find(filter, { projection: { [array]: 1 } });
  const ops: AnyBulkWriteOperation<RawDoc>[] = [];
  for await (const doc of cursor) {
    const lines = Array.isArray(doc[array]) ? (doc[array] as Record<string, unknown>[]) : [];
    const set: Record<string, unknown> = {};
    lines.forEach((line, index) => {
      for (const f of fields) {
        const value = line[f];
        if (typeof value !== 'string') continue;
        const report = reports.get(f);
        if (!report) continue;
        const kind = classify(value);
        if (kind === 'hex') { report.converted += 1; set[`${array}.${String(index)}.${f}`] = new Types.ObjectId(value); }
        else if (kind === 'empty') { report.emptied += 1; set[`${array}.${String(index)}.${f}`] = null; }
        else {
          report.invalid += 1;
          if (report.invalidSamples.length < 5) report.invalidSamples.push(value);
          if (opts.nullInvalid) set[`${array}.${String(index)}.${f}`] = null;
        }
      }
    });
    if (Object.keys(set).length > 0) ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: set } } });
  }
  if (opts.apply && ops.length > 0) {
    for (let i = 0; i < ops.length; i += 500) await coll.bulkWrite(ops.slice(i, i + 500), { ordered: false });
  }
  return [...reports.values()];
}

export async function migrateObjectIdFields(db: Db, opts: MigrateOptions): Promise<FieldReport[]> {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const reports: FieldReport[] = [];
  for (const entry of OBJECT_ID_FIELDS) {
    if (!existing.has(entry.collection)) continue;
    for (const field of entry.fields) reports.push(await migrateTopLevel(db, entry.collection, field, opts));
    if (entry.arrayPath) reports.push(...(await migrateArray(db, entry.collection, entry.arrayPath.array, entry.arrayPath.fields, opts)));
  }
  return reports;
}
