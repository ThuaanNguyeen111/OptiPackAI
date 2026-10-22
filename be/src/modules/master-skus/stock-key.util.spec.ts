import {
  resolveMasterSkus,
  sellerSkuEqualsIgnoreCase,
  stockAssignmentOrBranches,
  stockFilterFor,
  stockKeyOf,
  stockUpsertFilterFor,
} from './stock-key.util';
import { MarketplacePlatform } from '../marketplace-integration/enums/platform.enum';

// 21/10/2026 — tồn khoá theo mã SKU, KHÔNG phân biệt sàn/shop: cùng một mã ở Lazada hay
// AURELLE đều ra cùng một khoá và cùng một bộ lọc.
describe('stock-key.util — tồn khoá theo mã SKU, không phân biệt sàn', () => {
  it('sellerSkuEqualsIgnoreCase khớp hoa/thường', () => {
    const re = sellerSkuEqualsIgnoreCase('ka-d1-p03-t01-3');
    expect(re.test('KA-D1-P03-T01-3')).toBe(true);
    expect(re.test('KA-D1-P03-T01-4')).toBe(false);
  });

  it('resolveMasterSkus: mỗi SKU ra chính mã đã chuẩn hóa, không tra DB', async () => {
    const result = await resolveMasterSkus(undefined, MarketplacePlatform.AURELLE, 's1', [' skc-oat-s ', 'KA-1']);
    expect(result.get(' skc-oat-s ')).toBe('SKC-OAT-S');
    expect(result.get('KA-1')).toBe('KA-1');
  });

  it('stockKeyOf: cùng mã ở sàn/shop khác nhau ra cùng một khoá', () => {
    expect(stockKeyOf(undefined, 'lazada', 'shop-a', 'skc-oat-s')).toBe('M:SKC-OAT-S');
    expect(stockKeyOf(undefined, 'aurelle', '200000000101', ' SKC-OAT-S ')).toBe('M:SKC-OAT-S');
  });

  it('stockFilterFor: không lọc theo sàn/shop; có nhánh dòng cũ chưa gắn nhãn', () => {
    const filter = stockFilterFor(undefined, 'aurelle', 's1', 'skc-oat-s');
    expect(filter).not.toHaveProperty('platform');
    expect(filter).not.toHaveProperty('shop_id');
    expect(filter.$or).toEqual(
      expect.arrayContaining([{ master_sku: 'SKC-OAT-S' }, expect.objectContaining({ master_sku: null })]),
    );
  });

  it('stockAssignmentOrBranches: gom theo mã chuẩn hóa, không có platform/shop', () => {
    const branches = stockAssignmentOrBranches('lazada', 's1', ['skc-oat-s', 'SKC-OAT-S', 'KA-1']);
    expect(branches).toEqual(expect.arrayContaining([{ master_sku: { $in: ['SKC-OAT-S', 'KA-1'] } }]));
    for (const branch of branches) {
      expect(branch).not.toHaveProperty('platform');
      expect(branch).not.toHaveProperty('shop_id');
    }
  });

  // Upsert chỉ chép điều kiện so sánh bằng ở cấp trên vào dòng mới; $or và regex không được chép.
  it('stockUpsertFilterFor: chỉ { master_sku } chuẩn hóa để dòng mới mang đúng nhãn', () => {
    const filter = stockUpsertFilterFor(undefined, 'lazada', 's1', ' atd-m-01 ');
    expect(filter).toEqual({ master_sku: 'ATD-M-01' });
    expect(filter).not.toHaveProperty('$or');
  });
});
