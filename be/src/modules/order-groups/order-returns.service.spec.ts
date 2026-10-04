import { Types } from 'mongoose';
import { OrderReturnsService } from './order-returns.service';
import { ORD_GROUP_ERROR_CODES } from './order-groups.errors';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';
import type { ReceiveReturnDto } from './dto/receive-return.dto';

//!=============================================
// 30/09/2026 — nhận hàng hoàn về kho: kiểm chất lượng, nhập lại tồn phần đạt,
// chặn nhập 2 lần / nhập vượt số đã giao / SKU chưa gán vị trí.
//!=============================================
describe('OrderReturnsService', () => {
  const groupId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const warehouseId = new Types.ObjectId().toString();

  let receiptModel: { create: jest.Mock; findOne: jest.Mock };
  let assignmentModel: { updateOne: jest.Mock };
  let orderGroupsService: {
    findOrderGroupById: jest.Mock;
    getOrderedQuantitiesForGroup: jest.Mock;
  };
  let notificationsService: {
    buildReturnReceivedMessage: jest.Mock;
    notify: jest.Mock;
  };
  let service: OrderReturnsService;

  function mockGroup(status: GroupFulfillmentStatus): void {
    orderGroupsService.findOrderGroupById.mockResolvedValue({
      _id: new Types.ObjectId(groupId),
      platform: 'lazada',
      shop_id: 'shop-1',
      fulfillment_status: status,
    });
  }

  const dto = (lines: ReceiveReturnDto['lines']): ReceiveReturnDto => ({
    warehouse_id: warehouseId,
    lines,
  });

  beforeEach(() => {
    receiptModel = {
      create: jest
        .fn()
        .mockImplementation((docs: Record<string, unknown>[]) =>
          Promise.resolve(docs),
        ),
      findOne: jest.fn(),
    };
    assignmentModel = {
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    orderGroupsService = {
      findOrderGroupById: jest.fn(),
      getOrderedQuantitiesForGroup: jest.fn().mockResolvedValue(
        new Map([
          ['AO', 3],
          ['GIAY', 1],
        ]),
      ),
    };
    notificationsService = {
      buildReturnReceivedMessage: jest
        .fn()
        .mockReturnValue({ title: 't', message: 'm' }),
      notify: jest
        .fn<Promise<unknown>, [{ severity: string }]>()
        .mockResolvedValue({}),
    };
    const session = {
      withTransaction: jest.fn(async (fn: () => Promise<unknown>) => fn()),
      endSession: jest.fn(),
    };
    service = new OrderReturnsService(
      receiptModel as never,
      assignmentModel as never,
      { startSession: jest.fn().mockResolvedValue(session) } as never,
      orderGroupsService as never,
      notificationsService as never,
    );
  });

  it('nhóm chưa returned → ORD_GROUP_RETURN_NOT_RETURNED, không chạm tồn kho', async () => {
    mockGroup(GroupFulfillmentStatus.SHIPPED);
    await expect(
      service.receiveReturn(
        groupId,
        userId,
        dto([{ sku: 'AO', good_quantity: 1, damaged_quantity: 0 }]),
      ),
    ).rejects.toMatchObject({
      errorCode: ORD_GROUP_ERROR_CODES.RETURN_NOT_RETURNED,
    });
    expect(assignmentModel.updateOne).not.toHaveBeenCalled();
  });

  it('chỉ phần ĐẠT được nhập lại tồn (đúng kho + sàn + shop + SKU), phần hỏng chỉ ghi biên nhận', async () => {
    mockGroup(GroupFulfillmentStatus.RETURNED);

    const receipt = await service.receiveReturn(
      groupId,
      userId,
      dto([
        { sku: 'AO', good_quantity: 2, damaged_quantity: 1 },
        { sku: 'GIAY', good_quantity: 0, damaged_quantity: 1 },
      ]),
    );

    expect(assignmentModel.updateOne).toHaveBeenCalledTimes(1); // GIAY 0 đạt → không cộng tồn
    const [filter, update] = assignmentModel.updateOne.mock.calls[0] as [
      Record<string, unknown>,
      { $inc: { quantity_on_hand: number } },
    ];
    expect(filter).toMatchObject({
      platform: 'lazada',
      shop_id: 'shop-1',
      seller_sku: 'AO',
    });
    expect(String(filter.warehouse_id)).toBe(warehouseId);
    expect(update.$inc.quantity_on_hand).toBe(2);
    const created = receipt as unknown as {
      total_good: number;
      total_damaged: number;
    };
    expect(created.total_good).toBe(2);
    expect(created.total_damaged).toBe(2);
  });

  it('có hàng hỏng → báo Store Owner mức warning; không hỏng → info', async () => {
    mockGroup(GroupFulfillmentStatus.RETURNED);
    const severities: string[] = [];
    notificationsService.notify.mockImplementation(
      (input: { severity: string }) => {
        severities.push(input.severity);
        return Promise.resolve({});
      },
    );
    await service.receiveReturn(
      groupId,
      userId,
      dto([{ sku: 'AO', good_quantity: 1, damaged_quantity: 1 }]),
    );
    expect(severities).toEqual(['warning']);

    receiptModel.create.mockImplementation((docs: Record<string, unknown>[]) =>
      Promise.resolve(docs),
    );
    await service.receiveReturn(
      groupId,
      userId,
      dto([{ sku: 'AO', good_quantity: 1, damaged_quantity: 0 }]),
    );
    expect(severities).toEqual(['warning', 'info']);
  });

  it('nhận nhiều hơn số đã giao → ORD_GROUP_RETURN_EXCEEDS_SHIPPED (chống nhập khống tồn)', async () => {
    mockGroup(GroupFulfillmentStatus.RETURNED);
    await expect(
      service.receiveReturn(
        groupId,
        userId,
        dto([{ sku: 'AO', good_quantity: 3, damaged_quantity: 1 }]),
      ),
    ).rejects.toMatchObject({
      errorCode: ORD_GROUP_ERROR_CODES.RETURN_EXCEEDS_SHIPPED,
    });
    expect(assignmentModel.updateOne).not.toHaveBeenCalled();
  });

  it('SKU không thuộc group → ORD_GROUP_ITEM_NOT_IN_GROUP', async () => {
    mockGroup(GroupFulfillmentStatus.RETURNED);
    await expect(
      service.receiveReturn(
        groupId,
        userId,
        dto([{ sku: 'LA', good_quantity: 1, damaged_quantity: 0 }]),
      ),
    ).rejects.toMatchObject({
      errorCode: ORD_GROUP_ERROR_CODES.ITEM_NOT_IN_GROUP,
    });
  });

  it('1 SKU 2 dòng → ORD_GROUP_RETURN_DUPLICATE_LINE', async () => {
    mockGroup(GroupFulfillmentStatus.RETURNED);
    await expect(
      service.receiveReturn(
        groupId,
        userId,
        dto([
          { sku: 'AO', good_quantity: 1, damaged_quantity: 0 },
          { sku: 'AO', good_quantity: 1, damaged_quantity: 0 },
        ]),
      ),
    ).rejects.toMatchObject({
      errorCode: ORD_GROUP_ERROR_CODES.RETURN_DUPLICATE_LINE,
    });
  });

  it('SKU chưa gán vị trí trong kho → ORD_GROUP_RETURN_SKU_NOT_ASSIGNED, không ghi biên nhận', async () => {
    mockGroup(GroupFulfillmentStatus.RETURNED);
    assignmentModel.updateOne.mockResolvedValue({ matchedCount: 0 });
    await expect(
      service.receiveReturn(
        groupId,
        userId,
        dto([{ sku: 'AO', good_quantity: 1, damaged_quantity: 0 }]),
      ),
    ).rejects.toMatchObject({
      errorCode: ORD_GROUP_ERROR_CODES.RETURN_SKU_NOT_ASSIGNED,
    });
    expect(receiptModel.create).not.toHaveBeenCalled();
  });

  it('nhận lần 2 (unique order_group_id, E11000) → ORD_GROUP_RETURN_ALREADY_RECEIVED', async () => {
    mockGroup(GroupFulfillmentStatus.RETURNED);
    receiptModel.create.mockRejectedValue({ code: 11000 });
    await expect(
      service.receiveReturn(
        groupId,
        userId,
        dto([{ sku: 'AO', good_quantity: 1, damaged_quantity: 0 }]),
      ),
    ).rejects.toMatchObject({
      errorCode: ORD_GROUP_ERROR_CODES.RETURN_ALREADY_RECEIVED,
    });
  });
});
