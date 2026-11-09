import { Types } from 'mongoose';
import { WarehouseService } from './warehouse.service';
import { WAREHOUSE_ERROR_CODES } from './warehouse.errors';
import { StockAdjustReason } from './schemas/inventory-movement.schema';

//!=============================================
// 08/11/2026 — chống ghi trùng cho thao tác kho từ app mobile (hàng đợi ngoại tuyến gửi lại).
// Cùng client_event_id → trả kết quả cũ, không cộng/trừ tồn và không ghi sổ cái lần 2.
// Cùng mã nhưng khác thao tác → 409 WH_CLIENT_EVENT_REUSED.
//!=============================================
describe('WarehouseService — client_event_id (kiểm kê, chuyển ô, nhập thêm)', () => {
  const warehouseId = new Types.ObjectId();
  const assignmentId = new Types.ObjectId();
  const destAssignmentId = new Types.ObjectId();
  const srcBin = new Types.ObjectId();
  const dstBin = new Types.ObjectId();
  const assignment = (qty: number, id = assignmentId, bin = srcBin): Record<string, unknown> => ({
    _id: id, warehouse_id: warehouseId, bin_location_id: bin, platform: 'lazada', shop_id: 's1', seller_sku: 'SKU-1', quantity_on_hand: qty,
  });

  let assignmentModel: { findOne: jest.Mock; findOneAndUpdate: jest.Mock; aggregate: jest.Mock };
  let binModel: { findById: jest.Mock };
  let movementModel: { create: jest.Mock; findOne: jest.Mock };
  let service: WarehouseService;

  beforeEach(() => {
    assignmentModel = { findOne: jest.fn(), findOneAndUpdate: jest.fn(), aggregate: jest.fn().mockResolvedValue([]) };
    binModel = { findById: jest.fn() };
    movementModel = { create: jest.fn().mockResolvedValue([{}]), findOne: jest.fn().mockResolvedValue(null) };
    const warehouseModel = { findById: jest.fn().mockResolvedValue({ _id: warehouseId, warehouse_code: 'WH', is_active: true }) };
    const session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    service = new WarehouseService(
      warehouseModel as never, {} as never, binModel as never, assignmentModel as never, {} as never, {} as never,
      { startSession: jest.fn().mockResolvedValue(session) } as never, {} as never, movementModel as never,
      { find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) } as never,
    );
  });

  const created = (i = 0): Record<string, unknown> => (movementModel.create.mock.calls[i] as [[Record<string, unknown>]])[0][0];

  it('kiểm kê có mã → dòng sổ cái lưu client_event_id', async () => {
    assignmentModel.findOne.mockResolvedValue(assignment(5));
    assignmentModel.findOneAndUpdate.mockResolvedValue(assignment(5));
    await service.adjustStock(warehouseId.toString(), assignmentId.toString(), { counted_quantity: 5, reason_code: StockAdjustReason.COUNT_CORRECTION, client_event_id: 'evt-1' }, 'u1');
    expect(created()).toMatchObject({ type: 'adjust', client_event_id: 'evt-1' });
  });

  it('kiểm kê không gửi mã → không tra sổ cái, client_event_id = null (giữ hành vi cũ)', async () => {
    assignmentModel.findOne.mockResolvedValue(assignment(5));
    assignmentModel.findOneAndUpdate.mockResolvedValue(assignment(5));
    await service.adjustStock(warehouseId.toString(), assignmentId.toString(), { counted_quantity: 5, reason_code: StockAdjustReason.COUNT_CORRECTION }, 'u1');
    expect(movementModel.findOne).not.toHaveBeenCalled();
    expect(created()).toMatchObject({ client_event_id: null });
  });

  it('kiểm kê gửi lại cùng mã → trả dòng tồn hiện tại, không ghi thêm', async () => {
    movementModel.findOne.mockResolvedValue({ type: 'adjust', assignment_id: assignmentId });
    assignmentModel.findOne.mockResolvedValue(assignment(11));
    const result = await service.adjustStock(warehouseId.toString(), assignmentId.toString(), { counted_quantity: 11, reason_code: StockAdjustReason.LOST, client_event_id: 'evt-1' }, 'u1');
    expect(result).toMatchObject({ quantity_on_hand: 11 });
    expect(assignmentModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(movementModel.create).not.toHaveBeenCalled();
  });

  it('chuyển ô gửi lại cùng mã → trả nguồn + đích của lần đã chuyển, không chuyển lần 2', async () => {
    movementModel.findOne
      .mockResolvedValueOnce({ type: 'transfer_out', assignment_id: assignmentId, ref_id: 't-1' })
      .mockResolvedValueOnce({ type: 'transfer_in', assignment_id: destAssignmentId, ref_id: 't-1' });
    assignmentModel.findOne
      .mockResolvedValueOnce(assignment(6))
      .mockResolvedValueOnce(assignment(4, destAssignmentId, dstBin));
    const { from, to } = await service.transferStock(warehouseId.toString(), assignmentId.toString(), { to_bin_location_id: dstBin.toString(), quantity: 4, client_event_id: 'evt-2' }, 'u1');
    expect(from).toMatchObject({ quantity_on_hand: 6 });
    expect(to).toMatchObject({ _id: destAssignmentId, quantity_on_hand: 4 });
    expect(assignmentModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(movementModel.create).not.toHaveBeenCalled();
  });

  it('chuyển ô có mã → chỉ dòng transfer_out mang mã', async () => {
    assignmentModel.findOne.mockResolvedValue(assignment(10));
    binModel.findById.mockResolvedValue({ _id: dstBin, warehouse_id: warehouseId, bin_code: 'D', capacity: null });
    assignmentModel.findOneAndUpdate
      .mockResolvedValueOnce(assignment(6))
      .mockResolvedValueOnce(assignment(4, destAssignmentId, dstBin));
    await service.transferStock(warehouseId.toString(), assignmentId.toString(), { to_bin_location_id: dstBin.toString(), quantity: 4, client_event_id: 'evt-3' }, 'u1');
    expect(created(0)).toMatchObject({ type: 'transfer_out', client_event_id: 'evt-3' });
    expect(created(1)).toMatchObject({ type: 'transfer_in', client_event_id: null });
  });

  it('cùng mã đã dùng cho thao tác khác → 409 WH_CLIENT_EVENT_REUSED', async () => {
    movementModel.findOne.mockResolvedValue({ type: 'receive', assignment_id: assignmentId });
    await expect(service.adjustStock(warehouseId.toString(), assignmentId.toString(), { counted_quantity: 1, reason_code: StockAdjustReason.LOST, client_event_id: 'evt-1' }, 'u1'))
      .rejects.toMatchObject({ errorCode: WAREHOUSE_ERROR_CODES.CLIENT_EVENT_REUSED });
  });

  it('nhập thêm gửi lại cùng mã → không cộng tồn lần 2', async () => {
    movementModel.findOne.mockResolvedValue({ type: 'receive', assignment_id: assignmentId });
    assignmentModel.findOne.mockResolvedValue(assignment(60));
    const doc = await service.restockSku(warehouseId.toString(), assignmentId.toString(), 50, false, 'u1', { clientEventId: 'evt-4' });
    expect(doc).toMatchObject({ quantity_on_hand: 60 });
    expect(assignmentModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('2 lần gửi cùng mã chạy song song: lần sau đụng unique index → trả kết quả lần trước', async () => {
    movementModel.findOne
      .mockResolvedValueOnce(null) // kiểm tra trước: chưa có
      .mockResolvedValueOnce({ type: 'adjust', assignment_id: assignmentId }); // sau lỗi trùng khoá
    movementModel.create.mockRejectedValue(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
    assignmentModel.findOne.mockResolvedValue(assignment(5));
    assignmentModel.findOneAndUpdate.mockResolvedValue(assignment(5));
    const result = await service.adjustStock(warehouseId.toString(), assignmentId.toString(), { counted_quantity: 5, reason_code: StockAdjustReason.COUNT_CORRECTION, client_event_id: 'evt-5' }, 'u1');
    expect(result).toMatchObject({ quantity_on_hand: 5 });
  });
});
