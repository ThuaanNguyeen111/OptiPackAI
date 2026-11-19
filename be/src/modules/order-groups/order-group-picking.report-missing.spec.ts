import { Types } from 'mongoose';
import { OrderGroupPickingService } from './order-group-picking.service';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';
import { ORD_GROUP_ERROR_CODES } from './order-groups.errors';

//!=============================================
// AOFP-329 (19/11/2026) — báo thiếu hàng: kiểm SKU + số thiếu, lưu báo cáo lên nhóm, ghi nhật ký.
//!=============================================
describe('OrderGroupPickingService.reportMissing — AOFP-329', () => {
  const groupId = new Types.ObjectId();
  const reporterId = new Types.ObjectId().toString();
  const warehouseId = new Types.ObjectId().toString();
  let core: Record<'loadGroupOrThrow' | 'getOrderedSkuQuantities' | 'getPickedSkuQuantities' | 'transitionFulfillmentStatus', jest.Mock>;
  let orderGroupModel: { updateOne: jest.Mock };
  let activityLogModel: { create: jest.Mock };
  let notify: jest.Mock;
  let service: OrderGroupPickingService;

  beforeEach(() => {
    const group = { _id: groupId, pick_round: 2, set: jest.fn() };
    core = {
      loadGroupOrThrow: jest.fn().mockResolvedValue(group),
      getOrderedSkuQuantities: jest.fn().mockResolvedValue(new Map([['AO-M', 5]])),
      getPickedSkuQuantities: jest.fn().mockResolvedValue(new Map([['AO-M', 3]])),
      transitionFulfillmentStatus: jest.fn().mockResolvedValue(group),
    };
    orderGroupModel = { updateOne: jest.fn().mockResolvedValue({}) };
    activityLogModel = { create: jest.fn().mockResolvedValue([{}]) };
    notify = jest.fn().mockResolvedValue({});
    const session = { withTransaction: jest.fn(async (fn: () => Promise<unknown>) => fn()), endSession: jest.fn() };
    service = new OrderGroupPickingService(
      orderGroupModel as never,
      {} as never,
      {} as never,
      {} as never,
      { findById: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ name: 'Minh' }) }) })) } as never,
      { notify, buildMissingItemMessage: jest.fn(() => ({ title: 't', message: 'm' })) } as never,
      { startSession: jest.fn().mockResolvedValue(session) } as never,
      {} as never,
      {} as never,
      {} as never,
      core as never,
      undefined,
      undefined,
      activityLogModel as never,
    );
  });

  it('AC1: báo thiếu 2 → nhóm partial_needs_review, lưu {sku, qty, note, reporter, at} cùng transaction, ghi nhật ký', async () => {
    await service.reportMissing(groupId.toString(), reporterId, 'AO-M', 2, 7, '  Kệ trống  ', warehouseId);

    expect(core.transitionFulfillmentStatus).toHaveBeenCalledWith(groupId.toString(), GroupFulfillmentStatus.PARTIAL_NEEDS_REVIEW, 7, expect.anything());
    const [filter, update, opts] = orderGroupModel.updateOne.mock.calls[0] as [unknown, { $set: { missing_report: Record<string, unknown> } }, { session?: unknown }];
    expect(filter).toEqual({ _id: groupId });
    expect(opts.session).toBeDefined();
    expect(update.$set.missing_report).toMatchObject({
      sku: 'AO-M', quantity: 2, still_needed: 2, ordered: 5, note: 'Kệ trống', reporter_name: 'Minh', pick_round: 2,
    });
    expect(String(update.$set.missing_report.reporter_id)).toBe(reporterId);
    expect(String(update.$set.missing_report.warehouse_id)).toBe(warehouseId);
    expect(update.$set.missing_report.at).toBeInstanceOf(Date);
    const [[entry]] = activityLogModel.create.mock.calls[0] as [[Record<string, unknown>]];
    expect(entry).toMatchObject({ action: 'order_group.missing_reported', actor_id: reporterId });
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('AC2: SKU không thuộc nhóm → 400, nhóm giữ nguyên', async () => {
    await expect(service.reportMissing(groupId.toString(), reporterId, 'LA', 1, 7)).rejects.toMatchObject({
      errorCode: ORD_GROUP_ERROR_CODES.MISSING_REPORT_INVALID,
      status: 400,
    });
    expect(core.transitionFulfillmentStatus).not.toHaveBeenCalled();
  });

  it('AC2: thiếu vượt số còn cần (đặt 5, đã lấy 3, báo thiếu 3) → 400', async () => {
    await expect(service.reportMissing(groupId.toString(), reporterId, 'AO-M', 3, 7)).rejects.toMatchObject({
      errorCode: ORD_GROUP_ERROR_CODES.MISSING_REPORT_INVALID,
      status: 400,
    });
    expect(orderGroupModel.updateOne).not.toHaveBeenCalled();
  });
});
