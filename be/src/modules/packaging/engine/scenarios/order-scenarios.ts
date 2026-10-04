import type { PackableItem } from '../../../../common/interfaces/packaging.interface';
import type { BoxSpec, PackOk } from '../types';
import { expandToUnits } from '../units';
import { packOrder } from '../greedy-packer';
import { packIntoMultipleCartons } from '../multi-carton-packer';

/**
 * ===================================================================
 * Thư viện kịch bản đơn hàng (30/09/2026, Milestone 1)
 * ===================================================================
 * Mỗi kịch bản mô tả MỘT hình dạng đơn thực tế bằng hồ sơ SKU (cm/kg như
 * Product Master) và kết quả KỲ VỌNG của engine. Dùng chung cho:
 *  - scenario-runner.spec.ts: assert + validator độc lập trên mọi kết quả ok;
 *  - scripts/pack-benchmark.ts: đo hiệu năng/chất lượng trước-sau.
 * `knownGap` = kịch bản engine hiện chưa đạt kỳ vọng; runner đảo chiều
 * (it.failing) để khi 1 milestone sửa xong, test tự báo "gỡ knownGap".
 * ===================================================================
 */

export interface ItemOpts {
  qty?: number;
  fragile?: boolean;
  category?: string;
  upright?: boolean;
  /** Tải chồng tối đa (kg); bỏ trống = không cho đặt gì lên. */
  stackKg?: number | null;
  fold?: boolean;
}

export function item(
  sku: string,
  dimsCm: [number, number, number],
  kg: number,
  o: ItemOpts = {},
): PackableItem {
  return {
    sku,
    quantity: o.qty ?? 1,
    length_cm: dimsCm[0],
    width_cm: dimsCm[1],
    height_cm: dimsCm[2],
    weight_kg: kg,
    is_fragile: o.fragile ?? false,
    orientation_rule: o.upright ? 'upright_only' : 'any',
    max_stack_load_kg: o.stackKg ?? null,
    product_category: o.category ?? 'other',
    can_fold_in_half: o.fold ?? false,
  };
}

// Hồ sơ SKU mô phỏng đúng ngành hàng thật của shop (giày dép + quần áo).
export const tee = (qty = 1, sku = 'TEE'): PackableItem =>
  item(sku, [30, 22, 3], 0.25, {
    qty,
    category: 't_shirt',
    stackKg: 10,
    fold: true,
  });
export const jean = (qty = 1, sku = 'JEAN'): PackableItem =>
  item(sku, [32, 26, 5], 0.6, {
    qty,
    category: 'trousers',
    stackKg: 10,
    fold: true,
  });
export const jacket = (qty = 1, sku = 'JACKET'): PackableItem =>
  item(sku, [35, 28, 8], 0.9, {
    qty,
    category: 'jacket',
    stackKg: 8,
    fold: false,
  });
export const dress = (qty = 1, sku = 'DRESS'): PackableItem =>
  item(sku, [30, 24, 4], 0.4, {
    qty,
    category: 'dress',
    stackKg: 10,
    fold: true,
  });
export const shoebox = (qty = 1, sku = 'SHOE', kg = 0.9): PackableItem =>
  item(sku, [33, 21, 12], kg, {
    qty,
    category: 'shoes',
    upright: true,
    stackKg: 0.3,
  });
export const sandal = (qty = 1, sku = 'SANDAL'): PackableItem =>
  item(sku, [28, 12, 8], 0.4, { qty, category: 'sandals', stackKg: 1 });
export const sunglasses = (qty = 1, sku = 'GLASSES'): PackableItem =>
  item(sku, [16, 7, 5], 0.2, { qty, category: 'accessory', fragile: true });

/** Danh mục thùng mẫu (khớp scripts/seed-packaging-boxes.ts). */
export function sampleBoxes(): BoxSpec[] {
  const mk = (
    code: string,
    [l, w, h]: [number, number, number],
    tare: number,
    max: number,
    price: number,
  ): BoxSpec => ({
    code,
    name: code,
    inner: { length_mm: l, width_mm: w, height_mm: h },
    outer: { length_mm: l + 10, width_mm: w + 10, height_mm: h + 10 },
    tare_g: tare,
    max_load_g: max,
    price_vnd: price,
  });
  return [
    mk('SAMPLE-S', [200, 150, 100], 90, 5000, 2500),
    mk('SAMPLE-M', [350, 250, 200], 200, 10000, 4500),
    mk('SAMPLE-L', [500, 400, 350], 380, 20000, 8000),
  ];
}

export function customBox(
  code: string,
  inner: [number, number, number],
  maxLoadG = 20000,
): BoxSpec {
  return {
    code,
    name: code,
    inner: { length_mm: inner[0], width_mm: inner[1], height_mm: inner[2] },
    outer: {
      length_mm: inner[0] + 10,
      width_mm: inner[1] + 10,
      height_mm: inner[2] + 10,
    },
    tare_g: 100,
    max_load_g: maxLoadG,
    price_vnd: null,
  };
}

export interface SolveOutcome {
  status: 'ok' | 'no_fit';
  cartons: PackOk[];
  /** Nội dung lý do (khi no_fit). */
  reasons: string[];
  /** Mã lý do (khi engine đã có mã; chuỗi rỗng nếu chưa). */
  reasonCodes: string[];
  computationTimeMs: number;
}

/**
 * Điểm vào "tốt nhất hiện có" để kịch bản và benchmark gọi: chỉ xét 1 thùng
 * (`allowMulti: false`) hoặc đa kiện (thử 1 kiện trước, không được mới chia).
 */
export function solve(
  items: PackableItem[],
  boxes: BoxSpec[],
  options: {
    availability?: Map<string, number>;
    allowMulti?: boolean;
    /** Đệm quanh món dễ vỡ (mm mỗi mặt) — như production; mặc định 0. */
    fragileCushionMm?: number;
  } = {},
): SolveOutcome {
  const units = expandToUnits(items, {
    fragileCushionMm: options.fragileCushionMm,
  });
  if (options.allowMulti === false) {
    const single = packOrder(units, boxes, {
      availability: options.availability,
    });
    if (single.status === 'ok') {
      return {
        status: 'ok',
        cartons: [single],
        reasons: [],
        reasonCodes: [],
        computationTimeMs: single.computation_time_ms,
      };
    }
    return {
      status: 'no_fit',
      cartons: [],
      reasons: single.reasons.map((r) => r.reason),
      reasonCodes: single.reasons.map((r) => r.code ?? ''),
      computationTimeMs: single.computation_time_ms,
    };
  }
  const multi = packIntoMultipleCartons(units, boxes, {
    availability: options.availability,
  });
  if (multi.status === 'ok') {
    return {
      status: 'ok',
      cartons: multi.cartons,
      reasons: [],
      reasonCodes: [],
      computationTimeMs: multi.computationTimeMs,
    };
  }
  const unplacedReasons =
    units.length === 0
      ? [{ code: 'NO_ITEMS', reason: 'Không có món hàng nào để đóng gói.' }]
      : multi.unplaced;
  return {
    status: 'no_fit',
    cartons: multi.cartons,
    reasons: unplacedReasons.map((r) => r.reason),
    reasonCodes: unplacedReasons.map((r) => r.code),
    computationTimeMs: multi.computationTimeMs,
  };
}

export interface Scenario {
  id: string;
  group: string;
  name: string;
  items: PackableItem[];
  boxes?: BoxSpec[];
  availability?: Record<string, number>;
  /** false = chỉ xét 1 thùng (không rơi sang đa kiện). */
  allowMulti?: boolean;
  expected: {
    status: 'ok' | 'no_fit';
    minCartons?: number;
    maxCartons?: number;
    /** Mã lý do mong đợi (chỉ kiểm khi status = no_fit). */
    reasonCode?: string;
  };
  /** Ghi lý do engine hiện chưa đạt kỳ vọng; xóa khi đã sửa. */
  knownGap?: string;
}

export const toAvailability = (s: Scenario): Map<string, number> | undefined =>
  s.availability ? new Map(Object.entries(s.availability)) : undefined;

export const SCENARIOS: Scenario[] = [
  // ---------------------------------------------------------------- SỐ LƯỢNG
  {
    id: 'Q1',
    group: 'số lượng',
    name: '1 áo thun',
    items: [tee()],
    expected: { status: 'ok', maxCartons: 1 },
  },
  {
    id: 'Q2',
    group: 'số lượng',
    name: '20 áo thun giống nhau (chịu chồng 10 kg)',
    items: [tee(20)],
    expected: { status: 'ok', maxCartons: 2 },
  },
  {
    id: 'Q3',
    group: 'số lượng',
    name: '30 món: 15 áo + 15 quần',
    items: [tee(15), jean(15)],
    expected: { status: 'ok', maxCartons: 3 },
  },
  {
    id: 'Q4',
    group: 'số lượng',
    name: '31 áo thun (vượt trần 30 món của 1 thùng)',
    items: [tee(31)],
    expected: { status: 'ok', maxCartons: 3 },
  },
  {
    id: 'Q5',
    group: 'số lượng',
    name: '60 áo thun',
    items: [tee(60)],
    expected: { status: 'ok', maxCartons: 5 },
  },
  {
    id: 'Q6',
    group: 'số lượng',
    name: '120 món áo/quần/váy',
    items: [tee(50), jean(40), dress(30)],
    expected: { status: 'ok', maxCartons: 12 },
  },
  {
    id: 'Q7',
    group: 'số lượng',
    name: '2 SKU, mỗi SKU 15 món',
    items: [tee(15, 'TEE-A'), tee(15, 'TEE-B')],
    expected: { status: 'ok', maxCartons: 3 },
  },

  // ---------------------------------------------------------------------- TẢI
  {
    id: 'W1',
    group: 'tải',
    name: '5 hộp giày 5 kg (25 kg > tải thùng lớn nhất 20 kg)',
    items: [shoebox(5, 'SHOE-HEAVY', 5)],
    expected: { status: 'ok', minCartons: 2, maxCartons: 4 },
  },
  {
    id: 'W2',
    group: 'tải',
    name: '1 món nặng 30 kg (nặng hơn mọi thùng)',
    items: [item('ANVIL', [20, 20, 10], 30, { category: 'other' })],
    expected: { status: 'no_fit', reasonCode: 'ITEM_TOO_HEAVY' },
  },
  {
    id: 'W3',
    group: 'tải',
    name: 'Hộp giày (chịu 300 g) + áo 250 g đặt lên, thùng vừa khít 1 chồng',
    items: [
      shoebox(1),
      item('TEE-STACK', [30, 20, 3], 0.25, { category: 't_shirt', stackKg: 5 }),
    ],
    boxes: [customBox('TIGHT', [340, 220, 160])],
    allowMulti: false,
    expected: { status: 'ok', maxCartons: 1 },
  },
  {
    id: 'W4',
    group: 'tải',
    name: 'Hộp giày (chịu 300 g) + áo 301 g: vượt biên tải chồng, thùng chỉ đủ 1 chồng',
    items: [
      shoebox(1),
      item('TEE-HEAVY', [30, 20, 3], 0.301, {
        category: 't_shirt',
        stackKg: 5,
      }),
    ],
    boxes: [customBox('TIGHT', [340, 220, 160])],
    allowMulti: false,
    expected: { status: 'no_fit' },
  },

  // --------------------------------------------------------------------- CỠ
  {
    id: 'S1',
    group: 'cỡ',
    name: 'Món 80x60x50 cm lớn hơn mọi thùng ở mọi hướng',
    items: [item('BIG', [80, 60, 50], 3)],
    expected: { status: 'no_fit', reasonCode: 'ITEM_TOO_LARGE' },
  },
  {
    id: 'S2',
    group: 'cỡ',
    name: 'Món dài 30 cm chỉ vừa thùng cao khi dựng đứng (hướng any)',
    items: [item('TALL', [30, 5, 5], 0.3)],
    boxes: [customBox('TALLBOX', [100, 100, 320])],
    allowMulti: false,
    expected: { status: 'ok', maxCartons: 1 },
  },
  {
    id: 'S3',
    group: 'cỡ',
    name: 'Cùng món dài nhưng upright_only: không được nằm ngang, thùng thấp nên không vừa',
    items: [item('TALL-UP', [30, 5, 5], 0.3, { upright: true })],
    boxes: [customBox('LOWBOX', [100, 100, 100])],
    allowMulti: false,
    expected: { status: 'no_fit', reasonCode: 'ITEM_TOO_LARGE' },
  },
  {
    id: 'S4',
    group: 'cỡ',
    name: 'Dung sai: món 20,0 cm vào thùng lòng 200 mm vừa khít',
    items: [item('EXACT', [20, 10, 10], 0.2)],
    boxes: [customBox('EXACT', [200, 100, 100])],
    allowMulti: false,
    expected: { status: 'ok', maxCartons: 1 },
  },
  {
    id: 'S5',
    group: 'cỡ',
    name: 'Dung sai: món 20,01 cm (làm tròn lên 201 mm) không vào thùng lòng 200 mm',
    items: [item('OVER1MM', [20.01, 10, 10], 0.2)],
    boxes: [customBox('EXACT', [200, 100, 100])],
    allowMulti: false,
    expected: { status: 'no_fit' },
  },

  // -------------------------------------------------------------------- GIÀY
  {
    id: 'H1',
    group: 'giày',
    name: '1 hộp giày',
    items: [shoebox()],
    expected: { status: 'ok', maxCartons: 1 },
  },
  {
    id: 'H2',
    group: 'giày',
    name: '2 hộp giày khác SKU',
    items: [shoebox(1, 'SHOE-A'), shoebox(1, 'SHOE-B')],
    expected: { status: 'ok', maxCartons: 1 },
  },
  {
    id: 'H3',
    group: 'giày',
    name: '5 hộp giày (không chồng được vì chỉ chịu 300 g)',
    items: [shoebox(5)],
    expected: { status: 'ok', maxCartons: 3 },
  },
  {
    id: 'H4',
    group: 'giày',
    name: 'Hộp giày + áo thun đặt lên (chịu 300 g, áo 250 g)',
    items: [shoebox(), tee()],
    expected: { status: 'ok', maxCartons: 1 },
  },
  {
    id: 'H5',
    group: 'giày',
    name: 'Dép + giày',
    items: [sandal(), shoebox()],
    expected: { status: 'ok', maxCartons: 1 },
  },
  {
    id: 'H6',
    group: 'giày',
    name: '3 hộp giày + 3 dép + 2 áo + 1 quần',
    items: [shoebox(3), sandal(3), tee(2), jean()],
    expected: { status: 'ok', maxCartons: 2 },
  },

  // ------------------------------------------------------------------ DỄ VỠ
  {
    id: 'F1',
    group: 'dễ vỡ',
    name: 'Kính + 2 hộp giày',
    items: [sunglasses(), shoebox(2)],
    expected: { status: 'ok', maxCartons: 1 },
  },
  {
    id: 'F2',
    group: 'dễ vỡ',
    name: '5 kính + 1 hộp giày',
    items: [sunglasses(5), shoebox()],
    expected: { status: 'ok', maxCartons: 1 },
  },
  {
    id: 'F3',
    group: 'dễ vỡ',
    name: 'Dễ vỡ phải nằm TRÊN cùng: áo ở dưới, thùng chỉ đủ 1 chồng',
    items: [
      item('FRAGILE-BASE', [30, 20, 5], 0.3, {
        fragile: true,
        category: 'accessory',
      }),
      item('TEE-TOP', [30, 20, 3], 0.2, { category: 't_shirt', stackKg: 5 }),
    ],
    boxes: [customBox('WIDE', [310, 210, 90])],
    allowMulti: false,
    expected: { status: 'ok', maxCartons: 1 },
  },
  {
    id: 'F4',
    group: 'dễ vỡ',
    name: 'Hai món dễ vỡ, thùng chỉ đủ 1 chồng: không xếp được',
    items: [
      item('FRAGILE-A', [30, 20, 5], 0.3, {
        fragile: true,
        category: 'accessory',
      }),
      item('FRAGILE-B', [30, 20, 5], 0.3, {
        fragile: true,
        category: 'accessory',
      }),
    ],
    boxes: [customBox('TIGHT', [300, 200, 110])],
    allowMulti: false,
    expected: { status: 'no_fit' },
  },
  {
    id: 'F5',
    group: 'dễ vỡ',
    name: 'Kính + hộp giày nặng 5 kg',
    items: [sunglasses(), shoebox(1, 'SHOE-HEAVY', 5)],
    expected: { status: 'ok', maxCartons: 1 },
  },

  // ---------------------------------------------------------------- QUẦN ÁO
  {
    id: 'C1',
    group: 'quần áo',
    name: '1 quần jean (gập giúp vào thùng nhỏ hơn)',
    items: [jean()],
    expected: { status: 'ok', maxCartons: 1 },
  },
  {
    id: 'C2',
    group: 'quần áo',
    name: '2 quần jean + 1 áo khoác không gập được',
    items: [jean(2), jacket()],
    expected: { status: 'ok', maxCartons: 1 },
  },
  {
    id: 'C3',
    group: 'quần áo',
    name: 'Váy + áo + quần lẫn nhau',
    items: [dress(2), tee(3), jean(2)],
    expected: { status: 'ok', maxCartons: 1 },
  },
  {
    id: 'C4',
    group: 'quần áo',
    name: '4 áo khoác (không gập, chịu chồng 8 kg)',
    items: [jacket(4)],
    expected: { status: 'ok', maxCartons: 2 },
  },
  {
    id: 'C5',
    group: 'quần áo',
    name: 'Áo không cho chồng (stack null), thùng chỉ đủ 1 lớp: 6 áo không vừa',
    items: [
      item('TEE-NOSTACK', [30, 22, 3], 0.25, { qty: 6, category: 't_shirt' }),
    ],
    boxes: [customBox('FLAT', [320, 240, 40])],
    allowMulti: false,
    expected: { status: 'no_fit' },
  },

  // -------------------------------------------------------------------- KHO
  {
    id: 'K1',
    group: 'kho',
    name: 'Thùng S và M hết, còn L',
    items: [tee(2)],
    availability: { 'SAMPLE-S': 0, 'SAMPLE-M': 0, 'SAMPLE-L': 5 },
    expected: { status: 'ok', maxCartons: 1 },
  },
  {
    id: 'K2',
    group: 'kho',
    name: 'Tất cả thùng hết',
    items: [tee()],
    availability: { 'SAMPLE-S': 0, 'SAMPLE-M': 0, 'SAMPLE-L': 0 },
    expected: { status: 'no_fit', reasonCode: 'OUT_OF_STOCK' },
  },
  {
    id: 'K3',
    group: 'kho',
    name: 'Đơn cần nhiều kiện nhưng chỉ còn 1 thùng L',
    items: [shoebox(5, 'SHOE-HEAVY', 5)],
    availability: { 'SAMPLE-S': 0, 'SAMPLE-M': 0, 'SAMPLE-L': 1 },
    expected: { status: 'no_fit' },
  },

  // ------------------------------------------------------------------- BIÊN
  {
    id: 'E1',
    group: 'biên',
    name: '0 món',
    items: [],
    expected: { status: 'no_fit' },
  },
  {
    id: 'E2',
    group: 'biên',
    name: 'Món 1 mm',
    items: [item('DOT', [0.1, 0.1, 0.1], 0.001)],
    expected: { status: 'ok', maxCartons: 1 },
  },
  {
    id: 'E3',
    group: 'biên',
    name: '2 SKU khác nhau cùng kích thước',
    items: [
      item('SAME-A', [10, 10, 10], 0.2),
      item('SAME-B', [10, 10, 10], 0.2),
    ],
    expected: { status: 'ok', maxCartons: 1 },
  },
];
