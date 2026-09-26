import { Types } from 'mongoose';
import { WarehouseService } from './warehouse.service';
import { WAREHOUSE_ERROR_CODES } from './warehouse.errors';

//!=============================================
// Rà soát K2 (26/09/2026) — 2 lỗ hổng phát hiện khi review code K2:
// (1) ô đang chứa hàng vẫn đổi được danh mục/size/màu đăng ký;
// (2) route generate kiểu cũ vẫn sinh kệ mã cũ trong khu chuẩn mới.
//!=============================================
describe('WarehouseService — rà soát K2', () => {
  const warehouseId = new Types.ObjectId();
  const binId = new Types.ObjectId();
  let binModel: { findById: jest.Mock; updateOne: jest.Mock; bulkWrite: jest.Mock };
  let zoneModel: { findById: jest.Mock };
  let warehouseModel: { findById: jest.Mock };
  let assignmentModel: { aggregate: jest.Mock };
  let categoriesService: { getActiveLevel2: jest.Mock };
  let service: WarehouseService;

  beforeEach(() => {
    binModel = { findById: jest.fn(), updateOne: jest.fn().mockResolvedValue({}), bulkWrite: jest.fn() };
    zoneModel = { findById: jest.fn() };
    warehouseModel = { findById: jest.fn().mockResolvedValue({ _id: warehouseId, warehouse_code: 'WH-01', is_active: true }) };
    assignmentModel = { aggregate: jest.fn() };
    categoriesService = { getActiveLevel2: jest.fn().mockResolvedValue({ code: 'ATHUN', size_scale: ['S', 'M', 'L'] }) };
    service = new WarehouseService(
      warehouseModel as never, zoneModel as never, binModel as never, assignmentModel as never,
      {} as never, {} as never, {} as never, categoriesService as never,
      { create: jest.fn().mockResolvedValue([{}]), find: jest.fn() } as never, // K3 movementModel
    );
  });

  describe('updateBin — ô đang có hàng', () => {
    const bin = { _id: binId, bin_code: 'KA-D1-P02-T03-1', designated: { category_code: 'ATHUN', size: 'L', color_code: 'DEN' } };

    it('đổi size khi ô còn hàng -> 409 WH_BIN_HAS_STOCK_DESIGNATION, không ghi gì', async () => {
      binModel.findById.mockResolvedValue(bin);
      assignmentModel.aggregate.mockResolvedValue([{ total: 7 }]);

      await expect(service.updateBin(binId.toString(), { designated_size: 'M' })).rejects.toMatchObject({
        errorCode: WAREHOUSE_ERROR_CODES.BIN_HAS_STOCK_DESIGNATION,
      });
      expect(binModel.updateOne).not.toHaveBeenCalled();
    });

    it('ô trống -> đổi size được', async () => {
      binModel.findById.mockResolvedValue(bin);
      assignmentModel.aggregate.mockResolvedValue([]);

      await service.updateBin(binId.toString(), { designated_size: 'M' });

      expect(binModel.updateOne).toHaveBeenCalledWith({ _id: binId }, { $set: { 'designated.size': 'M' } });
    });

    it('ô còn hàng nhưng CHỈ đổi sức chứa (không đụng đăng ký) -> vẫn cho', async () => {
      binModel.findById.mockResolvedValue(bin);
      assignmentModel.aggregate.mockResolvedValue([{ total: 7 }]);

      await service.updateBin(binId.toString(), { capacity: 40 });

      expect(binModel.updateOne).toHaveBeenCalledWith({ _id: binId }, { $set: { capacity: 40 } });
    });
  });

  it('generate kiểu cũ trong khu chuẩn mới (KA) -> 409 WH_ZONE_V2_USE_RACKS, không sinh kệ', async () => {
    zoneModel.findById.mockResolvedValue({ _id: new Types.ObjectId(), zone_code: 'KA', warehouse_id: warehouseId, is_active: true });

    await expect(
      service.generateBinLocations(new Types.ObjectId().toString(), { aisle: '03', rack_from: 1, rack_to: 2, level_from: 1, level_to: 2 }),
    ).rejects.toMatchObject({ errorCode: WAREHOUSE_ERROR_CODES.ZONE_V2_USE_RACKS });
    expect(binModel.bulkWrite).not.toHaveBeenCalled();
  });

  it('generate kiểu cũ trong khu mã cũ (A) -> vẫn chạy (tương thích ngược)', async () => {
    zoneModel.findById.mockResolvedValue({ _id: new Types.ObjectId(), zone_code: 'A', warehouse_id: warehouseId, is_active: true });
    binModel.bulkWrite.mockResolvedValue({ upsertedCount: 4 });

    await expect(
      service.generateBinLocations(new Types.ObjectId().toString(), { aisle: '03', rack_from: 1, rack_to: 2, level_from: 1, level_to: 2 }),
    ).resolves.toEqual({ created: 4 });
  });
});
