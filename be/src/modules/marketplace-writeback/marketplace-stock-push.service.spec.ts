import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';
import { MarketplaceStockPushService } from './marketplace-stock-push.service';

//!=============================================
// 21/10/2026 — phương án A: kho OptiPack là nguồn tồn của SKU đã có ô trong kho.
//!=============================================
describe('MarketplaceStockPushService.pushAurelle', () => {
  const stock: Record<string, { available: number; managed: boolean }> = {
    'SF-A': { available: 7, managed: true },
    'SF-B': { available: 3, managed: false },
  };
  let update: jest.Mock;
  let service: MarketplaceStockPushService;

  beforeEach(() => {
    update = jest.fn((_token: string, rows: { sellerSku: string }[]) =>
      Promise.resolve(rows.map((r) => ({ sellerSku: r.sellerSku, success: true }))));
    service = new MarketplaceStockPushService(
      { find: () => ({ select: () => ({ lean: () => Promise.resolve([{ seller_sku: 'SF-A' }, { seller_sku: 'SF-B' }]) }) }) } as never,
      { [MarketplacePlatform.AURELLE]: { updateSellableQuantity: update } } as never,
      {
        listConnectedShops: () => Promise.resolve([{ shop_id: 'shop-a' }]),
        getValidAccessToken: () => Promise.resolve('tok'),
      } as never,
      { availability: (_p: string, _s: string, sku: string) => Promise.resolve(stock[sku]) } as never,
    );
  });

  it('chỉ đẩy SKU kho đã quản, số = tồn khả dụng của OptiPack', async () => {
    const result = await service.pushAurelle();
    expect(result).toMatchObject({ checked: 2, pushed: 1, unmanaged: 1, failed: 0 });
    expect(update).toHaveBeenCalledWith('tok', [{ itemId: '', skuId: '', sellerSku: 'SF-A', sellableQuantity: 7 }]);
  });

  it('số không đổi thì lượt sau không gửi lại; force thì gửi lại', async () => {
    await service.pushAurelle();
    const second = await service.pushAurelle();
    expect(second).toMatchObject({ pushed: 0, unchanged: 1 });
    expect(update).toHaveBeenCalledTimes(1);
    await service.pushAurelle({ force: true });
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('sàn từ chối 1 SKU → đếm lỗi, không nhớ là đã đẩy (lượt sau thử lại)', async () => {
    update.mockResolvedValueOnce([{ sellerSku: 'SF-A', success: false }]);
    expect(await service.pushAurelle()).toMatchObject({ pushed: 0, failed: 1 });
    expect(await service.pushAurelle()).toMatchObject({ pushed: 1 });
  });

  it('gọi sàn lỗi mạng → không ném ra ngoài', async () => {
    update.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(service.pushAurelle()).resolves.toMatchObject({ failed: 1 });
  });
});
