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

  let orderGroupModel: {
    findById: jest.Mock;
    updateOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  let orderModel: { find: jest.Mock };
  let productMasterModel: { find: jest.Mock };
  let skuBinAssignmentModel: {
    findOneAndUpdate: jest.Mock;
    updateOne: jest.Mock;
  };
  let pickEventModel: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  let connection: { startSession: jest.Mock };
  let inventoryMovementModel: { create: jest.Mock };

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
            items: items.map((i) => ({
              ...i,
              name: 'SP',
              unit_price: 1,
              status: 'pending',
            })),
            platform: 'lazada',
            shop_id: 'shop-1',
          },
        ]),
      }),
    });
  }

  function mockPickedEvents(
    events: { seller_sku: string; scanned_quantity: number }[],
  ): void {
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
    skuBinAssignmentModel = {
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    pickEventModel = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({}),
    };
    const session = {
      withTransaction: jest.fn(async (fn: () => Promise<unknown>) => fn()),
      endSession: jest.fn(),
    };
    connection = { startSession: jest.fn().mockResolvedValue(session) };
    inventoryMovementModel = { create: jest.fn().mockResolvedValue([{}]) };

    service = new OrderGroupsService(
      orderGroupModel as never,
      orderModel as never,
      productMasterModel as never,
      skuBinAssignmentModel as never,
      pickEventModel as never,
      {} as never, // userModel — không dùng trong đường code này
      {} as never, // packagingRecommendationModel — không dùng trong đường code này
      {} as never, // notificationsService
      {} as never, // staffAssignmentService — không dùng trong đường code này
      connection as never,
      inventoryMovementModel as never, // K3
      { find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) } as never, // K4b mappingModel (chưa nối gì -> đường lùi)
      { reconcile: jest.fn().mockResolvedValue([]), consume: jest.fn().mockResolvedValue(undefined), releaseGroup: jest.fn().mockResolvedValue(0) } as never, // K5
      {} as never, // binLocationModel
    );
  });

  it('quét SKU KHÔNG thuộc group -> ORD_GROUP_ITEM_NOT_IN_GROUP, KHÔNG chạm tồn kho', async () => {
    mockGroup();
    mockOrderedItems([{ sku: 'SKU-THAT-CUA-DON', quantity: 1 }]);

    await expect(
      service.pickItem(groupId, warehouseId, 'SKU-QUET-NHAM', 1, 'barcode'),
    ).rejects.toMatchObject({
      errorCode: ORD_GROUP_ERROR_CODES.ITEM_NOT_IN_GROUP,
    });
    expect(skuBinAssignmentModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('quét ĐÚNG SKU -> trừ tồn + ghi event cùng transaction, gắn pick_round; KHÔNG cần hồ sơ đóng gói', async () => {
    mockGroup();
    mockOrderedItems([{ sku: 'SKU-DUNG', quantity: 2 }]);
    mockPickedEvents([]);
    skuBinAssignmentModel.findOneAndUpdate.mockResolvedValue({
      quantity_on_hand: 9,
    });
    pickEventModel.create.mockResolvedValue([{}]);

    const result = await service.pickItem(
      groupId,
      warehouseId,
      'SKU-DUNG',
      1,
      'barcode',
    );

    expect(result).toEqual({
      sku: 'SKU-DUNG',
      decrementedBy: 1,
      remainingStock: 9,
    });
    const [docs, options] = pickEventModel.create.mock.calls[0] as [
      { pick_round: number }[],
      { session: unknown },
    ];
    expect(docs[0]?.pick_round).toBe(0);
    expect(options.session).toBeDefined();
    expect(productMasterModel.find).not.toHaveBeenCalled();
  });

  it('trừ tồn CHỈ trong đúng phạm vi platform + shop của group (2 shop trùng SKU không trừ nhầm nhau)', async () => {
    mockGroup();
    mockOrderedItems([{ sku: 'SKU-TRUNG', quantity: 1 }]);
    mockPickedEvents([]);
    skuBinAssignmentModel.findOneAndUpdate.mockResolvedValue({
      quantity_on_hand: 4,
    });
    pickEventModel.create.mockResolvedValue([{}]);

    await service.pickItem(groupId, warehouseId, 'SKU-TRUNG', 1, 'barcode');

    const [filter] = skuBinAssignmentModel.findOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(filter).toMatchObject({
      warehouse_id: new Types.ObjectId(warehouseId),
      platform: 'lazada',
      shop_id: 'shop-1',
      seller_sku: /^SKU-TRUNG$/i,
    });
  });

  it('confirmPicked khi group đang partial_needs_review -> bị chặn, KHÔNG được bỏ qua bước duyệt partial', async () => {
    mockGroup({
      fulfillment_status: GroupFulfillmentStatus.PARTIAL_NEEDS_REVIEW,
    });

    await expect(service.confirmPicked(groupId, 3)).rejects.toMatchObject({
      errorCode: ORD_GROUP_ERROR_CODES.INVALID_TRANSITION,
    });
    expect(orderGroupModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('quét vượt số đặt trong lượt -> ORD_GROUP_PICK_EXCEEDS_ORDERED, không trừ tồn', async () => {
    mockGroup();
    mockOrderedItems([{ sku: 'AO', quantity: 2 }]);
    mockPickedEvents([{ seller_sku: 'AO', scanned_quantity: 2 }]);

    await expect(
      service.pickItem(groupId, warehouseId, 'AO', 1, 'manual'),
    ).rejects.toMatchObject({
      errorCode: ORD_GROUP_ERROR_CODES.PICK_EXCEEDS_ORDERED,
    });
    expect(skuBinAssignmentModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('group không ở picking -> ORD_GROUP_PICK_NOT_ALLOWED', async () => {
    mockGroup({ fulfillment_status: GroupFulfillmentStatus.PICKED });

    await expect(
      service.pickItem(groupId, warehouseId, 'AO', 1, 'barcode'),
    ).rejects.toMatchObject({
      errorCode: ORD_GROUP_ERROR_CODES.PICK_NOT_ALLOWED,
    });
  });

  it('client_event_id đã xử lý -> trả kết quả cũ, không kiểm tra/trừ lại', async () => {
    pickEventModel.findOne.mockResolvedValue({
      seller_sku: 'AO',
      scanned_quantity: 1,
      remaining_stock_after: 5,
    });

    const result = await service.pickItem(
      groupId,
      warehouseId,
      'AO',
      1,
      'barcode',
      'evt-1',
    );

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
      details: {
        missing: [{ sku: 'QUAN', orderedQuantity: 1, pickedQuantity: 0 }],
      },
    });
  });

  it('picking-list KHÔNG chặn SKU chưa đo: trả số đặt + đã quét, số đo null, ready=false', async () => {
    mockGroup();
    mockOrderedItems([
      { sku: 'AO', quantity: 2 },
      { sku: 'GIAY', quantity: 1 },
    ]);
    mockPickedEvents([{ seller_sku: 'AO', scanned_quantity: 1 }]);
    productMasterModel.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          seller_sku: 'AO',
          packaging_profile_status: 'ready',
          is_fragile: false,
          dimension: {
            package_length_cm: 28,
            package_width_cm: 20,
            package_height_cm: 4,
            package_weight_kg: 0.25,
          },
        },
        { seller_sku: 'GIAY', packaging_profile_status: 'needs_measurement' },
      ]),
    });

    const { items } = await service.getPickableItemsForGroup(groupId);

    expect(items).toEqual([
      expect.objectContaining({
        sku: 'AO',
        quantity: 2,
        picked_quantity: 1,
        packaging_profile_ready: true,
        length_cm: 28,
      }),
      expect.objectContaining({
        sku: 'GIAY',
        quantity: 1,
        picked_quantity: 0,
        packaging_profile_ready: false,
        length_cm: null,
      }),
    ]);
  });

  function mockOldRoundEvents(events: Record<string, unknown>[]): void {
    pickEventModel.find.mockReturnValue({
      session: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue(events) }),
    });
  }

  it('decidePartial(false) -> vào lại picking VÀ mở lượt mới (pick_round + 1)', async () => {
    mockGroup({
      fulfillment_status: GroupFulfillmentStatus.PARTIAL_NEEDS_REVIEW,
    });
    orderGroupModel.findOneAndUpdate.mockResolvedValue({ pick_round: 1 });
    mockOldRoundEvents([]);

    await service.decidePartial(groupId, false, 3);

    const [filter, update] = orderGroupModel.findOneAndUpdate.mock.calls[0] as [
      { __v: number },
      { $set: { fulfillment_status: string }; $inc: Record<string, number> },
    ];
    expect(filter.__v).toBe(3);
    expect(update.$set.fulfillment_status).toBe(GroupFulfillmentStatus.PICKING);
    expect(update.$inc).toEqual({ __v: 1, pick_round: 1 });
  });

  it('decidePartial(false) -> nhập lại tồn của lượt bị hủy, đúng kho + sàn + shop + SKU, đánh dấu đã nhập', async () => {
    mockGroup({
      fulfillment_status: GroupFulfillmentStatus.PARTIAL_NEEDS_REVIEW,
    });
    orderGroupModel.findOneAndUpdate.mockResolvedValue({ pick_round: 1 });
    const wh = new Types.ObjectId();
    const idA = new Types.ObjectId();
    const idB = new Types.ObjectId();
    skuBinAssignmentModel.findOneAndUpdate.mockResolvedValue({
      _id: new Types.ObjectId(),
      warehouse_id: wh,
      bin_location_id: new Types.ObjectId(),
      platform: 'lazada',
      shop_id: 'shop-1',
      seller_sku: 'AO',
      quantity_on_hand: 10,
    });
    mockOldRoundEvents([
      { _id: idA, seller_sku: 'AO', scanned_quantity: 2, warehouse_id: wh },
      { _id: idB, seller_sku: 'AO', scanned_quantity: 1, warehouse_id: wh },
    ]);

    await service.decidePartial(groupId, false, 3);

    expect(skuBinAssignmentModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update] = skuBinAssignmentModel.findOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      { $inc: { quantity_on_hand: number } },
    ];
    expect(filter).toMatchObject({
      warehouse_id: wh,
      platform: 'lazada',
      shop_id: 'shop-1',
      seller_sku: /^AO$/i,
    });
    expect(update.$inc.quantity_on_hand).toBe(3); // 2 + 1 gộp theo SKU
    // Gộp main (K3): ghi sổ tồn loại pick_cancel cho phần trả về kệ.
    const [movements] = inventoryMovementModel.create.mock.calls[0] as [{ type: string; delta: number }[]];
    expect(movements[0]).toMatchObject({ type: 'pick_cancel', delta: 3 });
    const [markFilter] = pickEventModel.updateMany.mock.calls[0] as [
      { _id: { $in: Types.ObjectId[] } },
    ];
    expect(markFilter._id.$in).toEqual([idA, idB]);
    // Chỉ lấy event CHƯA nhập lại (idempotent) của đúng lượt cũ.
    const [findFilter] = pickEventModel.find.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(findFilter.restocked_at).toBeNull();
  });

  it('decidePartial(false) -> event cũ chưa lưu kho KHÔNG nhập lại được (bỏ qua, không lỗi)', async () => {
    mockGroup({
      fulfillment_status: GroupFulfillmentStatus.PARTIAL_NEEDS_REVIEW,
    });
    orderGroupModel.findOneAndUpdate.mockResolvedValue({ pick_round: 1 });
    mockOldRoundEvents([
      {
        _id: new Types.ObjectId(),
        seller_sku: 'AO',
        scanned_quantity: 2,
        warehouse_id: null,
      },
    ]);

    await service.decidePartial(groupId, false, 3);

    expect(skuBinAssignmentModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('pickItem ghi kho đã trừ tồn vào event (để restock đúng kho về sau)', async () => {
    mockGroup();
    mockOrderedItems([{ sku: 'AO', quantity: 2 }]);
    mockPickedEvents([]);
    skuBinAssignmentModel.findOneAndUpdate.mockResolvedValue({
      quantity_on_hand: 5,
    });
    pickEventModel.create.mockResolvedValue([{}]);

    await service.pickItem(groupId, warehouseId, 'AO', 1, 'barcode');

    const [docs] = pickEventModel.create.mock.calls[0] as [
      { warehouse_id: Types.ObjectId }[],
    ];
    expect(docs[0]?.warehouse_id.toString()).toBe(warehouseId);
  });

  it('K4a — trừ tồn LỌC ĐÚNG sàn + shop của nhóm đơn (không trừ nhầm SKU trùng chuỗi của sàn/shop khác)', async () => {
    mockGroup();
    mockOrderedItems([{ sku: 'ABC-123', quantity: 5 }]);
    mockPickedEvents([]);
    skuBinAssignmentModel.findOneAndUpdate.mockResolvedValue({ _id: new Types.ObjectId(), quantity_on_hand: 4, warehouse_id: new Types.ObjectId(), bin_location_id: new Types.ObjectId(), platform: 'lazada', shop_id: 'shop-1', seller_sku: 'ABC-123' });
    pickEventModel.create.mockResolvedValue([{}]);

    await service.pickItem(groupId, new Types.ObjectId().toString(), 'ABC-123', 1, 'barcode');

    expect((skuBinAssignmentModel.findOneAndUpdate.mock.calls[0] as [Record<string, unknown>])[0]).toMatchObject({ platform: 'lazada', shop_id: 'shop-1' });
  });

  it('K4b — SKU đã nối: trừ vào tồn CHUNG theo SKU nội bộ (không lọc theo sàn/shop nữa)', async () => {
    mockGroup();
    mockOrderedItems([{ sku: 'ABC-123', quantity: 5 }]);
    mockPickedEvents([]);
    (service as unknown as { mappingModel: unknown }).mappingModel = {
      find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ seller_sku_normalized: 'ABC-123', master_sku: 'ATHUN-005-DEN-M' }]) }) }),
    };
    skuBinAssignmentModel.findOneAndUpdate.mockResolvedValue({ _id: new Types.ObjectId(), quantity_on_hand: 9, warehouse_id: new Types.ObjectId(), bin_location_id: new Types.ObjectId(), platform: 'tiki', shop_id: 't1', seller_sku: 'X', master_sku: 'ATHUN-005-DEN-M' });
    pickEventModel.create.mockResolvedValue([{}]);

    await service.pickItem(groupId, new Types.ObjectId().toString(), 'ABC-123', 1, 'barcode');

    const filter = (skuBinAssignmentModel.findOneAndUpdate.mock.calls[0] as [Record<string, unknown>])[0];
    // Đã nối: $or [tồn gộp master_sku | unpooled đúng shop] — vẫn lấy được hàng Admin nhập trước sync-stock.
    expect(filter.$or).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ master_sku: 'ATHUN-005-DEN-M' }),
        expect.objectContaining({ platform: 'lazada', shop_id: 'shop-1', master_sku: null }),
      ]),
    );
  });
  //!=============================================
  // 07/10/2026 — lỗi ObjectId: schema cũ khai `type: Types.ObjectId` bị Mongoose hiểu là
  // Mixed (không tự ép kiểu). (1) lọc tồn bằng chuỗi id kho -> 0 dòng -> 409 dù còn hàng;
  // (2) pick_events lưu order_group_id dạng CHUỖI trong khi chỗ đọc dùng ObjectId.
  //!=============================================
  it('ObjectId — lọc tồn bằng warehouse_id kiểu ObjectId và ghi pick_events.order_group_id kiểu ObjectId', async () => {
    mockGroup();
    mockOrderedItems([{ sku: 'ABC-123', quantity: 5 }]);
    mockPickedEvents([]);
    skuBinAssignmentModel.findOneAndUpdate.mockResolvedValue({ _id: new Types.ObjectId(), quantity_on_hand: 2, warehouse_id: new Types.ObjectId(warehouseId), bin_location_id: new Types.ObjectId(), platform: 'lazada', shop_id: 'shop-1', seller_sku: 'ABC-123' });
    pickEventModel.create.mockResolvedValue([{}]);

    await service.pickItem(groupId, warehouseId, 'ABC-123', 1, 'barcode');

    const filter = (skuBinAssignmentModel.findOneAndUpdate.mock.calls[0] as [Record<string, unknown>])[0];
    expect(filter.warehouse_id).toBeInstanceOf(Types.ObjectId);
    expect(String(filter.warehouse_id)).toBe(warehouseId);
    const [events] = pickEventModel.create.mock.calls[0] as [{ order_group_id: unknown }[]];
    expect(events[0]?.order_group_id).toBeInstanceOf(Types.ObjectId);
    expect(String(events[0]?.order_group_id)).toBe(groupId);
  });
});
