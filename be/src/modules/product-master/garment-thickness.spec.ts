import { ProductCategory } from '../../common/enums/product-category.enum';
import { FLAT_CATEGORIES } from '../packaging/engine/units';
import { GARMENT_FABRIC, garmentThicknessCm, thicknessWarning } from './garment-thickness';

// Số kỳ vọng lấy từ bảng docs/PACKAGING_STANDARD.md §5.2 (13/11/2026).
describe('garmentThicknessCm — độ dày gói quần áo từ GSM', () => {
  it.each([
    [ProductCategory.T_SHIRT, 0.5],
    [ProductCategory.SHIRT, 0.3],
    [ProductCategory.SHORTS, 0.4],
    [ProductCategory.TROUSERS, 0.8],
    [ProductCategory.DRESS, 0.3],
    [ProductCategory.JACKET, 1],
  ])('%s dùng GSM mặc định → %s cm', (category, cm) => {
    expect(garmentThicknessCm(category, null)).toBe(cm);
  });
});

describe('garmentThicknessCm — GSM riêng của SKU và loại không phải quần áo', () => {
  it('áo thun vải dày 240 gsm → 8 × 240 ÷ 0,3 ÷ 10 000 = 0,64 → làm tròn lên 0,7 cm', () => {
    expect(garmentThicknessCm(ProductCategory.T_SHIRT, 240)).toBe(0.7);
  });

  it('giày không có GSM → null', () => {
    expect(garmentThicknessCm(ProductCategory.SHOES, null)).toBeNull();
  });
});

describe('thicknessWarning — số đo tay lệch > 50% so với GSM', () => {
  it('polo đo 5 cm trong khi GSM mặc định ra 0,5 cm → cảnh báo', () => {
    expect(thicknessWarning(ProductCategory.T_SHIRT, null, 5)).toBe(
      'Độ dày đo 5 cm lệch quá 50% so với 0,5 cm tính từ GSM 180 — kiểm tra lại số đo hoặc GSM của vải.',
    );
  });

  it('lệch trong 50% (0,7 cm so với 0,5) → không cảnh báo', () => {
    expect(thicknessWarning(ProductCategory.T_SHIRT, null, 0.7)).toBeNull();
  });

  it('lệch đúng 50% không cảnh báo (sơ mi 0,45 cm so với 0,3 — nhiễu dấu phẩy động không tính)', () => {
    expect(thicknessWarning(ProductCategory.SHIRT, null, 0.45)).toBeNull();
    expect(thicknessWarning(ProductCategory.T_SHIRT, 240, 1.05)).toBeNull();
  });

  it('mỏng hơn quá 50% cũng cảnh báo (jean 0,3 cm so với 0,8)', () => {
    expect(thicknessWarning(ProductCategory.TROUSERS, null, 0.3)).not.toBeNull();
  });

  it('hàng không phải quần áo → không cảnh báo', () => {
    expect(thicknessWarning(ProductCategory.SHOES, null, 12)).toBeNull();
  });
});

describe('GARMENT_FABRIC', () => {
  it('có đúng các loại quần áo nằm phẳng của engine (2 danh sách không được lệch nhau)', () => {
    expect(new Set(Object.keys(GARMENT_FABRIC))).toEqual(FLAT_CATEGORIES);
  });
});
