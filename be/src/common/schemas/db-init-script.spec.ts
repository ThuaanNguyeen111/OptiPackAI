import * as path from 'path';
import { Schema } from 'mongoose';
import {
  buildCollectionSpecs,
  CollectionSpec,
  loadSchemasFromDir,
  renderMongoshScript,
} from './db-init-script';

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('missing value');
  return value;
}

describe('db-init-script', () => {
  describe('buildCollectionSpecs', () => {
    const schema = new Schema(
      {
        code: { type: String, required: true, unique: true },
        status: { type: String, enum: ['open', 'closed'], default: 'open' },
        qty: { type: Number, required: true },
        note: { type: String, default: null },
        address: { city: { type: String, required: true }, ward: String },
        lines: [{ sku: { type: String, required: true }, quantity: Number }],
        tags: [String],
        extra: { type: Schema.Types.Mixed },
      },
      {
        collection: 'things',
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
      },
    );
    schema.index({ status: 1, created_at: -1 });
    const sub = new Schema({ x: Number }); // schema con: không có collection

    const spec = must(
      buildCollectionSpecs([
        { source: 'a#ThingSchema', schema },
        { source: 'b#SubSchema', schema: sub },
      ])[0],
    );

    it('chỉ lấy schema có collection', () => {
      expect(spec.name).toBe('things');
    });

    it('khai field bắt buộc, kiểu và enum', () => {
      const root = spec.validator.$jsonSchema;
      expect(root.required).toEqual(
        expect.arrayContaining(['_id', 'code', 'qty']),
      );
      expect(root.required).not.toContain('note');
      expect(root.properties?.code?.bsonType).toBe('string');
      expect(root.properties?.status?.enum).toEqual(['open', 'closed', null]);
      expect(root.properties?.note?.bsonType).toEqual(['string', 'null']);
      expect(root.properties?.created_at?.bsonType).toEqual(['date', 'null']);
      expect(root.properties?.extra).toBeUndefined();
      expect(root.properties?.__v).toBeUndefined();
    });

    it('khai object lồng và mảng', () => {
      const props = must(spec.validator.$jsonSchema.properties);
      expect(props.address?.properties?.city?.bsonType).toBe('string');
      expect(props.lines?.items?.required).toEqual(
        expect.arrayContaining(['_id', 'sku']),
      );
      expect(props.address?.required).toEqual(['city']);
      expect(props.tags?.items?.bsonType).toBe('string');
    });

    it('lấy đủ index của schema, kể cả unique trên field', () => {
      const keys = spec.indexes.map(([k]) => JSON.stringify(k));
      expect(keys).toContain(JSON.stringify({ code: 1 }));
      expect(keys).toContain(JSON.stringify({ status: 1, created_at: -1 }));
      const unique = spec.indexes.find(([k]) => 'code' in k);
      expect(unique?.[1].unique).toBe(true);
    });
  });

  describe('schema thật của hệ thống', () => {
    let specs: CollectionSpec[];
    beforeAll(() => {
      specs = buildCollectionSpecs(
        loadSchemasFromDir(path.resolve(__dirname, '../..')),
      );
    });

    it('mỗi collection có đúng 1 schema nguồn', () => {
      expect(specs.length).toBeGreaterThanOrEqual(60);
      for (const s of specs) expect(s.sources).toHaveLength(1);
    });

    it('có các index then chốt', () => {
      const byName = new Map(specs.map((s) => [s.name, s]));
      const groupKeys = must(byName.get('order_groups')).indexes.map(([k]) =>
        JSON.stringify(k),
      );
      expect(groupKeys).toContain(
        JSON.stringify({ fulfillment_status: 1, created_at: -1 }),
      );
      expect(
        must(byName.get('inventory_movements')).indexes.some(
          ([k, o]) => 'client_event_id' in k && o.unique,
        ),
      ).toBe(true);
    });

    it('script mongosh chạy được và gọi đủ mọi collection', () => {
      const created: string[] = [];
      const indexes: string[] = [];
      const db = {
        getCollectionNames: () => ['users'],
        createCollection: (n: string) => created.push(n),
        runCommand: (cmd: { collMod: string }) =>
          created.push(`mod:${cmd.collMod}`),
        getCollection: (n: string) => ({
          createIndex: (k: unknown) =>
            indexes.push(`${n}:${JSON.stringify(k)}`),
        }),
      };
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const run = new Function('db', 'print', renderMongoshScript(specs)) as (
        d: typeof db,
        print: () => void,
      ) => void;
      run(db, () => undefined);
      expect(created).toHaveLength(specs.length);
      expect(created).toContain('mod:users');
      expect(indexes).toHaveLength(
        specs.reduce((n, s) => n + s.indexes.length, 0),
      );
    });
  });
});
