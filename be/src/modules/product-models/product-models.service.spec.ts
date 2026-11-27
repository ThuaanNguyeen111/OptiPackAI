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
  const rows = [
    { _id: new Types.ObjectId(), product_category: 'other', model_id: placeholder._id },
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
    expect(r.skipped).toEqual([{ productCategory: 't_shirt', count: 2, reason: expect.any(String) }]);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('ghi thật chỉ cập nhật SKU hợp loại', async () => {
    const { svc, updateMany, find } = make();
    await svc.bulkAssign(bottle._id.toString(), { from_model_id: placeholder._id.toString() }, new Types.ObjectId().toString());
    expect(find).toHaveBeenCalledWith({ model_id: placeholder._id });
    expect(updateMany).toHaveBeenCalledWith({ _id: { $in: [rows[0]._id] } }, { $set: { model_id: bottle._id } });
  });

  it('không có bộ lọc → từ chối', async () => {
    const { svc } = make();
    await expect(svc.bulkAssign(bottle._id.toString(), {}, new Types.ObjectId().toString())).rejects.toMatchObject({
      errorCode: 'PM3D_BULK_FILTER_REQUIRED',
    });
  });
});
