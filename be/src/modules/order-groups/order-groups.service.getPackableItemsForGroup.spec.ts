import { Types } from 'mongoose';
import { OrderGroupsService } from './order-groups.service';
import { NOT_PACKABLE_ORDER_STATUSES } from '../orders/enums/order-status.enum';
import { ORD_GROUP_ERROR_CODES } from './order-groups.errors';

//!=============================================
// FIX bug (AOFP-XX, 2026-09-15, mở rộng cùng ngày): getPackableItemsForGroup()
// trước đây KHÔNG lọc đơn status=canceled — hàng của đơn đã hủy vẫn bị
// tính vào gợi ý đóng gói (Packaging) VÀ Picking List (Warehouse, tái
// dùng đúng hàm này). Mở rộng thêm: cũng lọc nhóm "sự cố logistics thật"
// (LOST/DAMAGED_BY_3PL/PACKAGE_SCRAPPED...) — hàng đã báo sự cố thì
// không còn gì để đóng gói/đi lấy, y hệt lý do lọc CANCELED. Test tập
// trung đúng 2 hành vi: (1) lọc bỏ NOT_PACKABLE_ORDER_STATUSES, (2) group
// toàn bộ đơn không packable -> throw rõ ràng, không trả items rỗng
// âm thầm. Không test lại toàn bộ hàm (mapping Product Master... đã ổn
// định từ trước, ngoài phạm vi fix này).
//!=============================================
describe('OrderGroupsService — getPackableItemsForGroup (lọc đơn canceled + sự cố logistics)', () => {
  let service: OrderGroupsService;

  const groupId = new Types.ObjectId().toString();

  let orderGroupModel: { findById: jest.Mock };
  let orderModel: { find: jest.Mock };
  let productMasterModel: { find: jest.Mock };

  function mockProductMasterFind(returnedProducts: unknown[]): void {
    productMasterModel.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue(returnedProducts),
    });
  }

  function mockOrderFind(returnedOrders: unknown[]): void {
    orderModel.find.mockReturnValue({
      select: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue(returnedOrders) }),
    });
  }

  beforeEach(() => {
    orderGroupModel = {
      findById: jest.fn().mockResolvedValue({
        _id: groupId,
        platform: 'lazada',
        shop_id: 'shop-1',
      }),
    };
    orderModel = { find: jest.fn() };
    productMasterModel = {
      find: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    };

    service = new OrderGroupsService(
      orderGroupModel as never,
      orderModel as never,
      productMasterModel as never,
      {} as never, // skuBinAssignmentModel — không dùng trong đường code này
      {} as never, // pickEventModel
      {} as never, // userModel
      {} as never, // notificationsService
    );
  });

  it('query DB PHẢI loại trừ toàn bộ NOT_PACKABLE_ORDER_STATUSES (canceled + nhóm sự cố) — đây là dòng fix chính', async () => {
    mockOrderFind([{ items: [], platform: 'lazada', shop_id: 'shop-1' }]);

    await service.getPackableItemsForGroup(groupId);

    expect(orderModel.find).toHaveBeenCalledWith({
      consolidated_group_id: groupId,
      status: { $nin: NOT_PACKABLE_ORDER_STATUSES },
    });
  });

  it('group có 1 đơn active + hàng gặp sự cố (đã bị lọc ở tầng query) -> vẫn tính đúng items của đơn active', async () => {
    mockOrderFind([
      {
        items: [{ sku: 'SKU-A', quantity: 2 }],
        platform: 'lazada',
        shop_id: 'shop-1',
      },
    ]);
    // BE-1: SKU phải có hồ sơ đóng gói đã được kho xác nhận (ready +
    // đủ số đo + độ nhạy), nếu không getPackableItemsForGroup() ném
    // ORD_GROUP_PACKAGING_PROFILE_NOT_READY — mock đúng hồ sơ hợp lệ.
    mockProductMasterFind([
      {
        seller_sku: 'SKU-A',
        is_fragile: false,
        packaging_profile_status: 'ready',
        dimension: {
          package_length_cm: 10,
          package_width_cm: 8,
          package_height_cm: 5,
          package_weight_kg: 0.3,
        },
      },
    ]);

    const result = await service.getPackableItemsForGroup(groupId);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.sku).toBe('SKU-A');
    expect(result.items[0]?.quantity).toBe(2);
  });

  it('SKU chưa có hồ sơ đóng gói được kho xác nhận -> throw ORD_GROUP_PACKAGING_PROFILE_NOT_READY (BE-1)', async () => {
    mockOrderFind([
      {
        items: [{ sku: 'SKU-A', quantity: 1 }],
        platform: 'lazada',
        shop_id: 'shop-1',
      },
    ]);
    mockProductMasterFind([]);

    await expect(
      service.getPackableItemsForGroup(groupId),
    ).rejects.toMatchObject({
      errorCode: ORD_GROUP_ERROR_CODES.PACKAGING_PROFILE_NOT_READY,
    });
  });

  it('TOÀN BỘ đơn trong group đã bị hủy/gặp sự cố (query trả rỗng) -> throw ORD_GROUP_ALL_ORDERS_CANCELED, KHÔNG trả items rỗng âm thầm', async () => {
    mockOrderFind([]);

    await expect(
      service.getPackableItemsForGroup(groupId),
    ).rejects.toMatchObject({
      errorCode: ORD_GROUP_ERROR_CODES.ALL_ORDERS_CANCELED,
    });

    expect(productMasterModel.find).not.toHaveBeenCalled();
  });
});
