import { Types } from 'mongoose';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { AUTO_MAP_ACTOR, MasterSkusService } from '../master-skus/master-skus.service';
import { ProductMasterService } from '../product-master/product-master.service';
import { MarketplaceWebhooksService } from '../marketplace-webhooks/marketplace-webhooks.service';
import { StorefrontAdminService } from './storefront-admin.service';

/**
 * 22/10/2026 — SKU AURELLE theo quy tắc OptiPack + tự nối SKU nội bộ cùng mã + ẩn SKU sàn ngừng bán.
 */
interface Chain {
  select: jest.Mock<Chain>;
  sort: jest.Mock<Chain>;
  session: jest.Mock<Chain>;
  lean: jest.Mock<Promise<unknown>>;
}
function chain(value: unknown): Chain {
  const self: Chain = {
    select: jest.fn(() => self),
    sort: jest.fn(() => self),
    session: jest.fn(() => self),
    lean: jest.fn(() => Promise.resolve(value)),
  };
  return self;
}

describe('MasterSkusService.autoMapSellerSkus — tự nối SKU sàn trùng mã SKU nội bộ', () => {
  function build(masters: string[], mapped: string[]) {
    const skuModel = { find: jest.fn(() => chain(masters.map((m) => ({ master_sku: m })))) };
    const mappingModel = { find: jest.fn(() => chain(mapped.map((m) => ({ seller_sku_normalized: m })))) };
    const service = new MasterSkusService(
      {} as never, skuModel as never, mappingModel as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    );
    const createMapping = jest.spyOn(service, 'createMapping').mockResolvedValue({} as never);
    return { service, createMapping };
  }

  it('chỉ nối SKU có SKU nội bộ đang dùng cùng mã (không phân biệt hoa thường) và chưa nối', async () => {
    const { service, createMapping } = build(['ATHUN-005-DEN-M', 'ATHUN-005-DEN-L'], ['ATHUN-005-DEN-L']);
    const created = await service.autoMapSellerSkus(MarketplacePlatform.AURELLE, 'S1', ['athun-005-den-m', 'ATHUN-005-DEN-L', 'SF-abc']);
    expect(created).toBe(1);
    expect(createMapping).toHaveBeenCalledTimes(1);
    expect(createMapping).toHaveBeenCalledWith(
      'ATHUN-005-DEN-M',
      { platform: MarketplacePlatform.AURELLE, shop_id: 'S1', seller_sku: 'athun-005-den-m' },
      AUTO_MAP_ACTOR,
    );
  });

  it('nối 1 SKU lỗi không chặn SKU khác', async () => {
    const { service, createMapping } = build(['A-001-DEN-M', 'A-001-DEN-L'], []);
    createMapping.mockRejectedValueOnce(new Error('đã nối')).mockResolvedValueOnce({} as never);
    expect(await service.autoMapSellerSkus(MarketplacePlatform.AURELLE, 'S1', ['A-001-DEN-M', 'A-001-DEN-L'])).toBe(1);
  });
});

describe('ProductMasterService — trạng thái sàn, tự nối, ngừng dùng', () => {
  function build() {
    const bulkWrite = jest.fn().mockResolvedValue({ upsertedCount: 2, modifiedCount: 0 });
    const findByIdAndUpdate = jest.fn().mockResolvedValue({ seller_sku: 'X', shop_id: 'S1' });
    const autoMapSellerSkus = jest.fn().mockResolvedValue(1);
    const adapter = {
      getProducts: jest.fn().mockResolvedValue([
        { item_id: '1', skus: [{ SellerSku: 'ATHUN-005-DEN-M', Status: 'active' }, { SellerSku: 'SF-OLD', Status: 'inactive' }] },
      ]),
    };
    const service = new ProductMasterService(
      { bulkWrite, findByIdAndUpdate } as never,
      {} as never,
      {} as never,
      { getValidAccessToken: jest.fn().mockResolvedValue('tok') } as never,
      { [MarketplacePlatform.AURELLE]: adapter } as never,
      undefined,
      undefined,
      { autoMapSellerSkus } as never,
    );
    return { service, bulkWrite, autoMapSellerSkus, findByIdAndUpdate };
  }

  it('ghi marketplace_status theo Status của sàn; chỉ tự nối SKU còn bán', async () => {
    const { service, bulkWrite, autoMapSellerSkus } = build();
    await service.syncProductsForShop(MarketplacePlatform.AURELLE, 'S1', ['ATHUN-005-DEN-M', 'SF-OLD']);
    const ops = (bulkWrite.mock.calls[0] as [{ updateOne: { update: { $set: Record<string, unknown> } } }[]])[0];
    expect(ops.map((op) => op.updateOne.update.$set.marketplace_status)).toEqual(['active', 'inactive']);
    expect(autoMapSellerSkus).toHaveBeenCalledWith(MarketplacePlatform.AURELLE, 'S1', ['ATHUN-005-DEN-M']);
  });

  it('setRetired: đánh dấu ngừng dùng kèm thời điểm, dùng lại thì xoá', async () => {
    const { service, findByIdAndUpdate } = build();
    const id = new Types.ObjectId().toString();
    await service.setRetired(id, true);
    const [, update] = findByIdAndUpdate.mock.calls[0] as [string, { $set: { retired: boolean; retired_at: Date | null } }];
    expect(update.$set.retired).toBe(true);
    expect(update.$set.retired_at).toBeInstanceOf(Date);
    await service.setRetired(id, false);
    expect((findByIdAndUpdate.mock.calls[1] as [string, { $set: Record<string, unknown> }])[1].$set).toEqual({ retired: false, retired_at: null });
  });
});

describe('Webhook product_updated', () => {
  it('kéo ngay hồ sơ các SKU website vừa tạo', async () => {
    const syncProductsForShop = jest.fn().mockResolvedValue({ synced: 1 });
    const service = new MarketplaceWebhooksService(
      { create: jest.fn().mockResolvedValue({}) } as never,
      { [MarketplacePlatform.AURELLE]: { verifyWebhookSignature: () => true } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { syncProductsForShop } as never,
    );
    await service.handleWebhook(MarketplacePlatform.AURELLE, Buffer.from('{}'), 'sig', {
      message_id: 'm1',
      seller_id: '200000000101',
      message_type: 'product_updated',
      timestamp: Date.now(),
      data: { seller_skus: ['ATHUN-005-DEN-M', ''] },
    });
    expect(syncProductsForShop).toHaveBeenCalledWith(MarketplacePlatform.AURELLE, '200000000101', ['ATHUN-005-DEN-M']);
  });
});

describe('StorefrontAdminService — SKU theo quy tắc OptiPack', () => {
  const category = { code: 'ATHUN', name: 'Áo thun', parent_code: 'AO', level: 2, size_scale: ['S', 'M', 'L'], is_active: true };
  function build(opts: { categoryFound?: boolean; hasRuleVariants?: boolean } = {}) {
    const skuCategories = {
      find: jest.fn(() => chain([category])),
      findOne: jest.fn(() => chain(opts.categoryFound === false ? null : category)),
    };
    const skuColors = { find: jest.fn(() => chain([{ code: 'DEN', name: 'Đen', hex: '#000000' }])) };
    const variants = { exists: jest.fn(() => ({ session: () => Promise.resolve(opts.hasRuleVariants ? { _id: 'v' } : null) })) };
    const service = new StorefrontAdminService(
      {} as never, {} as never, variants as never, {} as never, {} as never, {} as never,
      skuCategories as never, skuColors as never,
    );
    return { service };
  }
  interface Rule { categoryCode: string | null; modelNo: number | null; sizes: string[]; colors: Map<string, string> }
  const access = (service: StorefrontAdminService) => service as unknown as {
    resolveSkuRule(dto: unknown, product: unknown, existing: unknown[], session: unknown): Promise<Rule>;
    buildRuleSku(rule: Rule, input: unknown, index: number): { sku: string; colorName: string; size: string };
  };
  const dto = (over: Record<string, unknown> = {}) => ({ variants: [{ colorCode: 'DEN', size: 'm', price: 1, quantityOnHand: 0 }], ...over });
  const product = { _id: new Types.ObjectId(), sku_category_code: null, sku_model_no: null };

  it('ghép SKU {danh mục}-{3 số}-{màu}-{size}, size viết hoa, màu lấy tên OptiPack', async () => {
    const { service } = build();
    const rule = await access(service).resolveSkuRule(dto({ skuCategoryCode: 'ATHUN', skuModelNo: 5 }), product, [], {});
    expect(access(service).buildRuleSku(rule, dto().variants[0], 0)).toMatchObject({ sku: 'ATHUN-005-DEN-M', colorName: 'Đen', size: 'M' });
  });

  it('thiếu danh mục / số mẫu khi thêm biến thể mới → 400', async () => {
    const { service } = build();
    await expect(access(service).resolveSkuRule(dto(), product, [], {})).rejects.toThrow('Chọn danh mục OptiPack và số mẫu');
  });

  it('danh mục không phải cấp 2 đang dùng → 400; size ngoài thang → 400; màu ngoài danh mục → 400', async () => {
    await expect(access(build({ categoryFound: false }).service).resolveSkuRule(dto({ skuCategoryCode: 'AO', skuModelNo: 5 }), product, [], {}))
      .rejects.toThrow('không phải danh mục cấp 2');
    const { service } = build();
    const rule = await access(service).resolveSkuRule(dto({ skuCategoryCode: 'ATHUN', skuModelNo: 5 }), product, [], {});
    expect(() => access(service).buildRuleSku(rule, { colorCode: 'DEN', size: 'XXL' }, 0)).toThrow('thang size');
    expect(() => access(service).buildRuleSku(rule, { colorCode: 'TIM', size: 'M' }, 0)).toThrow('danh mục màu');
  });

  it('sản phẩm đã có biến thể theo mã → không đổi được danh mục / số mẫu', async () => {
    const { service } = build({ hasRuleVariants: true });
    const locked = { _id: new Types.ObjectId(), sku_category_code: 'ATHUN', sku_model_no: 5 };
    await expect(access(service).resolveSkuRule(dto({ skuCategoryCode: 'ATHUN', skuModelNo: 6 }), locked, [], {}))
      .rejects.toThrow('đã khoá');
  });

  it('skuOptions trả danh mục cấp 2 kèm thang size và màu', async () => {
    const { service } = build();
    const options = await service.skuOptions();
    expect(options.categories).toEqual([{ code: 'ATHUN', name: 'Áo thun', parentCode: 'AO', sizes: ['S', 'M', 'L'] }]);
    expect(options.colors).toEqual([{ code: 'DEN', name: 'Đen', hex: '#000000' }]);
  });
});
