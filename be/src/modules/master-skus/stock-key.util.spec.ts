import {
  sellerSkuEqualsIgnoreCase,
  sellerSkuMatch,
  stockAssignmentOrBranches,
  stockFilterFor,
  stockUpsertFilterFor,
} from './stock-key.util';

describe('stock-key.util — khớp tồn unpooled / normalize', () => {
  it('sellerSkuEqualsIgnoreCase khớp hoa/thường', () => {
    const re = sellerSkuEqualsIgnoreCase('ka-d1-p03-t01-3');
    expect(re.test('KA-D1-P03-T01-3')).toBe(true);
    expect(re.test('KA-D1-P03-T01-4')).toBe(false);
  });

  it('stockFilterFor chưa nối: lọc shop + mã SKU chuẩn hoá (có index), không còn regex', () => {
    const filter = stockFilterFor(undefined, 'lazada', '201171264532', ' ka-d1-p03-t01-3 ');
    expect(filter).toEqual({
      platform: 'lazada',
      shop_id: '201171264532',
      seller_sku_normalized: 'KA-D1-P03-T01-3',
      master_sku: null,
    });
  });

  it('stockAssignmentOrBranches: SKU chưa nối gom 1 nhánh $in mã chuẩn hoá (thay nhánh regex từng SKU)', () => {
    const branches = stockAssignmentOrBranches('lazada', 's1', ['ao-1', 'AO-1', 'QUAN-2'], new Map());
    expect(branches).toEqual([
      { platform: 'lazada', shop_id: 's1', seller_sku_normalized: { $in: ['AO-1', 'QUAN-2'] }, master_sku: null },
    ]);
    expect(JSON.stringify(branches)).not.toContain('$regex');
  });

  it('sellerSkuMatch: trim + viết hoa', () => {
    expect(sellerSkuMatch('  ab-c ')).toEqual({ seller_sku_normalized: 'AB-C' });
  });

  it('stockFilterFor đã nối: $or master_sku + unpooled cùng shop', () => {
    const filter = stockFilterFor('ATHUN-005-DEN-M', 'lazada', 's1', 'ATD-M-01');
    expect(filter.$or).toEqual(
      expect.arrayContaining([
        { master_sku: 'ATHUN-005-DEN-M' },
        expect.objectContaining({
          platform: 'lazada',
          shop_id: 's1',
          master_sku: null,
        }),
      ]),
    );
  });

  it('stockAssignmentOrBranches gồm nhánh unpooled cho SKU đã nối', () => {
    const masters = new Map([['KA-D1-P03-T01-3', 'ATHUN-005-DEN-M']]);
    const branches = stockAssignmentOrBranches('lazada', 's1', ['KA-D1-P03-T01-3'], masters);
    expect(branches).toEqual(
      expect.arrayContaining([
        { master_sku: { $in: ['ATHUN-005-DEN-M'] } },
        expect.objectContaining({ platform: 'lazada', shop_id: 's1', master_sku: null }),
      ]),
    );
  });
  // 07/10/2026 — upsert chỉ chép điều kiện so sánh bằng ở cấp trên vào dòng mới; $or và regex
  // không được chép. Bộ lọc upsert vì vậy phải là khớp chính xác, không có $or/regex.
  it('stockUpsertFilterFor đã nối: chỉ { master_sku } để dòng mới mang đúng nhãn', () => {
    expect(stockUpsertFilterFor('ATHUN-005-DEN-M', 'lazada', 's1', 'ATD-M-01')).toEqual({ master_sku: 'ATHUN-005-DEN-M' });
  });

  it('stockUpsertFilterFor chưa nối: so sánh bằng (không regex), seller_sku đã trim, master_sku null', () => {
    const filter = stockUpsertFilterFor(undefined, 'lazada', 's1', ' ATD-M-01 ');
    expect(filter).toEqual({ platform: 'lazada', shop_id: 's1', seller_sku: 'ATD-M-01', master_sku: null });
    expect(filter).not.toHaveProperty('$or');
  });
});
