import { DEFAULT_MATERIAL_RULES, selectMaterials } from './material-selector';
import { packOrder } from './greedy-packer';
import { UPRIGHT_ORIENTATIONS } from './types';
import type {
  BoxSpec,
  MaterialPlanning,
  MaterialSpec,
  PackingUnit,
} from './types';

function unit(key: string, overrides: Partial<PackingUnit> = {}): PackingUnit {
  return {
    item_key: key,
    sku: key.split('#')[0] ?? key,
    length_mm: 300,
    width_mm: 200,
    height_mm: 100,
    weight_g: 500,
    is_fragile: false,
    orientations: UPRIGHT_ORIENTATIONS,
    max_stack_load_g: 5000,
    product_category: null,
    ...overrides,
  };
}

const shoe = (n: number): PackingUnit =>
  unit(`GIAY#${String(n)}`, { product_category: 'shoes' });
const shirt = (n: number): PackingUnit =>
  unit(`AO#${String(n)}`, {
    product_category: 't_shirt',
    height_mm: 30,
    weight_g: 200,
  });

const foam: MaterialSpec = {
  code: 'FOAM',
  name: 'Góc xốp',
  type: 'foam_corner',
  unit: 'cái',
  weight_g_per_unit: 5,
  price_vnd_per_unit: 300,
};
const catalog: MaterialSpec[] = [
  foam,
  {
    code: 'DIV',
    name: 'Tấm ngăn',
    type: 'corrugated_divider',
    unit: 'tấm',
    weight_g_per_unit: 40,
    price_vnd_per_unit: 1000,
  },
  {
    code: 'BUB',
    name: 'Xốp hơi',
    type: 'bubble_wrap',
    unit: 'tấm',
    weight_g_per_unit: 10,
    price_vnd_per_unit: 800,
  },
  {
    code: 'PILLOW',
    name: 'Gối hơi',
    type: 'air_pillow',
    unit: 'cái',
    weight_g_per_unit: 3,
    price_vnd_per_unit: 400,
  },
  {
    code: 'TAPE',
    name: 'Tem dễ vỡ',
    type: 'fragile_tape',
    unit: 'cái',
    weight_g_per_unit: 1,
    price_vnd_per_unit: 200,
  },
];
const planning: MaterialPlanning = { catalog, rules: DEFAULT_MATERIAL_RULES };

function qty(
  units: PackingUnit[],
  fill: number,
  p: MaterialPlanning = planning,
): Record<string, number> {
  return Object.fromEntries(
    selectMaterials(units, fill, p).map((l) => [l.code, l.quantity]),
  );
}

describe('selectMaterials (28/09/2026)', () => {
  it('1 hộp giày: 4 góc xốp + tem cảnh báo, không có tấm ngăn', () => {
    expect(qty([shoe(1)], 0.9)).toEqual({ FOAM: 4, TAPE: 1 });
  });

  it('≥ 2 hộp giày chung thùng: thêm tấm ngăn = số hộp − 1, góc xốp theo từng hộp', () => {
    expect(qty([shoe(1), shoe(2), shoe(3)], 0.9)).toEqual({
      FOAM: 12,
      DIV: 2,
      TAPE: 1,
    });
  });

  it('hàng dễ vỡ: bọc xốp mỗi món + tem', () => {
    const fragileShirts = [shirt(1), shirt(2)].map((u) => ({
      ...u,
      is_fragile: true,
    }));
    expect(qty(fragileShirts, 0.9)).toEqual({ BUB: 2, TAPE: 1 });
  });

  it('chỉ quần áo thường, thùng vừa vặn: không cần vật tư nào', () => {
    expect(qty([shirt(1), shirt(2)], 0.8)).toEqual({});
  });

  it('thùng trống nhiều: gối hơi theo dải độ trống, lấy dải CAO NHẤT thỏa', () => {
    const shirts = [shirt(1)];
    expect(qty(shirts, 0.6)).toEqual({}); // trống 40% < 50%
    expect(qty(shirts, 0.45)).toEqual({ PILLOW: 2 }); // trống 55% ≥ 50%
    expect(qty(shirts, 0.2)).toEqual({ PILLOW: 4 }); // trống 80% ≥ 70%
  });

  it('danh mục thiếu loại vật tư mà luật cần → bỏ qua luật đó, không lỗi', () => {
    const noFoam: MaterialPlanning = {
      catalog: catalog.filter((c) => c.type !== 'foam_corner'),
      rules: DEFAULT_MATERIAL_RULES,
    };
    expect(qty([shoe(1)], 0.9, noFoam)).toEqual({ TAPE: 1 });
  });

  it('nhiều vật tư cùng loại: lấy mã nhỏ nhất theo chữ cái (xác định)', () => {
    const twoFoams: MaterialPlanning = {
      catalog: [
        { ...foam, code: 'FOAM-Z', price_vnd_per_unit: 1 },
        { ...foam, code: 'FOAM-A', price_vnd_per_unit: 999 },
      ],
      rules: DEFAULT_MATERIAL_RULES,
    };
    const lines = selectMaterials([shoe(1)], 0.9, twoFoams);
    expect(lines.map((l) => l.code)).toEqual(['FOAM-A']);
  });

  it('cộng dồn khi 2 luật cùng sinh 1 loại vật tư; tính khối lượng + giá', () => {
    const rules: MaterialPlanning = {
      catalog,
      rules: [
        {
          material_type: 'foam_corner',
          applies_to: 'shoes',
          basis: 'per_unit',
          quantity: 4,
        },
        {
          material_type: 'foam_corner',
          applies_to: 'fragile',
          basis: 'per_unit',
          quantity: 1,
        },
      ],
    };
    const units = [shoe(1), { ...shirt(1), is_fragile: true }];
    const [line] = selectMaterials(units, 0.9, rules);
    expect(line).toMatchObject({
      code: 'FOAM',
      quantity: 5,
      weight_g: 25,
      cost_vnd: 1500,
    });
  });

  it('không có món nào thuộc nhóm → luật không sinh vật tư (kể cả per_carton)', () => {
    expect(qty([], 0.5)).toEqual({});
  });
});

describe('packOrder + vật tư (28/09/2026)', () => {
  const box: BoxSpec = {
    code: 'M',
    name: 'Thùng M',
    inner: { length_mm: 400, width_mm: 300, height_mm: 250 },
    outer: { length_mm: 406, width_mm: 306, height_mm: 256 },
    tare_g: 200,
    max_load_g: 10000,
    price_vnd: 4500,
  };

  it('không truyền materials → không có vật tư, cân = hàng + bì (test hình học thuần không đổi)', () => {
    const result = packOrder([shoe(1)], [box]);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.materials).toEqual([]);
    expect(result.materials_weight_g).toBe(0);
    expect(result.estimated_package_weight_g).toBe(700);
  });

  it('có materials → vật tư vào kết quả và cộng vào cân ước tính, giá vật tư được tổng hợp', () => {
    const result = packOrder([shoe(1)], [box], { materials: planning });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    // Hộp giày lấp 20% thùng (trống 80%): 4 góc xốp (20 g, 1200đ) + 4 gối hơi
    // (12 g, 1600đ) + 1 tem (1 g, 200đ) = 33 g, 3000đ.
    expect(result.materials_weight_g).toBe(33);
    expect(result.materials_cost_vnd).toBe(3000);
    expect(result.estimated_package_weight_g).toBe(500 + 200 + 33);
  });
});
