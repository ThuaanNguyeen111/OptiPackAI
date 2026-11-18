import axios from 'axios';
import { createHash } from 'crypto';
import { ProofPhotosService } from './proof-photos.service';
import { RECEIPT_OCR_ERROR_CODES } from '../receipt-ocr/receipt-ocr.errors';
import { RECEIPT_PHOTO_FOLDER, phashDistance } from './proof-photo.util';

jest.mock('axios');
const mockedAxios = jest.mocked(axios);

interface Row {
  url: string;
  md5: string | null;
  phash: string | null;
  used_by: { kind: string; ref: string; at: Date } | null;
  created_at: Date;
}

/** Model giả của `receipt_photos`: đủ các truy vấn service dùng, `url` unique như index thật. */
function fakeReceiptPhotoModel(rows: Row[]): unknown {
  const matches = (r: Row, f: Record<string, unknown>): boolean =>
    Object.entries(f).every(([k, v]) => {
      const val = (r as unknown as Record<string, unknown>)[k];
      if (v && typeof v === 'object' && '$in' in v) return (v as { $in: unknown[] }).$in.includes(val);
      if (v && typeof v === 'object' && '$ne' in v) return val !== v.$ne;
      if (v && typeof v === 'object' && '$type' in v) return typeof val === 'string';
      return val === v;
    });
  const chain = (result: () => unknown): Record<string, unknown> => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'sort', 'limit', 'session']) q[m] = (): unknown => q;
    q.lean = (): Promise<unknown> => Promise.resolve(result());
    return q;
  };
  return {
    find: (f: Record<string, unknown>) => chain(() => rows.filter((r) => matches(r, f))),
    findOne: (f: Record<string, unknown>) => chain(() => rows.find((r) => matches(r, f)) ?? null),
    updateOne: (f: Record<string, unknown>, u: { $set?: Partial<Row>; $setOnInsert?: Partial<Row> }, o?: { upsert?: boolean }) => {
      const hit = rows.find((r) => matches(r, f));
      if (hit) {
        Object.assign(hit, u.$set ?? {});
        return Promise.resolve({ matchedCount: 1 });
      }
      if (!o?.upsert) return Promise.resolve({ matchedCount: 0 });
      const doc = { ...(u.$setOnInsert ?? {}), ...(u.$set ?? {}) } as Row;
      if (rows.some((r) => r.url === doc.url)) return Promise.reject(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
      rows.push(doc);
      return Promise.resolve({ upsertedCount: 1 });
    },
  };
}

describe('Ảnh phiếu NCC — chặn dùng lại (AOFP-311)', () => {
  const base = 'https://res.cloudinary.com/demo/image/upload/v1/optipack/receipts/';
  const usage = { kind: 'stock_receipt' as const, ref: 'REC-001' };
  let rows: Row[];
  let service: ProofPhotosService;
  const row = (name: string, extra: Partial<Row> = {}): Row => ({ url: base + name, md5: null, phash: null, used_by: null, created_at: new Date(), ...extra });

  beforeEach(() => {
    rows = [];
    service = new ProofPhotosService(fakeReceiptPhotoModel(rows) as never);
  });

  it('phashDistance đếm số bit khác; khác độ dài hoặc không phải hex → null', () => {
    expect(phashDistance('ff00', 'ff00')).toBe(0);
    expect(phashDistance('ff00', 'fe01')).toBe(2);
    expect(phashDistance('ff', 'ff00')).toBeNull();
    expect(phashDistance('zz', 'ff')).toBeNull();
  });

  it('Scenario 1: ảnh đã dùng cho REC-001 → lưu REC-002 bị 409 WH_RECEIPT_PHOTO_REUSED', async () => {
    rows.push(row('a.jpg', { md5: 'm1' }));
    await expect(service.checkReceiptPhotos([base + 'a.jpg'])).resolves.toEqual({ suspect: false, similarTo: [] });
    await service.markReceiptPhotosUsed([base + 'a.jpg'], usage);
    await expect(service.checkReceiptPhotos([base + 'a.jpg'])).rejects.toMatchObject({
      errorCode: RECEIPT_OCR_ERROR_CODES.PHOTO_REUSED,
      status: 409,
    });
  });

  it('tải lại đúng file (URL mới, cùng md5) → 409', async () => {
    rows.push(row('a.jpg', { md5: 'm1', used_by: { ...usage, at: new Date() } }), row('b.jpg', { md5: 'm1' }));
    await expect(service.checkReceiptPhotos([base + 'b.jpg'])).rejects.toMatchObject({ errorCode: RECEIPT_OCR_ERROR_CODES.PHOTO_REUSED });
  });

  it('pHash cách ≤ 5 bit với ảnh đã dùng → nghi trùng, không chặn; cách xa → không cờ', async () => {
    rows.push(
      row('old.jpg', { md5: 'm1', phash: 'ffffffffffffffff', used_by: { ...usage, at: new Date() } }),
      row('near.jpg', { md5: 'm2', phash: 'fffffffffffffff0' }), // 4 bit
      row('far.jpg', { md5: 'm3', phash: 'ffffffffffff0000' }), // 16 bit
    );
    const near = await service.checkReceiptPhotos([base + 'near.jpg']);
    expect(near.suspect).toBe(true);
    expect(near.similarTo).toEqual([expect.objectContaining({ url: base + 'old.jpg', distance: 4 })]);
    await expect(service.checkReceiptPhotos([base + 'far.jpg'])).resolves.toEqual({ suspect: false, similarTo: [] });
  });

  it('ảnh tải trước AOFP-311 (không có bản ghi) dùng được 1 lần theo URL', async () => {
    await expect(service.checkReceiptPhotos([base + 'legacy.jpg'])).resolves.toEqual({ suspect: false, similarTo: [] });
    await service.markReceiptPhotosUsed([base + 'legacy.jpg'], usage);
    expect(rows).toEqual([expect.objectContaining({ url: base + 'legacy.jpg', md5: null, used_by: expect.objectContaining({ ref: 'REC-001' }) as unknown })]);
    await expect(service.markReceiptPhotosUsed([base + 'legacy.jpg'], { kind: 'stock_receipt', ref: 'REC-002' })).rejects.toMatchObject({
      errorCode: RECEIPT_OCR_ERROR_CODES.PHOTO_REUSED,
    });
  });

  it('upload ảnh phiếu xin pHash và ghi md5 file gốc; ảnh bằng chứng thường không ghi', async () => {
    const env = { ...process.env };
    process.env = { ...env, CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' };
    mockedAxios.post.mockResolvedValue({ data: { secure_url: base + 'up.jpg', public_id: 'optipack/receipts/up', phash: 'abcdefabcdefabcd' } });
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9]);
    await service.upload([{ buffer, size: buffer.length }], RECEIPT_PHOTO_FOLDER);
    expect(new URLSearchParams((mockedAxios.post.mock.calls[0] as [string, string])[1]).get('phash')).toBe('true');
    const md5 = createHash('md5').update(buffer).digest('hex');
    expect(rows).toEqual([expect.objectContaining({ url: base + 'up.jpg', md5, phash: 'abcdefabcdefabcd', used_by: null })]);

    mockedAxios.post.mockClear();
    mockedAxios.post.mockResolvedValue({ data: { secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/optipack/proof/p.jpg', public_id: 'optipack/proof/p' } });
    await service.upload([{ buffer, size: buffer.length }]);
    expect(new URLSearchParams((mockedAxios.post.mock.calls[0] as [string, string])[1]).get('phash')).toBeNull();
    expect(rows).toHaveLength(1);
    process.env = env;
  });
});
