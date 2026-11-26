import { ProductCategory } from '../../common/enums/product-category.enum';
import { styleCode } from '../product-master/product-master.service';
import { modelCategoryMismatch, modelSourceLabel } from './model-rules';
import { isPlaceholderBox, normalizePrimitiveParams } from './primitive-params';

const garment = { source: 'category' as const, kind: 'garment' as const, has_fold_rig: true };
const bottle = { source: 'primitive' as const, kind: 'rigid' as const, has_fold_rig: false, primitive: { shape: 'bottle' } };
const upload = { source: 'upload' as const, kind: 'rigid' as const, has_fold_rig: false };

describe('AOFP-352 — mô hình hợp loại SKU', () => {
  it('quần áo chỉ nhận mô hình quần áo có rig gập', () => {
    expect(modelCategoryMismatch(ProductCategory.T_SHIRT, garment)).toBeNull();
    expect(modelCategoryMismatch(ProductCategory.T_SHIRT, bottle)).not.toBeNull();
    expect(modelCategoryMismatch(ProductCategory.DRESS, { ...garment, has_fold_rig: false })).not.toBeNull();
    expect(modelCategoryMismatch(ProductCategory.SHIRT, upload)).not.toBeNull();
  });

  it('túi xách không dùng hình cơ bản; hàng khác nhận mọi mô hình cứng', () => {
    expect(modelCategoryMismatch(ProductCategory.BAG, bottle)).not.toBeNull();
    expect(modelCategoryMismatch(ProductCategory.BAG, upload)).toBeNull();
    expect(modelCategoryMismatch(ProductCategory.OTHER, bottle)).toBeNull();
    expect(modelCategoryMismatch(null, bottle)).toBeNull();
    expect(modelCategoryMismatch(ProductCategory.OTHER, garment)).not.toBeNull();
  });

  it('nhãn nguồn: hộp không bo góc là hình đại diện', () => {
    const box = { source: 'primitive' as const, kind: 'rigid' as const, has_fold_rig: false, primitive: { shape: 'box', corner_radius_pct: 0 } };
    expect(isPlaceholderBox(box.primitive)).toBe(true);
    expect(modelSourceLabel(box)).toBe('Hình đại diện — dựng từ kích thước');
    expect(modelSourceLabel({ ...box, primitive: { shape: 'box', corner_radius_pct: 5 } })).toBe('Dựng từ hình cơ bản');
    expect(modelSourceLabel(upload)).toBe('Mô hình riêng');
  });
});

describe('AOFP-352 — thông số hình cơ bản', () => {
  it('thiếu thì lấy mặc định, thông số dáng khác bị bỏ', () => {
    const { params, error } = normalizePrimitiveParams('bottle', { neck_diameter_pct: 30, crimp_pct: 10 });
    expect(error).toBeNull();
    expect(params).toMatchObject({ shoulder_pct: 15, neck_height_pct: 20, neck_diameter_pct: 30, cap_height_pct: 8, crimp_pct: null });
  });

  it('ngoài khoảng → lỗi', () => {
    expect(normalizePrimitiveParams('tube', { crimp_pct: 50 }).error).toMatch(/crimp_pct/);
    expect(normalizePrimitiveParams('box', { corner_radius_pct: -1 }).error).toMatch(/corner_radius_pct/);
  });
});

describe('AOFP-352 — mã mẫu để gợi ý mô hình', () => {
  it('cắt đoạn size/màu cuối', () => {
    expect(styleCode('TS-BASIC-L')).toBe('TS-BASIC');
    expect(styleCode('SERUM_30ML')).toBe('SERUM');
    expect(styleCode('ABC')).toBeNull();
  });
});
