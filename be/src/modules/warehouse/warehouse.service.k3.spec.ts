import { Types } from 'mongoose';
import { WarehouseService } from './warehouse.service';
import { WAREHOUSE_ERROR_CODES } from './warehouse.errors';
import { StockAdjustReason } from './schemas/inventory-movement.schema';

//!=============================================
// K3 (27/09/2026) — sổ cái, kiểm kê, chuyển ô, bỏ gán. Kiểm đúng quy tắc:
// mọi thay đổi tồn đi kèm 1 dòng sổ cái; kiểm kê chống ghi đè khi tồn vừa đổi;
// chuyển ô trừ nguồn có điều kiện đủ hàng; không bỏ gán khi còn hàng.
//!=============================================
describe('WarehouseService — K3 sổ cái', () => {
  const warehouseId = new Types.ObjectId();
  const assignmentId = new Types.ObjectId();
  const srcBin = new Types.ObjectId();
  const dstBin = new Types.ObjectId();
  const assignment = (qty: number, bin = srcBin): Record<string, unknown> => ({
    _id: assignmentId, warehouse_id: warehouseId, bin_location_id: bin, platform: 'lazada', shop_id: 's1', seller_sku: 'SKU-1', quantity_on_hand: qty,
  });

  let assignmentModel: { findOne: jest.Mock; findOneAndUpdate: jest.Mock; deleteOne: jest.Mock; aggregate: jest.Mock };
  let binModel: { findById: jest.Mock };
  let movementModel: { create: jest.Mock };
  let service: WarehouseService;

  beforeEach(() => {
    assignmentModel = { findOne: jest.fn(), findOneAndUpdate: jest.fn(), deleteOne: jest.fn(), aggregate: jest.fn().mockResolvedValue([]) };
    binModel = { findById: jest.fn() };
    movementModel = { create: jest.fn().mockResolvedValue([{}]) };
    const warehouseModel = { findById: jest.fn().mockResolvedValue({ _id: warehouseId, warehouse_code: 'WH', is_active: true }) };
    const session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    service = new WarehouseService(
      warehouseModel as never, {} as never, binModel as never, assignmentModel as never, {} as never, {} as never,
      { startSession: jest.fn().mockResolvedValue(session) } as never, {} as never, movementModel as never,
      { find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) } as never, // K4b mappingModel (chưa nối gì -> đường lùi)
    );
  });

  const movement = (i = 0): Record<string, unknown> => (movementModel.create.mock.calls[i] as [[Record<string, unknown>]])[0][0];

  describe('adjustStock (kiểm kê)', () => {
    it('đếm được 11, hệ thống ghi 12 -> set 11, sổ cái delta -1 kèm lý do', async () => {
      assignmentModel.findOne.mockResolvedValue(assignment(12));
      assignmentModel.findOneAndUpdate.mockResolvedValue(assignment(11));

      await service.adjustStock(warehouseId.toString(), assignmentId.toString(), { counted_quantity: 11, reason_code: StockAdjustReason.DAMAGED }, 'u1');

      expect((assignmentModel.findOneAndUpdate.mock.calls[0] as [Record<string, unknown>])[0]).toMatchObject({ quantity_on_hand: 12 }); // chỉ ghi nếu tồn chưa đổi
      expect(movement()).toMatchObject({ type: 'adjust', delta: -1, quantity_before: 12, quantity_after: 11, reason_code: 'damaged', actor_id: 'u1' });
    });

    it('kiểm kê khớp (chênh 0) VẪN ghi sổ — bằng chứng đã kiểm', async () => {
      assignmentModel.findOne.mockResolvedValue(assignment(5));
      assignmentModel.findOneAndUpdate.mockResolvedValue(assignment(5));
      await service.adjustStock(warehouseId.toString(), assignmentId.toString(), { counted_quantity: 5, reason_code: StockAdjustReason.COUNT_CORRECTION }, 'u1');
      expect(movement()).toMatchObject({ delta: 0 });
    });

    it('tồn vừa bị người khác đổi giữa chừng -> 409 WH_STOCK_CHANGED, không ghi sổ', async () => {
      assignmentModel.findOne.mockResolvedValue(assignment(12));
      assignmentModel.findOneAndUpdate.mockResolvedValue(null);
      await expect(service.adjustStock(warehouseId.toString(), assignmentId.toString(), { counted_quantity: 11, reason_code: StockAdjustReason.LOST }, 'u1'))
        .rejects.toMatchObject({ errorCode: WAREHOUSE_ERROR_CODES.STOCK_CHANGED });
      expect(movementModel.create).not.toHaveBeenCalled();
    });

    it('"lý do khác" không ghi chú -> 400 WH_NOTE_REQUIRED', async () => {
      await expect(service.adjustStock(warehouseId.toString(), assignmentId.toString(), { counted_quantity: 1, reason_code: StockAdjustReason.OTHER }, 'u1'))
        .rejects.toMatchObject({ errorCode: WAREHOUSE_ERROR_CODES.NOTE_REQUIRED });
    });
  });

  describe('transferStock (chuyển ô)', () => {
    beforeEach(() => {
      assignmentModel.findOne.mockResolvedValue(assignment(10));
      binModel.findById.mockResolvedValue({ _id: dstBin, warehouse_id: warehouseId, bin_code: 'KA-D1-P02-T03-2', capacity: null });
    });

    it('chuyển 4 -> nguồn trừ có điều kiện đủ hàng, đích cộng, 2 dòng sổ cái cùng mã chuyển', async () => {
      assignmentModel.findOneAndUpdate
        .mockResolvedValueOnce(assignment(6))
        .mockResolvedValueOnce(assignment(4, dstBin));

      await service.transferStock(warehouseId.toString(), assignmentId.toString(), { to_bin_location_id: dstBin.toString(), quantity: 4 }, 'u1');

      expect((assignmentModel.findOneAndUpdate.mock.calls[0] as [Record<string, unknown>])[0]).toMatchObject({ quantity_on_hand: { $gte: 4 } });
      expect(movement(0)).toMatchObject({ type: 'transfer_out', delta: -4, quantity_before: 10, quantity_after: 6, ref_type: 'transfer' });
      expect(movement(1)).toMatchObject({ type: 'transfer_in', delta: 4, quantity_before: 0, quantity_after: 4 });
      expect(movement(0).ref_id).toBe(movement(1).ref_id);
    });

    it('nguồn không đủ hàng (bị lấy mất giữa chừng) -> 409 WH_INSUFFICIENT_STOCK', async () => {
      assignmentModel.findOneAndUpdate.mockResolvedValueOnce(null);
      await expect(service.transferStock(warehouseId.toString(), assignmentId.toString(), { to_bin_location_id: dstBin.toString(), quantity: 40 }, 'u1'))
        .rejects.toMatchObject({ errorCode: WAREHOUSE_ERROR_CODES.INSUFFICIENT_STOCK });
      expect(movementModel.create).not.toHaveBeenCalled();
    });

    it('chuyển sang chính ô đang đứng -> 400 WH_SAME_BIN', async () => {
      binModel.findById.mockResolvedValue({ _id: srcBin, warehouse_id: warehouseId, bin_code: 'X' });
      await expect(service.transferStock(warehouseId.toString(), assignmentId.toString(), { to_bin_location_id: srcBin.toString(), quantity: 1 }, 'u1'))
        .rejects.toMatchObject({ errorCode: WAREHOUSE_ERROR_CODES.SAME_BIN });
    });

    it('ô đích đầy (capacity) -> 409 WH_BIN_OVER_CAPACITY; force=true thì cho', async () => {
      binModel.findById.mockResolvedValue({ _id: dstBin, warehouse_id: warehouseId, bin_code: 'D', capacity: 5 });
      assignmentModel.aggregate.mockResolvedValue([{ total: 4 }]);
      await expect(service.transferStock(warehouseId.toString(), assignmentId.toString(), { to_bin_location_id: dstBin.toString(), quantity: 3 }, 'u1'))
        .rejects.toMatchObject({ errorCode: WAREHOUSE_ERROR_CODES.BIN_OVER_CAPACITY });
    });
  });

  it('bỏ gán khi còn hàng -> 409 WH_ASSIGNMENT_HAS_STOCK, không xóa', async () => {
    assignmentModel.findOne.mockResolvedValue(assignment(3));
    await expect(service.unassign(warehouseId.toString(), assignmentId.toString())).rejects.toMatchObject({ errorCode: WAREHOUSE_ERROR_CODES.ASSIGNMENT_HAS_STOCK });
    expect(assignmentModel.deleteOne).not.toHaveBeenCalled();
  });
});
