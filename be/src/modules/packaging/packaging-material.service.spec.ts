import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import type { ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import { PackagingMaterialService } from './packaging-material.service';
import { PackagingMaterial } from './schemas/packaging-material.schema';
import { PackagingMaterialMovement } from './schemas/packaging-material-movement.schema';
import { PackagingMaterialRules } from './schemas/packaging-material-rules.schema';
import { PACKAGING_ERROR_CODES } from './packaging.errors';
import { DEFAULT_MATERIAL_RULES } from './engine';

describe('PackagingMaterialService (28/09/2026)', () => {
  let service: PackagingMaterialService;
  let materialModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    create: jest.Mock;
  };
  let movementModel: { create: jest.Mock };
  let rulesModel: { findOne: jest.Mock };

  const session = {} as ClientSession;
  const groupId = new Types.ObjectId();
  const userId = new Types.ObjectId().toString();
  const recA = new Types.ObjectId();
  const recB = new Types.ObjectId();

  function stockDoc(code: string, onHand: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { _id: new Types.ObjectId(), code, name: `Vật tư ${code}`, quantity_on_hand: onHand, reorder_level: 20, ...extra };
  }

  /** findOne(...).session(...) → doc; findOneAndUpdate trả doc sau khi trừ. */
  function mockStock(doc: Record<string, unknown> | null): void {
    materialModel.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(doc) });
    if (doc) {
      materialModel.findOneAndUpdate.mockImplementation((_filter: unknown, update: { $inc: { quantity_on_hand: number } }) =>
        Promise.resolve({ ...doc, quantity_on_hand: (doc.quantity_on_hand as number) + update.$inc.quantity_on_hand }),
      );
    }
  }

  beforeEach(async () => {
    materialModel = {
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      create: jest.fn(),
    };
    movementModel = { create: jest.fn().mockResolvedValue([]) };
    rulesModel = { findOne: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PackagingMaterialService,
        { provide: getModelToken(PackagingMaterial.name), useValue: materialModel },
        { provide: getModelToken(PackagingMaterialMovement.name), useValue: movementModel },
        { provide: getModelToken(PackagingMaterialRules.name), useValue: rulesModel },
        { provide: getConnectionToken(), useValue: { startSession: jest.fn() } },
      ],
    }).compile();
    service = module.get(PackagingMaterialService);
  });

  describe('consumeForPack', () => {
    it('đủ tồn → trừ đúng số lượng, ghi 1 dòng sổ, không thiếu', async () => {
      mockStock(stockDoc('FOAM', 100));

      const result = await service.consumeForPack(session, [{ code: 'FOAM', quantity: 4, recommendationId: recA }], groupId, userId);

      expect(result.shortfalls).toEqual([]);
      expect(result.consumed).toEqual([expect.objectContaining({ code: 'FOAM', before: 100, after: 96, reorderLevel: 20 })]);
      expect(movementModel.create).toHaveBeenCalledTimes(1);
      const [[row]] = movementModel.create.mock.calls[0] as [[{ delta: number; reason: string; balance_after: number }]];
      expect(row).toMatchObject({ delta: -4, reason: 'pack', balance_after: 96 });
    });

    it('tồn ít hơn cần → trừ phần có, ghi phần thiếu, KHÔNG ném lỗi', async () => {
      mockStock(stockDoc('FOAM', 3));

      const result = await service.consumeForPack(session, [{ code: 'FOAM', quantity: 4, recommendationId: recA }], groupId, userId);

      expect(result.shortfalls).toEqual([{ recommendationId: recA, code: 'FOAM', missing: 1 }]);
      const [[row]] = movementModel.create.mock.calls[0] as [[{ delta: number; balance_after: number }]];
      expect(row).toMatchObject({ delta: -3, balance_after: 0 });
    });

    it('tồn = 0 → thiếu toàn bộ, không trừ, không ghi sổ', async () => {
      mockStock(stockDoc('FOAM', 0));

      const result = await service.consumeForPack(session, [{ code: 'FOAM', quantity: 4, recommendationId: recA }], groupId, userId);

      expect(result.shortfalls).toEqual([{ recommendationId: recA, code: 'FOAM', missing: 4 }]);
      expect(materialModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(movementModel.create).not.toHaveBeenCalled();
    });

    it('vật tư không còn trong danh mục → thiếu toàn bộ, không lỗi', async () => {
      mockStock(null);

      const result = await service.consumeForPack(session, [{ code: 'GONE', quantity: 2, recommendationId: recA }], groupId, userId);

      expect(result.shortfalls).toEqual([{ recommendationId: recA, code: 'GONE', missing: 2 }]);
      expect(result.consumed).toEqual([]);
    });

    it('2 kiện cùng dùng 1 vật tư → before lấy lần trừ đầu, after lấy lần trừ cuối, mỗi kiện 1 dòng sổ', async () => {
      const doc = stockDoc('FOAM', 100);
      let balance = 100;
      materialModel.findOne.mockImplementation(() => ({
        session: jest.fn().mockImplementation(() => Promise.resolve({ ...doc, quantity_on_hand: balance })),
      }));
      materialModel.findOneAndUpdate.mockImplementation((_f: unknown, update: { $inc: { quantity_on_hand: number } }) => {
        balance += update.$inc.quantity_on_hand;
        return Promise.resolve({ ...doc, quantity_on_hand: balance });
      });

      const result = await service.consumeForPack(
        session,
        [
          { code: 'FOAM', quantity: 4, recommendationId: recA },
          { code: 'FOAM', quantity: 4, recommendationId: recB },
        ],
        groupId,
        userId,
      );

      expect(result.consumed).toHaveLength(1);
      expect(result.consumed[0]).toMatchObject({ before: 100, after: 92 });
      expect(movementModel.create).toHaveBeenCalledTimes(2);
    });

    it('bỏ qua dòng cần 0 đơn vị', async () => {
      const result = await service.consumeForPack(session, [{ code: 'FOAM', quantity: 0, recommendationId: recA }], groupId, userId);
      expect(result).toEqual({ consumed: [], shortfalls: [] });
      expect(materialModel.findOne).not.toHaveBeenCalled();
    });
  });

  describe('luật vật tư', () => {
    it('chưa lưu bộ luật nào → dùng luật mặc định trong code', async () => {
      rulesModel.findOne.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve(null) }) });
      const active = await service.getActiveRules();
      expect(active).toEqual({ version: null, rules: DEFAULT_MATERIAL_RULES, isDefault: true });
    });

    it('có bộ luật trong DB → trả đúng version + luật (dải độ trống giữ nguyên)', async () => {
      rulesModel.findOne.mockReturnValue({
        sort: () => ({
          lean: () =>
            Promise.resolve({
              version: 3,
              rules: [
                { material_type: 'air_pillow', applies_to: 'any', min_units: 1, basis: 'void_band', quantity: 0, void_bands: [{ min_void_ratio: 0.6, quantity: 3 }] },
                { material_type: 'fragile_tape', applies_to: 'shoes', min_units: 1, basis: 'per_carton', quantity: 1, void_bands: [] },
              ],
            }),
        }),
      });
      const active = await service.getActiveRules();
      expect(active.version).toBe(3);
      expect(active.isDefault).toBe(false);
      expect(active.rules[0]?.void_bands).toEqual([{ min_void_ratio: 0.6, quantity: 3 }]);
      // luật không có dải → không mang field void_bands rỗng
      expect(active.rules[1]).not.toHaveProperty('void_bands');
    });

    it('planningData: danh mục đang dùng đổi sang kiểu lõi của engine', async () => {
      materialModel.find.mockReturnValue({
        lean: () =>
          Promise.resolve([
            { code: 'FOAM', name: 'Góc xốp', type: 'foam_corner', unit: 'cái', weight_g_per_unit: 5, price_vnd_per_unit: 300, quantity_on_hand: 9, is_active: true },
          ]),
      });
      rulesModel.findOne.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve(null) }) });

      const planning = await service.planningData();

      expect(planning.catalog).toEqual([
        { code: 'FOAM', name: 'Góc xốp', type: 'foam_corner', unit: 'cái', weight_g_per_unit: 5, price_vnd_per_unit: 300 },
      ]);
      expect(planning.rules).toBe(DEFAULT_MATERIAL_RULES);
    });
  });

  describe('create', () => {
    const dto = {
      code: 'FOAM',
      name: 'Góc xốp',
      type: 'foam_corner' as const,
      unit: 'cái',
      weight_g_per_unit: 5,
      price_vnd_per_unit: 300,
    };

    it('tồn ban đầu 0 và chưa đánh dấu mẫu', async () => {
      materialModel.create.mockResolvedValue({});
      await service.create(dto);
      expect(materialModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ quantity_on_hand: 0, reorder_level: 20, is_sample: false, is_active: true }),
      );
    });

    it('trùng mã (E11000) → PKG_MATERIAL_CODE_IN_USE', async () => {
      materialModel.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
      await expect(service.create(dto)).rejects.toMatchObject({ errorCode: PACKAGING_ERROR_CODES.MATERIAL_CODE_IN_USE });
    });
  });
});
