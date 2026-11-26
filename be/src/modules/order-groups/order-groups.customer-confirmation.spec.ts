import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { OrderGroupsService } from './order-groups.service';
import { OrderGroupPickingService } from './order-group-picking.service';
import { GroupFulfillmentStatus } from './enums/group-fulfillment-status.enum';
import { OrderStatus } from '../orders/enums/order-status.enum';

//!=============================================
// 27/11/2026 — giao thiếu đơn AURELLE chờ khách xác nhận (24 giờ) + báo "chờ bổ sung hàng" khi lấy lại.
//!=============================================
function lean<T>(value: T): { select: () => { lean: () => Promise<T> }; lean: () => Promise<T> } {
  return { select: () => ({ lean: () => Promise.resolve(value) }), lean: () => Promise.resolve(value) };
}

describe('OrderGroupsService.resolveCustomerConfirmation (27/11/2026)', () => {
  const groupId = new Types.ObjectId();
  const o1 = new Types.ObjectId();
  const o2 = new Types.ObjectId();
  const requested = new Date('2026-11-27T03:00:00Z');
  const deadline = new Date('2026-11-28T03:00:00Z');
  let service: OrderGroupsService;
  let orders: { _id: Types.ObjectId; status: string; short_ship_decision?: string | null }[];
  let transition: jest.Mock;
  let groupUpdate: jest.Mock;
  let orderUpdateMany: jest.Mock;

  function build(status = GroupFulfillmentStatus.PARTIAL_NEEDS_REVIEW): void {
    transition = jest.fn().mockResolvedValue({});
    groupUpdate = jest.fn().mockResolvedValue({});
    orderUpdateMany = jest.fn().mockResolvedValue({});
    service = Object.create(OrderGroupsService.prototype) as OrderGroupsService;
    Object.assign(service, {
      logger: new Logger('test'),
      orderGroupModel: {
        findById: jest.fn().mockResolvedValue({
          _id: groupId,
          __v: 7,
          fulfillment_status: status,
          customer_confirmation: { order_ids: [o1, o2], requested_at: requested, deadline_at: deadline },
        }),
        updateOne: groupUpdate,
      },
      orderModel: {
        find: jest.fn(() => lean(orders)),
        exists: jest.fn().mockResolvedValue({ _id: o1 }),
        updateMany: orderUpdateMany,
      },
      activityLogModel: { create: jest.fn().mockResolvedValue({}) },
      transitionFulfillmentStatus: transition,
    });
  }

  it('còn khách chưa trả lời, chưa quá hạn → chưa mở khóa', async () => {
    orders = [{ _id: o1, status: OrderStatus.PENDING, short_ship_decision: 'accepted' }, { _id: o2, status: OrderStatus.PENDING, short_ship_decision: 'pending' }];
    build();
    await expect(service.resolveCustomerConfirmation(groupId.toString(), new Date('2026-11-27T10:00:00Z'))).resolves.toBe(false);
    expect(transition).not.toHaveBeenCalled();
  });

  it('1 đồng ý + 1 hủy → sang picked, xoá customer_confirmation', async () => {
    orders = [{ _id: o1, status: OrderStatus.PENDING, short_ship_decision: 'accepted' }, { _id: o2, status: OrderStatus.CANCELED }];
    build();
    await expect(service.resolveCustomerConfirmation(groupId.toString(), new Date('2026-11-27T10:00:00Z'))).resolves.toBe(true);
    expect(transition).toHaveBeenCalledWith(groupId.toString(), GroupFulfillmentStatus.PICKED, 7);
    expect(groupUpdate).toHaveBeenCalledWith({ _id: groupId }, { $set: { customer_confirmation: null } });
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it('quá 24 giờ không trả lời → tự giao phần có sẵn, đơn chưa trả lời ghi accepted', async () => {
    orders = [{ _id: o1, status: OrderStatus.PENDING, short_ship_decision: 'pending' }, { _id: o2, status: OrderStatus.PENDING, short_ship_decision: 'pending' }];
    build();
    await expect(service.resolveCustomerConfirmation(groupId.toString(), new Date('2026-11-28T03:00:01Z'))).resolves.toBe(true);
    expect(transition).toHaveBeenCalled();
    expect(orderUpdateMany).toHaveBeenCalledWith({ _id: { $in: [o1, o2] } }, { $set: { short_ship_decision: 'accepted' } });
  });

  it('nhóm không còn chờ (kho đã lấy lại) → không làm gì', async () => {
    orders = [];
    build(GroupFulfillmentStatus.PICKING);
    await expect(service.resolveCustomerConfirmation(groupId.toString())).resolves.toBe(false);
    expect(transition).not.toHaveBeenCalled();
  });
});

describe('OrderGroupPickingService.allocateBackorder (27/11/2026)', () => {
  it('chia phần thiếu cho đơn MỚI nhất trước; SKU đủ hàng không báo', () => {
    const orders = [
      { _id: 'old', items: [{ sku: 'A', quantity: 2 }] },
      { _id: 'new', items: [{ sku: 'A', quantity: 1 }, { sku: 'B', quantity: 1 }] },
    ];
    expect(OrderGroupPickingService.allocateBackorder(orders, [{ sku: 'A', shortage: 2 }, { sku: 'B', shortage: 0 }])).toEqual([
      { orderId: 'new', items: [{ sku: 'A', missing_quantity: 1 }] },
      { orderId: 'old', items: [{ sku: 'A', missing_quantity: 1 }] },
    ]);
  });

  it('bỏ dòng đã hủy; không thiếu → rỗng', () => {
    const orders = [{ _id: 'o', items: [{ sku: 'A', quantity: 1, status: 'canceled' }] }];
    expect(OrderGroupPickingService.allocateBackorder(orders, [{ sku: 'A', shortage: 1 }])).toEqual([]);
    expect(OrderGroupPickingService.allocateBackorder(orders, [])).toEqual([]);
  });
});
