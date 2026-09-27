import { Types } from 'mongoose';
import { WarehouseService } from './warehouse.service';
import { WAREHOUSE_ERROR_CODES } from './warehouse.errors';

//!=============================================
// K1 (26/09/2026) — vòng đời kho/khu/kệ + vá lỗi gán SKU vào kệ sai.
// Tập trung đúng các quy tắc nghiệp vụ: chặn tắt khi còn hàng, tắt dây
// chuyền trong transaction, thao tác lặp lại không lỗi, document cũ
// (không có is_active) vẫn được coi là đang hoạt động.
//!=============================================
describe('WarehouseService — vòng đời K1', () => {
  const warehouseId = new Types.ObjectId().toString();
  const otherWarehouseId = new Types.ObjectId().toString();
  const zoneId = new Types.ObjectId().toString();
  const binId = new Types.ObjectId().toString();

  let warehouseModel: { findById: jest.Mock; updateOne: jest.Mock; find: jest.Mock };
  let zoneModel: { findById: jest.Mock; updateOne: jest.Mock; updateMany: jest.Mock; find: jest.Mock };
  let binModel: { findById: jest.Mock; updateOne: jest.Mock; updateMany: jest.Mock; find: jest.Mock };
  let assignmentModel: { aggregate: jest.Mock; findOneAndUpdate: jest.Mock };
  let session: { withTransaction: jest.Mock; endSession: jest.Mock };
  let service: WarehouseService;

  const activeWarehouse = { _id: new Types.ObjectId(warehouseId), warehouse_code: 'WH-01', is_active: true };

  beforeEach(() => {
    warehouseModel = { findById: jest.fn(), updateOne: jest.fn().mockResolvedValue({}), find: jest.fn() };
    zoneModel = { findById: jest.fn(), updateOne: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}), find: jest.fn() };
    binModel = { findById: jest.fn(), updateOne: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}), find: jest.fn() };
    assignmentModel = { aggregate: jest.fn(), findOneAndUpdate: jest.fn() };
    session = {
      withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    const connection = { startSession: jest.fn().mockResolvedValue(session) };
    service = new WarehouseService(
      warehouseModel as never,
      zoneModel as never,
      binModel as never,
      assignmentModel as never,
      {} as never, // productMasterModel
      {} as never, // orderGroupsService
      connection as never,
      {} as never, // categoriesService (K2) — không dùng trong các test vòng đời
      { create: jest.fn().mockResolvedValue([{}]), find: jest.fn() } as never, // K3 movementModel
      { find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) } as never, // K4b mappingModel (chưa nối gì -> đường lùi)
    );
  });

  describe('deactivateWarehouse', () => {
    it('còn hàng tồn -> 409 WH_HAS_STOCK, KHÔNG ghi gì vào DB', async () => {
      warehouseModel.findById.mockResolvedValue(activeWarehouse);
      assignmentModel.aggregate.mockResolvedValue([{ total: 12 }]);

      await expect(service.deactivateWarehouse(warehouseId)).rejects.toMatchObject({
        errorCode: WAREHOUSE_ERROR_CODES.HAS_STOCK,
      });
      expect(warehouseModel.updateOne).not.toHaveBeenCalled();
      expect(zoneModel.updateMany).not.toHaveBeenCalled();
      expect(binModel.updateMany).not.toHaveBeenCalled();
    });

    it('hết hàng -> tắt kho + dây chuyền toàn bộ khu + kệ trong CÙNG 1 transaction', async () => {
      warehouseModel.findById.mockResolvedValue(activeWarehouse);
      assignmentModel.aggregate.mockResolvedValue([]);

      await service.deactivateWarehouse(warehouseId);

      expect(session.withTransaction).toHaveBeenCalledTimes(1);
      expect(warehouseModel.updateOne).toHaveBeenCalledWith(expect.anything(), { $set: { is_active: false } }, { session });
      expect(zoneModel.updateMany).toHaveBeenCalledWith(expect.anything(), { $set: { is_active: false } }, { session });
      expect(binModel.updateMany).toHaveBeenCalledWith(expect.anything(), { $set: { is_active: false } }, { session });
      expect(session.endSession).toHaveBeenCalledTimes(1);
    });

    it('kho đã tắt sẵn -> trả về luôn, không kiểm tồn, không ghi (thao tác lặp lại không lỗi)', async () => {
      warehouseModel.findById.mockResolvedValue({ ...activeWarehouse, is_active: false });

      await service.deactivateWarehouse(warehouseId);

      expect(assignmentModel.aggregate).not.toHaveBeenCalled();
      expect(warehouseModel.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('assignSkuToBin — vá lỗi không kiểm tra kệ', () => {
    const dto = { platform: 'lazada', shop_id: 'shop-1', seller_sku: 'SKU-1', bin_location_id: binId, initial_quantity: 0 };

    it('kệ thuộc KHO KHÁC -> 400 WH_BIN_NOT_IN_WAREHOUSE, không tạo assignment', async () => {
      warehouseModel.findById.mockResolvedValue(activeWarehouse);
      binModel.findById.mockResolvedValue({ _id: new Types.ObjectId(binId), warehouse_id: new Types.ObjectId(otherWarehouseId), bin_code: 'B-01-01-01' });

      await expect(service.assignSkuToBin(warehouseId, dto as never)).rejects.toMatchObject({
        errorCode: WAREHOUSE_ERROR_CODES.BIN_NOT_IN_WAREHOUSE,
      });
      expect(assignmentModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('kệ đã vô hiệu hóa -> 409 WH_BIN_INACTIVE', async () => {
      warehouseModel.findById.mockResolvedValue(activeWarehouse);
      binModel.findById.mockResolvedValue({ _id: new Types.ObjectId(binId), warehouse_id: new Types.ObjectId(warehouseId), bin_code: 'A-01-01-01', is_active: false });

      await expect(service.assignSkuToBin(warehouseId, dto as never)).rejects.toMatchObject({
        errorCode: WAREHOUSE_ERROR_CODES.BIN_INACTIVE,
      });
    });

    it('kho đã vô hiệu hóa -> 409 WH_WAREHOUSE_INACTIVE', async () => {
      warehouseModel.findById.mockResolvedValue({ ...activeWarehouse, is_active: false });

      await expect(service.assignSkuToBin(warehouseId, dto as never)).rejects.toMatchObject({
        errorCode: WAREHOUSE_ERROR_CODES.WAREHOUSE_INACTIVE,
      });
    });

    it('kệ CŨ (tạo trước K1, không có field is_active) thuộc đúng kho -> vẫn gán được', async () => {
      warehouseModel.findById.mockResolvedValue(activeWarehouse);
      binModel.findById.mockResolvedValue({ _id: new Types.ObjectId(binId), warehouse_id: new Types.ObjectId(warehouseId), bin_code: 'A-01-01-01' });
      // K3 — gán = tạo bản ghi (SKU, ô) mới nếu chưa có, không còn upsert "dời chỗ"
      (assignmentModel as unknown as { findOne: jest.Mock }).findOne = jest.fn().mockResolvedValue(null);
      (assignmentModel as unknown as { create: jest.Mock }).create = jest.fn().mockResolvedValue([{ _id: new Types.ObjectId() }]);

      await expect(service.assignSkuToBin(warehouseId, dto as never)).resolves.toBeDefined();
    });
  });

  it('listZones mặc định lọc is_active $ne false — document cũ không có field vẫn hiện ra', async () => {
    const lean = jest.fn().mockResolvedValue([]);
    zoneModel.find.mockReturnValue({ lean });

    await service.listZones(warehouseId);

    expect(zoneModel.find).toHaveBeenCalledWith(expect.objectContaining({ is_active: { $ne: false } }));
  });

  it('reactivateBin khi khu đang tắt -> 409 WH_ZONE_INACTIVE', async () => {
    binModel.findById.mockResolvedValue({ _id: new Types.ObjectId(binId), zone_id: new Types.ObjectId(zoneId), bin_code: 'A-01-01-01', is_active: false });
    zoneModel.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ zone_code: 'A', is_active: false }) });

    await expect(service.reactivateBin(binId)).rejects.toMatchObject({ errorCode: WAREHOUSE_ERROR_CODES.ZONE_INACTIVE });
    expect(binModel.updateOne).not.toHaveBeenCalled();
  });
});
