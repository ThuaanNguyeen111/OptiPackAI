import { Types } from 'mongoose';
import { PackagingMaterialsService } from './packaging-materials.service';
import { PACKAGING_MATERIAL_ERROR_CODES as E } from './packaging-materials.errors';

/** Query giả: vừa await được trực tiếp, vừa gọi được .session(). */
function q<T>(value: T): Promise<T> & { session: jest.Mock } {
  return Object.assign(Promise.resolve(value), { session: jest.fn().mockResolvedValue(value) });
}

//!=============================================
// Vật liệu đóng gói — quy tắc nghiệp vụ: ưu tiên hàng tái sử dụng (ghi tiết kiệm);
// hàng dễ vỡ chỉ dùng thùng mới; không chặn pack khi thiếu vật liệu; pack lại không
// trừ 2 lần; khai vật liệu thực tế thì trừ đúng ngăn đã khai và ghi nhận có theo gợi ý
// hay không; hạng A phải gỡ nhãn cũ; hạng B vào kho nội bộ; hạng C ghi nhận loại bỏ.
//!=============================================
describe('PackagingMaterialsService', () => {
  const groupId = new Types.ObjectId().toString();
  let materialModel: { findOne: jest.Mock; updateOne: jest.Mock; create: jest.Mock; findOneAndUpdate: jest.Mock };
  let movementModel: { exists: jest.Mock; create: jest.Mock; aggregate: jest.Mock; updateMany: jest.Mock };
  let recommendationModel: { findOne: jest.Mock };
  let startSession: jest.Mock;
  let service: PackagingMaterialsService;

  const boxM = { _id: new Types.ObjectId(), code: 'BOX-M', kind: 'box', reusable: true, unit_cost_vnd: 6500, max_reuse_cycles: 3, qty_new: 10, qty_reused: 2, qty_internal: 0, is_active: true };
  const boxL = { ...boxM, _id: new Types.ObjectId(), code: 'BOX-L', unit_cost_vnd: 12000 };
  const bubble = { _id: new Types.ObjectId(), code: 'BUBBLE', kind: 'cushioning', reusable: true, unit_cost_vnd: 1500, max_reuse_cycles: 3, qty_new: 20, qty_reused: 0, qty_internal: 0, is_active: true };
  const rec = (materialType: string, qty = 1): Record<string, unknown> => ({ box_size: { length_cm: 35, width_cm: 25, height_cm: 20 }, material_type: materialType, material_quantity: qty });
  const moves = (): Record<string, unknown>[] => movementModel.create.mock.calls.map((c) => (c as [[Record<string, unknown>]])[0][0]);

  beforeEach(() => {
    materialModel = { findOne: jest.fn(), updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }), create: jest.fn(), findOneAndUpdate: jest.fn() };
    movementModel = { exists: jest.fn().mockReturnValue(q(null)), create: jest.fn().mockResolvedValue([{}]), aggregate: jest.fn(), updateMany: jest.fn().mockResolvedValue({}) };
    recommendationModel = { findOne: jest.fn() };
    const session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    startSession = jest.fn().mockResolvedValue(session);
    service = new PackagingMaterialsService(materialModel as never, movementModel as never, recommendationModel as never, { startSession } as never);
  });

  it('khai thùng thiếu kích thước -> 400 PKG_MATERIAL_INVALID_DEFINITION', async () => {
    await expect(service.create({ code: 'BOX-X', name: 'Thùng', kind: 'box', unit_cost_vnd: 1000 })).rejects.toMatchObject({ errorCode: E.INVALID_DEFINITION });
  });

  describe('trừ vật liệu theo GỢI Ý (không khai materials_used)', () => {
    it('hàng thường: dùng thùng tái sử dụng trước, ghi tiết kiệm, đánh dấu làm theo gợi ý', async () => {
      recommendationModel.findOne.mockReturnValue(q(rec('Medium Box')));
      materialModel.findOne.mockReturnValueOnce(q(boxM));
      const r = await service.consumeForPackedGroup(groupId, 'pk-1');
      expect(r.consumed).toEqual([{ materialCode: 'BOX-M', condition: 'reused', quantity: 1, savingVnd: 6500 }]);
      expect(r).toMatchObject({ recommendedBoxCode: 'BOX-M', followedRecommendation: true });
    });

    it('hàng dễ vỡ: thùng CHỈ dùng hàng mới + trừ Bubble Wrap theo gợi ý', async () => {
      recommendationModel.findOne.mockReturnValue(q(rec('Bubble Wrap', 2)));
      materialModel.findOne.mockReturnValueOnce(q(boxM)).mockReturnValueOnce(q(bubble));
      const r = await service.consumeForPackedGroup(groupId, 'pk-1');
      expect(r.consumed).toEqual([
        { materialCode: 'BOX-M', condition: 'new', quantity: 1, savingVnd: 0 },
        { materialCode: 'BUBBLE', condition: 'new', quantity: 2, savingVnd: 0 },
      ]);
    });

    it('pack lại (đã trừ) -> không trừ lần 2', async () => {
      movementModel.exists.mockReturnValue(q({ _id: 'x' }));
      const r = await service.consumeForPackedGroup(groupId, 'pk-1');
      expect(r.consumed).toEqual([]);
      expect(recommendationModel.findOne).not.toHaveBeenCalled();
    });

    it('chưa khai thùng trong danh mục -> không lỗi, chỉ cảnh báo (không chặn pack)', async () => {
      recommendationModel.findOne.mockReturnValue(q(rec('Medium Box')));
      materialModel.findOne.mockReturnValueOnce(q(null));
      const r = await service.consumeForPackedGroup(groupId, 'pk-1');
      expect(r.consumed).toEqual([]);
      expect(r.warnings[0]).toContain('Chưa khai thùng');
    });
  });

  describe('khai vật liệu THỰC TẾ (materials_used)', () => {
    it('gợi ý Medium nhưng nhân viên dùng Large mới -> trừ đúng Large ngăn mới, followedRecommendation=false', async () => {
      recommendationModel.findOne.mockReturnValue(q(rec('Medium Box')));
      materialModel.findOne.mockReturnValueOnce(q(boxM)).mockReturnValueOnce(q(boxL));
      const r = await service.consumeForPackedGroup(groupId, 'pk-1', undefined, [{ material_code: 'BOX-L', quantity: 1, condition: 'new' }]);
      expect(r.consumed).toEqual([{ materialCode: 'BOX-L', condition: 'new', quantity: 1, savingVnd: 0 }]);
      expect(r).toMatchObject({ recommendedBoxCode: 'BOX-M', followedRecommendation: false });
      expect(movementModel.updateMany).toHaveBeenCalledWith(expect.objectContaining({ ref_id: groupId }), { $set: { followed_recommendation: false } }, expect.anything());
    });

    it('khai lấy từ ngăn tái sử dụng -> trừ qty_reused (không phải qty_new) và ghi tiết kiệm', async () => {
      recommendationModel.findOne.mockReturnValue(q(rec('Medium Box')));
      materialModel.findOne.mockReturnValueOnce(q(boxM)).mockReturnValueOnce(q(boxM));
      await service.consumeForPackedGroup(groupId, 'pk-1', undefined, [{ material_code: 'BOX-M', quantity: 1, condition: 'reused' }]);
      expect(materialModel.updateOne).toHaveBeenCalledWith({ _id: boxM._id, qty_reused: { $gte: 1 } }, { $inc: { qty_reused: -1 } }, expect.anything());
      expect(moves()[0]).toMatchObject({ condition: 'reused', saving_vnd: 6500 });
    });
  });

  it('có session truyền vào (pack) -> chạy CHUNG transaction đó, không mở transaction riêng', async () => {
    recommendationModel.findOne.mockReturnValue(q(rec('Medium Box')));
    materialModel.findOne.mockReturnValueOnce(q(boxM));
    await service.consumeForPackedGroup(groupId, 'pk-1', {} as never);
    expect(startSession).not.toHaveBeenCalled();
  });

  describe('thu hồi từ hàng hoàn', () => {
    beforeEach(() => materialModel.findOne.mockReturnValue(q(boxM)));
    const session = {} as never;

    it('hạng A chưa gỡ nhãn cũ -> 400 PKG_OLD_LABEL_NOT_REMOVED', async () => {
      await expect(service.recoverFromReturn([{ material_code: 'BOX-M', quantity: 1, grade: 'A' }], 'rma-1', 'wh-1', session))
        .rejects.toMatchObject({ errorCode: E.OLD_LABEL_NOT_REMOVED });
    });

    it('hạng A hợp lệ -> kho tái sử dụng; hạng B -> kho NỘI BỘ; hạng C -> ghi nhận loại bỏ', async () => {
      const r = await service.recoverFromReturn([
        { material_code: 'BOX-M', quantity: 1, grade: 'A', reuse_cycle_seen: 1, old_label_removed: true },
        { material_code: 'BOX-M', quantity: 2, grade: 'B' },
        { material_code: 'BOX-M', quantity: 1, grade: 'C' },
      ], 'rma-1', 'wh-1', session);
      expect(r.map((x) => x.outcome)).toEqual(['Hạng A — vào kho tái sử dụng', 'Hạng B — vào kho vật liệu nội bộ', 'Hạng C — tái chế/loại bỏ']);
      expect(materialModel.updateOne).toHaveBeenCalledWith({ _id: boxM._id }, { $inc: { qty_reused: 1 } }, expect.anything());
      expect(materialModel.updateOne).toHaveBeenCalledWith({ _id: boxM._id }, { $inc: { qty_internal: 2 } }, expect.anything());
      expect(moves().map((m) => [m.type, m.condition])).toEqual([['recover', 'reused'], ['recover', 'internal'], ['discard', 'discarded']]);
    });

    it('hạng A đã dùng 3/3 lần -> tự hạ hạng C, ghi nhận loại bỏ', async () => {
      const r = await service.recoverFromReturn([{ material_code: 'BOX-M', quantity: 1, grade: 'A', reuse_cycle_seen: 3, old_label_removed: true }], 'rma-1', 'wh-1', session);
      expect(r[0]?.recoveredToReuse).toBe(false);
      expect(moves()[0]).toMatchObject({ type: 'discard' });
    });
  });

  it('xuất dùng nội bộ vượt tồn hạng B -> 409 PKG_INSUFFICIENT_INTERNAL', async () => {
    materialModel.findOne.mockReturnValue(q({ ...boxM, qty_internal: 1 }));
    materialModel.findOneAndUpdate.mockResolvedValue(null);
    await expect(service.internalUse('BOX-M', { quantity: 5, purpose: 'Chia khu' }, 'wh-1')).rejects.toMatchObject({ errorCode: E.INSUFFICIENT_INTERNAL });
  });

  it('savingsSummary: tiết kiệm, tỷ lệ dùng lại, tỷ lệ làm theo gợi ý', async () => {
    movementModel.aggregate
      .mockResolvedValueOnce([
        { _id: { type: 'consume', condition: 'new' }, units: 6, saving: 0 },
        { _id: { type: 'consume', condition: 'reused' }, units: 2, saving: 13000 },
        { _id: { type: 'recover', condition: 'internal' }, units: 4, saving: 0 },
      ])
      .mockResolvedValueOnce([{ _id: 'g1', followed: true }, { _id: 'g2', followed: true }, { _id: 'g3', followed: false }, { _id: 'g4', followed: true }]);
    await expect(service.savingsSummary()).resolves.toMatchObject({
      totalSavingVnd: 13000, reuseRate: 25, unitsRecoveredInternal: 4, groupsPacked: 4, groupsFollowedRecommendation: 3, recommendationFollowRate: 75,
    });
  });
});
