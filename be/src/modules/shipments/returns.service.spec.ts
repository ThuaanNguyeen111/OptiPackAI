import { Types } from 'mongoose';
import { ReturnsService } from './returns.service';
import { RETURN_ERROR_CODES } from './returns.errors';
import { InspectionResult, ReturnReason, ReturnStatus, ReturnType } from './enums/return.enums';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';

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

  let returnModel: { findById: jest.Mock; exists: jest.Mock; create: jest.Mock; findOneAndUpdate: jest.Mock };
  let shipmentModel: { findOne: jest.Mock };
  let orderGroupsService: { findOrderGroupById: jest.Mock; getPackableItemsForGroup: jest.Mock; transitionFulfillmentStatus: jest.Mock };
  let warehouseService: { restockReturnedItem: jest.Mock };
  let packagingMaterialsService: { recoverFromReturn: jest.Mock };
  let movementModel: { aggregate: jest.Mock };
  let service: ReturnsService;

  const rma = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    _id: rmaId, order_group_id: groupId, status: ReturnStatus.REQUESTED, type: ReturnType.RETURN_REFUND, platform: 'lazada', shop_id: 's1',
    items: [{ seller_sku: 'A', quantity: 2, reason_code: ReturnReason.DEFECTIVE }], created_by: 'admin-1', __v: 0, ...over,
  });

  beforeEach(() => {
    returnModel = { findById: jest.fn(), exists: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue([rma()]), findOneAndUpdate: jest.fn() };
    shipmentModel = { findOne: jest.fn().mockResolvedValue({ delivered_at: new Date() }) };
    orderGroupsService = {
      findOrderGroupById: jest.fn().mockResolvedValue({ _id: groupId, fulfillment_status: GroupFulfillmentStatus.DELIVERED, platform: 'lazada', shop_id: 's1', __v: 4, updated_at: new Date() }),
      getPackableItemsForGroup: jest.fn().mockResolvedValue({ items: [{ sku: 'A', quantity: 2 }, { sku: 'B', quantity: 1 }] }),
      transitionFulfillmentStatus: jest.fn().mockResolvedValue({}),
    };
    warehouseService = { restockReturnedItem: jest.fn().mockResolvedValue(undefined) };
    packagingMaterialsService = { recoverFromReturn: jest.fn().mockResolvedValue([]) };
    movementModel = { aggregate: jest.fn().mockResolvedValue([]) };
    const session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    service = new ReturnsService(returnModel as never, shipmentModel as never, orderGroupsService as never, warehouseService as never, { startSession: jest.fn().mockResolvedValue(session) } as never, packagingMaterialsService as never, movementModel as never);
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
});
