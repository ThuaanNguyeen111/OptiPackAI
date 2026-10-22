import { Types } from 'mongoose';
import { StockReservationService } from './stock-reservation.service';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';

//!=============================================
// 21/10/2026 — giữ chỗ THEO KHO (mục 8): tồn và tổng đang giữ tính trong kho của
// nhóm đơn, không cộng mọi kho; khóa tồn gom theo SKU nội bộ; nhả khóa đã rời nhóm.
//!=============================================
describe('StockReservationService — giữ chỗ theo kho', () => {
  const whA = new Types.ObjectId();
  const whB = new Types.ObjectId();
  const g1 = { _id: new Types.ObjectId(), platform: MarketplacePlatform.LAZADA, shop_id: 's1' };
  const chain = (value: unknown): { select: () => { lean: () => Promise<unknown> }; lean: () => Promise<unknown>; sort: () => unknown } => {
    const self = { select: () => self, sort: () => self, lean: () => Promise.resolve(value) };
    return self;
  };
  const existing = (doc: Record<string, unknown> | null): { session: jest.Mock } => ({ session: jest.fn().mockResolvedValue(doc) });

  function build(options: {
    groupWarehouse?: Types.ObjectId | null;
    warehouses?: { _id: Types.ObjectId; warehouse_code: string }[];
    stockByWarehouse?: Map<string, number>;
    existing?: Record<string, unknown> | null;
    activeRows?: { _id: string; stock_key: string }[];
    masters?: { seller_sku_normalized: string; master_sku: string }[];
  }) {
    let groupWarehouse = options.groupWarehouse ?? null;
    const totalModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue({ reserved: 0 }),
      updateOne: jest.fn().mockResolvedValue({}),
      findById: jest.fn().mockReturnValue(chain(null)),
      find: jest.fn(),
    };
    const reservationModel = {
      findOne: jest.fn().mockReturnValue(existing(options.existing ?? null)),
      updateOne: jest.fn().mockResolvedValue({}),
      find: jest.fn().mockReturnValue(chain(options.activeRows ?? [])),
      findOneAndUpdate: jest.fn().mockResolvedValue({ stock_key: 'S:lazada|s1|OLD', warehouse_id: whA, quantity_reserved: 2 }),
    };
    const groupModel = {
      updateOne: jest.fn((_filter: unknown, update: { $set: { warehouse_id: Types.ObjectId } }) => {
        groupWarehouse = update.$set.warehouse_id;
        return Promise.resolve({});
      }),
      findOneAndUpdate: jest.fn().mockResolvedValue({ stock_shortage: false }),
      findById: jest.fn(() => chain({ warehouse_id: groupWarehouse })),
    };
    const assignmentModel = {
      aggregate: jest.fn((pipeline: { $match: { warehouse_id?: Types.ObjectId } }[]) => {
        const wid = pipeline[0]?.$match.warehouse_id?.toString() ?? 'all';
        const total = options.stockByWarehouse?.get(wid) ?? 0;
        return Object.assign(Promise.resolve([{ total }]), { session: jest.fn() });
      }),
    };
    const mappingModel = { find: jest.fn().mockReturnValue(chain(options.masters ?? [])) };
    const warehouseModel = { find: jest.fn().mockReturnValue(chain(options.warehouses ?? [{ _id: whA, warehouse_code: 'WH-A' }])) };
    const session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    const service = new StockReservationService(
      reservationModel as never, totalModel as never, groupModel as never, assignmentModel as never, mappingModel as never,
      { startSession: jest.fn().mockResolvedValue(session) } as never, { notify: jest.fn().mockResolvedValue({}) } as never,
      warehouseModel as never,
    );
    return { service, totalModel, reservationModel, groupModel, assignmentModel };
  }

  it('1 kho: nhóm đơn gắn kho đó, tổng giữ chỗ theo "<kho>|<khóa>", tồn chỉ đếm trong kho', async () => {
    const { service, totalModel, groupModel, assignmentModel, reservationModel } = build({ stockByWarehouse: new Map([[whA.toString(), 3]]) });

    const shortages = await service.reconcile(g1, [{ sku: 'ATD-M-01', quantity: 2 }]);

    expect(shortages).toEqual([]);
    expect(groupModel.updateOne).toHaveBeenCalledWith({ _id: g1._id, warehouse_id: { $in: [null] } }, { $set: { warehouse_id: whA } });
    const totalId = `${whA.toString()}|S:lazada|s1|ATD-M-01`;
    expect((totalModel.findOneAndUpdate.mock.calls[0] as [unknown])[0]).toEqual({ _id: totalId });
    expect(totalModel.updateOne).toHaveBeenCalledWith({ _id: totalId }, { $inc: { reserved: 2 } }, expect.anything());
    const match = (assignmentModel.aggregate.mock.calls[0] as [{ $match: Record<string, unknown> }[]])[0][0]?.$match;
    expect(match?.warehouse_id).toEqual(whA);
    const [, update] = reservationModel.updateOne.mock.calls[0] as [unknown, { $set: Record<string, unknown> }];
    expect(update.$set.warehouse_id).toEqual(whA);
  });

  it('nhiều kho: chọn kho giữ được nhiều hàng nhất (không cộng tồn 2 kho lại)', async () => {
    // Kho A còn 1, kho B còn 3, đơn cần 3 → chọn B; trước đây cộng 4 rồi quét ở A bị 409.
    const { service, groupModel } = build({
      warehouses: [{ _id: whA, warehouse_code: 'WH-A' }, { _id: whB, warehouse_code: 'WH-B' }],
      stockByWarehouse: new Map([[whA.toString(), 1], [whB.toString(), 3]]),
    });
    const shortages = await service.reconcile(g1, [{ sku: 'ATD-M-01', quantity: 3 }]);
    expect(shortages).toEqual([]);
    expect(groupModel.updateOne).toHaveBeenCalledWith(expect.anything(), { $set: { warehouse_id: whB } });
  });

  it('kho đã gắn chỉ còn 1 mà cần 3 → thiếu hàng, dù kho khác còn nhiều', async () => {
    const { service } = build({
      groupWarehouse: whA,
      warehouses: [{ _id: whA, warehouse_code: 'WH-A' }, { _id: whB, warehouse_code: 'WH-B' }],
      stockByWarehouse: new Map([[whA.toString(), 1], [whB.toString(), 9]]),
    });
    const shortages = await service.reconcile(g1, [{ sku: 'ATD-M-01', quantity: 3 }]);
    expect(shortages).toEqual([{ sku: 'ATD-M-01', needed: 3, reserved: 1, shortage: 2 }]);
  });

  it('giữ chỗ cũ (chưa có kho) → trả phần đang giữ về tổng cũ rồi giữ lại ở kho của nhóm', async () => {
    const { service, totalModel } = build({
      groupWarehouse: whA,
      stockByWarehouse: new Map([[whA.toString(), 5]]),
      existing: { stock_key: 'S:lazada|s1|ATD-M-01', warehouse_id: null, status: 'active', quantity_reserved: 2, quantity_picked: 0 },
    });
    await service.reconcile(g1, [{ sku: 'ATD-M-01', quantity: 2 }]);
    expect(totalModel.updateOne).toHaveBeenCalledWith({ _id: 'S:lazada|s1|ATD-M-01' }, expect.objectContaining({ $inc: { reserved: -2 } }), expect.anything());
    expect(totalModel.updateOne).toHaveBeenCalledWith({ _id: `${whA.toString()}|S:lazada|s1|ATD-M-01` }, { $inc: { reserved: 2 } }, expect.anything());
  });

  it('2 SKU sàn cùng nối 1 SKU nội bộ → gom thành 1 dòng giữ chỗ với tổng số lượng', async () => {
    const { service, totalModel, reservationModel } = build({
      groupWarehouse: whA,
      stockByWarehouse: new Map([[whA.toString(), 10]]),
      masters: [
        { seller_sku_normalized: 'A-1', master_sku: 'GUOC-005-DEN-37' },
        { seller_sku_normalized: 'A-2', master_sku: 'GUOC-005-DEN-37' },
      ],
    });
    await service.reconcile(g1, [{ sku: 'A-1', quantity: 1 }, { sku: 'A-2', quantity: 2 }]);
    expect(totalModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [, update] = reservationModel.updateOne.mock.calls[0] as [unknown, { $set: Record<string, unknown> }];
    expect(update.$set.quantity_needed).toBe(3);
  });

  it('khóa không còn trong nhóm (đơn hủy một phần) → nhả phần đang giữ', async () => {
    const { service, reservationModel, totalModel } = build({
      groupWarehouse: whA,
      stockByWarehouse: new Map([[whA.toString(), 5]]),
      activeRows: [{ _id: 'r-old', stock_key: 'S:lazada|s1|OLD' }],
    });
    await service.reconcile(g1, [{ sku: 'ATD-M-01', quantity: 1 }]);
    expect(reservationModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'r-old', status: 'active' },
      { $set: { status: 'released', quantity_reserved: 0, quantity_needed: 0 } },
      expect.anything(),
    );
    expect(totalModel.updateOne).toHaveBeenCalledWith({ _id: `${whA.toString()}|S:lazada|s1|OLD` }, { $inc: { reserved: -2 } }, expect.anything());
  });
});
