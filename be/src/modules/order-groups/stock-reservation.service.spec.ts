import { Types } from 'mongoose';
import { StockReservationService } from './stock-reservation.service';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';

//!=============================================
// K5 (27/09/2026) — chống bán lố. Kịch bản chính: kệ còn ĐÚNG 1 cái, 2 nhóm
// đơn cùng cần -> nhóm 1 giữ được, nhóm 2 bị gắn cờ thiếu hàng NGAY TỪ ĐẦU.
//!=============================================
describe('StockReservationService — K5', () => {
  const g1 = { _id: new Types.ObjectId(), platform: MarketplacePlatform.LAZADA, shop_id: 's1' };
  let totalModel: { findOneAndUpdate: jest.Mock; updateOne: jest.Mock; findById: jest.Mock };
  let reservationModel: { findOne: jest.Mock; updateOne: jest.Mock; find: jest.Mock; findOneAndUpdate: jest.Mock };
  let groupModel: { updateOne: jest.Mock };
  let assignmentModel: { aggregate: jest.Mock };
  let mappingModel: { find: jest.Mock };
  let service: StockReservationService;

  const agg = (total: number): Promise<{ total: number }[]> & { session: jest.Mock } =>
    Object.assign(Promise.resolve([{ total }]), { session: jest.fn() });
  const existing = (doc: Record<string, unknown> | null): { session: jest.Mock } => ({ session: jest.fn().mockResolvedValue(doc) });

  beforeEach(() => {
    totalModel = { findOneAndUpdate: jest.fn(), updateOne: jest.fn().mockResolvedValue({}), findById: jest.fn() };
    reservationModel = { findOne: jest.fn().mockReturnValue(existing(null)), updateOne: jest.fn().mockResolvedValue({}), find: jest.fn(), findOneAndUpdate: jest.fn() };
    groupModel = { updateOne: jest.fn().mockResolvedValue({}) };
    assignmentModel = { aggregate: jest.fn() };
    mappingModel = { find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) };
    const session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    service = new StockReservationService(reservationModel as never, totalModel as never, groupModel as never, assignmentModel as never, mappingModel as never, { startSession: jest.fn().mockResolvedValue(session) } as never);
  });

  it('nhóm đơn 1: kệ còn 1, chưa ai giữ -> giữ được 1, KHÔNG thiếu hàng', async () => {
    totalModel.findOneAndUpdate.mockResolvedValue({ reserved: 0 });
    assignmentModel.aggregate.mockReturnValue(agg(1));

    const shortages = await service.reconcile(g1, [{ sku: 'ATD-M-01', quantity: 1 }]);

    expect(shortages).toEqual([]);
    expect(totalModel.updateOne).toHaveBeenCalledWith({ _id: 'S:lazada|s1|ATD-M-01' }, { $inc: { reserved: 1 } }, expect.anything());
    expect(groupModel.updateOne).toHaveBeenCalledWith({ _id: g1._id }, { $set: { stock_shortage: false, stock_shortage_items: [] } });
  });

  it('nhóm đơn 2: kệ còn 1 nhưng nhóm 1 đã giữ 1 -> giữ 0, GẮN CỜ THIẾU HÀNG ngay từ đầu', async () => {
    const g2 = { ...g1, _id: new Types.ObjectId() };
    totalModel.findOneAndUpdate.mockResolvedValue({ reserved: 1 });
    assignmentModel.aggregate.mockReturnValue(agg(1));

    const shortages = await service.reconcile(g2, [{ sku: 'ATD-M-01', quantity: 1 }]);

    expect(shortages).toEqual([{ sku: 'ATD-M-01', needed: 1, reserved: 0, shortage: 1 }]);
    expect(groupModel.updateOne).toHaveBeenCalledWith({ _id: g2._id }, { $set: { stock_shortage: true, stock_shortage_items: shortages } });
  });

  it('tính lại cho CHÍNH nhóm đã giữ (VD đơn gộp đến muộn) -> phần của mình không bị tính là "người khác giữ"', async () => {
    totalModel.findOneAndUpdate.mockResolvedValue({ reserved: 1 });
    assignmentModel.aggregate.mockReturnValue(agg(1));
    reservationModel.findOne.mockReturnValue(existing({ status: 'active', quantity_reserved: 1, quantity_picked: 0 }));

    const shortages = await service.reconcile(g1, [{ sku: 'ATD-M-01', quantity: 1 }]);

    expect(shortages).toEqual([]);
    expect(totalModel.updateOne).toHaveBeenCalledWith(expect.anything(), { $inc: { reserved: 0 } }, expect.anything());
  });

  it('SKU đã nối (K4b) -> khóa tồn theo SKU nội bộ "M:..." (giữ chỗ chung mọi sàn)', async () => {
    mappingModel.find.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ seller_sku_normalized: 'ATD-M-01', master_sku: 'ATHUN-005-DEN-M' }]) }) });
    totalModel.findOneAndUpdate.mockResolvedValue({ reserved: 0 });
    assignmentModel.aggregate.mockReturnValue(agg(5));

    await service.reconcile(g1, [{ sku: 'ATD-M-01', quantity: 2 }]);

    expect((totalModel.findOneAndUpdate.mock.calls[0] as [unknown])[0]).toEqual({ _id: 'M:ATHUN-005-DEN-M' });
  });

  it('quét hàng tiêu phần đã giữ + giảm tổng đã giữ', async () => {
    reservationModel.findOne.mockReturnValue(existing({ _id: 'r1', quantity_reserved: 2 }));
    await service.consume(g1._id.toString(), 'S:lazada|s1|ATD-M-01', 1, {} as never);
    expect(reservationModel.updateOne).toHaveBeenCalledWith({ _id: 'r1' }, { $inc: { quantity_reserved: -1, quantity_picked: 1 } }, expect.anything());
    expect(totalModel.updateOne).toHaveBeenCalledWith({ _id: 'S:lazada|s1|ATD-M-01' }, { $inc: { reserved: -1 } }, expect.anything());
  });

  it('nhả giữ chỗ: trả phần còn giữ về tồn khả dụng, xóa cờ thiếu hàng', async () => {
    reservationModel.find.mockResolvedValue([{ _id: 'r1' }]);
    reservationModel.findOneAndUpdate.mockResolvedValue({ stock_key: 'S:lazada|s1|ATD-M-01', quantity_reserved: 3 });

    await expect(service.releaseGroup(g1._id.toString())).resolves.toBe(3);
    expect(totalModel.updateOne).toHaveBeenCalledWith({ _id: 'S:lazada|s1|ATD-M-01' }, { $inc: { reserved: -3 } }, expect.anything());
  });

  it('tồn khả dụng = tồn thực − đã giữ', async () => {
    assignmentModel.aggregate.mockReturnValue(agg(10));
    totalModel.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({ reserved: 4 }) });
    await expect(service.availability(MarketplacePlatform.LAZADA, 's1', 'ATD-M-01')).resolves.toMatchObject({ onHand: 10, reserved: 4, available: 6 });
  });
});
