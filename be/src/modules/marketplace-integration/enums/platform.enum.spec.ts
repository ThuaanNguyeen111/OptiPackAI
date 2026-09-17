import { MarketplacePlatform, parseMarketplacePlatform } from './platform.enum';

describe('parseMarketplacePlatform', () => {
  it('giữ nguyên tiktok/lazada/tiki, không phân biệt hoa thường', () => {
    expect(parseMarketplacePlatform('LAZADA')).toBe(MarketplacePlatform.LAZADA);
    expect(parseMarketplacePlatform(' TikTok ')).toBe(MarketplacePlatform.TIKTOK);
    expect(parseMarketplacePlatform('tiki')).toBe(MarketplacePlatform.TIKI);
  });

  it('thiếu hoặc giá trị lạ → mặc định lazada (shop demo hiện chỉ 1 sàn)', () => {
    expect(parseMarketplacePlatform(undefined)).toBe(MarketplacePlatform.LAZADA);
    expect(parseMarketplacePlatform('')).toBe(MarketplacePlatform.LAZADA);
    expect(parseMarketplacePlatform('shopee')).toBe(MarketplacePlatform.LAZADA);
  });
});
