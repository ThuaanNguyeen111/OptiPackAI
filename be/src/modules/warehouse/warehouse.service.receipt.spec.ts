import { Types } from 'mongoose';
import { WarehouseService } from './warehouse.service';
import { WAREHOUSE_ERROR_CODES } from './warehouse.errors';

//!=============================================
// 15/10/2026 — phiếu nhập theo lô (nhiều SKU, cùng mã lô + ngày nhập).
//!=============================================
describe('WarehouseService — phiếu nhập theo lô', () => {
  const warehouseId = new Types.ObjectId();
  const binId = new Types.ObjectId();
  const actor = new Types.ObjectId().toString();

  function makeAssignment(sku: string, qty: number): Record<string, unknown> {
    return {
      _id: new Types.ObjectId(),
      warehouse_id: warehouseId,
      bin_location_id: binId,
      platform: 'lazada',
      shop_id: 'shop-1',
      seller_sku: sku,
      master_sku: null,
      quantity_on_hand: qty,
    };
  }

  let rows: Record<string, unknown>[];
  let assignmentModel: { findOne: jest.Mock; findOneAndUpdate: jest.Mock };
  let movementModel: { create: jest.Mock };
  let lotModel: { create: jest.Mock; aggregate: jest.Mock };
  let receiptModel: { create: jest.Mock };
  let binModel: { find: jest.Mock };
  let service: WarehouseService;

  beforeEach(() => {
    rows = [makeAssignment('AO-1', 0), makeAssignment('QUAN-2', 4)];
    assignmentModel = {
      findOne: jest.fn((f: { _id: Types.ObjectId }) => Promise.resolve(rows.find((r) => String(r._id) === String(f._id)) ?? null)),
      findOneAndUpdate: jest.fn((f: { _id: Types.ObjectId }, u: { $inc: { quantity_on_hand: number } }) => {
        const row = rows.find((r) => String(r._id) === String(f._id));
        if (!row) return Promise.resolve(null);
        row.quantity_on_hand = (row.quantity_on_hand as number) + u.$inc.quantity_on_hand;
        return Promise.resolve({ ...row });
      }),
    };
    movementModel = { create: jest.fn().mockResolvedValue([{}]) };
    const aggregateResult = Object.assign(Promise.resolve([{ total: 4 }]), { session: () => Promise.resolve([{ total: 4 }]) });
    lotModel = {
      create: jest.fn((docs: Record<string, unknown>[]) => Promise.resolve(docs.map((d) => ({ _id: new Types.ObjectId(), ...d })))),
      aggregate: jest.fn().mockReturnValue(aggregateResult),
    };
    receiptModel = { create: jest.fn((docs: Record<string, unknown>[]) => Promise.resolve(docs)) };
    binModel = { find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: binId, bin_code: 'KA-D1-P01-T01-1', capacity: null }]) }) };
    const session = { withTransaction: jest.fn(async (fn: () => Promise<unknown>) => fn()), endSession: jest.fn() };
    service = new WarehouseService(
      { findById: jest.fn().mockResolvedValue({ _id: warehouseId, is_active: true }) } as never,
      {} as never,
      binModel as never,
      assignmentModel as never,
      {} as never,
      {} as never,
      { startSession: jest.fn().mockResolvedValue(session) } as never,
      {} as never,
      movementModel as never,
      { find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) } as never,
      lotModel as never,
      receiptModel as never,
    );
  });

  it('nhiều SKU → mỗi dòng cộng tồn + 1 lô cùng mã lô và ngày nhập; phiếu lưu tổng số lượng', async () => {
    const [a1, a2] = rows;
    await service.createReceipt(
      warehouseId.toString(),
      {
        received_at: '2026-10-10T08:00:00+07:00',
        lot_code: 'lo-thang-10',
        supplier: 'Xưởng A',
        lines: [
          { assignment_id: String(a1?._id), quantity: 30 },
          { assignment_id: String(a2?._id), quantity: 10 },
          { assignment_id: String(a1?._id), quantity: 5 },
        ],
      },
      actor,
    );

    expect(rows.map((r) => r.quantity_on_hand)).toEqual([35, 14]);
    const lots = lotModel.create.mock.calls.flatMap((c: Record<string, unknown>[][]) => c[0] ?? []).filter((l) => l.source === 'receipt');
    expect(lots.map((l) => [l.seller_sku, l.quantity_received, l.lot_code])).toEqual([
      ['AO-1', 35, 'LO-THANG-10'],
      ['QUAN-2', 10, 'LO-THANG-10'],
    ]);
    expect((lots[0]?.received_at as Date).toISOString()).toBe('2026-10-10T01:00:00.000Z');
    const [receipt] = (receiptModel.create.mock.calls[0] as Record<string, unknown>[][])[0] ?? [];
    expect(receipt).toMatchObject({ lot_code: 'LO-THANG-10', total_quantity: 45, supplier: 'Xưởng A', created_by: actor });
    const types = movementModel.create.mock.calls.map((c: { type: string; ref_type: string }[][]) => [c[0]?.[0]?.type, c[0]?.[0]?.ref_type]);
    expect(types).toEqual([
      ['receive', 'stock_receipt'],
      ['receive', 'stock_receipt'],
    ]);
  });

  it('ngày nhập ở tương lai → WH_RECEIPT_DATE_IN_FUTURE, không ghi gì', async () => {
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    await expect(
      service.createReceipt(warehouseId.toString(), { received_at: future, lines: [{ assignment_id: String(rows[0]?._id), quantity: 1 }] }, actor),
    ).rejects.toMatchObject({ errorCode: WAREHOUSE_ERROR_CODES.RECEIPT_DATE_IN_FUTURE });
    expect(assignmentModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('dòng không có assignment_id lẫn đủ ô + sàn + shop + SKU → WH_RECEIPT_LINE_INVALID', async () => {
    await expect(
      service.createReceipt(warehouseId.toString(), { lines: [{ seller_sku: 'AO-1', quantity: 1 }] }, actor),
    ).rejects.toMatchObject({ errorCode: WAREHOUSE_ERROR_CODES.RECEIPT_LINE_INVALID });
  });

  it('SKU chưa gán vào ô → WH_RECEIPT_LINE_NOT_ASSIGNED', async () => {
    assignmentModel.findOne.mockResolvedValue(null);
    await expect(
      service.createReceipt(
        warehouseId.toString(),
        { lines: [{ bin_location_id: binId.toString(), platform: 'lazada' as never, shop_id: 'shop-1', seller_sku: 'MOI', quantity: 1 }] },
        actor,
      ),
    ).rejects.toMatchObject({ errorCode: WAREHOUSE_ERROR_CODES.RECEIPT_LINE_NOT_ASSIGNED });
  });

  it('dòng tồn đang có hàng chưa có lô → bù lô tồn đầu kỳ trước khi tạo lô mới', async () => {
    lotModel.aggregate.mockReturnValue(Object.assign(Promise.resolve([]), { session: () => Promise.resolve([]) }));
    await service.createReceipt(warehouseId.toString(), { lines: [{ assignment_id: String(rows[1]?._id), quantity: 2 }] }, actor);
    const sources = lotModel.create.mock.calls.flatMap((c: Record<string, unknown>[][]) => (c[0] ?? []).map((l) => [l.source, l.quantity_received]));
    expect(sources).toEqual([
      ['opening', 4],
      ['receipt', 2],
    ]);
  });
});
