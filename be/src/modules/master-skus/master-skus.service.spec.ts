import { MasterSkusService, buildMasterSkuCode, normalizeSellerSku } from './master-skus.service';
import { MASTER_SKU_ERROR_CODES as E } from './master-skus.errors';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';

//!=============================================
// K4a (27/09/2026) — SKU nội bộ. Kiểm quy tắc đã chốt: mã do HỆ THỐNG ghép;
// màu/size phải thuộc danh mục chuẩn; chỉ nối SKU sàn đã đồng bộ về; 1 SKU sàn
// chỉ nối 1 SKU nội bộ (so khớp không phân biệt hoa/thường); "sửa" mã = Thay thế.
//!=============================================
describe('MasterSkusService — K4a', () => {
  let colorModel: { findOne: jest.Mock; findOneAndUpdate: jest.Mock };
  let skuModel: { create: jest.Mock; findOne: jest.Mock; findOneAndUpdate: jest.Mock; countDocuments: jest.Mock; updateOne: jest.Mock };
  let mappingModel: { findOne: jest.Mock; create: jest.Mock; updateMany: jest.Mock; countDocuments: jest.Mock };
  let productMasterModel: { findOne: jest.Mock };
  let categoriesService: { getActiveLevel2: jest.Mock };
  let assignmentModel: { find: jest.Mock; findOne: jest.Mock; updateOne: jest.Mock; updateMany: jest.Mock; deleteOne: jest.Mock; aggregate: jest.Mock };
  let movementModel: { create: jest.Mock };
  let service: MasterSkusService;

  const dto = { category_code: 'ATHUN', model_no: 5, color_code: 'DEN', size: 'M', name: 'Áo thun basic đen M' };
  const skuDoc = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    master_sku: 'ATHUN-005-DEN-M', category_code: 'ATHUN', model_no: 5, color_code: 'DEN', size: 'M', name: 'Áo thun', gender: 'unisex',
    length_cm: null, width_cm: null, height_cm: null, weight_kg: null, is_fragile: false, is_active: true, replaced_by: null, ...over,
  });

  beforeEach(() => {
    colorModel = { findOne: jest.fn().mockResolvedValue({ code: 'DEN', is_active: true }), findOneAndUpdate: jest.fn() };
    skuModel = { create: jest.fn().mockImplementation((docs: Record<string, unknown>[]) => Promise.resolve(docs)), findOne: jest.fn(), findOneAndUpdate: jest.fn(), countDocuments: jest.fn(), updateOne: jest.fn() };
    mappingModel = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue([{}]), updateMany: jest.fn().mockResolvedValue({ modifiedCount: 2 }), countDocuments: jest.fn() };
    productMasterModel = { findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'pm' }) }) }) };
    assignmentModel = {
      find: jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue([]) }),
      findOne: jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(null) }),
      updateOne: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}), deleteOne: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue([]),
    };
    movementModel = { create: jest.fn().mockResolvedValue([]) };
    categoriesService = { getActiveLevel2: jest.fn().mockResolvedValue({ code: 'ATHUN', size_scale: ['S', 'M', 'L'] }) };
    const session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    service = new MasterSkusService(colorModel as never, skuModel as never, mappingModel as never, productMasterModel as never, categoriesService as never, { startSession: jest.fn().mockResolvedValue(session) } as never, assignmentModel as never, movementModel as never);
  });

  it('ghép mã đúng quy ước: danh mục-mẫu 3 số-màu-size', () => {
    expect(buildMasterSkuCode({ category_code: 'GUOC', model_no: 5, color_code: 'DEN', size: '37' })).toBe('GUOC-005-DEN-37');
    expect(normalizeSellerSku('  atd-m-01 ')).toBe('ATD-M-01');
  });

  describe('create', () => {
    it('hợp lệ -> hệ thống TỰ ghép mã ATHUN-005-DEN-M', async () => {
      const doc = await service.create(dto, 'admin-1');
      expect(doc.master_sku).toBe('ATHUN-005-DEN-M');
    });

    it('size không thuộc thang size danh mục -> 400 MSKU_SIZE_NOT_IN_SCALE', async () => {
      await expect(service.create({ ...dto, size: 'XXL' }, 'admin-1')).rejects.toMatchObject({ errorCode: E.SIZE_NOT_IN_SCALE });
    });

    it('màu chưa có trong danh mục màu -> 400 COLOR_NOT_FOUND (hết "DEN"/"DENN")', async () => {
      colorModel.findOne.mockResolvedValue(null);
      await expect(service.create({ ...dto, color_code: 'DENN' }, 'admin-1')).rejects.toMatchObject({ errorCode: E.COLOR_NOT_FOUND });
    });
  });

  describe('mapping', () => {
    const map = { platform: MarketplacePlatform.LAZADA, shop_id: 's1', seller_sku: 'ATD-M-01' };
    beforeEach(() => skuModel.findOne.mockResolvedValue(skuDoc()));

    it('SKU sàn chưa từng đồng bộ về (gõ sai) -> 400 MAP_SELLER_SKU_UNKNOWN', async () => {
      productMasterModel.findOne.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) });
      await expect(service.createMapping('ATHUN-005-DEN-M', map, 'admin-1')).rejects.toMatchObject({ errorCode: E.SELLER_SKU_UNKNOWN });
    });

    it('SKU sàn đã nối SKU nội bộ khác -> 409 MAP_ALREADY_MAPPED (tra theo bản chuẩn hóa)', async () => {
      mappingModel.findOne.mockResolvedValue({ master_sku: 'ATHUN-001-DEN-M' });
      await expect(service.createMapping('ATHUN-005-DEN-M', map, 'admin-1')).rejects.toMatchObject({ errorCode: E.ALREADY_MAPPED });
      expect(mappingModel.findOne).toHaveBeenCalledWith(expect.objectContaining({ seller_sku_normalized: 'ATD-M-01' }));
    });

    it('hợp lệ -> lưu cả bản gốc và bản chuẩn hóa', async () => {
      await service.createMapping('ATHUN-005-DEN-M', { ...map, seller_sku: 'atd-m-01' }, 'admin-1');
      expect((mappingModel.create.mock.calls[0] as [[Record<string, unknown>]])[0][0]).toMatchObject({ seller_sku: 'atd-m-01', seller_sku_normalized: 'ATD-M-01' });
    });
  });

  describe('replace (Thay thế SKU)', () => {
    it('đổi màu -> tạo SKU mới, chuyển MỌI liên kết sàn, khóa SKU cũ + replaced_by — 1 transaction', async () => {
      skuModel.findOne.mockResolvedValue(skuDoc());
      skuModel.findOneAndUpdate.mockResolvedValue(skuDoc({ is_active: false, replaced_by: 'ATHUN-005-TRANG-M' }));

      const r = await service.replace('ATHUN-005-DEN-M', { color_code: 'TRANG', reason: 'Đặt nhầm màu' }, 'admin-1');

      expect(r.newSku.master_sku).toBe('ATHUN-005-TRANG-M');
      expect(mappingModel.updateMany).toHaveBeenCalledWith({ master_sku: 'ATHUN-005-DEN-M' }, { $set: { master_sku: 'ATHUN-005-TRANG-M' } }, expect.anything());
      expect(r.movedMappings).toBe(2);
    });

    it('không đổi thành phần nào -> 400 MSKU_REPLACE_SAME', async () => {
      skuModel.findOne.mockResolvedValue(skuDoc());
      await expect(service.replace('ATHUN-005-DEN-M', { reason: 'test' }, 'admin-1')).rejects.toMatchObject({ errorCode: E.REPLACE_SAME });
    });
  });

  it('vô hiệu hóa SKU còn SKU sàn nối vào -> 409 MSKU_HAS_MAPPINGS', async () => {
    skuModel.findOne.mockResolvedValue(skuDoc());
    mappingModel.countDocuments.mockResolvedValue(1);
    await expect(service.setActive('ATHUN-005-DEN-M', false)).rejects.toMatchObject({ errorCode: E.HAS_MAPPINGS });
  });

  it('tắt màu đang có SKU dùng -> 409 COLOR_IN_USE', async () => {
    skuModel.countDocuments.mockResolvedValue(3);
    await expect(service.setColorActive('DEN', false)).rejects.toMatchObject({ errorCode: E.COLOR_IN_USE });
  });

  describe('K4b — gắn nhãn / gộp tồn', () => {
    const map = { platform: MarketplacePlatform.LAZADA, shop_id: 's1', seller_sku: 'ATD-M-01' };
    beforeEach(() => skuModel.findOne.mockResolvedValue(skuDoc()));

    it('nối SKU có tồn ở 1 ô CHƯA có dòng SKU nội bộ -> gắn nhãn master_sku (không đổi số lượng)', async () => {
      const row = { _id: 'r1', warehouse_id: 'w', bin_location_id: 'b', platform: 'lazada', shop_id: 's1', seller_sku: 'ATD-M-01', quantity_on_hand: 10 };
      assignmentModel.find.mockReturnValue({ session: jest.fn().mockResolvedValue([row]) });
      await service.createMapping('ATHUN-005-DEN-M', map, 'admin-1');
      expect(assignmentModel.updateOne).toHaveBeenCalledWith({ _id: 'r1' }, { $set: { master_sku: 'ATHUN-005-DEN-M' } }, expect.anything());
    });

    it('ô ĐÃ có dòng SKU nội bộ (từ sàn khác) -> GỘP số lượng, 2 dòng sổ cái, xóa dòng cũ', async () => {
      const row = { _id: 'r1', warehouse_id: 'w', bin_location_id: 'b', platform: 'lazada', shop_id: 's1', seller_sku: 'ATD-M-01', quantity_on_hand: 4 };
      const pooled = { _id: 'p1', platform: 'tiki', shop_id: 't1', seller_sku: 'AO-THUN-DEN-M', quantity_on_hand: 6 };
      assignmentModel.find.mockReturnValue({ session: jest.fn().mockResolvedValue([row]) });
      assignmentModel.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(pooled) });

      await service.createMapping('ATHUN-005-DEN-M', map, 'admin-1');

      expect(assignmentModel.updateOne).toHaveBeenCalledWith({ _id: 'p1' }, { $inc: { quantity_on_hand: 4 } }, expect.anything());
      const moves = (movementModel.create.mock.calls[0] as [Record<string, unknown>[]])[0];
      expect(moves.map((m) => [m.type, m.delta])).toEqual([['transfer_out', -4], ['transfer_in', 4]]);
      expect(assignmentModel.deleteOne).toHaveBeenCalledWith({ _id: 'r1' }, expect.anything());
    });

    it('bỏ nối khi SKU nội bộ còn tồn gộp chung -> 409 MAP_HAS_POOLED_STOCK', async () => {
      (mappingModel as unknown as { findById: jest.Mock }).findById = jest.fn().mockResolvedValue({ _id: 'm1', master_sku: 'ATHUN-005-DEN-M' });
      assignmentModel.aggregate.mockResolvedValue([{ total: 10 }]);
      await expect(service.deleteMapping('66f000000000000000000001')).rejects.toMatchObject({ errorCode: E.HAS_POOLED_STOCK });
    });
  });
});
