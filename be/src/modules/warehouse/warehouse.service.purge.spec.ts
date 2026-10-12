import { Types } from 'mongoose';
import { WarehouseService } from './warehouse.service';
import { WAREHOUSE_ERROR_CODES } from './warehouse.errors';

//!=============================================
// 10/10/2026 — xoá hẳn mục tạo nhầm + sửa gán nhầm ô (báo cáo Hải Phượng).
// Quy tắc: chưa từng dùng → xoá hẳn (trong transaction, kèm con); có hàng hoặc
// có dòng sổ cái → 409, không xoá gì.
//!=============================================
describe('WarehouseService — xoá hẳn + sửa gán nhầm (10/10/2026)', () => {
  const whId = new Types.ObjectId();
  const zoneId = new Types.ObjectId();
  const binId = new Types.ObjectId();
  const destBinId = new Types.ObjectId();
  const assignmentId = new Types.ObjectId();

  const leanList = (items: unknown[]): unknown => ({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(items) }),
  });

  let warehouseModel: Record<string, jest.Mock>;
  let zoneModel: Record<string, jest.Mock>;
  let binModel: Record<'findById' | 'find' | 'deleteOne' | 'deleteMany', jest.Mock>;
  let assignmentModel: Record<'aggregate' | 'deleteMany' | 'deleteOne' | 'findOne' | 'findOneAndUpdate', jest.Mock>;
  let movementModel: Record<'exists' | 'create', jest.Mock>;
  let session: { withTransaction: jest.Mock; endSession: jest.Mock };
  let service: WarehouseService;

  beforeEach(() => {
    warehouseModel = {
      findById: jest.fn().mockResolvedValue({ _id: whId, warehouse_code: 'WH-TEST', is_active: true }),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    zoneModel = {
      findById: jest.fn().mockResolvedValue({ _id: zoneId, warehouse_id: whId, zone_code: 'KA', is_active: true }),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 2 }),
    };
    binModel = {
      findById: jest.fn().mockImplementation((id: string) =>
        Promise.resolve(
          id === destBinId.toString()
            ? { _id: destBinId, warehouse_id: whId, bin_code: 'KA-D1-P01-T01-2', is_active: true, capacity: null }
            : { _id: binId, warehouse_id: whId, bin_code: 'KA-D1-P01-T01-1', is_active: true },
        ),
      ),
      find: jest.fn().mockReturnValue(leanList([{ _id: binId }])),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    assignmentModel = {
      aggregate: jest.fn().mockResolvedValue([]), // không còn hàng
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 3 }),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    movementModel = { exists: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue([{}]) };
    session = {
      withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    service = new WarehouseService(
      warehouseModel as never,
      zoneModel as never,
      binModel as never,
      assignmentModel as never,
      {} as never,
      {} as never,
      { startSession: jest.fn().mockResolvedValue(session) } as never,
      {} as never,
      movementModel as never,
      { find: jest.fn().mockReturnValue(leanList([])) } as never,
    );
  });

  describe('purgeBin', () => {
    it('ô chưa từng dùng → xoá ô + dòng gán thử tồn 0 trong 1 transaction', async () => {
      const result = await service.purgeBin(binId.toString());
      expect(session.withTransaction).toHaveBeenCalledTimes(1);
      expect(assignmentModel.deleteMany).toHaveBeenCalledWith(
        { warehouse_id: whId, bin_location_id: binId, quantity_on_hand: 0 },
        { session },
      );
      expect(binModel.deleteOne).toHaveBeenCalledWith({ _id: binId }, { session });
      expect(result).toEqual({ warehouses: 0, zones: 0, bins: 1, assignments: 3 });
    });

    it('ô còn hàng → 409 WH_HAS_STOCK, không xoá gì', async () => {
      assignmentModel.aggregate.mockResolvedValue([{ total: 4 }]);
      await expect(service.purgeBin(binId.toString())).rejects.toMatchObject({ errorCode: WAREHOUSE_ERROR_CODES.HAS_STOCK });
      expect(binModel.deleteOne).not.toHaveBeenCalled();
    });

    it('ô đã có lịch sử nhập–xuất (tồn đã về 0) → 409 WH_HAS_HISTORY, không xoá gì', async () => {
      movementModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });
      await expect(service.purgeBin(binId.toString())).rejects.toMatchObject({ errorCode: WAREHOUSE_ERROR_CODES.HAS_HISTORY });
      expect(movementModel.exists).toHaveBeenCalledWith({ bin_location_id: { $in: [binId] } });
      expect(session.withTransaction).not.toHaveBeenCalled();
    });
  });

  describe('purgeZone', () => {
    it('khu chưa dùng → xoá dòng gán thử, toàn bộ ô, rồi khu — cùng 1 transaction', async () => {
      const result = await service.purgeZone(zoneId.toString());
      expect(binModel.deleteMany).toHaveBeenCalledWith({ zone_id: zoneId }, { session });
      expect(zoneModel.deleteOne).toHaveBeenCalledWith({ _id: zoneId }, { session });
      expect(result).toEqual({ warehouses: 0, zones: 1, bins: 1, assignments: 3 });
    });

    it('khu rỗng (chưa có ô) → vẫn xoá được khu, không gọi xoá ô', async () => {
      binModel.find.mockReturnValue(leanList([]));
      const result = await service.purgeZone(zoneId.toString());
      expect(binModel.deleteMany).not.toHaveBeenCalled();
      expect(result.zones).toBe(1);
    });
  });

  describe('purgeRack', () => {
    const bin2 = new Types.ObjectId();

    it('kệ chưa dùng → xoá mọi ô của kệ + dòng gán thử, 1 transaction', async () => {
      binModel.find.mockReturnValue(leanList([{ _id: binId, side: 'P' }, { _id: bin2, side: 'P' }]));
      binModel.deleteMany.mockResolvedValue({ deletedCount: 2 });
      const result = await service.purgeRack(zoneId.toString(), { aisle: 'D1', side: 'P', bay: 2 });
      expect(binModel.find).toHaveBeenCalledWith({ zone_id: zoneId, aisle: 'D1', side: 'P', rack: 2 });
      expect(binModel.deleteMany).toHaveBeenCalledWith({ _id: { $in: [binId, bin2] } }, { session });
      expect(session.withTransaction).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ warehouses: 0, zones: 0, bins: 2, assignments: 3 });
    });

    it('chỉ truyền aisle → lọc cả dãy (không lọc side/rack)', async () => {
      binModel.find.mockReturnValue(leanList([{ _id: binId, side: 'T' }, { _id: bin2, side: 'P' }]));
      await service.purgeRack(zoneId.toString(), { aisle: 'D1' });
      expect(binModel.find).toHaveBeenCalledWith({ zone_id: zoneId, aisle: 'D1' });
    });

    it('1 ô trong kệ đã có lịch sử → 409 WH_HAS_HISTORY, không xoá ô nào', async () => {
      binModel.find.mockReturnValue(leanList([{ _id: binId, side: 'P' }, { _id: bin2, side: 'P' }]));
      movementModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });
      await expect(service.purgeRack(zoneId.toString(), { aisle: 'D1', side: 'P', bay: 2 })).rejects.toMatchObject({
        errorCode: WAREHOUSE_ERROR_CODES.HAS_HISTORY,
      });
      expect(binModel.deleteMany).not.toHaveBeenCalled();
    });

    it('có bay mà không có side, dãy có cả T và P → 400, không xoá', async () => {
      binModel.find.mockReturnValue(leanList([{ _id: binId, side: 'T' }, { _id: bin2, side: 'P' }]));
      await expect(service.purgeRack(zoneId.toString(), { aisle: 'D1', bay: 2 })).rejects.toMatchObject({
        errorCode: WAREHOUSE_ERROR_CODES.INVALID_RACK_LAYOUT,
      });
      expect(binModel.deleteMany).not.toHaveBeenCalled();
    });

    it('không có ô nào khớp → 404 WH_BIN_NOT_FOUND', async () => {
      binModel.find.mockReturnValue(leanList([]));
      await expect(service.purgeRack(zoneId.toString(), { aisle: 'D9' })).rejects.toMatchObject({
        errorCode: WAREHOUSE_ERROR_CODES.BIN_NOT_FOUND,
      });
    });
  });

  describe('purgeWarehouse', () => {
    it('kho chưa dùng → xoá dòng gán thử, ô, khu, kho', async () => {
      const result = await service.purgeWarehouse(whId.toString());
      expect(warehouseModel.deleteOne).toHaveBeenCalledWith({ _id: whId }, { session });
      expect(zoneModel.deleteMany).toHaveBeenCalledWith({ warehouse_id: whId }, { session });
      expect(result).toEqual({ warehouses: 1, zones: 2, bins: 1, assignments: 3 });
    });

    it('sổ cái còn dòng theo kho (kể cả của ô đã xoá trước đây) → 409 WH_HAS_HISTORY', async () => {
      movementModel.exists.mockImplementation((filter: Record<string, unknown>) =>
        Promise.resolve('warehouse_id' in filter ? { _id: 1 } : null),
      );
      await expect(service.purgeWarehouse(whId.toString())).rejects.toMatchObject({ errorCode: WAREHOUSE_ERROR_CODES.HAS_HISTORY });
      expect(warehouseModel.deleteOne).not.toHaveBeenCalled();
    });
  });

  describe('moveAssignment — sửa gán nhầm ô', () => {
    const emptySource = {
      _id: assignmentId,
      warehouse_id: whId,
      bin_location_id: binId,
      platform: 'lazada',
      shop_id: 'shop-1',
      seller_sku: 'POLO-001-DEN-M',
      master_sku: 'POLO-001-DEN-M',
      quantity_on_hand: 0,
    };

    it('ô hết hàng → chỉ đổi ô (không ghi sổ cái)', async () => {
      assignmentModel.findOne.mockResolvedValueOnce(emptySource).mockResolvedValueOnce(null);
      assignmentModel.findOneAndUpdate.mockResolvedValue({ ...emptySource, bin_location_id: destBinId });
      const moved = await service.moveAssignment(whId.toString(), assignmentId.toString(), { to_bin_location_id: destBinId.toString() }, 'admin-1');
      expect(assignmentModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: assignmentId, quantity_on_hand: 0 },
        { $set: { bin_location_id: destBinId } },
        { returnDocument: 'after' },
      );
      expect(movementModel.create).not.toHaveBeenCalled();
      expect(moved.bin_location_id).toBe(destBinId);
    });

    it('ô đích đã có sẵn dòng của đúng SKU → bỏ dòng nguồn, trả dòng đích', async () => {
      const destRow = { ...emptySource, _id: new Types.ObjectId(), bin_location_id: destBinId };
      assignmentModel.findOne.mockResolvedValueOnce(emptySource).mockResolvedValueOnce(destRow);
      const result = await service.moveAssignment(whId.toString(), assignmentId.toString(), { to_bin_location_id: destBinId.toString() }, 'admin-1');
      expect(assignmentModel.deleteOne).toHaveBeenCalledWith({ _id: assignmentId, quantity_on_hand: 0 });
      expect(result).toBe(destRow);
    });

    it('chọn đúng ô đang gán → 400 WH_SAME_BIN', async () => {
      assignmentModel.findOne.mockResolvedValueOnce(emptySource);
      await expect(
        service.moveAssignment(whId.toString(), assignmentId.toString(), { to_bin_location_id: binId.toString() }, 'admin-1'),
      ).rejects.toMatchObject({ errorCode: WAREHOUSE_ERROR_CODES.SAME_BIN });
    });

    it('ô còn hàng → chuyển toàn bộ qua transferStock rồi bỏ dòng nguồn đã về 0', async () => {
      const stocked = { ...emptySource, quantity_on_hand: 7 };
      assignmentModel.findOne.mockResolvedValue(stocked);
      const destRow = { ...stocked, _id: new Types.ObjectId(), bin_location_id: destBinId };
      const transferSpy = jest
        .spyOn(service, 'transferStock')
        .mockResolvedValue({ from: { ...stocked, quantity_on_hand: 0 } as never, to: destRow as never });
      const result = await service.moveAssignment(whId.toString(), assignmentId.toString(), { to_bin_location_id: destBinId.toString(), note: 'gán nhầm' }, 'admin-1');
      expect(transferSpy).toHaveBeenCalledWith(
        whId.toString(),
        assignmentId.toString(),
        { to_bin_location_id: destBinId.toString(), quantity: 7, force: undefined, note: 'gán nhầm' },
        'admin-1',
      );
      expect(assignmentModel.deleteOne).toHaveBeenCalledWith({ _id: assignmentId, quantity_on_hand: 0 });
      expect(result).toBe(destRow);
    });
  });
});
