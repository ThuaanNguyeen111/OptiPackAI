import { Types } from 'mongoose';
import { WarehouseService } from './warehouse.service';

//!=============================================
// K4b (27/09/2026) — nhánh SKU ĐÃ NỐI: tồn tính theo SKU nội bộ, chung mọi sàn.
// (Nhánh chưa nối = đường lùi, đã được toàn bộ test cũ bao phủ.)
//!=============================================
describe('WarehouseService — K4b tồn theo SKU nội bộ', () => {
  const warehouseId = new Types.ObjectId();
  const binId = new Types.ObjectId();
  const mapped = (rows: { seller_sku_normalized: string; master_sku: string }[]): { find: jest.Mock } => ({
    find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(rows) }) }),
  });

  it('Picking List: SKU Lazada đã nối -> lấy tồn ở dòng gộp theo SKU nội bộ, trả kèm master_sku', async () => {
    const rowFind = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([
      { _id: new Types.ObjectId(), warehouse_id: warehouseId, bin_location_id: binId, platform: 'tiki', shop_id: 't1', seller_sku: 'AO-THUN-DEN-M', master_sku: 'ATHUN-005-DEN-M', quantity_on_hand: 10 },
    ]) });
    const service = new WarehouseService(
      { findById: jest.fn().mockResolvedValue({ _id: warehouseId, is_active: true }) } as never,
      { find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: new Types.ObjectId(), zone_code: 'KA' }]) }) } as never,
      { find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: binId, bin_code: 'KA-D1-P02-T03-1', zone_id: new Types.ObjectId(), pick_sequence: 5 }]) }) } as never,
      { find: rowFind } as never, {} as never,
      { getPickableItemsForGroup: jest.fn().mockResolvedValue({ items: [{ sku: 'ATD-M-01', quantity: 1 }] }), findOrderGroupById: jest.fn().mockResolvedValue({ platform: 'lazada', shop_id: 's1' }) } as never,
      {} as never, {} as never, {} as never,
      mapped([{ seller_sku_normalized: 'ATD-M-01', master_sku: 'ATHUN-005-DEN-M' }]) as never,
    );

    const list = await service.getEnrichedPickingList(warehouseId.toString(), new Types.ObjectId().toString());

    // Đơn Lazada lấy được hàng dù dòng tồn đứng tên SKU Tiki — vì cùng 1 SKU nội bộ.
    expect(list[0]).toMatchObject({ sku: 'ATD-M-01', master_sku: 'ATHUN-005-DEN-M', bin_code: 'KA-D1-P02-T03-1' });
    expect((rowFind.mock.calls[0] as [{ $or: unknown[] }])[0].$or).toContainEqual({ master_sku: { $in: ['ATHUN-005-DEN-M'] } });
    // Có thêm nhánh fallback unpooled (master_sku null) cho SKU đã nối.
    expect((rowFind.mock.calls[0] as [{ $or: unknown[] }])[0].$or).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ platform: 'lazada', shop_id: 's1', master_sku: null }),
      ]),
    );
  });

  it('Picking List: SKU đã nối nhưng tồn còn unpooled (master_sku null) -> vẫn hiện mã kệ', async () => {
    const binId = new Types.ObjectId();
    const zoneId = new Types.ObjectId();
    const rowFind = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          warehouse_id: warehouseId,
          bin_location_id: binId,
          platform: 'lazada',
          shop_id: 's1',
          seller_sku: 'KA-D1-P03-T01-3',
          master_sku: null,
          quantity_on_hand: 10,
        },
      ]),
    });
    const service = new WarehouseService(
      { findById: jest.fn().mockResolvedValue({ _id: warehouseId, is_active: true }) } as never,
      { find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: zoneId, zone_code: 'KA' }]) }) } as never,
      {
        find: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: binId, bin_code: 'KA-D1-P03-T01-3', zone_id: zoneId, pick_sequence: 1 },
          ]),
        }),
      } as never,
      { find: rowFind } as never,
      {} as never,
      {
        getPickableItemsForGroup: jest.fn().mockResolvedValue({
          items: [{ sku: 'KA-D1-P03-T01-3', quantity: 1 }],
        }),
        findOrderGroupById: jest.fn().mockResolvedValue({ platform: 'lazada', shop_id: 's1' }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      mapped([{ seller_sku_normalized: 'KA-D1-P03-T01-3', master_sku: 'ATHUN-005-DEN-M' }]) as never,
    );

    const list = await service.getEnrichedPickingList(
      warehouseId.toString(),
      new Types.ObjectId().toString(),
    );

    expect(list[0]).toMatchObject({
      sku: 'KA-D1-P03-T01-3',
      master_sku: 'ATHUN-005-DEN-M',
      bin_code: 'KA-D1-P03-T01-3',
      bin_location_id: binId.toString(),
    });
  });

  it('Gán SKU đã nối vào ô -> tìm/tạo dòng theo SKU nội bộ, gắn nhãn master_sku', async () => {
    const assignmentModel = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue([{ _id: new Types.ObjectId() }]) };
    const session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    const service = new WarehouseService(
      { findById: jest.fn().mockResolvedValue({ _id: warehouseId, is_active: true }) } as never, {} as never,
      { findById: jest.fn().mockResolvedValue({ _id: binId, warehouse_id: warehouseId, bin_code: 'X', capacity: null }) } as never,
      assignmentModel as never, {} as never, {} as never, { startSession: jest.fn().mockResolvedValue(session) } as never, {} as never,
      { create: jest.fn() } as never,
      mapped([{ seller_sku_normalized: 'ATD-M-01', master_sku: 'ATHUN-005-DEN-M' }]) as never,
    );

    await service.assignSkuToBin(warehouseId.toString(), { platform: 'lazada', shop_id: 's1', seller_sku: 'ATD-M-01', bin_location_id: binId.toString() } as never, 'u1');

    expect(assignmentModel.findOne).toHaveBeenCalledWith({ warehouse_id: warehouseId, bin_location_id: binId, master_sku: 'ATHUN-005-DEN-M' });
    expect((assignmentModel.create.mock.calls[0] as [[Record<string, unknown>]])[0][0]).toMatchObject({ master_sku: 'ATHUN-005-DEN-M' });
  });
  //!=============================================
  // 07/10/2026 — Nhập lại hàng hoàn vào ô chưa có dòng tồn (upsert). Bộ lọc upsert phải khớp
  // chính xác: MongoDB không chép điều kiện trong $or / regex vào dòng mới tạo ra.
  //!=============================================
  describe('restockReturnedItem — bộ lọc upsert khớp chính xác', () => {
    const build = (mappingRows: { seller_sku_normalized: string; master_sku: string }[]): { service: WarehouseService; assignmentModel: { findOneAndUpdate: jest.Mock } } => {
      const assignmentModel = {
        findOneAndUpdate: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), warehouse_id: warehouseId, bin_location_id: binId, platform: 'lazada', shop_id: 's1', seller_sku: 'ATD-M-01', master_sku: null, quantity_on_hand: 1 }),
      };
      const service = new WarehouseService(
        {} as never, {} as never,
        { findById: jest.fn().mockResolvedValue({ _id: binId, warehouse_id: warehouseId, bin_code: 'KA-D1-P02-T03-1', is_active: true }) } as never,
        assignmentModel as never, {} as never, {} as never, {} as never, {} as never,
        { create: jest.fn().mockResolvedValue([{}]) } as never,
        mapped(mappingRows) as never,
      );
      return { service, assignmentModel };
    };
    const params = { warehouseId: warehouseId.toString(), binLocationId: binId.toString(), platform: 'lazada', shopId: 's1', sellerSku: 'ATD-M-01', quantity: 1, returnRequestId: 'rma-1', actorId: 'u1' } as never;

    it('SKU đã nối -> lọc { master_sku } (dòng mới mang nhãn SKU nội bộ), không có $or', async () => {
      const { service, assignmentModel } = build([{ seller_sku_normalized: 'ATD-M-01', master_sku: 'ATHUN-005-DEN-M' }]);
      await service.restockReturnedItem(params, {} as never);
      const [filter, update, options] = assignmentModel.findOneAndUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>];
      expect(filter).toEqual({ warehouse_id: warehouseId, bin_location_id: binId, master_sku: 'ATHUN-005-DEN-M' });
      expect(update.$setOnInsert).toEqual({ platform: 'lazada', shop_id: 's1', seller_sku: 'ATD-M-01' });
      expect(options).toMatchObject({ upsert: true });
    });

    it('SKU chưa nối -> lọc so sánh bằng { platform, shop_id, seller_sku, master_sku: null }, không regex', async () => {
      const { service, assignmentModel } = build([]);
      await service.restockReturnedItem(params, {} as never);
      const [filter] = assignmentModel.findOneAndUpdate.mock.calls[0] as [Record<string, unknown>];
      expect(filter).toEqual({ warehouse_id: warehouseId, bin_location_id: binId, platform: 'lazada', shop_id: 's1', seller_sku: 'ATD-M-01', master_sku: null });
    });
  });

  it('07/10/2026 — Nhập thêm hàng (restockSku) tìm dòng tồn bằng warehouse_id kiểu ObjectId', async () => {
    const assignmentId = new Types.ObjectId();
    const doc = { _id: assignmentId, warehouse_id: warehouseId, bin_location_id: binId, platform: 'lazada', shop_id: 's1', seller_sku: 'ATD-M-01', master_sku: null, quantity_on_hand: 15 };
    const assignmentModel = {
      findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(doc) }),
      findOneAndUpdate: jest.fn().mockResolvedValue(doc),
    };
    const session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    const service = new WarehouseService(
      { findById: jest.fn().mockResolvedValue({ _id: warehouseId, is_active: true }) } as never, {} as never,
      { findById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: binId, capacity: null }) }) } as never,
      assignmentModel as never, {} as never, {} as never, { startSession: jest.fn().mockResolvedValue(session) } as never, {} as never,
      { create: jest.fn().mockResolvedValue([{}]) } as never,
      mapped([]) as never,
    );

    await service.restockSku(warehouseId.toString(), assignmentId.toString(), 5, false, 'u1');

    const [lookup] = assignmentModel.findOne.mock.calls[0] as [Record<string, unknown>];
    const [filter] = assignmentModel.findOneAndUpdate.mock.calls[0] as [Record<string, unknown>];
    expect(lookup.warehouse_id).toBeInstanceOf(Types.ObjectId);
    expect(filter.warehouse_id).toBeInstanceOf(Types.ObjectId);
    expect(String(filter.warehouse_id)).toBe(warehouseId.toString());
  });
});
