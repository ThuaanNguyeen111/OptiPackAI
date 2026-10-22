import { Types } from 'mongoose';
import { moveReservations, reservationTotalId } from './reservation-key.util';

//!=============================================
// 21/10/2026 — mục 5: nối / bỏ nối / thay SKU nội bộ thì giữ chỗ đi theo khóa tồn mới.
//!=============================================
describe('reservation-key.util', () => {
  const wh = new Types.ObjectId();
  const group = new Types.ObjectId();
  const session = {} as never;

  function models(target: Record<string, unknown> | null) {
    return {
      reservationModel: {
        findOne: jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(target) }),
        updateOne: jest.fn().mockResolvedValue({}),
        deleteOne: jest.fn().mockResolvedValue({}),
      },
      totalModel: { updateOne: jest.fn().mockResolvedValue({}) },
    };
  }
  const row = (overrides: Record<string, unknown> = {}) => ({
    _id: 'r1', order_group_id: group, stock_key: 'S:lazada|s1|A-1', warehouse_id: wh,
    status: 'active', quantity_reserved: 2, quantity_needed: 2, quantity_picked: 0, seller_sku: 'A-1', ...overrides,
  });

  it('id tổng: có kho → "<kho>|<khóa>", giữ chỗ cũ → chính khóa', () => {
    expect(reservationTotalId('M:X', wh)).toBe(`${wh.toString()}|M:X`);
    expect(reservationTotalId('M:X', null)).toBe('M:X');
  });

  it('nối SKU: chuyển dòng giữ chỗ sang khóa SKU nội bộ, dời phần đang giữ giữa 2 tổng', async () => {
    const m = models(null);
    const moved = await moveReservations(m as never, [row()] as never, 'M:GUOC-005-DEN-37', 'GUOC-005-DEN-37', session);
    expect(moved).toBe(1);
    expect(m.totalModel.updateOne).toHaveBeenCalledWith({ _id: `${wh.toString()}|S:lazada|s1|A-1` }, expect.objectContaining({ $inc: { reserved: -2 } }), { session });
    expect(m.totalModel.updateOne).toHaveBeenCalledWith(
      { _id: `${wh.toString()}|M:GUOC-005-DEN-37` },
      expect.objectContaining({ $inc: { reserved: 2 } }),
      { upsert: true, session },
    );
    expect(m.reservationModel.updateOne).toHaveBeenCalledWith({ _id: 'r1' }, { $set: { stock_key: 'M:GUOC-005-DEN-37', master_sku: 'GUOC-005-DEN-37' } }, { session });
  });

  it('nhóm đơn đã có giữ chỗ ở khóa mới → gộp số lượng, xóa dòng cũ', async () => {
    const m = models({ _id: 't1', status: 'active', warehouse_id: wh });
    await moveReservations(m as never, [row({ quantity_needed: 1, quantity_reserved: 1, quantity_picked: 1 })] as never, 'M:X', 'X', session);
    expect(m.reservationModel.updateOne).toHaveBeenCalledWith(
      { _id: 't1' },
      { $inc: { quantity_needed: 1, quantity_picked: 1, quantity_reserved: 1 }, $set: { master_sku: 'X', status: 'active' } },
      { session },
    );
    expect(m.reservationModel.deleteOne).toHaveBeenCalledWith({ _id: 'r1' }, { session });
  });

  it('giữ chỗ đã nhả → chỉ đổi khóa, không đụng tổng', async () => {
    const m = models(null);
    await moveReservations(m as never, [row({ status: 'released', quantity_reserved: 0 })] as never, 'M:X', 'X', session);
    expect(m.totalModel.updateOne).not.toHaveBeenCalled();
  });

  it('dòng đã ở đúng khóa → bỏ qua', async () => {
    const m = models(null);
    await expect(moveReservations(m as never, [row({ stock_key: 'M:X' })] as never, 'M:X', 'X', session)).resolves.toBe(0);
  });
});
