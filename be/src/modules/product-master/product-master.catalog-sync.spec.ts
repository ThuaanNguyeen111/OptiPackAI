import { Types } from 'mongoose';
import { ProductMasterService } from './product-master.service';

//!=============================================
// 04/10/2026 — Product Master đồng bộ theo CATALOG của shop (GetProducts), không còn
// phụ thuộc SKU trong đơn. Lý do (báo cáo thật từ FE): đổi mã SKU trên Lazada, trang
// cấu hình kho / tình trạng kho reload vẫn không thấy mã mới vì hệ thống chỉ biết SKU
// đã có người đặt.
//!=============================================
describe('ProductMasterService — đồng bộ catalog', () => {
  const shopMongoId = new Types.ObjectId();
  let productMasterModel: { find: jest.Mock; bulkWrite: jest.Mock };
  let lazadaAdapter: { listProductsPage: jest.Mock };
  let marketplace: {
    getConnectedShop: jest.Mock;
    getValidAccessToken: jest.Mock;
    markShopProductsSynced: jest.Mock;
    listConnectedShops: jest.Mock;
  };
  let service: ProductMasterService;

  function product(...skus: string[]): {
    item_id: string;
    skus: { SellerSku: string }[];
  } {
    return { item_id: '1', skus: skus.map((s) => ({ SellerSku: s })) };
  }
  function pageCall(i: number): {
    updatedAfter: Date | null;
    offset: number;
    limit: number;
  } {
    const calls = lazadaAdapter.listProductsPage.mock.calls as [
      string,
      { updatedAfter: Date | null; offset: number; limit: number },
    ][];
    const call = calls[i];
    if (!call) throw new Error(`không có lần gọi thứ ${String(i)}`);
    return call[1];
  }

  beforeEach(() => {
    productMasterModel = {
      find: jest.fn().mockReturnValue({
        select: jest
          .fn()
          .mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      }),
      bulkWrite: jest
        .fn()
        .mockResolvedValue({ upsertedCount: 1, modifiedCount: 0 }),
    };
    lazadaAdapter = { listProductsPage: jest.fn() };
    marketplace = {
      getConnectedShop: jest.fn().mockResolvedValue({
        _id: shopMongoId,
        shop_id: 'shop-1',
        last_product_synced_at: null,
      }),
      getValidAccessToken: jest.fn().mockResolvedValue('TOKEN'),
      markShopProductsSynced: jest.fn().mockResolvedValue(undefined),
      listConnectedShops: jest.fn(),
    };
    service = new ProductMasterService(
      productMasterModel as never,
      {} as never,
      marketplace as never,
      lazadaAdapter as never,
    );
  });

  it('chưa từng đồng bộ -> lấy TOÀN BỘ catalog (updatedAfter = null), ghi mã mới chưa từng có đơn', async () => {
    lazadaAdapter.listProductsPage.mockResolvedValue({
      products: [product('MA-MOI-01')],
      total: 1,
    });

    const res = await service.syncCatalogForShop('shop-1');

    expect(pageCall(0)).toEqual({ updatedAfter: null, offset: 0, limit: 50 });
    const ops = (
      productMasterModel.bulkWrite.mock.calls as unknown[][]
    )[0]?.[0] as {
      updateOne: { filter: { seller_sku: string }; upsert: boolean };
    }[];
    expect(ops[0]?.updateOne.filter.seller_sku).toBe('MA-MOI-01');
    expect(ops[0]?.updateOne.upsert).toBe(true);
    expect(res.mode).toBe('full');
  });

  it('đã đồng bộ trước đó -> chỉ lấy sản phẩm thay đổi sau mốc, lùi 10 phút', async () => {
    const last = new Date('2026-10-04T08:00:00Z');
    marketplace.getConnectedShop.mockResolvedValue({
      _id: shopMongoId,
      shop_id: 'shop-1',
      last_product_synced_at: last,
    });
    lazadaAdapter.listProductsPage.mockResolvedValue({
      products: [],
      total: 0,
    });

    const res = await service.syncCatalogForShop('shop-1');

    expect(pageCall(0).updatedAfter?.toISOString()).toBe(
      '2026-10-04T07:50:00.000Z',
    );
    expect(res.mode).toBe('incremental');
  });

  it('full: true -> bỏ qua mốc, lấy toàn bộ', async () => {
    marketplace.getConnectedShop.mockResolvedValue({
      _id: shopMongoId,
      shop_id: 'shop-1',
      last_product_synced_at: new Date(),
    });
    lazadaAdapter.listProductsPage.mockResolvedValue({
      products: [],
      total: 0,
    });

    await service.syncCatalogForShop('shop-1', { full: true });

    expect(pageCall(0).updatedAfter).toBeNull();
  });

  it('phân trang: trang đủ 50 thì lấy tiếp, trang thiếu thì dừng; ghi mốc sau khi quét hết', async () => {
    const full = Array.from({ length: 50 }, (_, i) =>
      product(`SKU-${String(i)}`),
    );
    lazadaAdapter.listProductsPage
      .mockResolvedValueOnce({ products: full, total: 51 })
      .mockResolvedValueOnce({ products: [product('SKU-50')], total: 51 });

    const res = await service.syncCatalogForShop('shop-1');

    expect(lazadaAdapter.listProductsPage).toHaveBeenCalledTimes(2);
    expect(pageCall(1).offset).toBe(50);
    expect(res.products).toBe(51);
    expect(res.complete).toBe(true);
    expect(marketplace.markShopProductsSynced).toHaveBeenCalledWith(
      shopMongoId,
      expect.any(Date),
    );
  });

  it('chạm giới hạn offset 10.000 -> dừng và KHÔNG ghi mốc (lần sau quét lại)', async () => {
    const full = Array.from({ length: 50 }, (_, i) =>
      product(`SKU-${String(i)}`),
    );
    lazadaAdapter.listProductsPage.mockResolvedValue({
      products: full,
      total: 99999,
    });

    const res = await service.syncCatalogForShop('shop-1');

    expect(lazadaAdapter.listProductsPage).toHaveBeenCalledTimes(200);
    expect(res.complete).toBe(false);
    expect(marketplace.markShopProductsSynced).not.toHaveBeenCalled();
  });

  it('SKU đã sửa tay vẫn giữ nguyên số Admin nhập; SKU thiếu SellerSku bị bỏ qua', async () => {
    lazadaAdapter.listProductsPage.mockResolvedValue({
      products: [
        {
          item_id: '1',
          skus: [
            { SellerSku: 'SKU-MANUAL' },
            { SellerSku: '' },
            { SellerSku: 'SKU-AUTO' },
          ],
        },
      ],
      total: 1,
    });
    productMasterModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ seller_sku: 'SKU-MANUAL' }]),
      }),
    });

    await service.syncCatalogForShop('shop-1');

    const ops = (
      productMasterModel.bulkWrite.mock.calls as unknown[][]
    )[0]?.[0] as {
      updateOne: {
        filter: { seller_sku: string };
        update: { $set: Record<string, unknown> };
      };
    }[];
    expect(ops).toHaveLength(2);
    const manual = ops.find(
      (o) => o.updateOne.filter.seller_sku === 'SKU-MANUAL',
    );
    expect(Object.keys(manual?.updateOne.update.$set ?? {})).toEqual([
      'last_synced_at',
    ]);
  });

  it('syncCatalogAllShops: 1 shop lỗi không chặn shop khác', async () => {
    marketplace.listConnectedShops.mockResolvedValue([
      { shop_id: 'shop-1' },
      { shop_id: 'shop-2' },
    ]);
    marketplace.getConnectedShop.mockImplementation((id: string) =>
      id === 'shop-1'
        ? Promise.reject(new Error('token hết hạn'))
        : Promise.resolve({
            _id: shopMongoId,
            shop_id: 'shop-2',
            last_product_synced_at: null,
          }),
    );
    lazadaAdapter.listProductsPage.mockResolvedValue({
      products: [],
      total: 0,
    });

    const results = await service.syncCatalogAllShops();

    expect(results).toEqual([
      { ok: false, shopId: 'shop-1', error: 'token hết hạn' },
      expect.objectContaining({ ok: true, shopId: 'shop-2' }),
    ]);
  });
});
