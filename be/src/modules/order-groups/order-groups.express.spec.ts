import { Types } from 'mongoose';
import { EXPRESS_PINNED_EXCLUDED_STATUSES, OrderGroupsService, expressGroupFields } from './order-groups.service';
import { ORD_GROUP_ERROR_CODES } from './order-groups.errors';
import { deliveryOptionOf } from '../orders/mappers/lazada-order.mapper';
import { expressConsolidationKey } from '../orders/utils/consolidation-key.util';

//!=============================================
// 29/10/2026 — Đơn GIAO HỎA TỐC từ AURELLE: nhóm riêng, hạn đóng gói = giờ hẹn − 2 giờ,
// hạn giao = giờ hẹn khách, ghim đầu danh sách, không gộp tay, không đổi mức ưu tiên tay.
//!=============================================
interface Chain { select: jest.Mock<Chain>; sort: jest.Mock<Chain>; limit: jest.Mock<Chain>; lean: jest.Mock<Promise<unknown>> }
function chain(value: unknown): Chain {
  const self: Chain = { select: jest.fn(() => self), sort: jest.fn(() => self), limit: jest.fn(() => self), lean: jest.fn(() => Promise.resolve(value)) };
  return self;
}
function makeService(groupModel: Record<string, unknown>): OrderGroupsService {
  const rest = Array.from({ length: 13 }, () => ({}) as never) as [never, never, never, never, never, never, never, never, never, never, never, never, never];
  return new OrderGroupsService(groupModel as never, ...rest);
}

describe('Đơn hỏa tốc AURELLE → nhóm đơn', () => {
  const promised = new Date('2026-10-29T05:00:00.000Z'); // đặt 9:00 VN, hẹn 12:00

  it('Open API: express + giờ hẹn hợp lệ → hỏa tốc; thiếu / sai giờ hẹn → giao thường', () => {
    expect(deliveryOptionOf({ delivery_option: 'express', promised_delivery_time: promised.toISOString() })).toEqual({ delivery_option: 'express', promised_delivery_at: promised });
    expect(deliveryOptionOf({ delivery_option: 'express' })).toEqual({ delivery_option: 'standard', promised_delivery_at: null });
    expect(deliveryOptionOf({ delivery_option: 'express', promised_delivery_time: 'abc' })).toEqual({ delivery_option: 'standard', promised_delivery_at: null });
    expect(deliveryOptionOf({})).toEqual({ delivery_option: 'standard', promised_delivery_at: null });
  });

  it('khoá gộp riêng từng đơn (không tự gộp), khác nhau giữa 2 đơn', () => {
    expect(expressConsolidationKey('aurelle', 'S1:720000001')).not.toBe(expressConsolidationKey('aurelle', 'S1:720000002'));
  });

  it('nhóm tạo ra: hỏa tốc, tự giao, hạn giao = giờ hẹn, hạn đóng gói = giờ hẹn − 2 giờ (= giờ đặt + 1 giờ)', () => {
    expect(expressGroupFields({ delivery_option: 'express', promised_delivery_at: promised })).toEqual({
      order_priority: 'express',
      requires_self_delivery: true,
      delivery_deadline: promised,
      packaging_deadline: new Date('2026-10-29T03:00:00.000Z'),
      is_overdue: false,
    });
    expect(expressGroupFields({ delivery_option: 'standard', promised_delivery_at: null })).toEqual({});
  });

  it('danh sách: nhóm hỏa tốc còn xử lý ghim đầu trang đầu, không lặp ở phần thường; trang sau không ghim', async () => {
    const normalA = { _id: new Types.ObjectId(), order_priority: 'normal' };
    const express = { _id: new Types.ObjectId(), order_priority: 'express' };
    const find = jest.fn()
      .mockReturnValueOnce(chain([normalA, express]))
      .mockReturnValueOnce(chain([express]));
    const service = makeService({ find });
    const rows = await service.listOrderGroups({});
    expect(rows.map((g) => g._id)).toEqual([express._id, normalA._id]);
    expect((find.mock.calls as unknown[][])[1]?.[0]).toEqual({ order_priority: 'express', fulfillment_status: { $nin: EXPRESS_PINNED_EXCLUDED_STATUSES } });

    const page2 = jest.fn().mockReturnValueOnce(chain([normalA]));
    await makeService({ find: page2 }).listOrderGroups({ before: new Date() });
    expect(page2).toHaveBeenCalledTimes(1);
  });

  it('gộp tay nhóm hỏa tốc → 409 ORD_GROUP_MERGE_EXPRESS', async () => {
    const a = new Types.ObjectId();
    const b = new Types.ObjectId();
    const findById = jest.fn((id: Types.ObjectId) => Promise.resolve({ _id: id, platform: 'aurelle', shop_id: 'S1', __v: 0, requires_self_delivery: String(id) === String(b) }));
    const service = makeService({ findById });
    await expect(service.mergeGroups(a.toString(), b.toString(), 0, 'gộp thử', 'u1')).rejects.toMatchObject({ errorCode: ORD_GROUP_ERROR_CODES.MERGE_EXPRESS });
  });

  it('đổi mức ưu tiên nhóm hỏa tốc khách đã trả phí → 409 ORD_GROUP_PRIORITY_LOCKED', async () => {
    const service = makeService({ findById: jest.fn(() => chain({ requires_self_delivery: true })) });
    await expect(service.setPriority(new Types.ObjectId().toString(), 'normal')).rejects.toMatchObject({ errorCode: ORD_GROUP_ERROR_CODES.PRIORITY_LOCKED });
  });
});
