import { bagFits, packageEdgesMm, suggestSmallestBag } from './bag-fit.util';

describe('bag-fit — túi zip theo size món', () => {
  // Gói 28×20×4 cm → a=280, b=200, t=40 mm → cần rộng ≥ 250, dài ≥ 350 mm.
  const pkg = { length_cm: 28, width_cm: 20, height_cm: 4 };

  it('sắp 3 cạnh giảm dần theo mm, bất kể thứ tự nhập', () => {
    expect(packageEdgesMm(pkg)).toEqual([280, 200, 40]);
    expect(packageEdgesMm({ length_cm: 4, width_cm: 28, height_cm: 20 })).toEqual([280, 200, 40]);
  });

  it('vừa khi túi đủ rộng + dài; vừa sát biên vẫn tính vừa', () => {
    expect(bagFits(pkg, { width_mm: 250, length_mm: 350 })).toBe(true);
    expect(bagFits(pkg, { width_mm: 300, length_mm: 400 })).toBe(true);
  });

  it('thiếu 1 mm ở bất kỳ chiều nào → không vừa', () => {
    expect(bagFits(pkg, { width_mm: 249, length_mm: 350 })).toBe(false);
    expect(bagFits(pkg, { width_mm: 250, length_mm: 349 })).toBe(false);
  });

  it('thử cả hai chiều xoay của túi (túi khai ngược rộng/dài)', () => {
    expect(bagFits(pkg, { width_mm: 400, length_mm: 300 })).toBe(true);
    expect(bagFits(pkg, { width_mm: 350, length_mm: 250 })).toBe(true);
  });

  it('gợi ý túi có diện tích nhỏ nhất trong các túi còn vừa; không túi nào vừa → null', () => {
    const bags = [
      { code: 'ZIP-L', width_mm: 400, length_mm: 500 },
      { code: 'ZIP-S', width_mm: 150, length_mm: 200 },
      { code: 'ZIP-M', width_mm: 300, length_mm: 400 },
    ];
    expect(suggestSmallestBag(pkg, bags)?.code).toBe('ZIP-M');
    expect(suggestSmallestBag({ length_cm: 90, width_cm: 60, height_cm: 30 }, bags)).toBeNull();
    expect(suggestSmallestBag(pkg, [])).toBeNull();
  });
});
