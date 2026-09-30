import { Types } from 'mongoose';
import { OrderGroupsService } from './order-groups.service';
import {
  NOT_PACKABLE_ORDER_STATUSES,
  OrderStatus,
} from '../orders/enums/order-status.enum';
import {
  buildOrderGroupResponse,
  buildOrderGroupResponses,
} from './order-groups.controller';
import { OrderGroupDocument } from './schemas/order-group.schema';

//!=============================================
// 01/10/2026 — Danh sách nhóm đơn trả thêm activeOrderCount / canceledOrderCount
// (yêu cầu FE: phân biệt nhóm bình thường / hủy một phần / hủy hết ngay trên
// danh sách, không phải mở từng Picking List). Đếm lúc đọc từ `orders`, 1 truy
// vấn cho cả danh sách.
//!=============================================
interface Stage {
  $match?: Record<string, unknown>;
  $group?: {
    active: { $sum: { $cond: unknown[] } };
    canceled: { $sum: { $cond: unknown[] } };
  };
}

describe('OrderGroupsService — getOrderCountsForGroups + response nhóm đơn', () => {
  let service: OrderGroupsService;
  let orderModel: { aggregate: jest.Mock };

  const g1 = new Types.ObjectId();
  const g2 = new Types.ObjectId();
  const g3 = new Types.ObjectId();

  beforeEach(() => {
    orderModel = { aggregate: jest.fn() };
    service = new OrderGroupsService(
      {} as never, // orderGroupModel
      orderModel as never,
      {} as never, // productMasterModel
      {} as never, // skuBinAssignmentModel
      {} as never, // pickEventModel
      {} as never, // userModel
      {} as never, // notificationsService
      {} as never, // staffAssignmentService
      {} as never, // inventoryMovementModel
      {} as never, // mappingModel
      {} as never, // stockReservationService
    );
  });

  function pipelineOfFirstCall(): Stage[] {
    const calls = orderModel.aggregate.mock.calls as Stage[][][];
    return calls[0]?.[0] ?? [];
  }

  function groupDoc(
    id: Types.ObjectId,
    orderCount: number,
  ): OrderGroupDocument {
    return {
      _id: id,
      platform: 'lazada',
      shop_id: 'shop-1',
      order_count: orderCount,
      fulfillment_status: 'picking',
      order_priority: 'normal',
      packaging_deadline: null,
      is_overdue: false,
      __v: 0,
    } as unknown as OrderGroupDocument;
  }

  it('1 truy vấn aggregation cho cả danh sách, lọc đúng theo các nhóm được hỏi', async () => {
    orderModel.aggregate.mockResolvedValue([]);

    await service.getOrderCountsForGroups([g1, g2]);

    expect(orderModel.aggregate).toHaveBeenCalledTimes(1);
    const pipeline = pipelineOfFirstCall();
    expect(pipeline[0]).toEqual({
      $match: { consolidated_group_id: { $in: [g1, g2] } },
    });
  });

  it('không thêm is_consolidated vào điều kiện lọc (nhóm 1 đơn có is_consolidated=false vẫn phải được đếm)', async () => {
    orderModel.aggregate.mockResolvedValue([]);

    await service.getOrderCountsForGroups([g1]);

    const pipeline = pipelineOfFirstCall();
    expect(pipeline[0]?.$match).not.toHaveProperty('is_consolidated');
  });

  it('đơn còn hiệu lực dùng đúng danh sách NOT_PACKABLE_ORDER_STATUSES của Picking List; đơn hủy = status canceled', async () => {
    orderModel.aggregate.mockResolvedValue([]);

    await service.getOrderCountsForGroups([g1]);

    const group = pipelineOfFirstCall()[1]?.$group;
    expect(group?.active.$sum.$cond[0]).toEqual({
      $in: ['$status', NOT_PACKABLE_ORDER_STATUSES],
    });
    expect(group?.canceled.$sum.$cond[0]).toEqual({
      $eq: ['$status', OrderStatus.CANCELED],
    });
  });

  it('danh sách rỗng -> không truy vấn DB', async () => {
    const result = await service.getOrderCountsForGroups([]);

    expect(result.size).toBe(0);
    expect(orderModel.aggregate).not.toHaveBeenCalled();
  });

  it('buildOrderGroupResponses: gắn đúng số đếm cho từng nhóm (bình thường / hủy một phần / hủy hết)', async () => {
    orderModel.aggregate.mockResolvedValue([
      { _id: g1, active: 2, canceled: 0 },
      { _id: g2, active: 1, canceled: 1 },
      { _id: g3, active: 0, canceled: 2 },
    ]);

    const res = await buildOrderGroupResponses(service, [
      groupDoc(g1, 2),
      groupDoc(g2, 2),
      groupDoc(g3, 2),
    ]);

    expect(orderModel.aggregate).toHaveBeenCalledTimes(1);
    expect(
      res.map((r) => [r.orderCount, r.activeOrderCount, r.canceledOrderCount]),
    ).toEqual([
      [2, 2, 0],
      [2, 1, 1],
      [2, 0, 2],
    ]);
  });

  it('buildOrderGroupResponse: nhóm không có đơn nào trong kết quả đếm -> 0/0, không lỗi', async () => {
    orderModel.aggregate.mockResolvedValue([]);

    const res = await buildOrderGroupResponse(service, groupDoc(g1, 1));

    expect(res.activeOrderCount).toBe(0);
    expect(res.canceledOrderCount).toBe(0);
    expect(res.id).toBe(g1.toString());
  });

  describe('bản lưu sẵn trên order_groups (refreshOrderCounts)', () => {
    let groupModel: { updateOne: jest.Mock; findById: jest.Mock };
    let countDocuments: jest.Mock;

    beforeEach(() => {
      groupModel = {
        updateOne: jest.fn().mockResolvedValue({}),
        findById: jest.fn(),
      };
      countDocuments = jest.fn();
      service = new OrderGroupsService(
        groupModel as never,
        { aggregate: orderModel.aggregate, countDocuments } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
    });

    it('ghi active/canceled + thời điểm bằng updateOne (không save -> không tăng __v)', async () => {
      orderModel.aggregate.mockResolvedValue([
        { _id: g1, active: 1, canceled: 1 },
      ]);

      await service.refreshOrderCounts(g1);

      expect(groupModel.updateOne).toHaveBeenCalledWith(
        { _id: g1 },
        {
          $set: expect.objectContaining({
            active_order_count: 1,
            canceled_order_count: 1,
          }) as unknown,
        },
      );
    });

    it('nhóm không còn đơn nào -> ghi 0/0', async () => {
      orderModel.aggregate.mockResolvedValue([]);

      await service.refreshOrderCounts(g1);

      expect(groupModel.updateOne).toHaveBeenCalledWith(
        { _id: g1 },
        {
          $set: expect.objectContaining({
            active_order_count: 0,
            canceled_order_count: 0,
          }) as unknown,
        },
      );
    });

    it('lỗi DB khi đếm -> không ném lỗi (không chặn đồng bộ)', async () => {
      orderModel.aggregate.mockRejectedValue(new Error('db down'));

      await expect(service.refreshOrderCounts(g1)).resolves.toBeUndefined();
      expect(groupModel.updateOne).not.toHaveBeenCalled();
    });

    it('getOrCreateGroupForOrder (đồng bộ chạm tới nhóm đã có) -> tính lại bản lưu sẵn', async () => {
      const existing = { _id: g2, order_count: 2 };
      groupModel.findById.mockResolvedValue(existing);
      countDocuments.mockResolvedValue(2); // số đơn không đổi -> không giữ chỗ lại
      orderModel.aggregate.mockResolvedValue([
        { _id: g2, active: 1, canceled: 1 },
      ]);

      const result = await service.getOrCreateGroupForOrder({
        consolidated_group_id: g2,
      } as never);

      expect(result).toBe(existing);
      expect(groupModel.updateOne).toHaveBeenCalledWith(
        { _id: g2 },
        {
          $set: expect.objectContaining({
            active_order_count: 1,
            canceled_order_count: 1,
          }) as unknown,
        },
      );
    });
  });
});
