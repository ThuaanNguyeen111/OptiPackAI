import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app-exception';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import type { MarketplaceReturnRaw } from '../marketplace-integration/interfaces/marketplace-adapter.interface';
import { GroupFulfillmentStatus } from '../order-groups/enums/group-fulfillment-status.enum';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { ReturnReason, ReturnStatus, ReturnType } from './enums/return.enums';
import { ReturnsService } from './returns.service';

//!=============================================
// 20/10/2026 — Trả hàng do KHÁCH gửi trên sàn (AURELLE): đổi yêu cầu của sàn thành phiếu RMA
// theo ĐƠN gốc của khách, và báo ngược kết quả xử lý cho khách qua hàng đợi.
//!=============================================
describe('ReturnsService — trả hàng của khách trên sàn', () => {
  const groupId = new Types.ObjectId();
  const orderId = new Types.ObjectId();
  const rmaId = new Types.ObjectId();

  const raw = (overrides: Partial<MarketplaceReturnRaw> = {}): MarketplaceReturnRaw => ({
    return_id: 'sf-ret-1',
    order_id: 720000001,
    type: 'return_refund',
    status: 'requested',
    customer_note: 'Chật quá',
    rma_code: null,
    items: [{ seller_sku: 'ATD-M', quantity: 1, reason_code: 'size_not_fit' }],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  });

  const orderDoc = {
    _id: orderId,
    consolidated_group_id: groupId,
    items: [
      { sku: 'ATD-M', quantity: 1, status: OrderStatus.DELIVERED },
      { sku: 'ATD-M', quantity: 1, status: OrderStatus.DELIVERED },
      { sku: 'HUY-1', quantity: 5, status: OrderStatus.CANCELED },
    ],
  };

  let returnModel: Record<'findById' | 'exists' | 'create' | 'findOneAndUpdate' | 'find' | 'findOne', jest.Mock>;
  let orderModel: { findOne: jest.Mock };
  let orderGroupsService: Record<'findOrderGroupById' | 'getPackableItemsForGroup' | 'transitionFulfillmentStatus', jest.Mock>;
  let outboxUpdate: jest.Mock<Promise<object>, [Record<string, unknown>, { $setOnInsert: Record<string, unknown> }]>;
  let session: { withTransaction: jest.Mock; endSession: jest.Mock };
  let service: ReturnsService;

  const lean = <T,>(value: T) => ({ select: () => ({ lean: () => Promise.resolve(value) }) });

  beforeEach(() => {
    returnModel = {
      findById: jest.fn(),
      exists: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue([{ _id: rmaId, rma_code: 'RMA-1', type: ReturnType.RETURN_REFUND, source: 'marketplace', order_group_id: groupId, items: [] }]),
      findOneAndUpdate: jest.fn(),
      find: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve([]), session: () => ({ lean: () => Promise.resolve([]) }) }) })),
      findOne: jest.fn(),
    };
    orderModel = { findOne: jest.fn(() => lean(orderDoc)) };
    orderGroupsService = {
      findOrderGroupById: jest.fn().mockResolvedValue({ _id: groupId, fulfillment_status: GroupFulfillmentStatus.DELIVERED, platform: 'aurelle', shop_id: 'S1', __v: 3, updated_at: new Date() }),
      getPackableItemsForGroup: jest.fn().mockResolvedValue({ items: [{ sku: 'ATD-M', quantity: 2 }] }),
      transitionFulfillmentStatus: jest.fn().mockResolvedValue({}),
    };
    outboxUpdate = jest.fn<Promise<object>, [Record<string, unknown>, { $setOnInsert: Record<string, unknown> }]>().mockResolvedValue({});
    session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    service = new ReturnsService(
      returnModel as never,
      { findOne: jest.fn().mockResolvedValue({ delivered_at: new Date() }) } as never,
      orderGroupsService as never,
      {} as never,
      { startSession: jest.fn().mockResolvedValue(session) } as never,
      {} as never,
      { notify: jest.fn().mockResolvedValue({}) } as never,
      orderModel as never,
      {} as never,
      { find: jest.fn() } as never,
      { updateOne: outboxUpdate } as never,
    );
  });

  describe('createFromMarketplace', () => {
    it('đã có phiếu với id yêu cầu đó → exists (webhook và cron chạy trùng nhau vẫn an toàn)', async () => {
      returnModel.exists.mockResolvedValue({ _id: rmaId });
      expect(await service.createFromMarketplace(MarketplacePlatform.AURELLE, 'S1', raw())).toEqual({ outcome: 'exists' });
      expect(orderModel.findOne).not.toHaveBeenCalled();
    });

    it('đơn chưa về OptiPack / chưa vào nhóm → order_not_ready (lượt sau thử lại)', async () => {
      orderModel.findOne.mockReturnValue(lean(null));
      expect(await service.createFromMarketplace(MarketplacePlatform.AURELLE, 'S1', raw())).toEqual({ outcome: 'order_not_ready' });
      orderModel.findOne.mockReturnValue(lean({ ...orderDoc, consolidated_group_id: null }));
      expect(await service.createFromMarketplace(MarketplacePlatform.AURELLE, 'S1', raw())).toEqual({ outcome: 'order_not_ready' });
    });

    it('tạo phiếu nguồn marketplace, gắn đơn gốc + id yêu cầu của sàn, người tạo không phải nhân viên', async () => {
      const result = await service.createFromMarketplace(MarketplacePlatform.AURELLE, 'S1', raw());
      expect(result.outcome).toBe('created');
      const created = (returnModel.create.mock.calls[0] as [[Record<string, unknown>]])[0][0];
      expect(created).toMatchObject({
        source: 'marketplace',
        external_ref: 'sf-ret-1',
        status: ReturnStatus.REQUESTED,
        type: ReturnType.RETURN_REFUND,
        created_by: 'aurelle:sf-ret-1',
        customer_note: 'Chật quá',
      });
      expect(String(created.source_order_id)).toBe(orderId.toString());
    });

    it('số lượng được trả tính theo ĐƠN gốc: món đã hủy không tính, vượt số đã mua → từ chối', async () => {
      const over = await service.createFromMarketplace(
        MarketplacePlatform.AURELLE,
        'S1',
        raw({ items: [{ seller_sku: 'ATD-M', quantity: 3, reason_code: 'defective' }] }),
      );
      expect(over).toMatchObject({ outcome: 'rejected' });
      const cancelledSku = await service.createFromMarketplace(
        MarketplacePlatform.AURELLE,
        'S1',
        raw({ items: [{ seller_sku: 'HUY-1', quantity: 1, reason_code: 'defective' }] }),
      );
      expect(cancelledSku).toMatchObject({ outcome: 'rejected' });
      expect(returnModel.create).not.toHaveBeenCalled();
    });

    it('KHÔNG đọc hồ sơ đóng gói của cả nhóm khi kiểm số lượng (dùng đơn gốc)', async () => {
      await service.createFromMarketplace(MarketplacePlatform.AURELLE, 'S1', raw());
      // chỉ updateReturnGroup (so cả nhóm với phiếu) mới gọi — không phải bước kiểm số lượng trả
      const calls = orderGroupsService.getPackableItemsForGroup.mock.calls.length;
      expect(calls).toBeLessThanOrEqual(1);
    });

    it('nhóm chưa giao → rejected kèm lý do để khách không kẹt "đang chờ"', async () => {
      orderGroupsService.findOrderGroupById.mockResolvedValue({ _id: groupId, fulfillment_status: GroupFulfillmentStatus.SHIPPED });
      const result = await service.createFromMarketplace(MarketplacePlatform.AURELLE, 'S1', raw());
      expect(result).toMatchObject({ outcome: 'rejected' });
      expect((result as { reason: string }).reason).toContain('giao thành công');
    });

    it('nhóm đang có phiếu khác chưa xong → busy (giữ yêu cầu, lượt sau thử lại, KHÔNG từ chối)', async () => {
      returnModel.exists.mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: new Types.ObjectId() });
      const result = await service.createFromMarketplace(MarketplacePlatform.AURELLE, 'S1', raw());
      expect(result.outcome).toBe('busy');
    });

    it('2 luồng cùng tạo phiếu (E11000 trên external_ref) → exists, không lỗi', async () => {
      returnModel.create.mockRejectedValue({ code: 11000 });
      expect(await service.createFromMarketplace(MarketplacePlatform.AURELLE, 'S1', raw())).toEqual({ outcome: 'exists' });
    });

    it('lỗi khác (dữ liệu/hạ tầng) KHÔNG bị coi là từ chối — ném ra để thử lại', async () => {
      orderGroupsService.findOrderGroupById.mockRejectedValue(new AppException('ORD_GROUP_NOT_FOUND', 'không có nhóm', HttpStatus.NOT_FOUND));
      await expect(service.createFromMarketplace(MarketplacePlatform.AURELLE, 'S1', raw())).rejects.toBeInstanceOf(AppException);
    });

    it('21/10/2026 — phiếu mở tính theo ĐƠN: chỉ chặn phiếu mở của chính đơn đó (hoặc phiếu chung của nhóm)', async () => {
      await service.createFromMarketplace(MarketplacePlatform.AURELLE, 'S1', raw());
      const openQuery = (returnModel.exists.mock.calls as [Record<string, unknown>][])[1]?.[0];
      expect(openQuery?.source_order_id).toEqual({ $in: [orderId, null] });
    });

    it('2 lần tạo đồng thời đụng index phiếu mở (E11000 trên order_group_id) → busy, không coi là đã có', async () => {
      returnModel.create.mockRejectedValue({ code: 11000, keyPattern: { order_group_id: 1, source_order_id: 1 } });
      expect((await service.createFromMarketplace(MarketplacePlatform.AURELLE, 'S1', raw())).outcome).toBe('busy');
    });

    it('21/10/2026 — đổi hàng từ website → phiếu exchange mang hàng đổi sang', async () => {
      const productMasterFind = jest.fn().mockReturnValue(lean([{ seller_sku: 'ATD-L' }]));
      (service as unknown as { productMasterModel: { find: jest.Mock } }).productMasterModel = { find: productMasterFind };
      const result = await service.createFromMarketplace(
        MarketplacePlatform.AURELLE,
        'S1',
        raw({ type: 'exchange', exchange_items: [{ seller_sku: 'ATD-L', quantity: 1 }] }),
      );
      expect(result.outcome).toBe('created');
      const created = (returnModel.create.mock.calls[0] as [[Record<string, unknown>]])[0][0];
      expect(created).toMatchObject({ type: ReturnType.EXCHANGE, exchange_items: [{ seller_sku: 'ATD-L', quantity: 1 }] });
    });

    it('đổi sang SKU shop không có → rejected kèm lý do (không treo yêu cầu)', async () => {
      (service as unknown as { productMasterModel: { find: jest.Mock } }).productMasterModel = { find: jest.fn().mockReturnValue(lean([])) };
      const result = await service.createFromMarketplace(
        MarketplacePlatform.AURELLE,
        'S1',
        raw({ type: 'exchange', exchange_items: [{ seller_sku: 'KHONG-CO', quantity: 1 }] }),
      );
      expect(result.outcome).toBe('rejected');
    });

    it('lý do lạ được chuyển thành "other"', async () => {
      await service.createFromMarketplace(MarketplacePlatform.AURELLE, 'S1', raw({ items: [{ seller_sku: 'ATD-M', quantity: 1, reason_code: 'kỳ-lạ' }] }));
      const created = (returnModel.create.mock.calls[0] as [[{ items: { reason_code: string }[] }]])[0][0];
      expect(created.items[0]?.reason_code).toBe(ReturnReason.OTHER);
    });
  });

  describe('báo ngược kết quả xử lý cho khách (outbox)', () => {
    const marketplaceRma = (over: Record<string, unknown> = {}) => ({
      _id: rmaId,
      order_group_id: groupId,
      status: ReturnStatus.REQUESTED,
      type: ReturnType.RETURN_REFUND,
      source: 'marketplace',
      platform: 'aurelle',
      shop_id: 'S1',
      items: [{ seller_sku: 'ATD-M', quantity: 1, reason_code: ReturnReason.SIZE_NOT_FIT }],
      created_by: 'aurelle:sf-ret-1',
      __v: 0,
      ...over,
    });

    it('duyệt phiếu của khách → xếp hàng báo "approved"', async () => {
      returnModel.findById.mockResolvedValue(marketplaceRma());
      returnModel.findOneAndUpdate.mockResolvedValue(marketplaceRma({ status: ReturnStatus.AWAITING_RECEIPT, __v: 1 }));
      await service.approve(rmaId.toString(), 0, 'owner-1', 'Đồng ý');
      const [filter, update] = outboxUpdate.mock.calls[0] ?? [];
      expect(filter?.idempotency_key).toBe(`ret:${rmaId.toString()}:approved:1`);
      expect(update?.$setOnInsert).toMatchObject({ kind: 'return_status', status: 'approved', note: 'Đồng ý' });
    });

    it('từ chối kèm lý do → báo "rejected" mang đúng lý do cho khách', async () => {
      returnModel.findById.mockResolvedValue(marketplaceRma());
      returnModel.findOneAndUpdate.mockResolvedValue(marketplaceRma({ status: ReturnStatus.REJECTED, __v: 1 }));
      await service.reject(rmaId.toString(), 0, 'owner-1', 'Hàng đã qua sử dụng');
      expect(outboxUpdate.mock.calls[0]?.[1].$setOnInsert).toMatchObject({ status: 'rejected', note: 'Hàng đã qua sử dụng' });
    });

    it('21/10/2026 — khách hủy trên website khi phiếu còn chờ duyệt → phiếu hủy, báo "canceled"', async () => {
      returnModel.findOne.mockResolvedValue(marketplaceRma());
      returnModel.findOneAndUpdate.mockResolvedValue(marketplaceRma({ status: ReturnStatus.CANCELED, __v: 1 }));
      expect(await service.cancelFromMarketplace(MarketplacePlatform.AURELLE, 'sf-ret-1')).toBe('canceled');
      const [filter, update] = returnModel.findOneAndUpdate.mock.calls[0] as [Record<string, unknown>, { $set: Record<string, unknown> }];
      expect(filter).toMatchObject({ status: ReturnStatus.REQUESTED });
      expect(update.$set).toMatchObject({ status: ReturnStatus.CANCELED, decided_by: 'aurelle:customer' });
      expect(outboxUpdate.mock.calls[0]?.[1].$setOnInsert).toMatchObject({ status: 'canceled' });
    });

    it('khách hủy khi phiếu đã duyệt nhưng hàng chưa về kho → vẫn hủy được', async () => {
      returnModel.findOne.mockResolvedValue(marketplaceRma({ status: ReturnStatus.AWAITING_RECEIPT }));
      returnModel.findOneAndUpdate.mockResolvedValue(marketplaceRma({ status: ReturnStatus.CANCELED, __v: 1 }));
      expect(await service.cancelFromMarketplace(MarketplacePlatform.AURELLE, 'sf-ret-1')).toBe('canceled');
    });

    it('hàng đã về kho → too_late (giữ phiếu); phiếu đã kết thúc → already_closed; không có → not_found', async () => {
      returnModel.findOne.mockResolvedValueOnce(marketplaceRma({ status: ReturnStatus.RECEIVED }));
      expect(await service.cancelFromMarketplace(MarketplacePlatform.AURELLE, 'sf-ret-1')).toBe('too_late');
      returnModel.findOne.mockResolvedValueOnce(marketplaceRma({ status: ReturnStatus.CLOSED }));
      expect(await service.cancelFromMarketplace(MarketplacePlatform.AURELLE, 'sf-ret-1')).toBe('already_closed');
      returnModel.findOne.mockResolvedValueOnce(null);
      expect(await service.cancelFromMarketplace(MarketplacePlatform.AURELLE, 'sf-ret-1')).toBe('not_found');
      expect(returnModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('phiếu Admin tạo (simulated) hoặc giao thất bại thì KHÔNG báo ngược', async () => {
      returnModel.findById.mockResolvedValue(marketplaceRma({ source: 'simulated', created_by: 'admin-1' }));
      returnModel.findOneAndUpdate.mockResolvedValue(marketplaceRma({ source: 'simulated', status: ReturnStatus.AWAITING_RECEIPT, __v: 1 }));
      await service.approve(rmaId.toString(), 0, 'owner-1');
      expect(outboxUpdate).not.toHaveBeenCalled();
    });
  });
});
