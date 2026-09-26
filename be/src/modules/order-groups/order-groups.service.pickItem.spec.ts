import { Types } from 'mongoose';
import { OrderGroupsService } from './order-groups.service';
import { ORD_GROUP_ERROR_CODES } from './order-groups.errors';

//!=============================================
// FIX (AOFP-XX, 19/09/2026, báo cáo thật Hải Phượng): pickItem() trước
// đây nhận `groupId` nhưng KHÔNG dùng để kiểm tra SKU quét có thuộc
// group hay không — chỉ trừ tồn kho THẲNG theo warehouse_id+seller_sku,
// không quan tâm SKU đó có nằm trong đơn nào của group đang lấy không.
// Hậu quả: quét NHẦM 1 mã vạch bất kỳ (miễn còn tồn kho) vẫn trừ tồn
// THẬT cho SKU hoàn toàn không liên quan tới đơn. Test xác nhận đúng
// hành vi mới: validate SKU thuộc group TRƯỚC khi chạm vào tồn kho.
//!=============================================
describe('OrderGroupsService — pickItem (validate SKU thuộc group trước khi trừ tồn)', () => {
  let service: OrderGroupsService;

  const groupId = new Types.ObjectId().toString();
  const warehouseId = new Types.ObjectId().toString();

  let orderGroupModel: { findById: jest.Mock };
  let orderModel: { find: jest.Mock };
  let productMasterModel: { find: jest.Mock };
  let skuBinAssignmentModel: { findOneAndUpdate: jest.Mock; db: { startSession: jest.Mock } };
  let pickEventModel: { findOne: jest.Mock; create: jest.Mock };

  function mockGroupHasOnlySku(realSku: string): void {
    orderGroupModel.findById.mockResolvedValue({
      _id: groupId,
      platform: 'lazada',
      shop_id: 'shop-1',
    });
    orderModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValue([
            {
              items: [
                {
                  sku: realSku,
                  quantity: 1,
                  name: 'Sản phẩm thật',
                  unit_price: 100000,
                },
              ],
              platform: 'lazada',
              shop_id: 'shop-1',
            },
          ]),
      }),
    });
    productMasterModel.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    });
  }

  beforeEach(() => {
    orderGroupModel = { findById: jest.fn() };
    orderModel = { find: jest.fn() };
    productMasterModel = { find: jest.fn() };
    // K4a — pickItem chạy trong transaction (session lấy từ model.db)
    const session = { withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()), endSession: jest.fn() };
    skuBinAssignmentModel = { findOneAndUpdate: jest.fn(), db: { startSession: jest.fn().mockResolvedValue(session) } };
    pickEventModel = { findOne: jest.fn(), create: jest.fn() };

    service = new OrderGroupsService(
      orderGroupModel as never,
      orderModel as never,
      productMasterModel as never,
      skuBinAssignmentModel as never,
      pickEventModel as never,
      {} as never, // userModel — không dùng trong đường code này
      {} as never, // notificationsService
      {} as never, // staffAssignmentService — không dùng trong đường code này
      { create: jest.fn().mockResolvedValue({}) } as never, // K3 inventoryMovementModel
      { find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) } as never, // K4b mappingModel (chưa nối gì -> đường lùi)
      { reconcile: jest.fn().mockResolvedValue([]), consume: jest.fn().mockResolvedValue(undefined), releaseGroup: jest.fn().mockResolvedValue(0) } as never, // K5
    );
  });

  it('quét SKU KHÔNG thuộc group -> throw ORD_GROUP_ITEM_NOT_IN_GROUP, TUYỆT ĐỐI KHÔNG chạm tới trừ tồn kho', async () => {
    mockGroupHasOnlySku('SKU-THAT-CUA-DON');

    await expect(
      service.pickItem(groupId, warehouseId, 'SKU-QUET-NHAM', 1, 'barcode'),
    ).rejects.toMatchObject({
      errorCode: ORD_GROUP_ERROR_CODES.ITEM_NOT_IN_GROUP,
    });

    // Đây là khẳng định QUAN TRỌNG NHẤT của test này — chứng minh sự
    // cố đã mô tả (trừ tồn nhầm) KHÔNG THỂ xảy ra nữa: hàm phải throw
    // và return SỚM, không bao giờ chạm tới lệnh $inc trừ tồn kho.
    expect(skuBinAssignmentModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('quét ĐÚNG SKU thuộc group -> cho qua, trừ tồn bình thường', async () => {
    mockGroupHasOnlySku('SKU-DUNG');
    skuBinAssignmentModel.findOneAndUpdate.mockResolvedValue({
      quantity_on_hand: 9,
    });
    pickEventModel.create.mockResolvedValue({});

    const result = await service.pickItem(
      groupId,
      warehouseId,
      'SKU-DUNG',
      1,
      'barcode',
    );

    expect(result).toEqual({
      sku: 'SKU-DUNG',
      decrementedBy: 1,
      remainingStock: 9,
    });
    expect(skuBinAssignmentModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('K4a — trừ tồn LỌC ĐÚNG sàn + shop của nhóm đơn (không trừ nhầm SKU trùng chuỗi của sàn/shop khác)', async () => {
    mockGroupHasOnlySku('ABC-123');
    skuBinAssignmentModel.findOneAndUpdate.mockResolvedValue({ _id: new Types.ObjectId(), quantity_on_hand: 4, warehouse_id: new Types.ObjectId(), bin_location_id: new Types.ObjectId(), platform: 'lazada', shop_id: 'shop-1', seller_sku: 'ABC-123' });
    pickEventModel.create.mockResolvedValue([{}]);

    await service.pickItem(groupId, new Types.ObjectId().toString(), 'ABC-123', 1, 'barcode');

    expect((skuBinAssignmentModel.findOneAndUpdate.mock.calls[0] as [Record<string, unknown>])[0]).toMatchObject({ platform: 'lazada', shop_id: 'shop-1' });
  });

  it('K4b — SKU đã nối: trừ vào tồn CHUNG theo SKU nội bộ (không lọc theo sàn/shop nữa)', async () => {
    mockGroupHasOnlySku('ABC-123');
    (service as unknown as { mappingModel: unknown }).mappingModel = {
      find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ seller_sku_normalized: 'ABC-123', master_sku: 'ATHUN-005-DEN-M' }]) }) }),
    };
    skuBinAssignmentModel.findOneAndUpdate.mockResolvedValue({ _id: new Types.ObjectId(), quantity_on_hand: 9, warehouse_id: new Types.ObjectId(), bin_location_id: new Types.ObjectId(), platform: 'tiki', shop_id: 't1', seller_sku: 'X', master_sku: 'ATHUN-005-DEN-M' });
    pickEventModel.create.mockResolvedValue([{}]);

    await service.pickItem(groupId, new Types.ObjectId().toString(), 'ABC-123', 1, 'barcode');

    const filter = (skuBinAssignmentModel.findOneAndUpdate.mock.calls[0] as [Record<string, unknown>])[0];
    expect(filter).toMatchObject({ master_sku: 'ATHUN-005-DEN-M' });
    expect(filter).not.toHaveProperty('platform');
  });
});
