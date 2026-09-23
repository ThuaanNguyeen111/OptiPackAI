import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ProductMasterService } from './product-master.service';
import { ProductMaster, ProductMasterSchema } from './schemas/product-master.schema';
import { Order } from '../orders/schemas/order.schema';
import { LazadaAdapter, MarketplaceIntegrationService } from '../marketplace-integration';
import { PRODUCT_MASTER_ERROR_CODES } from './product-master.errors';
import { ConfirmPackagingProfileDto } from './dto/confirm-packaging-profile.dto';
import { PackagingBag } from '../packaging/schemas/packaging-bag.schema';
import { ProductCategory } from '../../common/enums/product-category.enum';

describe('ProductMasterService', () => {
  let service: ProductMasterService;
  let productMasterModel: { findByIdAndUpdate: jest.Mock; bulkWrite: jest.Mock };
  let lazadaAdapter: { getProducts: jest.Mock };
  let bagModel: { exists: jest.Mock };

  function makeDto(
    zip: { zip_bag_code?: string; zip_bag_folded?: boolean; can_fold_in_half?: boolean; product_category?: ProductCategory } = {},
  ): ConfirmPackagingProfileDto {
    return {
      length_cm: 28,
      width_cm: 20,
      height_cm: 4,
      weight_kg: 0.25,
      is_fragile: false,
      orientation_rule: 'any',
      product_category: ProductCategory.T_SHIRT,
      ...zip,
    };
  }
  const dto = makeDto();


  beforeEach(async () => {
    productMasterModel = { findByIdAndUpdate: jest.fn(), bulkWrite: jest.fn() };
    lazadaAdapter = { getProducts: jest.fn() };
    bagModel = { exists: jest.fn().mockResolvedValue({ _id: 'bag' }) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductMasterService,
        { provide: getModelToken(ProductMaster.name), useValue: productMasterModel },
        { provide: getModelToken(Order.name), useValue: {} },
        { provide: getModelToken(PackagingBag.name), useValue: bagModel },
        {
          provide: MarketplaceIntegrationService,
          useValue: { getValidAccessToken: jest.fn().mockResolvedValue('token') },
        },
        { provide: LazadaAdapter, useValue: lazadaAdapter },
      ],
    }).compile();
    service = module.get(ProductMasterService);
  });

  it('schema khởi tạo được với các field hồ sơ mới (Rule #23)', () => {
    expect(ProductMasterSchema.path('max_stack_load_kg')).toBeDefined();
    expect(ProductMasterSchema.path('profile_confirmed_at')).toBeDefined();
  });

  it('xác nhận hồ sơ → ghi dimension + ready + người xác nhận; max_stack_load thiếu = null', async () => {
    const id = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    productMasterModel.findByIdAndUpdate.mockResolvedValue({ seller_sku: 'AO-M', shop_id: 's1' });

    await service.confirmPackagingProfile(id, userId, dto);

    const [, update] = productMasterModel.findByIdAndUpdate.mock.calls[0] as [
      string,
      { $set: Record<string, unknown> },
    ];
    expect(update.$set.packaging_profile_status).toBe('ready');
    expect(update.$set.max_stack_load_kg).toBeNull();
    expect(update.$set.dimension).toEqual({
      package_length_cm: 28,
      package_width_cm: 20,
      package_height_cm: 4,
      package_weight_kg: 0.25,
    });
    expect(String(update.$set.profile_confirmed_by)).toBe(userId);
  });

  it('lưu loại sản phẩm; không có túi zip thì không gập đôi và không kiểm tra danh mục túi', async () => {
    productMasterModel.findByIdAndUpdate.mockResolvedValue({ seller_sku: 'AO-M', shop_id: 's1' });

    await service.confirmPackagingProfile(new Types.ObjectId().toString(), new Types.ObjectId().toString(), makeDto({ zip_bag_folded: true }));

    const [, update] = productMasterModel.findByIdAndUpdate.mock.calls[0] as [string, { $set: Record<string, unknown> }];
    expect(update.$set).toMatchObject({ product_category: 't_shirt', zip_bag_code: null, zip_bag_folded: false });
    expect(bagModel.exists.mock.calls).toHaveLength(0);
  });

  it('có túi zip đang dùng -> lưu mã túi + gập đôi', async () => {
    productMasterModel.findByIdAndUpdate.mockResolvedValue({ seller_sku: 'AO-M', shop_id: 's1' });

    await service.confirmPackagingProfile(new Types.ObjectId().toString(), new Types.ObjectId().toString(), makeDto({ zip_bag_code: 'ZIP-M', zip_bag_folded: true }));

    const [, update] = productMasterModel.findByIdAndUpdate.mock.calls[0] as [string, { $set: Record<string, unknown> }];
    expect(update.$set).toMatchObject({ zip_bag_code: 'ZIP-M', zip_bag_folded: true });
    const [bagFilter] = bagModel.exists.mock.calls[0] as [unknown];
    expect(bagFilter).toEqual({ code: 'ZIP-M', is_active: true });
  });

  it('mã túi zip không có trong danh mục -> PM_ZIP_BAG_NOT_FOUND, không ghi hồ sơ', async () => {
    bagModel.exists.mockResolvedValue(null);

    await expect(
      service.confirmPackagingProfile(new Types.ObjectId().toString(), new Types.ObjectId().toString(), makeDto({ zip_bag_code: 'ZIP-KHONG-CO' })),
    ).rejects.toMatchObject({ errorCode: PRODUCT_MASTER_ERROR_CODES.ZIP_BAG_NOT_FOUND });
    expect(productMasterModel.findByIdAndUpdate.mock.calls).toHaveLength(0);
  });

  it('lưu cờ có thể gập đôi cho hàng mềm', async () => {
    productMasterModel.findByIdAndUpdate.mockResolvedValue({ seller_sku: 'AO-M', shop_id: 's1' });
    await service.confirmPackagingProfile(new Types.ObjectId().toString(), new Types.ObjectId().toString(), makeDto({ can_fold_in_half: true }));
    const [, update] = productMasterModel.findByIdAndUpdate.mock.calls[0] as [string, { $set: Record<string, unknown> }];
    expect(update.$set.can_fold_in_half).toBe(true);
  });

  it('giày (hộp cứng) đánh dấu gập đôi → PM_FOLD_NOT_ALLOWED, không ghi hồ sơ', async () => {
    await expect(
      service.confirmPackagingProfile(
        new Types.ObjectId().toString(),
        new Types.ObjectId().toString(),
        makeDto({ can_fold_in_half: true, product_category: ProductCategory.SHOES }),
      ),
    ).rejects.toMatchObject({ errorCode: PRODUCT_MASTER_ERROR_CODES.FOLD_NOT_ALLOWED });
    expect(productMasterModel.findByIdAndUpdate.mock.calls).toHaveLength(0);
  });

  it('id sai định dạng → PM_INVALID_ID', async () => {
    await expect(service.confirmPackagingProfile('abc', 'u', dto)).rejects.toMatchObject({
      errorCode: PRODUCT_MASTER_ERROR_CODES.INVALID_ID,
    });
  });

  it('không tìm thấy → PM_NOT_FOUND', async () => {
    productMasterModel.findByIdAndUpdate.mockResolvedValue(null);
    await expect(
      service.confirmPackagingProfile(new Types.ObjectId().toString(), new Types.ObjectId().toString(), dto),
    ).rejects.toMatchObject({ errorCode: PRODUCT_MASTER_ERROR_CODES.NOT_FOUND });
  });

  it('sync sàn KHÔNG ghi đè trạng thái ready (chỉ $setOnInsert)', async () => {
    lazadaAdapter.getProducts.mockResolvedValue([
      { item_id: 1, skus: [{ SellerSku: 'AO-M', package_length: '30' }] },
    ]);
    productMasterModel.bulkWrite.mockResolvedValue({ upsertedCount: 0, modifiedCount: 1 });

    await service.syncProductsForShop('s1', ['AO-M']);

    const [ops] = productMasterModel.bulkWrite.mock.calls[0] as [
      { updateOne: { update: { $set: Record<string, unknown>; $setOnInsert: Record<string, unknown> } } }[],
    ];
    const update = ops[0]?.updateOne.update;
    expect(update?.$set.packaging_profile_status).toBeUndefined();
    expect(update?.$setOnInsert.packaging_profile_status).toBe('needs_measurement');
  });
});
