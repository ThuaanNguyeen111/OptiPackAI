import { Types } from 'mongoose';
import { OrderGroupsService } from './order-groups.service';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';
import { ORD_GROUP_ERROR_CODES } from './order-groups.errors';

/**
 * (05/10/2026) Điều chỉnh "đã lấy" từ khâu đóng gói: tháo kiện trả kệ (cộng tồn
 * đúng ô) và món hỏng bị loại (không cộng tồn) — luôn ghi pick_event ÂM để mọi
 * phép đếm "đã lấy" khớp hàng thật; lấy món thay thì trừ tồn có điều kiện.
 */
describe('OrderGroupsService — điều chỉnh hàng đã lấy từ khâu đóng gói', () => {
  const groupId = new Types.ObjectId();
  const warehouse = new Types.ObjectId();
  const binA = new Types.ObjectId();
  const binB = new Types.ObjectId();
  const session = {} as never;

  let pickEventModel: { find: jest.Mock; create: jest.Mock };
  let skuBinAssignmentModel: { findOneAndUpdate: jest.Mock };
  let inventoryMovementModel: { create: jest.Mock };
  let reservation: { unconsume: jest.Mock; recordPicked: jest.Mock };
  let orderModel: { find: jest.Mock };
  let notify: jest.Mock;
  let events: Record<string, unknown>[];
  let service: OrderGroupsService;

  /** Đơn còn đóng gói được trong nhóm: mỗi phần tử = danh sách món (sku, số lượng). */
  function remainingOrders(lines: [string, number][][]): void {
    const orders = lines.map((items) => ({
      items: items.map(([sku, quantity], i) => ({
        sku,
        quantity,
        status: 'pending',
        variation: null,
        platform_order_item_id: `${sku}-${String(i)}`,
      })),
    }));
    orderModel.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(orders) }) });
  }

  const createdEvents = (): { scanned_quantity: number; kind: string; bin_location_id: Types.ObjectId | null }[] =>
    pickEventModel.create.mock.calls.map(
      (c) => (c as [[{ scanned_quantity: number; kind: string; bin_location_id: Types.ObjectId | null }]])[0][0],
    );

  beforeEach(() => {
    // Lượt hiện tại: lấy 2 cái ở ô A (lúc 1), 1 cái ở ô B (lúc 2, sau cùng).
    events = [
      { seller_sku: 'TEE', scanned_quantity: 2, warehouse_id: warehouse, bin_location_id: binA, created_at: new Date(1000) },
      { seller_sku: 'TEE', scanned_quantity: 1, warehouse_id: warehouse, bin_location_id: binB, created_at: new Date(2000) },
    ];
    pickEventModel = {
      // adjustPickedUnits đọc .session().lean(); đếm "đã lấy" đọc .select().lean().
      find: jest.fn(() => ({
        session: () => ({ lean: () => Promise.resolve(events) }),
        select: () => ({ lean: () => Promise.resolve(events) }),
      })),
      // Ghi event mới vào "sổ" để lần gọi sau thấy (kiểm tra gọi lặp không trả 2 lần).
      create: jest.fn((docs: Record<string, unknown>[]) => {
        events.push(...docs.map((d) => ({ ...d, created_at: new Date(3000) })));
        return Promise.resolve([]);
      }),
    };
    skuBinAssignmentModel = {
      findOneAndUpdate: jest.fn((filter: { bin_location_id?: Types.ObjectId }) =>
        Promise.resolve({
          _id: new Types.ObjectId(),
          warehouse_id: warehouse,
          bin_location_id: filter.bin_location_id ?? binA,
          platform: 'lazada',
          shop_id: 'shop-1',
          seller_sku: 'TEE',
          master_sku: null,
          quantity_on_hand: 10,
        }),
      ),
    };
    inventoryMovementModel = { create: jest.fn().mockResolvedValue([]) };
    reservation = { unconsume: jest.fn().mockResolvedValue(undefined), recordPicked: jest.fn().mockResolvedValue(undefined) };
    orderModel = { find: jest.fn() };
    remainingOrders([[['TEE', 3]]]);
    notify = jest.fn().mockResolvedValue({});
    const orderGroupModel = {
      findById: jest.fn().mockResolvedValue({
        _id: groupId,
        platform: 'lazada',
        shop_id: 'shop-1',
        pick_round: 0,
        fulfillment_status: GroupFulfillmentStatus.APPROVED_FOR_PACKING,
        assigned_staff_id: new Types.ObjectId(),
      }),
    };
    const connection = {
      startSession: () =>
        Promise.resolve({ withTransaction: (fn: () => Promise<unknown>) => fn(), endSession: () => Promise.resolve() }),
    };
    const binLocationModel = {
      find: () => ({
        select: () => ({
          lean: () =>
            Promise.resolve([
              { _id: binA, bin_code: 'KA-D1-P01-T02-1' },
              { _id: binB, bin_code: 'KA-D1-P01-T03-2' },
            ]),
        }),
      }),
    };
    const mappingModel = { find: () => ({ select: () => ({ lean: () => Promise.resolve([]) }) }) };
    service = new OrderGroupsService(
      orderGroupModel as never,
      orderModel as never,
      {} as never,
      skuBinAssignmentModel as never,
      pickEventModel as never,
      {} as never,
      {} as never,
      { notify } as never,
      {} as never,
      connection as never,
      inventoryMovementModel as never,
      mappingModel as never,
      reservation as never,
      binLocationModel as never,
    );
  });

  it('tháo kiện: trả về đúng ô lấy SAU CÙNG trước, cộng tồn + sổ kho cancel_unpack + pick_event âm', async () => {
    const result = await service.adjustPickedUnits(groupId.toString(), [{ sku: 'TEE', quantity: 2 }], {
      restock: true,
      kind: 'unpack',
      note: 'Tháo kiện 1',
      actorId: 'u1',
      session,
    });
    expect(result).toMatchObject({ restocked: 2, withoutLocation: 0 });
    expect(result.returned.map((r) => String(r.binLocationId))).toEqual([String(binB), String(binA)]);
    const events = createdEvents();
    expect(events.map((e) => [e.scanned_quantity, String(e.bin_location_id)])).toEqual([
      [-1, String(binB)],
      [-1, String(binA)],
    ]);
    expect(events.every((e) => e.kind === 'unpack')).toBe(true);
    const movements = inventoryMovementModel.create.mock.calls.map((c) => (c as [[{ type: string; delta: number }]])[0][0]);
    expect(movements.map((m) => [m.type, m.delta])).toEqual([
      ['cancel_unpack', 1],
      ['cancel_unpack', 1],
    ]);
    // Bộ đếm "đã lấy" của giữ chỗ giảm đúng số món rời giỏ.
    expect(reservation.unconsume).toHaveBeenCalledWith(groupId.toString(), 'S:lazada|shop-1|TEE', 2, session);
  });

  it('món hỏng (restock = false): không cộng tồn, vẫn ghi pick_event âm theo ô', async () => {
    const result = await service.adjustPickedUnits(groupId.toString(), [{ sku: 'TEE', quantity: 1 }], {
      restock: false,
      kind: 'pack_issue',
      note: 'hỏng',
      actorId: 'u1',
      session,
    });
    expect(result.restocked).toBe(0);
    expect(skuBinAssignmentModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(createdEvents()).toEqual([expect.objectContaining({ scanned_quantity: -1, kind: 'pack_issue' })]);
  });

  it('bớt nhiều hơn số đã lấy có ô → phần dư vẫn bớt (event không ô), báo không biết trả về đâu', async () => {
    const result = await service.adjustPickedUnits(groupId.toString(), [{ sku: 'TEE', quantity: 5 }], {
      restock: true,
      kind: 'unpack',
      note: 'x',
      actorId: 'u1',
      session,
    });
    expect(result).toMatchObject({ restocked: 3, withoutLocation: 2 });
    expect(createdEvents().at(-1)).toMatchObject({ scanned_quantity: -2, bin_location_id: null });
  });

  it('lấy món thay: trừ 1 có điều kiện còn hàng, sổ kho pack_replace, pick_event dương', async () => {
    await service.takeReplacementUnit(groupId.toString(), 'TEE', warehouse.toString(), undefined, 'u1', session);
    const [filter, update] = skuBinAssignmentModel.findOneAndUpdate.mock.calls[0] as [
      { quantity_on_hand: unknown },
      { $inc: { quantity_on_hand: number } },
    ];
    expect(filter.quantity_on_hand).toEqual({ $gte: 1 });
    expect(update.$inc.quantity_on_hand).toBe(-1);
    expect(createdEvents()[0]).toMatchObject({ scanned_quantity: 1, kind: 'pack_replace' });
    expect(reservation.recordPicked).toHaveBeenCalledWith(groupId.toString(), 'S:lazada|shop-1|TEE', 1, session);
  });

  it('lấy món thay khi kho hết → ORD_GROUP_INSUFFICIENT_STOCK', async () => {
    skuBinAssignmentModel.findOneAndUpdate.mockResolvedValueOnce(null);
    await expect(
      service.takeReplacementUnit(groupId.toString(), 'TEE', warehouse.toString(), undefined, 'u1', session),
    ).rejects.toMatchObject({ errorCode: ORD_GROUP_ERROR_CODES.INSUFFICIENT_STOCK });
  });
  describe('returnSurplusPickedUnits — đơn hủy trước khi bắt đầu đóng', () => {
    it('nhóm còn đơn cần 1 áo, đã lấy 3 → trả 2 áo về đúng ô, sổ kho cancel_return, báo kho kèm mã ô', async () => {
      remainingOrders([[['TEE', 1]]]);
      expect(await service.returnSurplusPickedUnits(groupId.toString())).toBe(2);
      const movements = inventoryMovementModel.create.mock.calls.map((c) => (c as [[{ type: string }]])[0][0].type);
      expect(movements).toEqual(['cancel_return', 'cancel_return']);
      expect(createdEvents().every((e) => e.kind === 'cancel_return' && e.scanned_quantity < 0)).toBe(true);
      const message = (notify.mock.calls[0] as [{ message: string; type: string }])[0];
      expect(message.type).toBe('return_to_shelf');
      expect(message.message).toContain('KA-D1-P01-T03-2');
      expect(notify).toHaveBeenCalledTimes(2); // Warehouse Staff + người lấy hàng được giao
    });

    it('không dư (đơn còn lại cần đủ 3) → không làm gì', async () => {
      expect(await service.returnSurplusPickedUnits(groupId.toString())).toBe(0);
      expect(skuBinAssignmentModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    });

    it('mọi đơn đều hủy → trả toàn bộ 3 món', async () => {
      remainingOrders([]);
      expect(await service.returnSurplusPickedUnits(groupId.toString())).toBe(3);
    });

    it('gọi lần 2 → không trả thêm (sự kiện âm lần 1 đã làm "đã lấy" khớp)', async () => {
      remainingOrders([[['TEE', 1]]]);
      await service.returnSurplusPickedUnits(groupId.toString());
      skuBinAssignmentModel.findOneAndUpdate.mockClear();
      expect(await service.returnSurplusPickedUnits(groupId.toString())).toBe(0);
      expect(skuBinAssignmentModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
