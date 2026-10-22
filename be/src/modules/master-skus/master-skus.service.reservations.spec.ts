import { Types } from 'mongoose';
import { MasterSkusService } from './master-skus.service';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';

//!=============================================
// 21/10/2026 — mục 5: nối / bỏ nối / thay SKU nội bộ chuyển luôn giữ chỗ (K5) sang khóa
// tồn mới trong cùng transaction. Trước đây giữ chỗ nằm lại ở khóa cũ → giữ 2 lần.
//!=============================================
describe('MasterSkusService — giữ chỗ đi theo khóa tồn', () => {
  const group = new Types.ObjectId();
  const wh = new Types.ObjectId();
  let reservationModel: { find: jest.Mock; findOne: jest.Mock; updateOne: jest.Mock; deleteOne: jest.Mock };
  let totalModel: { updateOne: jest.Mock };
  let mappingModel: { findOne: jest.Mock; findById: jest.Mock; create: jest.Mock; updateMany: jest.Mock; countDocuments: jest.Mock; deleteOne: jest.Mock };
  let service: MasterSkusService;

  const resRow = (over: Record<string, unknown> = {}) => ({
    _id: 'r1', order_group_id: group, stock_key: 'S:lazada|s1|ATD-M-01', warehouse_id: wh, status: 'active',
    quantity_reserved: 2, quantity_needed: 2, quantity_picked: 0, seller_sku: 'atd-m-01', ...over,
  });

  beforeEach(() => {
    reservationModel = {
      find: jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue([resRow()]) }),
      findOne: jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(null) }),
      updateOne: jest.fn().mockResolvedValue({}),
      deleteOne: jest.fn().mockResolvedValue({}),
    };
    totalModel = { updateOne: jest.fn().mockResolvedValue({}) };
    mappingModel = {
      findOne: jest.fn().mockResolvedValue(null),
      findById: jest.fn(),
      create: jest.fn().mockResolvedValue([{}]),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      countDocuments: jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue(1) }),
      deleteOne: jest.fn().mockResolvedValue({}),
    };
    const skuModel = {
      findOne: jest.fn().mockResolvedValue({ master_sku: 'ATHUN-005-DEN-M', is_active: true }),
    };
    const productMasterModel = { findOne: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'pm' }) }) }) };
    const assignmentModel = {
      find: jest.fn().mockReturnValue({ session: jest.fn().mockResolvedValue([]) }),
      aggregate: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({}),
    };
    const session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    service = new MasterSkusService(
      {} as never, skuModel as never, mappingModel as never, productMasterModel as never, {} as never,
      { startSession: jest.fn().mockResolvedValue(session) } as never, assignmentModel as never, {} as never,
      undefined, reservationModel as never, totalModel as never,
    );
  });

  it('nối SKU sàn → giữ chỗ khóa "S:..." chuyển sang "M:<SKU nội bộ>"', async () => {
    await service.createMapping('ATHUN-005-DEN-M', { platform: MarketplacePlatform.LAZADA, shop_id: 's1', seller_sku: 'ATD-M-01' }, 'admin');
    expect(reservationModel.find).toHaveBeenCalledWith({ stock_key: 'S:lazada|s1|ATD-M-01' });
    expect(reservationModel.updateOne).toHaveBeenCalledWith(
      { _id: 'r1' },
      { $set: { stock_key: 'M:ATHUN-005-DEN-M', master_sku: 'ATHUN-005-DEN-M' } },
      expect.anything(),
    );
    expect(totalModel.updateOne).toHaveBeenCalledWith({ _id: `${wh.toString()}|M:ATHUN-005-DEN-M` }, expect.objectContaining({ $inc: { reserved: 2 } }), expect.anything());
  });

  it('bỏ nối → chỉ giữ chỗ của đúng SKU sàn đó quay về khóa SKU sàn', async () => {
    const id = new Types.ObjectId();
    mappingModel.findById.mockResolvedValue({ _id: id, platform: MarketplacePlatform.LAZADA, shop_id: 's1', seller_sku: 'ATD-M-01', seller_sku_normalized: 'ATD-M-01', master_sku: 'ATHUN-005-DEN-M' });
    reservationModel.find.mockReturnValue({
      session: jest.fn().mockResolvedValue([
        resRow({ stock_key: 'M:ATHUN-005-DEN-M' }),
        resRow({ _id: 'r2', stock_key: 'M:ATHUN-005-DEN-M', seller_sku: 'KHAC-01' }),
      ]),
    });
    await service.deleteMapping(id.toString());
    expect(reservationModel.find).toHaveBeenCalledWith({ stock_key: 'M:ATHUN-005-DEN-M', platform: MarketplacePlatform.LAZADA, shop_id: 's1' });
    expect(reservationModel.updateOne).toHaveBeenCalledTimes(1);
    expect(reservationModel.updateOne).toHaveBeenCalledWith({ _id: 'r1' }, { $set: { stock_key: 'S:lazada|s1|ATD-M-01', master_sku: null } }, expect.anything());
  });
});
