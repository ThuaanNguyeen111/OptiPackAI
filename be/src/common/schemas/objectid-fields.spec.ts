import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { Schema } from 'mongoose';
import { OBJECT_ID_FIELDS } from './objectid-fields';

//!=============================================
// 07/10/2026 — Bảo vệ khỏi lỗi "ObjectId bị hiểu là Mixed".
// `@Prop({ type: Types.ObjectId })` với @nestjs/mongoose tạo ra field kiểu Mixed:
// Mongoose không ép chuỗi -> ObjectId nên truy vấn bằng chuỗi id ra 0 dòng.
// Test quét MỌI file *.schema.ts trong src/ và khẳng định:
//  1. Không còn field nào kiểu Mixed.
//  2. Mọi field kiểu ObjectId (trừ _id) đều có trong OBJECT_ID_FIELDS và ngược lại
//     (script chuyển dữ liệu dựa vào danh sách này).
//!=============================================
function schemaFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) schemaFiles(path, out);
    else if (name.endsWith('.schema.ts')) out.push(path);
  }
  return out;
}

interface Found {
  objectId: Set<string>;
  mixed: string[];
}

function scan(): Found {
  const objectId = new Set<string>();
  const mixed: string[] = [];
  for (const file of schemaFiles(join(__dirname, '..', '..'))) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file) as Record<string, unknown>;
    for (const [exportName, value] of Object.entries(mod)) {
      if (!(value instanceof Schema)) continue;
      const schema: Schema = value as Schema;
      const configured: unknown = schema.get('collection');
      const collection = typeof configured === 'string' ? configured : `(sub:${exportName})`;
      const visit = (schema: Schema, prefix: string): void => {
        schema.eachPath((path, type) => {
          if (path === '_id') return;
          const full = `${collection}.${prefix}${path}`;
          if (type.instance === 'Mixed') mixed.push(full);
          if (type.instance === 'ObjectId') objectId.add(full);
          const sub = (type as unknown as { schema?: Schema }).schema;
          if (sub) visit(sub, `${prefix}${path}.`);
        });
      };
      visit(schema, '');
    }
  }
  return { objectId, mixed };
}

describe('Schema — field id phải là ObjectId thật, không phải Mixed', () => {
  const found = scan();

  it('không schema nào còn field kiểu Mixed', () => {
    expect(found.mixed).toEqual([]);
  });

  it('danh sách OBJECT_ID_FIELDS khớp đúng các field ObjectId thực tế (đủ 77 field)', () => {
    const expected = new Set<string>();
    for (const entry of OBJECT_ID_FIELDS) {
      for (const f of entry.fields) expected.add(`${entry.collection}.${f}`);
      for (const f of entry.arrayPath?.fields ?? []) expected.add(`${entry.collection}.${entry.arrayPath?.array ?? ''}.${f}`);
      for (const f of entry.nested ?? []) expected.add(`${entry.collection}.${f}`);
    }
    const actualTopLevel = [...found.objectId].filter((p) => !p.startsWith('(sub:')).sort();
    expect(actualTopLevel).toEqual([...expected].sort());
    expect(expected.size).toBe(77);
  });
});
