import { buildTemplateGuide, describeOrientation, describePackingSteps } from './packing-guide';
import { ALL_ORIENTATIONS, type BoxSpec, type PackingUnit, type Placement } from './types';

const box: BoxSpec = {
  code: 'SAMPLE-M',
  name: 'Thùng M',
  inner: { length_mm: 600, width_mm: 300, height_mm: 300 },
  outer: { length_mm: 610, width_mm: 310, height_mm: 310 },
  tare_g: 200,
  max_load_g: 20000,
  price_vnd: null,
};

function placement(
  key: string,
  step: number,
  [x, y, z]: [number, number, number],
  [dx, dy, dz]: [number, number, number],
): Placement {
  return { item_key: key, sku: key.split('#')[0] ?? key, step, x, y, z, dx, dy, dz, orientation: 'LWH' };
}

function unit(key: string, opts: { fragile?: boolean; maxStack?: number | null } = {}): PackingUnit {
  return {
    item_key: key,
    sku: key.split('#')[0] ?? key,
    length_mm: 100,
    width_mm: 100,
    height_mm: 100,
    weight_g: 500,
    is_fragile: opts.fragile ?? false,
    orientations: ALL_ORIENTATIONS,
    max_stack_load_g: opts.maxStack === undefined ? 5000 : opts.maxStack,
  };
}

describe('describePackingSteps', () => {
  // 2 hộp giày cạnh nhau ở đáy, 1 áo đặt lên hộp bên trái.
  const shoe1 = placement('GIAY#1', 1, [0, 0, 0], [300, 100, 120]);
  const shoe2 = placement('GIAY#2', 2, [300, 0, 0], [300, 100, 120]);
  const shirt = placement('AO#1', 3, [0, 0, 120], [250, 180, 40]);

  it('giữ đúng thứ tự step của engine, kể cả khi đầu vào bị xáo', () => {
    const facts = describePackingSteps([shirt, shoe2, shoe1], box);
    expect(facts.map((f) => f.item_key)).toEqual(['GIAY#1', 'GIAY#2', 'AO#1']);
    expect(facts.map((f) => f.step)).toEqual([1, 2, 3]);
  });

  it('món ở đáy không nằm trên món nào; món tầng trên biết đúng món bên dưới', () => {
    const facts = describePackingSteps([shoe1, shoe2, shirt], box);
    expect(facts[0]?.rests_on).toEqual([]);
    expect(facts[2]?.rests_on).toEqual(['GIAY#1']);
  });

  it('mô tả vị trí theo mặt bằng thùng (trái/phải, trước/sau)', () => {
    const facts = describePackingSteps([shoe1, shoe2], box);
    expect(facts[0]?.position).toBe('góc trái – phía trước');
    expect(facts[1]?.position).toBe('góc phải – phía trước');
  });

  it('lấy cờ dễ vỡ / cấm chồng từ hồ sơ món; thiếu hồ sơ thì không cảnh báo', () => {
    const facts = describePackingSteps([shoe1, shoe2], box, [unit('GIAY#1', { fragile: true, maxStack: null })]);
    expect(facts[0]).toMatchObject({ is_fragile: true, no_stack_on_top: true });
    expect(facts[1]).toMatchObject({ is_fragile: false, no_stack_on_top: false });
  });
});

describe('describeOrientation', () => {
  it('phân biệt giữ nguyên, xoay ngang, nằm nghiêng và dựng đứng', () => {
    expect(describeOrientation('LWH')).toContain('mặt trên hướng lên');
    expect(describeOrientation('WLH')).toContain('xoay ngang 90°');
    expect(describeOrientation('LHW')).toContain('nằm nghiêng');
    expect(describeOrientation('HWL')).toContain('dựng đứng');
  });
});

describe('buildTemplateGuide', () => {
  it('mỗi bước có câu chứa SKU, nhắc bọc xốp hàng dễ vỡ, tóm tắt đúng thùng và độ lấp đầy', () => {
    const facts = describePackingSteps(
      [placement('GIAY#1', 1, [0, 0, 0], [300, 200, 120])],
      box,
      [unit('GIAY#1', { fragile: true })],
    );
    const guide = buildTemplateGuide(facts, box, 0.25, 1);
    expect(guide.steps).toHaveLength(1);
    expect(guide.steps[0]?.instruction).toContain('GIAY');
    expect(guide.steps[0]?.instruction).toContain('Bọc xốp hơi');
    expect(guide.steps[0]?.tip).toContain('dễ vỡ');
    expect(guide.summary).toContain('SAMPLE-M');
    expect(guide.summary).toContain('25%');
  });
});

describe('túi zip và loại sản phẩm', () => {
  const shirt = placement('AO#1', 1, [0, 0, 0], [360, 240, 40]);
  const profiles = new Map([
    ['AO', { product_category: 't_shirt', zip_bag: { code: 'ZIP-M', name: 'Túi zip M', folded: true } }],
  ]);

  it('dữ kiện mang tên loại sản phẩm tiếng Việt và thông tin túi zip', () => {
    const [fact] = describePackingSteps([shirt], box, [], profiles);
    expect(fact).toMatchObject({
      product_type: 'áo thun',
      zip_bag: { code: 'ZIP-M', name: 'Túi zip M', folded: true },
    });
  });

  it('câu mẫu bắt đầu bằng cho hàng vào túi zip + gập đôi, tóm tắt nhắc chuẩn bị túi', () => {
    const facts = describePackingSteps([shirt], box, [], profiles);
    const guide = buildTemplateGuide(facts, box, null, 0);
    expect(guide.steps[0]?.instruction.startsWith('Cho áo thun AO (AO#1) vào túi zip Túi zip M, gập đôi túi')).toBe(true);
    expect(guide.steps[0]?.tip).toContain('kéo kín miệng túi');
    expect(guide.summary).toContain('1 túi zip Túi zip M');
  });

  it('loại "other" không gắn tên loại; thiếu hồ sơ thì không có túi', () => {
    const [other] = describePackingSteps([shirt], box, [], new Map([['AO', { product_category: 'other', zip_bag: null }]]));
    expect(other).toMatchObject({ product_type: null, zip_bag: null });
    const [missing] = describePackingSteps([shirt], box);
    expect(missing).toMatchObject({ product_type: null, zip_bag: null });
  });
});

describe('gập đôi trong hướng dẫn (22/09/2026)', () => {
  it('món được engine gập → dữ kiện folded_in_half và câu mẫu nói gập đôi', () => {
    const folded = { ...placement('AO#1', 1, [0, 0, 0], [180, 240, 80]), folded: true };
    const [fact] = describePackingSteps([folded], box);
    expect(fact?.folded_in_half).toBe(true);
    const guide = buildTemplateGuide(describePackingSteps([folded], box), box, null, 0);
    expect(guide.steps[0]?.instruction).toContain('Gập đôi');
  });
});
