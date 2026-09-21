import { Types } from 'mongoose';
import { OrderGroupsService } from './order-groups.service';
import { ORD_GROUP_ERROR_CODES } from './order-groups.errors';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';

//!=============================================
// pickItem/confirmPicked/decidePartial — luồng lấy hàng.
// - 19/09/2026 (báo cáo thật Hải Phượng): validate SKU thuộc group
//   TRƯỚC khi trừ tồn (quét nhầm mã không được chạm tồn kho).
// - 21/09/2026 (BE-4a): chỉ quét khi group đang picking; không quét vượt
//   số đặt trong lượt hiện tại; trừ tồn + ghi event cùng transaction;
//   "đã lấy xong" phải đối soát đủ; hủy lượt mở lượt mới (pick_round+1).
//   Lấy hàng KHÔNG còn phụ thuộc hồ sơ đóng gói (Product Master).
//!=============================================
describe('OrderGroupsService — luồng lấy hàng', () => {
  let service: OrderGroupsService;

  const groupId = new Types.ObjectId().toString();
  const warehouseId = new Types.ObjectId().toString();

  let orderGroupModel: { findById: jest.Mock; updateOne: jest.Mock; findOneAndUpdate: jest.Mock };
  let orderModel: { find: jest.Mock };
  let productMasterModel: { find: jest.Mock };
  let skuBinAssignmentModel: { findOneAndUpdate: jest.Mock };
  let pickEventModel: { findOne: jest.Mock; find: jest.Mock; create: jest.Mock };
  let connection: { startSession: jest.Mock };

  function mockGroup(overrides: Record<string, unknown> = {}): void {
    orderGroupModel.findById.mockResolvedValue({
      _id: new Types.ObjectId(groupId),
      platform: 'lazada',
      shop_id: 'shop-1',
      fulfillment_status: GroupFulfillmentStatus.PICKING,
      pick_round: 0,
      __v: 3,
      ...overrides,
    });
  }

  function mockOrderedItems(items: { sku: string; quantity: number }[]): void {
    orderModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            items: items.map((i) => ({ ...i, name: 'SP', unit_price: 1, status: 'pending' })),
            platform: 'lazada',
            shop_id: 'shop-1',
          },
        ]),
      }),
    });
  }

  function mockPickedEvents(events: { seller_sku: string; scanned_quantity: number }[]): void {
    const lean = jest.fn().mockResolvedValue(events);
    pickEventModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean,
        session: jest.fn().mockReturnValue({ lean }),
      }),
    });
  }

  beforeEach(() => {
    orderGroupModel = {
      findById: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
      findOneAndUpdate: jest.fn(),
    };
    orderModel = { find: jest.fn() };
    productMasterModel = { find: jest.fn() };
    skuBinAssignmentModel = { findOneAndUpdate: jest.fn() };
    pickEventModel = { findOne: jest.fn(), find: jest.fn(), create: jest.fn() };
    const session = {
      withTransaction: jest.fn(async (fn: () => Promise<unknown>) => fn()),
      endSession: jest.fn(),
    };
    connection = { startSession: jest.fn().mockResolvedValue(session) };

    service = new OrderGroupsService(
      orderGroupModel as never,
      orderModel as never,
      productMasterModel as never,
      skuBinAssignmentModel as never,
      pickEventModel as never,
      {} as never, // userModel — không dùng trong đường code này
      {} as never, // notificationsService
      {} as never, // staffAssignmentService — không dùng trong đường code này
      connection as never,
    );
  });

  it('quét SKU KHÔNG thuộc group -> ORD_GROUP_ITEM_NOT_IN_GROUP, KHÔNG chạm tồn kho', async () => {
    mockGroup();
    mockOrderedItems([{ sku: 'SKU-THAT-CUA-DON', quantity: 1 }]);

    await expect(
      service.pickItem(groupId, warehouseId, 'SKU-QUET-NHAM', 1, 'barcode'),
    ).rejects.toMatchObject({ errorCode: ORD_GROUP_ERROR_CODES.ITEM_NOT_IN_GROUP });
    expect(skuBinAssignmentModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('quét ĐÚNG SKU -> trừ tồn + ghi event cùng transaction, gắn pick_round; KHÔNG cần hồ sơ đóng gói', async () => {
    mockGroup();
    mockOrderedItems([{ sku: 'SKU-DUNG', quantity: 2 }]);
    mockPickedEvents([]);
    skuBinAssignmentModel.findOneAndUpdate.mockResolvedValue({ quantity_on_hand: 9 });
    pickEventModel.create.mockResolvedValue([{}]);

    const result = await service.pickItem(groupId, warehouseId, 'SKU-DUNG', 1, 'barcode');

    expect(result).toEqual({ sku: 'SKU-DUNG', decrementedBy: 1, remainingStock: 9 });
    const [docs, options] = pickEventModel.create.mock.calls[0] as [
      { pick_round: number }[],
      { session: unknown },
    ];
    expect(docs[0]?.pick_round).toBe(0);
    expect(options.session).toBeDefined();
    expect(productMasterModel.find).not.toHaveBeenCalled();
  });

  it('quét vượt số đặt trong lượt -> ORD_GROUP_PICK_EXCEEDS_ORDERED, không trừ tồn', async () => {
    mockGroup();
    mockOrderedItems([{ sku: 'AO', quantity: 2 }]);
    mockPickedEvents([{ seller_sku: 'AO', scanned_quantity: 2 }]);

    await expect(
      service.pickItem(groupId, warehouseId, 'AO', 1, 'manual'),
    ).rejects.toMatchObject({ errorCode: ORD_GROUP_ERROR_CODES.PICK_EXCEEDS_ORDERED });
    expect(skuBinAssignmentModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('group không ở picking -> ORD_GROUP_PICK_NOT_ALLOWED', async () => {
    mockGroup({ fulfillment_status: GroupFulfillmentStatus.PICKED });

    await expect(
      service.pickItem(groupId, warehouseId, 'AO', 1, 'barcode'),
    ).rejects.toMatchObject({ errorCode: ORD_GROUP_ERROR_CODES.PICK_NOT_ALLOWED });
  });

  it('client_event_id đã xử lý -> trả kết quả cũ, không kiểm tra/trừ lại', async () => {
    pickEventModel.findOne.mockResolvedValue({
      seller_sku: 'AO',
      scanned_quantity: 1,
      remaining_stock_after: 5,
    });

    const result = await service.pickItem(groupId, warehouseId, 'AO', 1, 'barcode', 'evt-1');

    expect(result).toEqual({ sku: 'AO', decrementedBy: 1, remainingStock: 5 });
    expect(orderGroupModel.findById).not.toHaveBeenCalled();
    expect(skuBinAssignmentModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('confirmPicked khi còn thiếu -> ORD_GROUP_PICK_INCOMPLETE kèm danh sách thiếu', async () => {
    mockGroup();
    mockOrderedItems([
      { sku: 'AO', quantity: 2 },
      { sku: 'QUAN', quantity: 1 },
    ]);
    mockPickedEvents([{ seller_sku: 'AO', scanned_quantity: 2 }]);

    await expect(service.confirmPicked(groupId, 3)).rejects.toMatchObject({
      errorCode: ORD_GROUP_ERROR_CODES.PICK_INCOMPLETE,
      details: { missing: [{ sku: 'QUAN', orderedQuantity: 1, pickedQuantity: 0 }] },
    });
  });

  it('decidePartial(false) -> quay awaiting_packaging VÀ mở lượt mới (pick_round + 1)', async () => {
    mockGroup({ fulfillment_status: GroupFulfillmentStatus.PARTIAL_NEEDS_REVIEW });
    orderGroupModel.findOneAndUpdate.mockResolvedValue({ pick_round: 1 });

    await service.decidePartial(groupId, false, 3);

    const [filter, update] = orderGroupModel.findOneAndUpdate.mock.calls[0] as [
      { __v: number },
      { $set: { fulfillment_status: string }; $inc: Record<string, number> },
    ];
    expect(filter.__v).toBe(3);
    expect(update.$set.fulfillment_status).toBe(GroupFulfillmentStatus.AWAITING_PACKAGING);
    expect(update.$inc).toEqual({ __v: 1, pick_round: 1 });
  });
});
