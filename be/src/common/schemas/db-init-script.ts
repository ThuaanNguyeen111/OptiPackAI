import * as fs from 'fs';
import * as path from 'path';
import { Schema, SchemaType } from 'mongoose';

/**
 * ===================================================================
 * Database script (MongoDB) sinh từ các schema Mongoose
 * ===================================================================
 * Hướng dẫn Review 2 yêu cầu "database script khớp với ERD". MongoDB
 * không có CREATE TABLE, nên script tương đương là một file mongosh:
 *   - createCollection cho từng collection, kèm validator $jsonSchema
 *     (field, kiểu dữ liệu, field bắt buộc, enum) — ở chế độ
 *     validationAction 'warn' để KHÔNG BAO GIỜ chặn ghi của ứng dụng;
 *   - createIndex cho mọi index khai báo trong schema (unique, partial,
 *     TTL...).
 *
 * Nguồn sự thật vẫn là schema Mongoose trong be/src; file này chỉ đọc
 * schema rồi sinh ra script, nên script luôn khớp với code.
 * CLI: be/scripts/init-db.ts. Kết quả: be/db/init-db.mongosh.js.
 * ===================================================================
 */

export type IndexSpec = [Record<string, unknown>, Record<string, unknown>];

export interface JsonSchemaNode {
  bsonType: string | string[];
  required?: string[];
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  enum?: unknown[];
}

export interface CollectionSpec {
  name: string;
  /** Export schema sinh ra collection này (để truy vết). */
  sources: string[];
  validator: { $jsonSchema: JsonSchemaNode };
  indexes: IndexSpec[];
}

export interface LoadedSchema {
  source: string;
  schema: Schema;
}

/** Kiểu Mongoose → bsonType của MongoDB. Mixed / không rõ → không ràng buộc kiểu. */
const BSON_TYPES: Record<string, string[]> = {
  String: ['string'],
  Number: ['int', 'long', 'double', 'decimal'],
  Double: ['double'],
  Int32: ['int'],
  BigInt: ['long'],
  Decimal128: ['decimal'],
  Date: ['date'],
  Boolean: ['bool'],
  ObjectId: ['objectId'],
  ObjectID: ['objectId'],
  Buffer: ['binData'],
  UUID: ['binData'],
  Map: ['object'],
  Embedded: ['object'],
  Array: ['array'],
};

/** Field Mongoose tự quản lý — không đưa vào validator. */
const SKIPPED_PATHS = new Set(['__v']);

/** Các thuộc tính nội bộ của SchemaType mà type của Mongoose không khai. */
interface SchemaTypeInternals {
  enumValues?: unknown[];
  schema?: Schema;
  embeddedSchemaType?: SchemaType;
}

function internals(st: SchemaType): SchemaTypeInternals {
  return st;
}

function optionOf(st: SchemaType, key: 'required' | 'enum'): unknown {
  const options = st.options as Record<string, unknown> | undefined;
  return options?.[key];
}

function isRequired(st: SchemaType): boolean {
  const r = optionOf(st, 'required');
  return r === true || (Array.isArray(r) && r[0] === true);
}

function isScalar(v: unknown): v is string | number | boolean | null {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v);
}

function enumValues(st: SchemaType): unknown[] | undefined {
  const fromString = internals(st).enumValues;
  if (Array.isArray(fromString) && fromString.length > 0)
    return fromString.slice();
  const raw = optionOf(st, 'enum');
  if (Array.isArray(raw)) {
    const values: unknown[] = raw.filter(isScalar);
    return values.length > 0 ? values : undefined;
  }
  if (raw !== null && typeof raw === 'object') {
    // TS enum: lấy giá trị, bỏ reverse mapping của enum số.
    const values = Object.values(raw).filter(isScalar);
    const numbers = values.filter((v) => typeof v === 'number');
    const picked = numbers.length > 0 ? numbers : values;
    return picked.length > 0 ? [...new Set(picked)] : undefined;
  }
  return undefined;
}

function nodeFor(st: SchemaType): JsonSchemaNode | null {
  const types = BSON_TYPES[st.instance];
  if (!types) return null;
  const node: JsonSchemaNode = {
    bsonType: types.length === 1 && types[0] ? types[0] : types,
  };
  const { schema: sub, embeddedSchemaType } = internals(st);

  if (st.instance === 'Embedded') {
    if (sub) Object.assign(node, objectNode(sub));
  } else if (st.instance === 'Array') {
    if (sub) node.items = { bsonType: 'object', ...objectNode(sub) };
    else if (embeddedSchemaType) {
      const item = nodeFor(embeddedSchemaType);
      if (item) node.items = item;
    }
  } else {
    const values = enumValues(st);
    if (values) node.enum = values;
  }
  return node;
}

/** Cho phép null với field không bắt buộc (Mongoose lưu null khi default: null). */
function nullable(node: JsonSchemaNode): JsonSchemaNode {
  const types = Array.isArray(node.bsonType) ? node.bsonType : [node.bsonType];
  const out: JsonSchemaNode = { ...node, bsonType: [...types, 'null'] };
  if (node.enum) out.enum = [...node.enum, null];
  return out;
}

interface ObjectBody {
  required: string[];
  properties: Record<string, JsonSchemaNode>;
}

function childObject(parent: ObjectBody, key: string): ObjectBody {
  const existing = parent.properties[key];
  if (existing?.properties && existing.required) {
    return { required: existing.required, properties: existing.properties };
  }
  const created: ObjectBody = { required: [], properties: {} };
  parent.properties[key] = { bsonType: ['object', 'null'], ...created };
  return created;
}

function objectNode(
  schema: Schema,
): Pick<JsonSchemaNode, 'required' | 'properties'> {
  const root: ObjectBody = { required: [], properties: {} };

  schema.eachPath((fullPath, st) => {
    if (SKIPPED_PATHS.has(fullPath)) return;
    const parts = fullPath.split('.');
    const leaf = parts.pop() ?? fullPath;
    // Object lồng khai báo trực tiếp (không phải sub-schema) → node object trung gian.
    const target = parts.reduce<ObjectBody>(childObject, root);
    const node = nodeFor(st);
    const required = isRequired(st) || fullPath === '_id';
    if (node) target.properties[leaf] = required ? node : nullable(node);
    if (required) target.required.push(leaf);
  });

  pruneEmptyRequired(root.properties);
  return root.required.length > 0 ? root : { properties: root.properties };
}

function pruneEmptyRequired(props: Record<string, JsonSchemaNode>): void {
  for (const node of Object.values(props)) {
    if (node.required?.length === 0) delete node.required;
    if (node.properties) pruneEmptyRequired(node.properties);
  }
}

/** Gom schema theo collection. Bỏ qua schema con (không khai báo collection). */
export function buildCollectionSpecs(
  schemas: LoadedSchema[],
): CollectionSpec[] {
  const byName = new Map<string, CollectionSpec>();
  for (const { source, schema } of schemas) {
    const name: unknown = schema.get('collection');
    if (typeof name !== 'string' || name === '') continue;
    const existing = byName.get(name);
    if (existing) {
      existing.sources.push(source);
      continue;
    }
    byName.set(name, {
      name,
      sources: [source],
      validator: { $jsonSchema: { bsonType: 'object', ...objectNode(schema) } },
      indexes: schema
        .indexes()
        .map(([keys, options]): IndexSpec => [{ ...keys }, { ...options }]),
    });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Nạp mọi file *.schema.ts|js dưới srcDir và trả các Schema được export. */
export function loadSchemasFromDir(srcDir: string): LoadedSchema[] {
  const files = fs
    .readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.schema\.(ts|js)$/.test(f) && !f.endsWith('.d.ts'))
    .sort();
  const out: LoadedSchema[] = [];
  for (const rel of files) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(path.join(srcDir, rel)) as Record<string, unknown>;
    for (const [exportName, value] of Object.entries(mod)) {
      if (value instanceof Schema) {
        out.push({
          source: `${rel.replace(/\\/g, '/')}#${exportName}`,
          schema: value as Schema,
        });
      }
    }
  }
  return out;
}

/** Sinh nội dung file mongosh (chạy: mongosh "<uri>" db/init-db.mongosh.js). */
export function renderMongoshScript(specs: CollectionSpec[]): string {
  const lines: string[] = [
    '// =====================================================================',
    '// OptiPack AI – MongoDB database script',
    '// AUTO-GENERATED from the Mongoose schemas in be/src by:',
    '//   cd be && npx ts-node -r tsconfig-paths/register scripts/init-db.ts',
    '// Do not edit by hand; change the schema and regenerate.',
    '//',
    `// ${String(specs.length)} collections. For each collection: a $jsonSchema validator`,
    '// (fields, BSON types, required fields, enums; validationAction "warn",',
    '// so it never blocks writes of the application) and every index declared',
    '// in the schema. Existing collections and indexes are kept; nothing is dropped.',
    '//',
    '// Run:  mongosh "<MONGODB_URI>" db/init-db.mongosh.js',
    '// =====================================================================',
    '',
    'const existing = new Set(db.getCollectionNames());',
    'function ensureCollection(name, validator, indexes) {',
    "  const opts = { validator, validationLevel: 'moderate', validationAction: 'warn' };",
    '  if (!existing.has(name)) db.createCollection(name, opts);',
    '  else db.runCommand({ collMod: name, ...opts });',
    '  for (const [keys, options] of indexes) {',
    '    try {',
    '      db.getCollection(name).createIndex(keys, options);',
    '    } catch (e) {',
    "      print('WARN ' + name + ' ' + JSON.stringify(keys) + ': ' + e.message);",
    '    }',
    '  }',
    "  print('ok ' + name + ' (' + indexes.length + ' indexes)');",
    '}',
    '',
  ];
  for (const spec of specs) {
    lines.push(`// ${spec.name} – ${spec.sources.join(', ')}`);
    lines.push(
      `ensureCollection(${JSON.stringify(spec.name)}, ${JSON.stringify(spec.validator)}, ${JSON.stringify(spec.indexes)});`,
    );
    lines.push('');
  }
  return lines.join('\n');
}
