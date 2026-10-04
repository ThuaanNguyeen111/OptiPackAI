import type { ConfigService } from '@nestjs/config';
import type { Model } from 'mongoose';
import { MarketplaceIntegrationService } from './marketplace-integration.service';
import { MarketplacePlatform } from './enums/platform.enum';
import type { MarketplaceShopDocument } from './schemas/marketplace-shop.schema';
import type { MarketplaceOauthStateDocument } from './schemas/marketplace-oauth-state.schema';

describe('MarketplaceIntegrationService.listShopsForDisplay', () => {
  function build(rows: Record<string, unknown>[]): {
    service: MarketplaceIntegrationService;
    find: jest.Mock;
    select: jest.Mock;
  } {
    const lean = jest.fn().mockResolvedValue(rows);
    const sort = jest.fn().mockReturnValue({ lean });
    const select = jest.fn().mockReturnValue({ sort });
    const find = jest.fn().mockReturnValue({ select });
    const service = new MarketplaceIntegrationService(
      { find } as unknown as Model<MarketplaceShopDocument>,
      {} as Model<MarketplaceOauthStateDocument>,
      {},
      {} as ConfigService,
    );
    return { service, find, select };
  }

  it('lọc theo platform, không chọn field token, map đúng field hiển thị', async () => {
    const createdAt = new Date('2026-10-04T08:00:00Z');
    const { service, find, select } = build([
      {
        shop_id: '200000000101',
        shop_name: 'AURELLE Demo',
        environment: 'sandbox',
        is_active: true,
        access_token_expires_at: new Date('2026-10-11T08:00:00Z'),
        refresh_token_expires_at: new Date('2026-11-03T08:00:00Z'),
        last_polled_at: null,
        created_at: createdAt,
      },
    ]);

    const result = await service.listShopsForDisplay(MarketplacePlatform.AURELLE);

    expect(find).toHaveBeenCalledWith({ platform: MarketplacePlatform.AURELLE });
    const [projection] = select.mock.calls[0] as [string];
    expect(projection).not.toContain('token_encrypted');
    expect(result).toHaveLength(1);
    const [first] = result;
    expect(first?.shop_id).toBe('200000000101');
    expect(first?.connected_at).toEqual(createdAt);
    expect(first?.last_polled_at).toBeNull();
  });

  it('shop chưa có created_at trả connected_at null', async () => {
    const { service } = build([
      {
        shop_id: 'x',
        shop_name: null,
        environment: 'sandbox',
        is_active: false,
        access_token_expires_at: new Date(),
        refresh_token_expires_at: new Date(),
        last_polled_at: null,
      },
    ]);
    const [first] = await service.listShopsForDisplay(MarketplacePlatform.AURELLE);
    expect(first?.connected_at).toBeNull();
    expect(first?.is_active).toBe(false);
  });
});
