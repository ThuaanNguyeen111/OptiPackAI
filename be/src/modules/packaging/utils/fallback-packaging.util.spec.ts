import { computeFallbackPackaging } from './fallback-packaging.util';
import { PackableItem } from '../../../common/interfaces/packaging.interface';

describe('computeFallbackPackaging', () => {
  function makeItem(overrides: Partial<PackableItem> = {}): PackableItem {
    return {
      sku: 'SKU-001',
      quantity: 1,
      length_cm: 10,
      width_cm: 10,
      height_cm: 10,
      weight_kg: 0.2,
      is_fragile: false,
      ...overrides,
    };
  }

  it('chọn thùng Small cho đơn nhỏ (thể tích thấp)', () => {
    const result = computeFallbackPackaging([makeItem()]);

    expect(result.box_size).toEqual({ length_cm: 20, width_cm: 15, height_cm: 10 });
    expect(result.fallback_used).toBe(true);
  });

  it('chọn thùng Large khi tổng thể tích vượt Small/Medium', () => {
    const bigItem = makeItem({ length_cm: 40, width_cm: 30, height_cm: 25, quantity: 1 });
    const result = computeFallbackPackaging([bigItem]);

    expect(result.box_size).toEqual({ length_cm: 50, width_cm: 40, height_cm: 35 });
  });

  it('vẫn trả thùng Large (không throw) khi vượt cả thùng lớn nhất — để tầng UC-04 Alt Flow xử lý "Multi-package required"', () => {
    const hugeItem = makeItem({ length_cm: 200, width_cm: 200, height_cm: 200 });
    const result = computeFallbackPackaging([hugeItem]);

    expect(result.box_size).toEqual({ length_cm: 50, width_cm: 40, height_cm: 35 });
  });

  it('BR-06: sản phẩm fragile bắt buộc dùng Bubble Wrap, material_quantity = 2', () => {
    const result = computeFallbackPackaging([makeItem({ is_fragile: true })]);

    expect(result.material_type).toBe('Bubble Wrap');
    expect(result.material_quantity).toBe(2);
  });

  it('sản phẩm không fragile dùng material_type mặc định của thùng, material_quantity = 1', () => {
    const result = computeFallbackPackaging([makeItem({ is_fragile: false })]);

    expect(result.material_type).toBe('Small Box');
    expect(result.material_quantity).toBe(1);
  });

  it('tính estimated_shipping_cost_vnd theo đúng tổng cân nặng × đơn giá cố định', () => {
    const result = computeFallbackPackaging([makeItem({ weight_kg: 0.5, quantity: 2 })]);

    // tổng weight = 0.5 * 2 = 1kg; đơn giá 15,000đ/kg (SHIPPING_COST_PER_KG_VND trong util)
    expect(result.estimated_shipping_cost_vnd).toBe(15000);
  });

  it('gộp nhiều item cùng lúc — tổng thể tích/cân nặng cộng dồn đúng theo quantity', () => {
    const items = [
      makeItem({ sku: 'A', length_cm: 10, width_cm: 10, height_cm: 10, weight_kg: 0.1, quantity: 3 }),
      makeItem({ sku: 'B', length_cm: 5, width_cm: 5, height_cm: 5, weight_kg: 0.05, quantity: 2 }),
    ];
    const result = computeFallbackPackaging(items);

    // tổng weight = 0.1*3 + 0.05*2 = 0.4kg -> 0.4 * 15000 = 6000
    expect(result.estimated_shipping_cost_vnd).toBe(6000);
  });

  it('computation_time_ms luôn >= 0 (đo thời gian thật, không hard-code)', () => {
    const result = computeFallbackPackaging([makeItem()]);

    expect(result.computation_time_ms).toBeGreaterThanOrEqual(0);
  });
});
