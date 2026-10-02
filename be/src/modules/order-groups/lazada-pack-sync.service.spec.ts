import { Types } from 'mongoose';
import { LazadaPackSyncService } from './lazada-pack-sync.service';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { ORD_GROUP_ERROR_CODES } from './order-groups.errors';

//!=============================================
// 02/10/2026 — báo "đã đóng gói" lên Lazada sau nút "pack" của OptiPack.
// Các tình huống: cầu dao tắt, nhóm không phải Lazada, đơn đổi hàng EXC-, đơn hủy,
// món đã packed sẵn, thành công / một phần / cả lô bị từ chối / lỗi mạng, gửi lại.
//!=============================================
describe('LazadaPackSyncService', () => {
  const groupId = new Types.ObjectId();
  let groupModel: { findById: jest.Mock; updateOne: jest.Mock };
  let orderModel: { find: jest.Mock };
  let adapter: { packOrders: jest.Mock };
  let marketplace: { getValidAccessToken: jest.Mock };
  let enabled: boolean;
  let service: LazadaPackSyncService;

  function mockGroup(doc: Record<string, unknown> | null): void {
    groupModel.findById.mockReturnValue({
      select: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue(doc) }),
    });
  }
  function mockOrders(orders: unknown[]): void {
    orderModel.find.mockReturnValue({
      select: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue(orders) }),
    });
  }
  function order(
    id: string,
    items: [string, OrderStatus][],
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      platform_order_id: id,
      origin: 'marketplace',
      items: items.map(([itemId, status]) => ({
        platform_order_item_id: itemId,
        status,
      })),
      ...extra,
    };
  }
  function savedSet(): Record<string, unknown> {
    const calls = groupModel.updateOne.mock.calls as [
      unknown,
      { $set: Record<string, unknown> },
    ][];
    return calls[calls.length - 1]?.[1].$set ?? {};
  }

  beforeEach(() => {
    enabled = true;
    groupModel = {
      findById: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    orderModel = { find: jest.fn() };
    adapter = { packOrders: jest.fn() };
    marketplace = { getValidAccessToken: jest.fn().mockResolvedValue('TOKEN') };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'marketplace.lazada.writeApisEnabled') return enabled;
        if (key === 'marketplace.lazada.shippingAllocateType') return 'TFS';
        return undefined;
      }),
    };
    service = new LazadaPackSyncService(
      groupModel as never,
      orderModel as never,
      adapter as never,
      marketplace as never,
      config as never,
    );
    mockGroup({ _id: groupId, platform: 'lazada', shop_id: 'shop-1' });
  });

  it('cầu dao tắt -> không gọi Lazada, ghi trạng thái "disabled"', async () => {
    enabled = false;
    mockOrders([order('111', [['11', OrderStatus.PENDING]])]);

    const res = await service.syncGroup(groupId.toString());

    expect(res.status).toBe('disabled');
    expect(adapter.packOrders).not.toHaveBeenCalled();
    expect(savedSet().lazada_pack_status).toBe('disabled');
  });

  it('nhóm không thuộc Lazada -> "skipped", không đọc đơn, không gọi Lazada', async () => {
    mockGroup({ _id: groupId, platform: 'aurelle', shop_id: 'shop-1' });

    const res = await service.syncGroup(groupId.toString());

    expect(res.status).toBe('skipped');
    expect(orderModel.find).not.toHaveBeenCalled();
    expect(adapter.packOrders).not.toHaveBeenCalled();
  });

  it('chỉ có đơn đổi hàng EXC- -> "skipped" (mã đơn không tồn tại trên Lazada)', async () => {
    mockOrders([
      order('EXC-RMA-1', [['EXC-RMA-1-1', OrderStatus.PENDING]], {
        origin: 'replacement',
      }),
    ]);

    const res = await service.syncGroup(groupId.toString());

    expect(res.status).toBe('skipped');
    expect(adapter.packOrders).not.toHaveBeenCalled();
  });

  it('truy vấn đơn loại bỏ đơn đã hủy / gặp sự cố', async () => {
    mockOrders([]);

    await service.syncGroup(groupId.toString());

    const filter = (orderModel.find.mock.calls as unknown[][])[0]?.[0] as {
      status: { $nin: OrderStatus[] };
    };
    expect(filter.status.$nin).toContain(OrderStatus.CANCELED);
  });

  it('thành công: gửi đúng món pending, delivery_type dropship + TFS, lưu package_id', async () => {
    mockOrders([
      order('111', [
        ['11', OrderStatus.PENDING],
        ['12', OrderStatus.TO_PACK],
      ]),
    ]);
    adapter.packOrders.mockResolvedValue({
      code: '0',
      result: {
        success: 'true',
        data: {
          pack_order_list: [
            {
              order_id: '111',
              order_item_list: [
                {
                  order_item_id: '11',
                  item_err_code: '0',
                  msg: 'success',
                  package_id: 'FP1',
                  tracking_number: 'T1',
                },
                {
                  order_item_id: 12,
                  item_err_code: 0,
                  msg: 'success',
                  package_id: 'FP1',
                },
              ],
            },
          ],
        },
      },
    });

    const res = await service.syncGroup(groupId.toString());

    expect(adapter.packOrders).toHaveBeenCalledWith('TOKEN', {
      pack_order_list: [{ order_id: 111, order_item_list: [11, 12] }],
      delivery_type: 'dropship',
      shipping_allocate_type: 'TFS',
    });
    expect(res.status).toBe('success');
    expect(res.items.map((i) => i.package_id)).toEqual(['FP1', 'FP1']);
    expect(savedSet().lazada_pack_status).toBe('success');
  });

  it('một phần: món lỗi trạng thái -> "partial" + gợi ý đã đóng gói/đã hủy trên Seller Center', async () => {
    mockOrders([
      order('111', [
        ['11', OrderStatus.PENDING],
        ['12', OrderStatus.PENDING],
      ]),
    ]);
    adapter.packOrders.mockResolvedValue({
      code: '0',
      result: {
        success: true,
        data: {
          pack_order_list: [
            {
              order_id: '111',
              order_item_list: [
                { order_item_id: '11', item_err_code: '0', package_id: 'FP1' },
                {
                  order_item_id: '12',
                  item_err_code: '700026',
                  msg: 'FO_ITEM_NOT_ALLOW_TO_PACK',
                },
              ],
            },
          ],
        },
      },
    });

    const res = await service.syncGroup(groupId.toString());

    expect(res.status).toBe('partial');
    expect(res.items.find((i) => i.order_item_id === '12')?.msg).toContain(
      'Seller Center',
    );
    expect(res.error).toContain('món 12');
  });

  it('Lazada từ chối cả lô (success=false) -> "failed", mọi món mang lỗi lô', async () => {
    mockOrders([order('111', [['11', OrderStatus.PENDING]])]);
    adapter.packOrders.mockResolvedValue({
      code: '0',
      result: {
        success: 'false',
        error_code: '700004',
        error_msg: 'PARAM_ILLEGAL',
      },
    });

    const res = await service.syncGroup(groupId.toString());

    expect(res.status).toBe('failed');
    expect(res.items[0]?.item_err_code).toBe('700004');
  });

  it('món đã packed trên Lazada (seller tự bấm) -> không gửi lại, coi là thành công', async () => {
    mockOrders([order('111', [['11', OrderStatus.PACKED]])]);

    const res = await service.syncGroup(groupId.toString());

    expect(adapter.packOrders).not.toHaveBeenCalled();
    expect(res.status).toBe('success');
  });

  it('lỗi mạng / token -> không ném ra ngoài, ghi "failed" kèm nội dung lỗi', async () => {
    mockOrders([order('111', [['11', OrderStatus.PENDING]])]);
    marketplace.getValidAccessToken.mockRejectedValue(
      new Error('Shop chưa kết nối'),
    );

    const res = await service.syncGroup(groupId.toString());

    expect(res.status).toBe('failed');
    expect(res.error).toBe('Shop chưa kết nối');
    expect(savedSet().lazada_pack_status).toBe('failed');
  });

  it('nhiều hơn 20 đơn -> chia lô, mỗi lô tối đa 20 đơn', async () => {
    mockOrders(
      Array.from({ length: 21 }, (_, i) =>
        order(String(1000 + i), [[String(5000 + i), OrderStatus.PENDING]]),
      ),
    );
    adapter.packOrders.mockResolvedValue({
      code: '0',
      result: { success: true, data: { pack_order_list: [] } },
    });

    await service.syncGroup(groupId.toString());

    expect(adapter.packOrders).toHaveBeenCalledTimes(2);
    const firstReq = (adapter.packOrders.mock.calls as unknown[][])[0]?.[1] as {
      pack_order_list: unknown[];
    };
    expect(firstReq.pack_order_list).toHaveLength(20);
  });

  describe('retryGroup', () => {
    it('nhóm chưa "packed" -> 409 LAZADA_PACK_NOT_ALLOWED', async () => {
      mockGroup({ fulfillment_status: 'picking', lazada_pack_status: null });

      await expect(
        service.retryGroup(groupId.toString()),
      ).rejects.toMatchObject({
        errorCode: ORD_GROUP_ERROR_CODES.LAZADA_PACK_NOT_ALLOWED,
      });
    });

    it('đã gửi thành công -> 409, không gửi lại', async () => {
      mockGroup({
        fulfillment_status: 'packed',
        lazada_pack_status: 'success',
      });

      await expect(
        service.retryGroup(groupId.toString()),
      ).rejects.toBeDefined();
      expect(adapter.packOrders).not.toHaveBeenCalled();
    });
  });
});
