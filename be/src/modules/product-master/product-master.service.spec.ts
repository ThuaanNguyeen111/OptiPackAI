import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ProductMasterService } from './product-master.service';
import { ProductMaster, ProductMasterSchema } from './schemas/product-master.schema';
import { Order } from '../orders/schemas/order.schema';
import { MarketplaceIntegrationService } from '../marketplace-integration';
import { MARKETPLACE_ADAPTERS } from '../marketplace-integration/interfaces/marketplace-adapter.interface';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { PRODUCT_MASTER_ERROR_CODES } from './product-master.errors';
import { ConfirmPackagingProfileDto } from './dto/confirm-packaging-profile.dto';
import { PackagingBag } from '../packaging/schemas/packaging-bag.schema';
import { ProductCategory } from '../../common/enums/product-category.enum';

describe('ProductMasterService', () => {
  let service: ProductMasterService;
  let productMasterModel: { findByIdAndUpdate: jest.Mock; bulkWrite: jest.Mock };
  // 🔄 (29/09/2026) — service giờ tra adapter qua registry MARKETPLACE_ADAPTERS
  // thay vì inject thẳng LazadaAdapter (xem product-master.service.ts).
  let lazadaAdapter: { getProducts: jest.Mock };
  let bagModel: { findOne: jest.Mock; find: jest.Mock };
  // Gói mẫu 28×20×4 cm cần túi tối thiểu ~250×350 mm (xem bag-fit.util).
  const ZIP_M = { code: 'ZIP-M', width_mm: 300, length_mm: 400 };
  const ZIP_S = { code: 'ZIP-S', width_mm: 200, length_mm: 300 };
  let bagDoc: Record<string, unknown> | null;
  let activeBags: Record<string, unknown>[];

  function makeDto(
    zip: {
      zip_bag_code?: string;
      zip_bag_folded?: boolean;
      can_fold_in_half?: boolean;
      product_category?: ProductCategory;
      height_cm?: number;
      fabric_gsm?: number;
    } = {},
  ): ConfirmPackagingProfileDto {
    return {
      length_cm: 28,
      width_cm: 20,
      height_cm: 4,
      weight_kg: 0.25,
      is_fragile: false,
      orientation_rule: 'any',
      product_category: ProductCategory.T_SHIRT,
      model_id: '6745f0c2a1b2c3d4e5f60718',
      ...zip,
    };
  }
  const dto = makeDto();


  beforeEach(async () => {
    productMasterModel = { findByIdAndUpdate: jest.fn(), bulkWrite: jest.fn() };
    lazadaAdapter = { getProducts: jest.fn() };
    bagDoc = ZIP_M;
    activeBags = [ZIP_S, ZIP_M];
    bagModel = {
      findOne: jest.fn(() => ({ lean: () => Promise.resolve(bagDoc) })),
      find: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve(activeBags) }) })),
    };
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
        {
          provide: MARKETPLACE_ADAPTERS,
          useValue: { [MarketplacePlatform.LAZADA]: lazadaAdapter },
        },
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

  it('quần áo bỏ trống độ dày → BE tính từ GSM của SKU và lưu cả fabric_gsm', async () => {
    productMasterModel.findByIdAndUpdate.mockResolvedValue({ seller_sku: 'AO-M', shop_id: 's1' });
    await service.confirmPackagingProfile(new Types.ObjectId().toString(), new Types.ObjectId().toString(), makeDto({ height_cm: undefined, fabric_gsm: 240 }));
    const [, update] = productMasterModel.findByIdAndUpdate.mock.calls[0] as [string, { $set: Record<string, unknown> }];
    // 8 lớp × 240 gsm ÷ 0,3 g/cm³ = 0,64 → 0,7 cm (PACKAGING_STANDARD §5.2).
    expect(update.$set.dimension).toMatchObject({ package_height_cm: 0.7 });
    expect(update.$set.fabric_gsm).toBe(240);
  });

  it('cảnh báo độ dày chỉ khi kho tự nhập: null coi như bỏ trống, 5 cm cho áo thun thì cảnh báo', async () => {
    productMasterModel.findByIdAndUpdate.mockResolvedValue({ seller_sku: 'AO-M', shop_id: 's1' });
    const blank = await service.confirmPackagingProfile(
      new Types.ObjectId().toString(),
      new Types.ObjectId().toString(),
      makeDto({ height_cm: null as unknown as undefined }),
    );
    expect(blank.warnings).toEqual([]);
    const [, update] = productMasterModel.findByIdAndUpdate.mock.calls[0] as [string, { $set: Record<string, unknown> }];
    expect(update.$set.dimension).toMatchObject({ package_height_cm: 0.5 });

    const thick = await service.confirmPackagingProfile(
      new Types.ObjectId().toString(),
      new Types.ObjectId().toString(),
      makeDto({ height_cm: 5 }),
    );
    expect(thick.warnings).toEqual([expect.stringContaining('Độ dày đo 5 cm lệch quá 50%')]);
  });

  it('hàng không phải quần áo bỏ trống độ dày → 422, không ghi', async () => {
    const withoutHeight = makeDto({ product_category: ProductCategory.SHOES, height_cm: undefined });
    await expect(
      service.confirmPackagingProfile(new Types.ObjectId().toString(), new Types.ObjectId().toString(), withoutHeight),
    ).rejects.toMatchObject({ errorCode: PRODUCT_MASTER_ERROR_CODES.HEIGHT_REQUIRED });
    expect(productMasterModel.findByIdAndUpdate.mock.calls).toHaveLength(0);
  });

  it('lưu loại sản phẩm; không có túi zip thì không gập đôi và không kiểm tra danh mục túi', async () => {
    productMasterModel.findByIdAndUpdate.mockResolvedValue({ seller_sku: 'AO-M', shop_id: 's1' });

    await service.confirmPackagingProfile(new Types.ObjectId().toString(), new Types.ObjectId().toString(), makeDto({ zip_bag_folded: true }));

    const [, update] = productMasterModel.findByIdAndUpdate.mock.calls[0] as [string, { $set: Record<string, unknown> }];
    expect(update.$set).toMatchObject({ product_category: 't_shirt', zip_bag_code: null, zip_bag_folded: false });
    expect(bagModel.findOne.mock.calls).toHaveLength(0);
  });

  it('có túi zip đang dùng -> lưu mã túi + gập đôi', async () => {
    productMasterModel.findByIdAndUpdate.mockResolvedValue({ seller_sku: 'AO-M', shop_id: 's1' });

    await service.confirmPackagingProfile(new Types.ObjectId().toString(), new Types.ObjectId().toString(), makeDto({ zip_bag_code: 'ZIP-M', zip_bag_folded: true }));

    const [, update] = productMasterModel.findByIdAndUpdate.mock.calls[0] as [string, { $set: Record<string, unknown> }];
    expect(update.$set).toMatchObject({ zip_bag_code: 'ZIP-M', zip_bag_folded: true });
    const [bagFilter] = bagModel.findOne.mock.calls[0] as [unknown];
    expect(bagFilter).toEqual({ code: 'ZIP-M', is_active: true });
  });

  it('mã túi zip không có trong danh mục -> PM_ZIP_BAG_NOT_FOUND, không ghi hồ sơ', async () => {
    bagDoc = null;

    await expect(
      service.confirmPackagingProfile(new Types.ObjectId().toString(), new Types.ObjectId().toString(), makeDto({ zip_bag_code: 'ZIP-KHONG-CO' })),
    ).rejects.toMatchObject({ errorCode: PRODUCT_MASTER_ERROR_CODES.ZIP_BAG_NOT_FOUND });
    expect(productMasterModel.findByIdAndUpdate.mock.calls).toHaveLength(0);
  });

  it('túi quá nhỏ so với gói đã đo -> PM_ZIP_BAG_TOO_SMALL kèm gợi ý túi nhỏ nhất còn vừa, không ghi hồ sơ', async () => {
    bagDoc = ZIP_S;
    await expect(
      service.confirmPackagingProfile(new Types.ObjectId().toString(), new Types.ObjectId().toString(), makeDto({ zip_bag_code: 'ZIP-S' })),
    ).rejects.toMatchObject({
      errorCode: PRODUCT_MASTER_ERROR_CODES.ZIP_BAG_TOO_SMALL,
      details: { zipBagCode: 'ZIP-S', suggestedZipBagCode: 'ZIP-M' },
    });
    expect(productMasterModel.findByIdAndUpdate.mock.calls).toHaveLength(0);
  });

  it('suggestZipBag: túi nhỏ nhất còn vừa; không túi nào vừa -> null', async () => {
    expect(await service.suggestZipBag({ length_cm: 28, width_cm: 20, height_cm: 4 })).toBe('ZIP-M');
    expect(await service.suggestZipBag({ length_cm: 20, width_cm: 12, height_cm: 2 })).toBe('ZIP-S');
    expect(await service.suggestZipBag({ length_cm: 80, width_cm: 60, height_cm: 30 })).toBeNull();
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

  it.each([ProductCategory.SANDALS, ProductCategory.ACCESSORY, ProductCategory.OTHER])(
    '%s đánh dấu gập đôi → PM_FOLD_NOT_ALLOWED',
    async (category) => {
      await expect(
        service.confirmPackagingProfile(
          new Types.ObjectId().toString(),
          new Types.ObjectId().toString(),
          makeDto({ can_fold_in_half: true, product_category: category }),
        ),
      ).rejects.toMatchObject({ errorCode: PRODUCT_MASTER_ERROR_CODES.FOLD_NOT_ALLOWED });
    },
  );

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

    await service.syncProductsForShop(MarketplacePlatform.LAZADA, 's1', ['AO-M']);

    const [ops] = productMasterModel.bulkWrite.mock.calls[0] as [
      { updateOne: { update: { $set: Record<string, unknown>; $setOnInsert: Record<string, unknown> } } }[],
    ];
    const update = ops[0]?.updateOne.update;
    expect(update?.$set.packaging_profile_status).toBeUndefined();
    expect(update?.$setOnInsert.packaging_profile_status).toBe('needs_measurement');
  });
});
