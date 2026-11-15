import type { PackableItem } from '../../../common/interfaces/packaging.interface';
import { toItemProfiles } from './item-profiles.util';

const bags = [
  { code: 'ZIP-S', width_mm: 200, length_mm: 250 },
  { code: 'ZIP-M', width_mm: 300, length_mm: 400 },
];

function item(sku: string, category: string, zip: string | null = null): PackableItem {
  return {
    sku,
    quantity: 1,
    length_cm: 28,
    width_cm: 20,
    height_cm: 1,
    weight_kg: 0.2,
    is_fragile: false,
    product_category: category,
    zip_bag_code: zip,
  };
}

describe('toItemProfiles — túi zip mặc định cho quần áo (16/11/2026)', () => {
  it('quần áo hồ sơ trống túi → túi zip nhỏ nhất vừa gói', () => {
    expect(toItemProfiles([item('AO', 't_shirt')], bags)[0]?.zip_bag_code).toBe('ZIP-M');
  });

  it('hồ sơ đã chọn túi thì giữ nguyên', () => {
    expect(toItemProfiles([item('AO', 't_shirt', 'ZIP-S')], bags)[0]?.zip_bag_code).toBe('ZIP-S');
  });

  it('hàng không phải quần áo không tự thêm túi', () => {
    expect(toItemProfiles([item('KINH', 'accessory')], bags)[0]?.zip_bag_code).toBeNull();
  });

  it('không túi nào vừa → để trống, không đoán', () => {
    expect(toItemProfiles([item('AO', 't_shirt')], bags.slice(0, 1))[0]?.zip_bag_code).toBeNull();
  });
});
