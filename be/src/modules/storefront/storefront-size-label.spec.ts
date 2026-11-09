import { normalizeSizeLabel } from './storefront-admin.service';

describe('normalizeSizeLabel — size biến thể AURELLE giống Master SKU', () => {
  it.each([
    ['m', 'M'],
    ['Size M', 'M'],
    ['  size  xl ', 'XL'],
    ['SIZE 39', '39'],
    ['free size', 'FREE SIZE'],
  ])('"%s" → "%s"', (raw, expected) => {
    expect(normalizeSizeLabel(raw)).toBe(expected);
  });

  it('rỗng / null → null', () => {
    expect(normalizeSizeLabel('   ')).toBeNull();
    expect(normalizeSizeLabel(null)).toBeNull();
    expect(normalizeSizeLabel(undefined)).toBeNull();
  });
});
