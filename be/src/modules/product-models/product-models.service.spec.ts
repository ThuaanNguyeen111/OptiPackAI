import { Types } from 'mongoose';
import { ProductCategory } from '../../common/enums/product-category.enum';
import { ProductModelsService } from './product-models.service';

const codes = { required: 'PM_MODEL_REQUIRED', mismatch: 'PM_MODEL_CATEGORY_MISMATCH' };
const placeholder = { _id: new Types.ObjectId(), source: 'primitive', kind: 'rigid', has_fold_rig: false, status: 'active', primitive: { shape: 'box' } };
const tshirt = { _id: new Types.ObjectId(), source: 'category', kind: 'garment', has_fold_rig: true, status: 'active', category_key: 't_shirt' };

function makeService(docs: Record<string, unknown>[]): ProductModelsService {
  const lean = (v: unknown) => ({ lean: () => Promise.resolve(v) });
  const modelModel = {
    findById: (id: Types.ObjectId | string) => lean(docs.find((d) => String(d._id) === String(id)) ?? null),
    findOne: (f: { category_key: string }) => lean(docs.find((d) => d.source === 'category' && d.category_key === f.category_key) ?? null),
  };
  return new ProductModelsService(modelModel as never, {} as never);
}

describe('AOFP-352 — resolveForConfirm (app mobile chưa gửi model_id)', () => {
  it('giữ mô hình đang gắn nếu còn hợp loại', async () => {
    const svc = makeService([placeholder, tshirt]);
    const m = await svc.resolveForConfirm(null, ProductCategory.OTHER, placeholder._id, codes);
    expect(m._id).toEqual(placeholder._id);
  });

  it('đổi sang quần áo mà mô hình cũ là hình đại diện → lấy mô hình theo loại', async () => {
    const svc = makeService([placeholder, tshirt]);
    const m = await svc.resolveForConfirm(null, ProductCategory.T_SHIRT, placeholder._id, codes);
    expect(m._id).toEqual(tshirt._id);
  });

  it('không có gì để lấy → PM_MODEL_REQUIRED', async () => {
    const svc = makeService([]);
    await expect(svc.resolveForConfirm(null, ProductCategory.SHOES, null, codes)).rejects.toMatchObject({ errorCode: 'PM_MODEL_REQUIRED' });
  });

  it('gửi mô hình không hợp loại → PM_MODEL_CATEGORY_MISMATCH', async () => {
    const svc = makeService([placeholder]);
    await expect(svc.resolveForConfirm(placeholder._id.toString(), ProductCategory.DRESS, null, codes)).rejects.toMatchObject({
      errorCode: 'PM_MODEL_CATEGORY_MISMATCH',
    });
  });
});

describe('Đợt 2 — gắn mô hình hàng loạt theo bộ lọc', () => {
  const bottle = { _id: new Types.ObjectId(), source: 'primitive', kind: 'rigid', has_fold_rig: false, status: 'active', primitive: { shape: 'bottle' } };
  const assignable = { _id: new Types.ObjectId(), product_category: 'other', model_id: placeholder._id };
  const rows = [
    assignable,
    { _id: new Types.ObjectId(), product_category: 'other', model_id: bottle._id },
    { _id: new Types.ObjectId(), product_category: 't_shirt', model_id: tshirt._id },
    { _id: new Types.ObjectId(), product_category: 't_shirt', model_id: tshirt._id },
  ];
  function make(): { svc: ProductModelsService; updateMany: jest.Mock; find: jest.Mock } {
    const lean = (v: unknown) => ({ lean: () => Promise.resolve(v) });
    const find = jest.fn(() => ({ select: () => lean(rows) }));
    const updateMany = jest.fn(() => Promise.resolve({}));
    const modelModel = { findById: (id: Types.ObjectId) => lean([bottle, placeholder].find((d) => d._id.equals(id)) ?? null) };
    return { svc: new ProductModelsService(modelModel as never, { find, updateMany } as never), updateMany, find };
  }

  it('bỏ qua SKU khác loại, không đếm SKU đã dùng sẵn; dry_run không ghi', async () => {
    const { svc, updateMany } = make();
    const r = await svc.bulkAssign(bottle._id.toString(), { q: 'A', dry_run: true }, new Types.ObjectId().toString());
    expect(r).toMatchObject({ matched: 4, assigned: 1, alreadyUsing: 1, dryRun: true });
    expect(r.skipped).toEqual([{ productCategory: 't_shirt', count: 2, reason: expect.any(String) as string }]);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('ghi thật chỉ cập nhật SKU hợp loại', async () => {
    const { svc, updateMany, find } = make();
    await svc.bulkAssign(bottle._id.toString(), { from_model_id: placeholder._id.toString() }, new Types.ObjectId().toString());
    expect(find).toHaveBeenCalledWith({ model_id: placeholder._id });
    expect(updateMany).toHaveBeenCalledWith({ _id: { $in: [assignable._id] } }, { $set: { model_id: bottle._id } });
  });

  it('không có bộ lọc → từ chối', async () => {
    const { svc } = make();
    await expect(svc.bulkAssign(bottle._id.toString(), {}, new Types.ObjectId().toString())).rejects.toMatchObject({
      errorCode: 'PM3D_BULK_FILTER_REQUIRED',
    });
  });
});

describe('Đợt 2 — khôi phục bản cũ', () => {
  const file = (n: number) => ({ url: `https://cdn/v${String(n)}.glb`, public_id: `p${String(n)}`, bytes: 1, sha256: null });
  const base = {
    _id: new Types.ObjectId(),
    name: 'Chai',
    source: 'upload',
    kind: 'rigid',
    version: 3,
    status: 'active',
    file: file(3),
    bbox_m: { x: 0.1, y: 0.2, z: 0.1 },
    has_fold_rig: false,
    auto_fold: false,
    history: [
      { version: 2, file: file(2), primitive: null, bbox_m: { x: 0.05, y: 0.2, z: 0.05 }, has_fold_rig: false, auto_fold: false, replaced_at: new Date() },
      { version: 1, file: file(1), primitive: null, bbox_m: null, has_fold_rig: null, auto_fold: null, replaced_at: new Date() },
    ],
  };
  function make(): { svc: ProductModelsService; update: jest.Mock } {
    const lean = (v: unknown) => ({ lean: () => Promise.resolve(v) });
    const update = jest.fn((_f: unknown, u: { $set: Record<string, unknown> }) => lean({ ...base, ...u.$set, version: 4 }));
    const modelModel = { findById: () => lean(base), findOneAndUpdate: update };
    return { svc: new ProductModelsService(modelModel as never, {} as never), update };
  }

  it('nội dung bản cũ thành phiên bản mới, bản đang dùng vào lịch sử; khoá lạc quan theo version', async () => {
    const { svc, update } = make();
    const r = await svc.restoreVersion(base._id.toString(), 2, new Types.ObjectId().toString());
    expect(r.version).toBe(4);
    const [filter, u] = update.mock.calls[0] as [Record<string, unknown>, Record<string, Record<string, unknown>>];
    expect(filter).toEqual({ _id: base._id, version: 3 });
    expect(u.$set).toMatchObject({ file: file(2), bbox_m: { x: 0.05, y: 0.2, z: 0.05 } });
    expect(u.$inc).toEqual({ version: 1 });
    expect(u.$push).toMatchObject({ history: { version: 3, file: file(3), bbox_m: base.bbox_m, has_fold_rig: false } });
  });

  it('bản ghi cũ thiếu thông số file → từ chối, không ghi', async () => {
    const { svc, update } = make();
    await expect(svc.restoreVersion(base._id.toString(), 1, new Types.ObjectId().toString())).rejects.toMatchObject({
      errorCode: 'PM3D_HISTORY_INCOMPLETE',
    });
    await expect(svc.restoreVersion(base._id.toString(), 9, new Types.ObjectId().toString())).rejects.toMatchObject({
      errorCode: 'PM3D_VERSION_NOT_FOUND',
    });
    expect(update).not.toHaveBeenCalled();
  });
});
