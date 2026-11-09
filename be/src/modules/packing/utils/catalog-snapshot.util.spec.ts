import type { BoxSpec, MaterialSpec } from '../../packaging/engine/types';
import { diffCatalog, snapshotCatalog, type CatalogInputs } from './catalog-snapshot.util';

function box(code: string, price = 3000, inner: [number, number, number] = [300, 200, 100]): BoxSpec {
  return {
    code,
    name: code,
    inner: { length_mm: inner[0], width_mm: inner[1], height_mm: inner[2] },
    outer: { length_mm: inner[0] + 10, width_mm: inner[1] + 10, height_mm: inner[2] + 10 },
    tare_g: 100,
    max_load_g: 10000,
    price_vnd: price,
  };
}

function material(code: string, weight = 5): MaterialSpec {
  return { code, name: code, type: 'bubble_wrap', unit: 'tấm', weight_g_per_unit: weight, price_vnd_per_unit: 500 };
}

const inputs = (over: Partial<CatalogInputs> = {}): CatalogInputs => ({
  boxes: [box('S'), box('M')],
  mailers: [],
  materials: [material('BUBBLE')],
  materialRulesVersion: 3,
  charge: { volumetricDivisor: 5000, billingStepG: 500 },
  ...over,
});

describe('Ảnh chụp danh mục lúc tính kế hoạch', () => {
  it('danh mục không đổi (chỉ tồn kho đổi) → không có thay đổi', () => {
    expect(diffCatalog(snapshotCatalog(inputs()), snapshotCatalog(inputs()))).toEqual([]);
  });

  it('nêu đích danh từng thay đổi: thùng mới, thùng đổi số đo/giá, thùng tắt, vật tư đổi, luật vật tư và luật cước đổi', () => {
    const before = snapshotCatalog(inputs());
    const after = snapshotCatalog(
      inputs({
        boxes: [box('S', 3500), box('L')],
        materials: [material('BUBBLE', 8)],
        materialRulesVersion: 4,
        charge: { volumetricDivisor: 6000, billingStepG: 500 },
      }),
    );

    const changes = diffCatalog(before, after);

    expect(changes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Thùng L mới'),
        expect.stringContaining('Thùng S đã đổi'),
        expect.stringContaining('Thùng M đã ngừng dùng'),
        expect.stringContaining('Vật tư BUBBLE đã đổi'),
        expect.stringContaining('Luật vật tư chèn: phiên bản 3 → 4'),
        expect.stringContaining('Luật cân tính cước'),
      ]),
    );
    expect(changes).toHaveLength(6);
  });
});
