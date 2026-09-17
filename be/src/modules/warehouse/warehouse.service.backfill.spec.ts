import { Types } from 'mongoose';
import { WarehouseService } from './warehouse.service';

//!=============================================
// Backfill warehouse_id trên bin_locations (AOFP, 2026-09-18):
// kệ sinh trước bản vá $setOnInsert.warehouse_id có thể thiếu field.
// Test 3 nhánh: gắn lại từ zone, bỏ qua khi mất zone, dọn bản trùng
// (SKU trỏ kệ mồ côi → bản đủ field, rồi xóa bản thiếu).
//!=============================================

describe('WarehouseService — backfillMissingBinWarehouseIds', () => {
  const warehouseId = new Types.ObjectId();
  const zoneId = new Types.ObjectId();
  const orphanId = new Types.ObjectId();
  const completeId = new Types.ObjectId();
  const secondOrphanId = new Types.ObjectId();

  let binModel: {
    find: jest.Mock;
    bulkWrite: jest.Mock;
    deleteMany: jest.Mock;
  };
  let zoneModel: { find: jest.Mock };
  let assignmentModel: { bulkWrite: jest.Mock };
  let service: WarehouseService;

  function chainLean(rows: unknown[]): { select: jest.Mock } {
    const lean = jest.fn().mockResolvedValue(rows);
    return { select: jest.fn().mockReturnValue({ lean }) };
  }

  beforeEach(() => {
    binModel = {
      find: jest.fn(),
      bulkWrite: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    zoneModel = { find: jest.fn() };
    assignmentModel = {
      bulkWrite: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    service = new WarehouseService(
      {} as never,
      zoneModel as never,
      binModel as never,
      assignmentModel as never,
      {} as never,
      {} as never,
    );
  });

  it('không có kệ thiếu warehouse_id → không query zone, không ghi', async () => {
    binModel.find.mockReturnValue(chainLean([]));

    const result = await service.backfillMissingBinWarehouseIds();

    expect(result).toEqual({
      scanned: 0,
      attached: 0,
      retargeted: 0,
      deleted: 0,
      skipped: 0,
    });
    expect(zoneModel.find).not.toHaveBeenCalled();
    expect(binModel.bulkWrite).not.toHaveBeenCalled();
    expect(assignmentModel.bulkWrite).not.toHaveBeenCalled();
    expect(binModel.deleteMany).not.toHaveBeenCalled();
  });

  it('kệ thiếu warehouse_id còn zone → gắn warehouse_id của khu đó', async () => {
    binModel.find.mockImplementation((filter: Record<string, unknown>) => {
      if ('$or' in filter) {
        return chainLean([
          { _id: orphanId, zone_id: zoneId, bin_code: 'A-03-01-01' },
        ]);
      }
      return chainLean([]);
    });
    zoneModel.find.mockReturnValue(
      chainLean([{ _id: zoneId, warehouse_id: warehouseId }]),
    );

    const result = await service.backfillMissingBinWarehouseIds();

    expect(result).toEqual({
      scanned: 1,
      attached: 1,
      retargeted: 0,
      deleted: 0,
      skipped: 0,
    });
    expect(binModel.bulkWrite).toHaveBeenCalledTimes(1);
    expect(binModel.bulkWrite).toHaveBeenCalledWith([
      {
        updateOne: {
          filter: { _id: orphanId },
          update: { $set: { warehouse_id: warehouseId } },
        },
      },
    ]);
    expect(assignmentModel.bulkWrite).not.toHaveBeenCalled();
    expect(binModel.deleteMany).not.toHaveBeenCalled();
  });

  it('kệ thiếu warehouse_id mà zone đã mất → skipped, không gắn mù', async () => {
    binModel.find.mockReturnValue(
      chainLean([{ _id: orphanId, zone_id: zoneId, bin_code: 'A-03-01-01' }]),
    );
    zoneModel.find.mockReturnValue(chainLean([]));

    const result = await service.backfillMissingBinWarehouseIds();

    expect(result.scanned).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.attached).toBe(0);
    expect(binModel.bulkWrite).not.toHaveBeenCalled();
    expect(binModel.deleteMany).not.toHaveBeenCalled();
  });

  it('đã có kệ đủ field cùng mã → chuyển SKU sang bản đủ rồi xóa kệ mồ côi', async () => {
    binModel.find.mockImplementation((filter: Record<string, unknown>) => {
      if ('$or' in filter) {
        return chainLean([
          { _id: orphanId, zone_id: zoneId, bin_code: 'A-03-01-01' },
        ]);
      }
      return chainLean([
        {
          _id: completeId,
          warehouse_id: warehouseId,
          bin_code: 'A-03-01-01',
        },
      ]);
    });
    zoneModel.find.mockReturnValue(
      chainLean([{ _id: zoneId, warehouse_id: warehouseId }]),
    );

    const result = await service.backfillMissingBinWarehouseIds();

    expect(result).toEqual({
      scanned: 1,
      attached: 0,
      retargeted: 1,
      deleted: 1,
      skipped: 0,
    });
    expect(binModel.bulkWrite).not.toHaveBeenCalled();
    expect(assignmentModel.bulkWrite).toHaveBeenCalledTimes(1);
    expect(assignmentModel.bulkWrite).toHaveBeenCalledWith([
      {
        updateMany: {
          filter: { bin_location_id: orphanId },
          update: { $set: { bin_location_id: completeId } },
        },
      },
    ]);
    expect(binModel.deleteMany).toHaveBeenCalledWith({
      _id: { $in: [orphanId] },
    });
  });

  it('hai kệ mồ côi cùng mã, chưa có bản đủ → giữ 1 bản gắn warehouse_id, xóa bản kia', async () => {
    binModel.find.mockImplementation((filter: Record<string, unknown>) => {
      if ('$or' in filter) {
        return chainLean([
          { _id: orphanId, zone_id: zoneId, bin_code: 'A-03-01-01' },
          { _id: secondOrphanId, zone_id: zoneId, bin_code: 'A-03-01-01' },
        ]);
      }
      return chainLean([]);
    });
    zoneModel.find.mockReturnValue(
      chainLean([{ _id: zoneId, warehouse_id: warehouseId }]),
    );

    const result = await service.backfillMissingBinWarehouseIds();

    expect(result).toEqual({
      scanned: 2,
      attached: 1,
      retargeted: 1,
      deleted: 1,
      skipped: 0,
    });
    expect(binModel.deleteMany).toHaveBeenCalledWith({
      _id: { $in: [secondOrphanId] },
    });
  });
});
