import mongoose from 'mongoose';
import { SkuBinAssignmentSchema } from './sku-bin-assignment.schema';

// 10/11/2026 (BE-5) — seller_sku_normalized luôn được ghi cùng seller_sku (tạo mới, cập nhật, upsert).
describe('sku_bin_assignments — hook ghi seller_sku_normalized', () => {
  // Model không kiểu (spec chỉ chạy middleware, không đụng DB).
  const Model = mongoose.model('SkuBinAssignmentNormalizedSpec', SkuBinAssignmentSchema.clone()) as unknown as mongoose.Model<Record<string, unknown>>;

  it('tạo document → validate ghi mã chuẩn hoá', async () => {
    const doc = new Model({
      warehouse_id: new mongoose.Types.ObjectId(),
      platform: 'lazada',
      shop_id: 's1',
      seller_sku: ' ao-thun-m ',
      bin_location_id: new mongoose.Types.ObjectId(),
    });
    await doc.validate();
    expect(doc.seller_sku_normalized).toBe('AO-THUN-M');
  });

  it('findOneAndUpdate $set / $setOnInsert seller_sku → thêm mã chuẩn hoá vào đúng toán tử', () => {
    const q1 = Model.findOneAndUpdate({ _id: new mongoose.Types.ObjectId() }, { $set: { seller_sku: 'ab' } });
    const q2 = Model.findOneAndUpdate({ _id: new mongoose.Types.ObjectId() }, { $setOnInsert: { seller_sku: 'cd' } }, { upsert: true });
    return Promise.all([run(q1), run(q2)]).then(([u1, u2]) => {
      expect(u1.$set?.seller_sku_normalized).toBe('AB');
      expect(u2.$setOnInsert?.seller_sku_normalized).toBe('CD');
    });
  });

  it('upsert lấy seller_sku từ bộ lọc (stockUpsertFilterFor) → $setOnInsert mã chuẩn hoá', async () => {
    const q = Model.findOneAndUpdate(
      { platform: 'lazada', shop_id: 's1', seller_sku: 'Giay-41', master_sku: null },
      { $inc: { quantity_on_hand: 2 } },
      { upsert: true },
    );
    const u = await run(q);
    expect(u.$setOnInsert?.seller_sku_normalized).toBe('GIAY-41');
  });

  it('cập nhật không đụng seller_sku, không upsert → không thêm gì', async () => {
    const u = await run(Model.findOneAndUpdate({ seller_sku: 'x' }, { $inc: { quantity_on_hand: 1 } }));
    expect(JSON.stringify(u)).not.toContain('seller_sku_normalized');
  });

  // Chạy middleware "pre" của query mà không cần kết nối DB (kareem của Mongoose 9 trả Promise).
  async function run(q: mongoose.Query<unknown, unknown>): Promise<Record<string, Record<string, unknown> | undefined>> {
    const op = (q as unknown as { op: string }).op;
    const hooks = (q.model.schema as unknown as { s: { hooks: { execPre: (name: string, ctx: unknown, args: unknown[]) => Promise<void> } } }).s.hooks;
    await hooks.execPre(op, q, []);
    return q.getUpdate() as Record<string, Record<string, unknown> | undefined>;
  }
});
