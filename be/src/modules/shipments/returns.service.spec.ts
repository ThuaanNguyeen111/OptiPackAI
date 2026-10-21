import { Types, type ClientSession } from 'mongoose';
import { ReturnsService } from './returns.service';
import { RETURN_ERROR_CODES } from './returns.errors';
import { InspectionResult, ReturnReason, ReturnStatus, ReturnType } from './enums/return.enums';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import { isValidStatusTransition } from '../order-groups/enums/allowed-status-transitions';
import type { ReturnRequestDocument } from './schemas/return-request.schema';
import type { InspectReturnDto } from './dto/return.dto';

//!=============================================
// G3 (27/09/2026) — trả/hoàn hàng bản gọn. Kiểm đúng các quy tắc nghiệp vụ:
// chỉ trả khi đã giao, trong 15 ngày, không vượt số đã mua; người tạo không
// tự duyệt; từ chối phải có lý do; kiểm hàng phải khớp đủ số lượng; chỉ dòng
// "restock" mới cộng tồn (qua sổ cái), cùng transaction.
//!=============================================
describe('ReturnsService — G3', () => {
  const groupId = new Types.ObjectId();
  const rmaId = new Types.ObjectId();
  const whId = new Types.ObjectId().toString();
  const binId = new Types.ObjectId().toString();

  let returnModel: { findById: jest.Mock; exists: jest.Mock; create: jest.Mock; findOneAndUpdate: jest.Mock; findByIdAndUpdate: jest.Mock; find: jest.Mock };
  let shipmentModel: { findOne: jest.Mock };
  let orderGroupsService: { findOrderGroupById: jest.Mock; getPackableItemsForGroup: jest.Mock; transitionFulfillmentStatus: jest.Mock; getOrCreateGroupForOrder: jest.Mock };
  let warehouseService: { restockReturnedItem: jest.Mock };
  let packagingMaterialsService: { recoverFromReturn: jest.Mock };
  let movementModel: { aggregate: jest.Mock };
  let orderModel: { findOne: jest.Mock; create: jest.Mock };
  let orderGroupModel: { updateOne: jest.Mock };
  let productMasterModel: { find: jest.Mock };
  let session: { withTransaction: jest.Mock; endSession: jest.Mock };
  let service: ReturnsService;

  const rma = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    _id: rmaId, order_group_id: groupId, status: ReturnStatus.REQUESTED, type: ReturnType.RETURN_REFUND, source: 'simulated', platform: 'lazada', shop_id: 's1',
    items: [{ seller_sku: 'A', quantity: 2, reason_code: ReturnReason.DEFECTIVE }], created_by: 'admin-1', __v: 0, ...over,
  });

  beforeEach(() => {
    returnModel = { findById: jest.fn(), exists: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue([rma()]), findOneAndUpdate: jest.fn(), findByIdAndUpdate: jest.fn(), find: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve([]), session: () => ({ lean: () => Promise.resolve([]) }) }) })) };
    shipmentModel = { findOne: jest.fn().mockResolvedValue({ delivered_at: new Date() }) };
    orderGroupsService = {
      findOrderGroupById: jest.fn().mockResolvedValue({ _id: groupId, fulfillment_status: GroupFulfillmentStatus.DELIVERED, platform: 'lazada', shop_id: 's1', __v: 4, updated_at: new Date() }),
      getPackableItemsForGroup: jest.fn().mockResolvedValue({ items: [{ sku: 'A', quantity: 2 }, { sku: 'B', quantity: 1 }] }),
      transitionFulfillmentStatus: jest.fn().mockResolvedValue({}),
      getOrCreateGroupForOrder: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    };
    warehouseService = { restockReturnedItem: jest.fn().mockResolvedValue(undefined) };
    packagingMaterialsService = { recoverFromReturn: jest.fn().mockResolvedValue([]) };
    movementModel = { aggregate: jest.fn().mockResolvedValue([]) };
    orderModel = { findOne: jest.fn(), create: jest.fn() };
    orderGroupModel = { updateOne: jest.fn().mockResolvedValue({}) };
    productMasterModel = { find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) };
    session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    service = new ReturnsService(returnModel as never, shipmentModel as never, orderGroupsService as never, warehouseService as never, { startSession: jest.fn().mockResolvedValue(session) } as never, packagingMaterialsService as never, movementModel as never, { notify: jest.fn().mockResolvedValue({}) } as never, orderModel as never, orderGroupModel as never, productMasterModel as never);
  });

  const createDto = (items: { seller_sku: string; quantity: number }[]): never =>
    ({ order_group_id: groupId.toString(), type: ReturnType.RETURN_REFUND, items: items.map((i) => ({ ...i, reason_code: ReturnReason.DEFECTIVE })) }) as never;

  describe('createSimulated', () => {
    it('nhóm đơn chưa giao -> 409 RMA_ORDER_NOT_DELIVERED', async () => {
      orderGroupsService.findOrderGroupById.mockResolvedValue({ _id: groupId, fulfillment_status: GroupFulfillmentStatus.SHIPPED });
      await expect(service.createSimulated(createDto([{ seller_sku: 'A', quantity: 1 }]), 'admin-1')).rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.ORDER_NOT_DELIVERED });
    });

    it('quá 15 ngày kể từ khi giao -> 409 RMA_WINDOW_EXPIRED', async () => {
      shipmentModel.findOne.mockResolvedValue({ delivered_at: new Date(Date.now() - 16 * 86_400_000) });
      await expect(service.createSimulated(createDto([{ seller_sku: 'A', quantity: 1 }]), 'admin-1')).rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.WINDOW_EXPIRED });
    });

    it('trả nhiều hơn số đã mua / SKU lạ -> 400 RMA_INVALID_ITEMS', async () => {
      await expect(service.createSimulated(createDto([{ seller_sku: 'A', quantity: 3 }]), 'admin-1')).rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.INVALID_ITEMS });
      await expect(service.createSimulated(createDto([{ seller_sku: 'ZZZ', quantity: 1 }]), 'admin-1')).rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.INVALID_ITEMS });
    });

    it('lần trả sau trừ số đã trả ở phiếu trước (bỏ phiếu bị từ chối/hủy)', async () => {
      returnModel.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ items: [{ seller_sku: 'A', quantity: 2 }] }]) }) });
      await expect(service.createSimulated(createDto([{ seller_sku: 'A', quantity: 1 }]), 'admin-1')).rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.INVALID_ITEMS });
      const [filter] = returnModel.find.mock.calls[0] as [Record<string, unknown>];
      expect(filter).toEqual({ order_group_id: groupId });
    });

    it('hủy phiếu đã duyệt mà hàng không về: bắt buộc lý do, awaiting_receipt → canceled', async () => {
      await expect(service.cancel(rmaId.toString(), 1, 'owner-1', '  ')).rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.NOTE_REQUIRED });
      returnModel.findById.mockResolvedValue(rma({ status: ReturnStatus.AWAITING_RECEIPT, __v: 1 }));
      returnModel.findOneAndUpdate.mockResolvedValue(rma({ status: ReturnStatus.CANCELED }));
      const out = await service.cancel(rmaId.toString(), 1, 'owner-1', 'Khách không gửi hàng');
      expect(out.status).toBe(ReturnStatus.CANCELED);
      const [filter, update] = returnModel.findOneAndUpdate.mock.calls[0] as [{ status: ReturnStatus }, { $set: { status: ReturnStatus } }];
      expect(filter.status).toBe(ReturnStatus.AWAITING_RECEIPT);
      expect(update.$set.status).toBe(ReturnStatus.CANCELED);
    });

    it('đang có phiếu chưa xử lý xong -> 409 RMA_OPEN_EXISTS', async () => {
      returnModel.exists.mockResolvedValue({ _id: rmaId });
      await expect(service.createSimulated(createDto([{ seller_sku: 'A', quantity: 1 }]), 'admin-1')).rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.OPEN_EXISTS });
    });

    it('hợp lệ -> tạo phiếu "requested"', async () => {
      await service.createSimulated(createDto([{ seller_sku: 'A', quantity: 1 }]), 'admin-1');
      expect((returnModel.create.mock.calls[0] as [[Record<string, unknown>]])[0][0]).toMatchObject({ status: ReturnStatus.REQUESTED, source: 'simulated' });
    });
  });

  describe('duyệt / từ chối', () => {
    it('người tạo phiếu tự duyệt -> 403 RMA_SELF_APPROVAL', async () => {
      returnModel.findById.mockResolvedValue(rma());
      await expect(service.approve(rmaId.toString(), 0, 'admin-1')).rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.SELF_APPROVAL });
    });

    it('hoàn tiền không trả hàng -> duyệt là ĐÓNG luôn; trả hàng -> chờ hàng về', async () => {
      returnModel.findById.mockResolvedValue(rma({ type: ReturnType.REFUND_ONLY }));
      returnModel.findOneAndUpdate.mockResolvedValue(rma({ status: ReturnStatus.CLOSED }));
      await service.approve(rmaId.toString(), 0, 'owner-1');
      expect((returnModel.findOneAndUpdate.mock.calls[0] as [unknown, { $set: { status: string } }])[1].$set.status).toBe(ReturnStatus.CLOSED);

      returnModel.findById.mockResolvedValue(rma());
      await service.approve(rmaId.toString(), 0, 'owner-1');
      expect((returnModel.findOneAndUpdate.mock.calls[1] as [unknown, { $set: { status: string } }])[1].$set.status).toBe(ReturnStatus.AWAITING_RECEIPT);
    });

    it('từ chối không ghi lý do -> 400 RMA_NOTE_REQUIRED', async () => {
      await expect(service.reject(rmaId.toString(), 0, 'owner-1', ' ')).rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.NOTE_REQUIRED });
    });
  });

  it('nhận hàng khi phiếu còn "requested" (chưa duyệt) -> 409 RMA_INVALID_STATUS', async () => {
    returnModel.findById.mockResolvedValue(rma());
    await expect(service.receive(rmaId.toString(), 0, 'wh-1')).rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.INVALID_STATUS });
  });

  it('nhận hàng trả TOÀN BỘ -> nhóm đơn -> returned; trả 1 phần -> nhóm đơn giữ nguyên', async () => {
    returnModel.findById.mockResolvedValue(rma({ status: ReturnStatus.AWAITING_RECEIPT, items: [{ seller_sku: 'A', quantity: 2 }, { seller_sku: 'B', quantity: 1 }] }));
    returnModel.findOneAndUpdate.mockResolvedValue(rma({ status: ReturnStatus.RECEIVED }));
    await service.receive(rmaId.toString(), 0, 'wh-1');
    expect(orderGroupsService.transitionFulfillmentStatus).toHaveBeenCalledWith(groupId.toString(), GroupFulfillmentStatus.RETURNED, 4, expect.anything());

    orderGroupsService.transitionFulfillmentStatus.mockClear();
    returnModel.findById.mockResolvedValue(rma({ status: ReturnStatus.AWAITING_RECEIPT }));
    await service.receive(rmaId.toString(), 0, 'wh-1');
    expect(orderGroupsService.transitionFulfillmentStatus).not.toHaveBeenCalled();
  });

  describe('inspect (kiểm hàng)', () => {
    beforeEach(() => {
      returnModel.findById.mockResolvedValue(rma({ status: ReturnStatus.RECEIVED }));
      returnModel.findOneAndUpdate.mockResolvedValue(rma({ status: ReturnStatus.CLOSED }));
    });

    it('trả 2 mà chỉ kiểm 1 -> 400 RMA_INSPECTION_MISMATCH, không nhập kho', async () => {
      await expect(service.inspect(rmaId.toString(), { expected_version: 0, lines: [{ seller_sku: 'A', quantity: 1, result: InspectionResult.DISCARD }] }, 'wh-1'))
        .rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.INSPECTION_MISMATCH });
      expect(warehouseService.restockReturnedItem).not.toHaveBeenCalled();
    });

    it('dòng nhập lại kho không chọn ô -> 400 RMA_BIN_REQUIRED', async () => {
      await expect(service.inspect(rmaId.toString(), { expected_version: 0, lines: [{ seller_sku: 'A', quantity: 2, result: InspectionResult.RESTOCK }] }, 'wh-1'))
        .rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.BIN_REQUIRED });
    });

    it('1 đạt nhập lại + 1 cách ly -> CHỈ dòng đạt được cộng tồn (qua sổ cái), phiếu đóng', async () => {
      await service.inspect(rmaId.toString(), {
        expected_version: 0,
        lines: [
          { seller_sku: 'A', quantity: 1, result: InspectionResult.RESTOCK, warehouse_id: whId, bin_location_id: binId },
          { seller_sku: 'A', quantity: 1, result: InspectionResult.QUARANTINE },
        ],
      }, 'wh-1');
      expect(warehouseService.restockReturnedItem).toHaveBeenCalledTimes(1);
      expect(warehouseService.restockReturnedItem).toHaveBeenCalledWith(expect.objectContaining({ sellerSku: 'A', quantity: 1, binLocationId: binId, returnRequestId: rmaId.toString() }), expect.anything());
      expect((returnModel.findOneAndUpdate.mock.calls[0] as [unknown, { $set: { status: string } }])[1].$set.status).toBe(ReturnStatus.CLOSED);
    });
  });
  describe('G4 — sửa điểm yếu + thu hồi vật liệu', () => {
    it('phiếu hoàn giao thất bại lấy SỐ LƯỢNG ĐÃ QUÉT THẬT (sổ cái), không phải số đặt', async () => {
      movementModel.aggregate.mockResolvedValue([{ _id: 'A', qty: 1 }]); // đặt 2 nhưng chỉ lấy được 1
      await service.createFromFailedDelivery(groupId.toString(), new Types.ObjectId().toString(), 'wh-1', {} as never);
      const created = (returnModel.create.mock.calls[0] as [[{ items: { seller_sku: string; quantity: number }[] }]])[0][0];
      expect(created.items).toEqual([expect.objectContaining({ seller_sku: 'A', quantity: 1 })]);
      expect(orderGroupsService.getPackableItemsForGroup).not.toHaveBeenCalled();
    });

    it('kiểm hàng kèm vật liệu -> gọi thu hồi vật liệu TRONG cùng transaction, lưu kết quả vào phiếu', async () => {
      returnModel.findById.mockResolvedValue(rma({ status: ReturnStatus.RECEIVED }));
      returnModel.findOneAndUpdate.mockResolvedValue(rma({ status: ReturnStatus.CLOSED }));
      const pkgLine = { material_code: 'BOX-M', quantity: 1, grade: 'A' as const, old_label_removed: true };
      packagingMaterialsService.recoverFromReturn.mockResolvedValue([{ line: pkgLine, recoveredToReuse: true, outcome: 'Hạng A' }]);

      await service.inspect(rmaId.toString(), { expected_version: 0, lines: [{ seller_sku: 'A', quantity: 2, result: InspectionResult.DISCARD }], packaging: [pkgLine] }, 'wh-1');

      expect(packagingMaterialsService.recoverFromReturn).toHaveBeenCalledWith([pkgLine], rmaId.toString(), 'wh-1', expect.anything());
      const set = (returnModel.findOneAndUpdate.mock.calls[0] as [unknown, { $set: { packaging_inspection: { recovered_to_reuse: boolean }[] } }])[1].$set;
      expect(set.packaging_inspection[0]?.recovered_to_reuse).toBe(true);
    });
  });

  describe('Đổi hàng', () => {
    const exDto = (exchange: { seller_sku: string; quantity: number }[] | undefined): never =>
      ({ order_group_id: groupId.toString(), type: ReturnType.EXCHANGE, items: [{ seller_sku: 'A', quantity: 1, reason_code: ReturnReason.SIZE_NOT_FIT }], exchange_items: exchange }) as never;

    it('phiếu đổi hàng không khai hàng đổi sang -> 400 RMA_EXCHANGE_ITEMS_REQUIRED', async () => {
      await expect(service.createSimulated(exDto([]), 'admin-1')).rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.EXCHANGE_ITEMS_REQUIRED });
    });

    it('hàng đổi sang không có trong danh mục shop -> 400 RMA_INVALID_EXCHANGE_ITEMS', async () => {
      await expect(service.createSimulated(exDto([{ seller_sku: 'KHONG-CO', quantity: 1 }]), 'admin-1')).rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.INVALID_EXCHANGE_ITEMS });
    });

    it('kiểm hàng xong phiếu đổi hàng -> tạo đơn thay thế EXC-<RMA> giá 0 + nhóm đơn mới gắn nhãn "replacement"', async () => {
      const closedEx = rma({ type: ReturnType.EXCHANGE, status: ReturnStatus.CLOSED, rma_code: 'RMA-1', exchange_items: [{ seller_sku: 'A-L', quantity: 1 }], replacement_status: 'none' });
      returnModel.findById.mockResolvedValueOnce(rma({ type: ReturnType.EXCHANGE, status: ReturnStatus.RECEIVED })).mockResolvedValueOnce(closedEx);
      returnModel.findOneAndUpdate.mockResolvedValue(closedEx);
      returnModel.findByIdAndUpdate.mockResolvedValue({ ...closedEx, replacement_status: 'created' });
      orderModel.findOne.mockResolvedValueOnce({ _id: 'o1', platform: 'lazada', shop_id: 's1', marketplace_shop: 'm1', recipient: {}, currency: 'VND' }).mockResolvedValueOnce(null);
      orderModel.create.mockResolvedValue({ _id: 'o2' });

      const r = await service.inspect(rmaId.toString(), { expected_version: 0, lines: [{ seller_sku: 'A', quantity: 2, result: InspectionResult.RESTOCK, warehouse_id: whId, bin_location_id: binId }] }, 'wh-1');

      const [created] = orderModel.create.mock.calls[0] as [Record<string, unknown>];
      expect(created).toMatchObject({ platform_order_id: 'EXC-RMA-1', total_amount: 0, origin: 'replacement', consolidation_key: `replacement:${rmaId.toString()}` });
      expect(orderGroupsService.getOrCreateGroupForOrder).toHaveBeenCalledTimes(1);
      expect(orderGroupModel.updateOne).toHaveBeenCalledWith(expect.anything(), { $set: { origin: 'replacement', source_return_id: rmaId } });
      expect(r).toMatchObject({ replacement_status: 'created' });
    });

    it('tạo đơn thay thế lần 2 -> 409 RMA_REPLACEMENT_EXISTS', async () => {
      returnModel.findById.mockResolvedValue(rma({ type: ReturnType.EXCHANGE, status: ReturnStatus.CLOSED, replacement_status: 'created' }));
      await expect(service.createReplacement(rmaId.toString(), 'owner-1')).rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.REPLACEMENT_EXISTS });
    });
  });

  describe('tiến độ trả đủ nhóm (18/10/2026)', () => {
    interface ReturnQuery {
      select(): ReturnQuery;
      session(): ReturnQuery;
      lean(): Promise<ReturnRequestDocument[]>;
    }
    let requests: ReturnRequestDocument[];
    let group: { _id: Types.ObjectId; fulfillment_status: GroupFulfillmentStatus; __v: number; platform: string; shop_id: string; updated_at: Date };
    const allItems = [{ seller_sku: 'A', quantity: 2 }, { seller_sku: 'B', quantity: 1 }];
    const inspection = (request: ReturnRequestDocument, result = InspectionResult.RESTOCK): InspectReturnDto => ({
      expected_version: request.__v,
      lines: request.items.map((i) => ({ seller_sku: i.seller_sku, quantity: i.quantity, result, warehouse_id: whId, bin_location_id: binId })),
    });

    beforeEach(() => {
      requests = [];
      group = { _id: groupId, fulfillment_status: GroupFulfillmentStatus.DELIVERED, __v: 4, platform: 'lazada', shop_id: 's1', updated_at: new Date() };
      orderGroupsService.findOrderGroupById.mockImplementation(() => Promise.resolve({ ...group }));
      orderGroupsService.transitionFulfillmentStatus.mockImplementation((_id: string, target: GroupFulfillmentStatus, expected: number) => {
        if (expected !== group.__v || !isValidStatusTransition(group.fulfillment_status, target)) throw new Error('group conflict');
        group = { ...group, fulfillment_status: target, __v: expected + 1, updated_at: new Date() };
        return Promise.resolve({ ...group });
      });
      returnModel.find.mockImplementation((filter: { status?: ReturnStatus; _id?: { $ne: Types.ObjectId }; type?: ReturnType; source?: string | { $ne: string } }) => {
        const chain: ReturnQuery = {
          select: () => chain,
          session: () => chain,
          lean: (): Promise<ReturnRequestDocument[]> => Promise.resolve(requests.filter((r) =>
            (!filter.status || r.status === filter.status) &&
            (!filter._id || !r._id.equals(filter._id.$ne)) &&
            (!filter.type || r.type === filter.type) &&
            (!filter.source || (typeof filter.source === 'string' ? r.source === filter.source : r.source !== filter.source.$ne)),
          )),
        };
        return chain;
      });
      returnModel.exists.mockImplementation(() => Promise.resolve(
        requests.find((r) => [ReturnStatus.REQUESTED, ReturnStatus.AWAITING_RECEIPT, ReturnStatus.RECEIVED].includes(r.status)) ?? null,
      ));
      returnModel.create.mockImplementation((docs: Record<string, unknown>[]) => {
        const created = docs.map((d) => rma({ ...d, _id: new Types.ObjectId() }) as unknown as ReturnRequestDocument);
        requests.push(...created);
        return Promise.resolve(created);
      });
      returnModel.findById.mockImplementation((id: string) => Promise.resolve(requests.find((r) => r._id.equals(id))));
      returnModel.findOneAndUpdate.mockImplementation((filter: { _id: Types.ObjectId; __v: number; status: ReturnStatus }, update: { $set: Partial<ReturnRequestDocument> }) => {
        const current = requests.find((r) => r._id.equals(filter._id) && r.__v === filter.__v && r.status === filter.status);
        if (!current) return Promise.resolve(null);
        Object.assign(current, update.$set, { __v: current.__v + 1 });
        return Promise.resolve(current);
      });
    });

    it('tạo → returning; duyệt → returned; nhận giữ returned; kiểm xong → canceled, cùng session', async () => {
      let request = await service.createSimulated(createDto(allItems), 'admin-1');
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.RETURNING);
      expect(request.status).toBe(ReturnStatus.REQUESTED);
      request = await service.approve(request._id.toString(), request.__v, 'owner-1');
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.RETURNED);
      expect(request.status).toBe(ReturnStatus.AWAITING_RECEIPT);
      const approvedVersion = group.__v;
      request = await service.receive(request._id.toString(), request.__v, 'wh-1');
      expect(group.__v).toBe(approvedVersion);
      expect(warehouseService.restockReturnedItem).not.toHaveBeenCalled();
      request = await service.inspect(request._id.toString(), inspection(request), 'wh-1');
      expect(request.status).toBe(ReturnStatus.CLOSED);
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.CANCELED);
      expect(warehouseService.restockReturnedItem).toHaveBeenCalledTimes(2);
      const transitions = orderGroupsService.transitionFulfillmentStatus.mock.calls as [string, GroupFulfillmentStatus, number, ClientSession][];
      expect(transitions.map((call) => call[1])).toEqual([
        GroupFulfillmentStatus.RETURNING, GroupFulfillmentStatus.RETURNED, GroupFulfillmentStatus.CANCELED,
      ]);
      expect(transitions.every((call) => call[3] === (session as unknown))).toBe(true);
      expect(returnModel.create).toHaveBeenCalledWith(expect.anything(), { session });
      expect(warehouseService.restockReturnedItem).toHaveBeenCalledWith(expect.anything(), session);
      expect(returnModel.findOneAndUpdate).toHaveBeenCalledWith(expect.anything(), expect.anything(), { returnDocument: 'after', session });
    });

    it('trả một phần giữ delivered; phiếu sau trả hết phần còn lại thì hủy sau kiểm hàng', async () => {
      let first = await service.createSimulated(createDto([{ seller_sku: 'A', quantity: 1 }]), 'admin-1');
      first = await service.approve(first._id.toString(), first.__v, 'owner-1');
      first = await service.receive(first._id.toString(), first.__v, 'wh-1');
      await service.inspect(first._id.toString(), inspection(first), 'wh-1');
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.DELIVERED);
      expect(orderGroupsService.transitionFulfillmentStatus).not.toHaveBeenCalled();

      let last = await service.createSimulated(createDto([{ seller_sku: 'A', quantity: 1 }, { seller_sku: 'B', quantity: 1 }]), 'admin-1');
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.RETURNING);
      last = await service.approve(last._id.toString(), last.__v, 'owner-1');
      last = await service.receive(last._id.toString(), last.__v, 'wh-1');
      await service.inspect(last._id.toString(), inspection(last), 'wh-1');
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.CANCELED);
    });

    it.each([ReturnStatus.REJECTED, ReturnStatus.CANCELED])('không cộng phiếu %s vào số đã trả', async (status) => {
      requests.push(rma({ _id: new Types.ObjectId(), status, items: [{ seller_sku: 'A', quantity: 1 }] }) as never);
      await service.createSimulated(createDto([{ seller_sku: 'A', quantity: 1 }, { seller_sku: 'B', quantity: 1 }]), 'admin-1');
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.DELIVERED);
    });

    it.each(['reject', 'cancel'] as const)('%s phiếu trả đủ khôi phục delivered, vẫn tạo lại phiếu được', async (action) => {
      let request = await service.createSimulated(createDto(allItems), 'admin-1');
      if (action === 'cancel') request = await service.approve(request._id.toString(), request.__v, 'owner-1');
      await service[action](request._id.toString(), request.__v, 'owner-1', 'Khách không trả hàng');
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.DELIVERED);
      await service.createSimulated(createDto(allItems), 'admin-1');
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.RETURNING);
    });

    it('giữ ngày giao gốc qua phiếu bị từ chối, không kéo dài hạn bằng updated_at của nhóm', async () => {
      shipmentModel.findOne.mockResolvedValue(null);
      const deliveredAt = new Date(Date.now() - 14 * 86_400_000);
      group.updated_at = deliveredAt;
      const request = await service.createSimulated(createDto(allItems), 'admin-1');
      expect(request.delivered_at_snapshot).toEqual(deliveredAt);
      await service.reject(request._id.toString(), request.__v, 'owner-1', 'Khách đổi ý');
      requests[0]?.delivered_at_snapshot?.setTime(Date.now() - 16 * 86_400_000);
      await expect(service.createSimulated(createDto(allItems), 'admin-1')).rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.WINDOW_EXPIRED });
    });

    it('nhóm đổi sang returning giữa lúc kiểm và tạo phiếu thì chặn yêu cầu tạo thứ hai', async () => {
      group.fulfillment_status = GroupFulfillmentStatus.RETURNING;
      orderGroupsService.findOrderGroupById.mockResolvedValueOnce({ ...group, fulfillment_status: GroupFulfillmentStatus.DELIVERED });
      await expect(service.createSimulated(createDto(allItems), 'admin-1')).rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.OPEN_EXISTS });
      expect(orderGroupsService.transitionFulfillmentStatus).not.toHaveBeenCalled();
    });

    it('phiếu requested cũ vẫn duyệt được từ delivered, không cần tạo lại phiếu', async () => {
      const request = rma({ items: allItems }) as unknown as ReturnRequestDocument;
      requests.push(request);
      await service.approve(request._id.toString(), request.__v, 'owner-1');
      expect(request.status).toBe(ReturnStatus.AWAITING_RECEIPT);
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.RETURNED);
    });

    it('kiểm lại phiếu đã đóng hoặc gửi version cũ không nhập tồn lần hai', async () => {
      let request = await service.createSimulated(createDto(allItems), 'admin-1');
      request = await service.approve(request._id.toString(), request.__v, 'owner-1');
      request = await service.receive(request._id.toString(), request.__v, 'wh-1');
      const stale = inspection(request);
      stale.expected_version -= 1;
      await expect(service.inspect(request._id.toString(), stale, 'wh-1')).rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.STATE_CONFLICT });
      expect(warehouseService.restockReturnedItem).not.toHaveBeenCalled();
      await service.inspect(request._id.toString(), inspection(request), 'wh-1');
      warehouseService.restockReturnedItem.mockClear();
      await expect(service.inspect(request._id.toString(), inspection(request), 'wh-1')).rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.INVALID_STATUS });
      expect(warehouseService.restockReturnedItem).not.toHaveBeenCalled();
    });

    it('nhập tồn thất bại không đóng phiếu hoặc hủy nhóm; các ghi tồn dùng session của transaction', async () => {
      let request = await service.createSimulated(createDto(allItems), 'admin-1');
      request = await service.approve(request._id.toString(), request.__v, 'owner-1');
      request = await service.receive(request._id.toString(), request.__v, 'wh-1');
      warehouseService.restockReturnedItem.mockRejectedValueOnce(new Error('Lỗi nhập tồn'));
      await expect(service.inspect(request._id.toString(), inspection(request), 'wh-1')).rejects.toThrow('Lỗi nhập tồn');
      expect(request.status).toBe(ReturnStatus.RECEIVED);
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.RETURNED);
      expect(warehouseService.restockReturnedItem).toHaveBeenCalledWith(expect.anything(), session);
    });

    it.each([GroupFulfillmentStatus.DELIVERED, GroupFulfillmentStatus.RETURNED])('phiếu received cũ, nhóm %s, vẫn kiểm và kết thúc được', async (status) => {
      group.fulfillment_status = status;
      const request = rma({ status: ReturnStatus.RECEIVED, items: allItems }) as unknown as ReturnRequestDocument;
      requests.push(request);
      await service.inspect(request._id.toString(), inspection(request, InspectionResult.DISCARD), 'wh-1');
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.CANCELED);
      expect(warehouseService.restockReturnedItem).not.toHaveBeenCalled();
    });

    it('kiểm đủ nhóm có hàng cách ly/loại bỏ vẫn kết thúc; chỉ dòng đạt được cộng tồn bán', async () => {
      group.fulfillment_status = GroupFulfillmentStatus.RETURNED;
      const request = rma({ status: ReturnStatus.RECEIVED, items: allItems }) as unknown as ReturnRequestDocument;
      requests.push(request);
      await service.inspect(request._id.toString(), {
        expected_version: 0,
        lines: [
          { seller_sku: 'A', quantity: 1, result: InspectionResult.RESTOCK, warehouse_id: whId, bin_location_id: binId },
          { seller_sku: 'A', quantity: 1, result: InspectionResult.QUARANTINE },
          { seller_sku: 'B', quantity: 1, result: InspectionResult.DISCARD },
        ],
      }, 'wh-1');
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.CANCELED);
      expect(warehouseService.restockReturnedItem).toHaveBeenCalledTimes(1);
    });

    it('chỉ hoàn tiền: duyệt đóng phiếu, nhóm vẫn delivered và không đi qua kho', async () => {
      let request = await service.createSimulated({
        order_group_id: groupId.toString(), type: ReturnType.REFUND_ONLY,
        items: allItems.map((item) => ({ ...item, reason_code: ReturnReason.DEFECTIVE })),
      }, 'admin-1');
      request = await service.approve(request._id.toString(), request.__v, 'owner-1');
      expect(request.status).toBe(ReturnStatus.CLOSED);
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.DELIVERED);
      expect(orderGroupsService.transitionFulfillmentStatus).not.toHaveBeenCalled();
      expect(warehouseService.restockReturnedItem).not.toHaveBeenCalled();
    });

    it.each([ReturnType.EXCHANGE, ReturnType.FAILED_DELIVERY])('kiểm hàng %s giữ nhóm returned theo luồng cũ', async (type) => {
      group.fulfillment_status = GroupFulfillmentStatus.RETURNED;
      const request = rma({ type, source: type === ReturnType.FAILED_DELIVERY ? 'failed_delivery' : 'simulated', status: ReturnStatus.RECEIVED, items: allItems }) as unknown as ReturnRequestDocument;
      requests.push(request);
      jest.spyOn(service, 'createReplacement').mockResolvedValue(request);
      await service.inspect(request._id.toString(), inspection(request), 'wh-1');
      expect(request.status).toBe(ReturnStatus.CLOSED);
      expect(group.fulfillment_status).toBe(GroupFulfillmentStatus.RETURNED);
      expect(orderGroupsService.transitionFulfillmentStatus).not.toHaveBeenCalled();
    });
  });

  describe('Hàng cách ly', () => {
    const withQuarantine = (disposition: string | undefined): Record<string, unknown> =>
      rma({ status: ReturnStatus.CLOSED, closed_at: new Date(), inspection: [{ seller_sku: 'A', quantity: 1, result: InspectionResult.RESTOCK }, { seller_sku: 'A', quantity: 1, result: InspectionResult.QUARANTINE, note: 'Nghi lỗi', disposition }] });

    it('danh sách chỉ gồm dòng cách ly CHỜ XỬ LÝ (kể cả dữ liệu cũ không có trạng thái)', async () => {
      returnModel.find.mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([withQuarantine(undefined), withQuarantine('discarded')]) }) });
      const list = await service.listQuarantine();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ lineIndex: 1, sellerSku: 'A', quantity: 1 });
    });

    it('xử lý "nhập lại" -> cộng tồn qua sổ cái + đánh dấu restocked; xử lý lần 2 -> 409', async () => {
      returnModel.findById.mockResolvedValue(withQuarantine('pending'));
      returnModel.findOneAndUpdate.mockResolvedValue(withQuarantine('restocked'));
      await service.resolveQuarantine(rmaId.toString(), 1, { action: 'restock', warehouse_id: whId, bin_location_id: binId }, 'wh-1');
      expect(warehouseService.restockReturnedItem).toHaveBeenCalledWith(expect.objectContaining({ sellerSku: 'A', quantity: 1 }), expect.anything());

      returnModel.findById.mockResolvedValue(withQuarantine('restocked'));
      await expect(service.resolveQuarantine(rmaId.toString(), 1, { action: 'discard' }, 'wh-1')).rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.QUARANTINE_ALREADY_RESOLVED });
    });

    it('dòng không phải cách ly -> 404 RMA_QUARANTINE_LINE_NOT_FOUND', async () => {
      returnModel.findById.mockResolvedValue(withQuarantine('pending'));
      await expect(service.resolveQuarantine(rmaId.toString(), 0, { action: 'discard' }, 'wh-1')).rejects.toMatchObject({ errorCode: RETURN_ERROR_CODES.QUARANTINE_LINE_NOT_FOUND });
    });
  });
});
