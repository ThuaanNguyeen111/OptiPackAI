import { Types } from 'mongoose';
import { ProductMasterService } from './product-master.service';
import { PRODUCT_MASTER_ERROR_CODES } from './product-master.errors';

//!=============================================
// K1 (26/09/2026) — xung đột với luồng cũ: cron đồng bộ 3h sáng trước
// đây ghi đè dimension mỗi lần chạy. Nay Admin sửa tay được -> cron PHẢI
// giữ nguyên số Admin đã nhập cho SKU có manual_override=true.
//!=============================================
describe('ProductMasterService — K1', () => {
  let productMasterModel: { find: jest.Mock; bulkWrite: jest.Mock; findById: jest.Mock; findByIdAndUpdate: jest.Mock };
  let lazadaAdapter: { getProducts: jest.Mock };
  let service: ProductMasterService;

  beforeEach(() => {
    productMasterModel = { find: jest.fn(), bulkWrite: jest.fn().mockResolvedValue({ upsertedCount: 0, modifiedCount: 2 }), findById: jest.fn(), findByIdAndUpdate: jest.fn() };
    lazadaAdapter = { getProducts: jest.fn() };
    const marketplaceIntegrationService = { getValidAccessToken: jest.fn().mockResolvedValue('token') };
    service = new ProductMasterService(productMasterModel as never, {} as never, marketplaceIntegrationService as never, lazadaAdapter as never);
  });

  it('cron đồng bộ: SKU đã sửa tay -> CHỈ cập nhật last_synced_at, KHÔNG ghi đè dimension; SKU thường -> ghi đè bình thường', async () => {
    lazadaAdapter.getProducts.mockResolvedValue([
      { skus: [
        { SellerSku: 'SKU-MANUAL', package_length: '99', package_width: '99', package_height: '99', package_weight: '9' },
        { SellerSku: 'SKU-AUTO', package_length: '10', package_width: '10', package_height: '10', package_weight: '1' },
      ] },
    ]);
    productMasterModel.find.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ seller_sku: 'SKU-MANUAL' }]) }) });

    await service.syncProductsForShop('shop-1', ['SKU-MANUAL', 'SKU-AUTO']);

    const [ops] = productMasterModel.bulkWrite.mock.calls[0] as [ { updateOne: { filter: { seller_sku: string }; update: { $set: Record<string, unknown> } } }[]];
    const manualOp = ops.find((o) => o.updateOne.filter.seller_sku === 'SKU-MANUAL');
    const autoOp = ops.find((o) => o.updateOne.filter.seller_sku === 'SKU-AUTO');
    expect(Object.keys(manualOp?.updateOne.update.$set ?? {})).toEqual(['last_synced_at']);
    expect(autoOp?.updateOne.update.$set).toHaveProperty('dimension');
  });

  it('updateProduct: ghi đúng field bằng dot-path + bật manual_override kèm người sửa', async () => {
    const id = new Types.ObjectId().toString();
    productMasterModel.findById.mockResolvedValue({ _id: id });
    productMasterModel.findByIdAndUpdate.mockResolvedValue({ _id: id });

    await service.updateProduct(id, { package_weight_kg: 0.35, is_fragile: true }, 'admin-1');

    const [, update] = productMasterModel.findByIdAndUpdate.mock.calls[0] as [unknown, { $set: Record<string, unknown> }];
    expect(update.$set).toMatchObject({
      'dimension.package_weight_kg': 0.35,
      is_fragile: true,
      manual_override: true,
      manual_override_by: 'admin-1',
    });
    // KHÔNG ghi đè cả object dimension (sẽ xóa mất 3 cạnh còn lại)
    expect(update.$set).not.toHaveProperty('dimension');
  });

  it('updateProduct không gửi field nào -> 400 PM_NOTHING_TO_UPDATE', async () => {
    await expect(service.updateProduct(new Types.ObjectId().toString(), {}, 'admin-1')).rejects.toMatchObject({
      errorCode: PRODUCT_MASTER_ERROR_CODES.NOTHING_TO_UPDATE,
    });
  });
  it('clearManualOverride (K2): tắt cờ + xóa người/giờ sửa, KHÔNG đụng kích thước hiện tại', async () => {
    const id = new Types.ObjectId().toString();
    productMasterModel.findById.mockResolvedValue({ _id: id });
    productMasterModel.findByIdAndUpdate.mockResolvedValue({ _id: id });

    await service.clearManualOverride(id);

    const [, update] = productMasterModel.findByIdAndUpdate.mock.calls[0] as [unknown, { $set: Record<string, unknown> }];
    expect(update.$set).toEqual({ manual_override: false, manual_override_at: null, manual_override_by: null });
  });
});
