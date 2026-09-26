import { Types } from 'mongoose';
import { PackagingMaterialsService } from './packaging-materials.service';
import { PACKAGING_MATERIAL_ERROR_CODES as E } from './packaging-materials.errors';

//!=============================================
// G4 (27/09/2026) — vật liệu đóng gói + tái sử dụng. Kiểm quy tắc nghiệp vụ:
// ưu tiên hàng tái sử dụng (ghi tiết kiệm); hàng dễ vỡ chỉ dùng thùng MỚI;
// không chặn pack khi thiếu vật liệu; pack lại không trừ 2 lần; hạng A phải
// gỡ nhãn cũ; quá số lần tái sử dụng -> tự hạ hạng C.
//!=============================================
describe('PackagingMaterialsService — G4', () => {
  const groupId = new Types.ObjectId().toString();
  let materialModel: { findOne: jest.Mock; updateOne: jest.Mock; create: jest.Mock };
  let movementModel: { exists: jest.Mock; create: jest.Mock; aggregate: jest.Mock };
  let recommendationModel: { findOne: jest.Mock };
  let service: PackagingMaterialsService;

  const boxM = { _id: new Types.ObjectId(), code: 'BOX-M', kind: 'box', reusable: true, unit_cost_vnd: 6500, max_reuse_cycles: 3, qty_new: 10, qty_reused: 2, is_active: true };
  const bubble = { _id: new Types.ObjectId(), code: 'BUBBLE', kind: 'cushioning', reusable: true, unit_cost_vnd: 1500, max_reuse_cycles: 3, qty_new: 20, qty_reused: 0, is_active: true };
  const rec = (materialType: string, qty = 1): Record<string, unknown> => ({ box_size: { length_cm: 35, width_cm: 25, height_cm: 20 }, material_type: materialType, material_quantity: qty });

  beforeEach(() => {
    materialModel = { findOne: jest.fn(), updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }), create: jest.fn() };
    movementModel = { exists: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue([{}]), aggregate: jest.fn() };
    recommendationModel = { findOne: jest.fn() };
    const session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    service = new PackagingMaterialsService(materialModel as never, movementModel as never, recommendationModel as never, { startSession: jest.fn().mockResolvedValue(session) } as never);
  });

  const moves = (): Record<string, unknown>[] => movementModel.create.mock.calls.map((c) => (c as [[Record<string, unknown>]])[0][0]);

  it('khai thùng thiếu kích thước -> 400 PKG_MATERIAL_INVALID_DEFINITION', async () => {
    await expect(service.create({ code: 'BOX-X', name: 'Thùng', kind: 'box', unit_cost_vnd: 1000 })).rejects.toMatchObject({ errorCode: E.INVALID_DEFINITION });
  });

  describe('consumeForPackedGroup', () => {
    it('hàng thường: dùng thùng TÁI SỬ DỤNG trước, ghi tiết kiệm = đơn giá thùng mới', async () => {
      recommendationModel.findOne.mockResolvedValue(rec('Medium Box'));
      materialModel.findOne.mockResolvedValueOnce(boxM);

      const r = await service.consumeForPackedGroup(groupId, 'pk-1');

      expect(r.consumed).toEqual([{ materialCode: 'BOX-M', condition: 'reused', quantity: 1, savingVnd: 6500 }]);
      expect(moves()[0]).toMatchObject({ type: 'consume', condition: 'reused', delta: -1, saving_vnd: 6500, ref_type: 'order_group', ref_id: groupId });
    });

    it('hàng dễ vỡ: thùng CHỈ dùng hàng mới (dù có tái sử dụng) + trừ Bubble Wrap theo số lượng gợi ý', async () => {
      recommendationModel.findOne.mockResolvedValue(rec('Bubble Wrap', 2));
      materialModel.findOne.mockResolvedValueOnce(boxM).mockResolvedValueOnce(bubble);

      const r = await service.consumeForPackedGroup(groupId, 'pk-1');

      expect(r.consumed).toEqual([
        { materialCode: 'BOX-M', condition: 'new', quantity: 1, savingVnd: 0 },
        { materialCode: 'BUBBLE', condition: 'new', quantity: 2, savingVnd: 0 },
      ]);
    });

    it('bấm pack lại (đã trừ rồi) -> không trừ lần 2', async () => {
      movementModel.exists.mockResolvedValue({ _id: 'x' });
      const r = await service.consumeForPackedGroup(groupId, 'pk-1');
      expect(r.consumed).toEqual([]);
      expect(recommendationModel.findOne).not.toHaveBeenCalled();
    });

    it('chưa khai thùng trong danh mục -> KHÔNG lỗi, chỉ cảnh báo (không chặn pack)', async () => {
      recommendationModel.findOne.mockResolvedValue(rec('Medium Box'));
      materialModel.findOne.mockResolvedValueOnce(null);
      const r = await service.consumeForPackedGroup(groupId, 'pk-1');
      expect(r.consumed).toEqual([]);
      expect(r.warnings[0]).toContain('Chưa khai thùng');
    });

    it('hết thùng mới (hàng dễ vỡ) -> cảnh báo nhập thêm, không trừ âm', async () => {
      recommendationModel.findOne.mockResolvedValue(rec('Bubble Wrap', 1));
      materialModel.findOne.mockResolvedValueOnce({ ...boxM, qty_new: 0 }).mockResolvedValueOnce(bubble);
      materialModel.updateOne.mockResolvedValueOnce({ modifiedCount: 0 }).mockResolvedValue({ modifiedCount: 1 });
      const r = await service.consumeForPackedGroup(groupId, 'pk-1');
      expect(r.warnings.some((w) => w.includes('Không đủ "BOX-M"'))).toBe(true);
    });
  });

  describe('recoverFromReturn', () => {
    beforeEach(() => materialModel.findOne.mockResolvedValue(boxM));
    const session = {} as never;

    it('hạng A chưa gỡ nhãn cũ -> 400 PKG_OLD_LABEL_NOT_REMOVED (bảo vệ dữ liệu cá nhân khách trước)', async () => {
      await expect(service.recoverFromReturn([{ material_code: 'BOX-M', quantity: 1, grade: 'A' }], 'rma-1', 'wh-1', session))
        .rejects.toMatchObject({ errorCode: E.OLD_LABEL_NOT_REMOVED });
    });

    it('hạng A đã dùng 3/3 lần -> tự hạ hạng C, KHÔNG vào kho tái sử dụng', async () => {
      const r = await service.recoverFromReturn([{ material_code: 'BOX-M', quantity: 1, grade: 'A', reuse_cycle_seen: 3, old_label_removed: true }], 'rma-1', 'wh-1', session);
      expect(r[0]?.recoveredToReuse).toBe(false);
      expect(materialModel.updateOne).not.toHaveBeenCalled();
    });

    it('hạng A hợp lệ -> +qty_reused + sổ cái "recover"; hạng B -> không vào kho', async () => {
      const r = await service.recoverFromReturn([
        { material_code: 'BOX-M', quantity: 1, grade: 'A', reuse_cycle_seen: 1, old_label_removed: true },
        { material_code: 'BOX-M', quantity: 1, grade: 'B' },
      ], 'rma-1', 'wh-1', session);
      expect(r.map((x) => x.recoveredToReuse)).toEqual([true, false]);
      expect(materialModel.updateOne).toHaveBeenCalledTimes(1);
      expect(moves()[0]).toMatchObject({ type: 'recover', condition: 'reused', delta: 1, ref_type: 'return_request', ref_id: 'rma-1' });
    });
  });

  it('savingsSummary: tổng tiết kiệm + tỷ lệ dùng lại', async () => {
    movementModel.aggregate.mockResolvedValue([
      { _id: { type: 'consume', condition: 'new' }, units: 6, saving: 0 },
      { _id: { type: 'consume', condition: 'reused' }, units: 2, saving: 13000 },
      { _id: { type: 'recover', condition: 'reused' }, units: 3, saving: 0 },
    ]);
    await expect(service.savingsSummary()).resolves.toEqual({ totalSavingVnd: 13000, unitsConsumedNew: 6, unitsConsumedReused: 2, unitsRecovered: 3, reuseRate: 25 });
  });
});
