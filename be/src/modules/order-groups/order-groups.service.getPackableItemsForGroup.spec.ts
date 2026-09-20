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
// âm thầm.
// BỔ SUNG (19/09/2026): thêm test cho crash thật 500 khi product_master
// tìm thấy nhưng thiếu field `dimension` (xem test riêng cuối file) —
// mapping Product Master KHÔNG còn "ngoài phạm vi" như comment cũ ghi.
//!=============================================
describe('OrderGroupsService — getPackableItemsForGroup (lọc đơn canceled + sự cố logistics)', () => {
  let service: OrderGroupsService;

  const groupId = new Types.ObjectId().toString();

  let orderGroupModel: { findById: jest.Mock };
  let orderModel: { find: jest.Mock };
  let productMasterModel: { find: jest.Mock };

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
      {} as never, // staffAssignmentService — không dùng trong đường code này
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

    const result = await service.getPackableItemsForGroup(groupId);

    expect(result.items).toHaveLength(1);
    const [first] = result.items;
    expect(first).toBeDefined();
    expect(first?.sku).toBe('SKU-A');
    expect(first?.quantity).toBe(2);
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

  //!=============================================
  // FIX (AOFP-XX, 19/09/2026, báo cáo thật): document product_master TÌM
  // THẤY (không phải trường hợp "thiếu hẳn" đã test ở trên) nhưng field
  // `dimension` lại thiếu/undefined (dữ liệu chèn tay bỏ qua validation
  // Mongoose — schema khai dimension required:true nên code ứng dụng
  // KHÔNG BAO GIỜ tự tạo ra tình huống này) -> code cũ
  // `product?.dimension.package_length_cm` chỉ bảo vệ `product`, KHÔNG
  // bảo vệ `dimension` -> ném TypeError -> 500, sập cả API picking-list.
  //!=============================================
  it('product_master TÌM THẤY nhưng dimension bị thiếu/undefined -> KHÔNG throw, dùng giá trị mặc định an toàn (không phải 500)', async () => {
    mockOrderFind([
      {
        items: [{ sku: 'SKU-RAC', quantity: 1 }],
        platform: 'lazada',
        shop_id: 'shop-1',
      },
    ]);
    productMasterModel.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { seller_sku: 'SKU-RAC', is_fragile: false }, // KHÔNG có field dimension — mô phỏng đúng data rác chèn tay
      ]),
    });

    const result = await service.getPackableItemsForGroup(groupId);

    expect(result.items).toHaveLength(1);
    const [item] = result.items;
    expect(item).toEqual({
      sku: 'SKU-RAC',
      quantity: 1,
      length_cm: 20,
      width_cm: 20,
      height_cm: 20,
      weight_kg: 0.5,
      is_fragile: false,
    });
  });
});
