import { Types } from 'mongoose';
import { ProductMasterService } from './product-master.service';

//!=============================================
// 27/11/2026 — cùng 1 hàng bán ở 2 sàn (Lazada + AURELLE) có 2 dòng product_master. Trước đây đo
// dòng Lazada xong, dòng AURELLE kéo về sau vẫn "Chưa đo" → bắt đo lại. Nay dùng chung hồ sơ kho
// theo SKU nội bộ (hoặc trùng mã SKU sàn khi chưa nối).
//!=============================================
interface Row extends Record<string, unknown> { _id: Types.ObjectId; platform: string; shop_id: string; seller_sku: string }
interface Mapping extends Record<string, unknown> { platform: string; shop_id: string; seller_sku: string; seller_sku_normalized: string; master_sku: string }

function matches(doc: Record<string, unknown>, q: Record<string, unknown>): boolean {
  return Object.entries(q).every(([k, v]) => {
    if (k === '$or') return (v as Record<string, unknown>[]).some((sub) => matches(doc, sub));
    const actual = doc[k];
    if (v && typeof v === 'object' && !(v instanceof Types.ObjectId)) {
      const op = v as Record<string, unknown>;
      if ('$in' in op) return (op.$in as unknown[]).some((x) => String(x) === String(actual));
      if ('$ne' in op) return String(actual) !== String(op.$ne);
    }
    return String(actual) === String(v);
  });
}

function chain<T>(rows: T[]): { select: () => { lean: () => Promise<T[]> }; lean: () => Promise<T[]> } {
  const lean = (): Promise<T[]> => Promise.resolve(rows);
  return { select: () => ({ lean }), lean };
}

describe('ProductMasterService — hồ sơ kho dùng chung giữa các sàn (27/11/2026)', () => {
  let rows: Row[];
  let mappings: Mapping[];
  let service: ProductMasterService;
  let productModel: { find: jest.Mock; updateOne: jest.Mock; updateMany: jest.Mock };

  const lazada = (sku: string, extra: Record<string, unknown> = {}): Row =>
    ({ _id: new Types.ObjectId(), platform: 'lazada', shop_id: '201182096267', seller_sku: sku, packaging_profile_status: 'needs_measurement', ...extra });
  const aurelle = (sku: string, extra: Record<string, unknown> = {}): Row =>
    ({ _id: new Types.ObjectId(), platform: 'aurelle', shop_id: '200000000101', seller_sku: sku, packaging_profile_status: 'needs_measurement', ...extra });
  const map = (r: Row, master: string): Mapping =>
    ({ platform: r.platform, shop_id: r.shop_id, seller_sku: r.seller_sku, seller_sku_normalized: r.seller_sku.toUpperCase(), master_sku: master });

  function build(): void {
    productModel = {
      find: jest.fn((q: Record<string, unknown>) => chain(rows.filter((r) => matches(r, q)))),
      updateOne: jest.fn((q: Record<string, unknown>, u: { $set: Record<string, unknown> }) => {
        rows.filter((r) => matches(r, q)).forEach((r) => Object.assign(r, u.$set));
        return Promise.resolve({});
      }),
      updateMany: jest.fn((q: { _id: { $in: Types.ObjectId[] } }, u: { $set: Record<string, unknown> }) => {
        rows.filter((r) => q._id.$in.some((id) => id.equals(r._id))).forEach((r) => Object.assign(r, u.$set));
        return Promise.resolve({});
      }),
    };
    const mappingModel = {
      findOne: jest.fn((q: Record<string, unknown>) => ({ select: () => ({ lean: () => Promise.resolve(mappings.find((m) => matches(m, q)) ?? null) }) })),
      find: jest.fn((q: Record<string, unknown>) => chain(mappings.filter((m) => matches(m, q)))),
    };
    service = new ProductMasterService(
      productModel as never, {} as never, {} as never, {} as never, {},
      undefined, undefined, undefined, mappingModel as never,
    );
  }

  const measured = { packaging_profile_status: 'ready', dimension: { package_length_cm: 30, package_width_cm: 22, package_height_cm: 0.8, package_weight_kg: 0.5 }, product_category: 'pants', profile_confirmed_at: new Date('2026-11-26T10:00:00Z') };

  it('cùng mã SKU ở 2 sàn: dòng AURELLE chưa đo nhận số đo của dòng Lazada đã đo', async () => {
    const lz = lazada('QUANDAI-006-TRANG-M', measured);
    const au = aurelle('QUANDAI-006-TRANG-M');
    rows = [lz, au];
    mappings = [map(au, 'QUANDAI-006-TRANG-M')];
    build();

    await expect(service.inheritSharedProfiles({})).resolves.toBe(1);
    expect(au.packaging_profile_status).toBe('ready');
    expect(au.dimension).toEqual(measured.dimension);
    expect(au.product_category).toBe('pants');
  });

  it('mã sàn khác nhau nhưng cùng nối 1 SKU nội bộ → vẫn dùng chung', async () => {
    const lz = lazada('3301234567-1700000000000-0', measured);
    const au = aurelle('QUANDAI-006-TRANG-M');
    rows = [lz, au];
    mappings = [map(lz, 'QUANDAI-006-TRANG-M'), map(au, 'QUANDAI-006-TRANG-M')];
    build();

    const same = await service.findSameProductRows(au as never);
    expect(same.map((r) => r.seller_sku)).toEqual(['3301234567-1700000000000-0']);
  });

  it('trùng mã nhưng đã nối SKU nội bộ KHÁC → không coi là cùng hàng', async () => {
    const lz = lazada('AO-01', measured);
    const au = aurelle('AO-01');
    rows = [lz, au];
    mappings = [map(lz, 'AOTHUN-001-DEN-M'), map(au, 'AOTHUN-001-BE-M')];
    build();

    await expect(service.inheritSharedProfiles({})).resolves.toBe(0);
    expect(au.packaging_profile_status).toBe('needs_measurement');
  });

  it('SKU ngừng dùng không nhận hồ sơ; không có dòng đã đo → không đổi gì', async () => {
    const lz = lazada('X-1');
    const au = aurelle('X-1', { retired: true });
    rows = [lz, au];
    mappings = [];
    build();

    await expect(service.inheritSharedProfiles({})).resolves.toBe(0);
    expect(productModel.updateOne).not.toHaveBeenCalled();
  });
});

describe('ProductMasterService.groupSameProduct — 1 dòng / hàng (27/11/2026)', () => {
  it('gộp dòng Lazada + AURELLE cùng mã, đại diện là dòng đã đo; SKU khác tách nhóm', async () => {
    const lz = { _id: new Types.ObjectId(), platform: 'lazada', shop_id: 'L', seller_sku: 'AOTHUN-001-BE-L', packaging_profile_status: 'ready', profile_confirmed_at: new Date() };
    const au = { _id: new Types.ObjectId(), platform: 'aurelle', shop_id: 'A', seller_sku: 'AOTHUN-001-BE-L', packaging_profile_status: 'needs_measurement' };
    const other = { _id: new Types.ObjectId(), platform: 'aurelle', shop_id: 'A', seller_sku: 'AOTHUN-001-BE-M', packaging_profile_status: 'needs_measurement' };
    const mappingModel = {
      find: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve([{ platform: 'aurelle', shop_id: 'A', seller_sku: 'AOTHUN-001-BE-L', master_sku: 'AOTHUN-001-BE-L' }]) }) })),
    };
    const service = new ProductMasterService({} as never, {} as never, {} as never, {} as never, {}, undefined, undefined, undefined, mappingModel as never);

    const groups = await service.groupSameProduct([au, lz, other] as never[]);

    expect(groups).toHaveLength(2);
    const first = groups[0] as unknown as { representative: { _id: Types.ObjectId }; members: unknown[] };
    expect(first.representative._id.equals(lz._id)).toBe(true);
    expect(first.members).toHaveLength(2);
  });
});
