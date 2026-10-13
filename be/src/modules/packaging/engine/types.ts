/**
 * ===================================================================
 * Engine đóng gói 3D — kiểu dữ liệu lõi (21/09/2026, BE-3a)
 * ===================================================================
 * Hàm thuần, không gọi DB/sàn. Đơn vị lõi: mm và gram, số nguyên.
 * Trục: x = chiều dài thùng, y = chiều rộng, z = chiều cao (hướng lên).
 * Món hàng mô hình hóa bằng khối hộp không biến dạng, xoay vuông góc.
 * ===================================================================
 */

/** Hướng đặt: thứ tự cạnh gốc (L, W, H) nằm dọc theo trục (x, y, z). */
export type Orientation = 'LWH' | 'WLH' | 'LHW' | 'HLW' | 'WHL' | 'HWL';

export const ALL_ORIENTATIONS: readonly Orientation[] = [
  'LWH',
  'WLH',
  'LHW',
  'HLW',
  'WHL',
  'HWL',
];
/** Giữ nguyên chiều cao (H theo trục z), chỉ xoay quanh trục đứng. */
export const UPRIGHT_ORIENTATIONS: readonly Orientation[] = ['LWH', 'WLH'];

export interface DimensionsMm {
  length_mm: number;
  width_mm: number;
  height_mm: number;
}

export interface PackingUnit {
  /** Định danh 1 đơn vị vật lý: `${sku}#${thứ tự}` */
  item_key: string;
  sku: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  weight_g: number;
  is_fragile: boolean;
  orientations: readonly Orientation[];
  /** Tải tối đa được đặt lên trên (g); null = không cho đặt gì lên. */
  max_stack_load_g: number | null;
  /** (22/09/2026) Hàng mềm được phép gập đôi thêm khi cần để vừa thùng nhỏ hơn. */
  foldable?: boolean;
  /** true = số đo đang là số đo SAU KHI gập đôi (xem foldUnit). */
  folded?: boolean;
  /**
   * (28/09/2026) Loại sản phẩm (enum ProductCategory) — chỉ để chọn vật tư
   * chèn theo luật; hình học không dùng.
   */
  product_category?: string | null;
}

export interface BoxSpec {
  code: string;
  name: string;
  inner: DimensionsMm;
  outer: DimensionsMm;
  tare_g: number;
  /** Tải HÀNG tối đa (không gồm bì). */
  max_load_g: number;
  price_vnd: number | null;
}

export interface Placement {
  item_key: string;
  sku: string;
  /** Thứ tự đặt (1-based) — dùng làm thứ tự animation. */
  step: number;
  x: number;
  y: number;
  z: number;
  /** Kích thước sau xoay theo trục x/y/z. */
  dx: number;
  dy: number;
  dz: number;
  orientation: Orientation;
  /** (22/09/2026) Món này phải gập đôi trước khi đặt. */
  folded?: boolean;
}

export type ViolationCode =
  | 'EMPTY_INPUT'
  | 'MISSING_ITEM'
  | 'DUPLICATE_ITEM'
  | 'UNKNOWN_ITEM'
  | 'ORIENTATION_NOT_ALLOWED'
  | 'OUT_OF_BOUNDS'
  | 'OVERLAP'
  | 'NO_SUPPORT'
  | 'STACK_LOAD_EXCEEDED'
  | 'BOX_LOAD_EXCEEDED';

export interface Violation {
  code: ViolationCode;
  item_key?: string;
  message: string;
}

/**
 * ===================================================================
 * Vật tư chèn (28/09/2026, P1) — ƯỚC LƯỢNG THEO LUẬT
 * ===================================================================
 * Vật tư KHÔNG tham gia hình học (không chiếm thể tích trong validator);
 * số lượng suy ra từ luật (loại hàng, số món, độ trống của thùng). Không
 * được trình bày như lượng đệm tính chính xác.
 */
export type MaterialType =
  | 'foam_corner'
  | 'corrugated_divider'
  | 'air_pillow'
  | 'bubble_wrap'
  | 'fragile_tape';

export const MATERIAL_TYPES: readonly MaterialType[] = [
  'foam_corner',
  'corrugated_divider',
  'air_pillow',
  'bubble_wrap',
  'fragile_tape',
];

/** 1 vật tư trong danh mục (đã đổi sang đơn vị lõi: g, VND). */
export interface MaterialSpec {
  code: string;
  name: string;
  type: MaterialType;
  /** Đơn vị đếm, VD "cái", "tấm". */
  unit: string;
  weight_g_per_unit: number;
  price_vnd_per_unit: number;
}

/** Nhóm món luật xét: dễ vỡ, giày (hộp cứng), một trong hai, hoặc tất cả. */
export type MaterialRuleScope =
  'fragile' | 'shoes' | 'fragile_or_shoes' | 'any';

/**
 * Cách tính số lượng:
 *  - per_unit:        quantity × số món thuộc nhóm
 *  - per_extra_unit:  quantity × (số món thuộc nhóm − 1) — vd tấm ngăn giữa các hộp giày
 *  - per_carton:      quantity cố định cho mỗi kiện
 *  - void_band:       theo độ trống (1 − fill_ratio) của thùng, chọn dải cao nhất thỏa
 */
export type MaterialRuleBasis =
  'per_unit' | 'per_extra_unit' | 'per_carton' | 'void_band';

export interface MaterialVoidBand {
  min_void_ratio: number;
  quantity: number;
}

export interface MaterialRule {
  material_type: MaterialType;
  applies_to: MaterialRuleScope;
  /** Luật chỉ áp dụng khi số món thuộc nhóm ≥ min_units (mặc định 1). */
  min_units?: number;
  basis: MaterialRuleBasis;
  /** Hệ số/số lượng (per_unit, per_extra_unit, per_carton); bỏ qua với void_band. */
  quantity?: number;
  void_bands?: MaterialVoidBand[];
}

/** Dữ liệu tính vật tư truyền vào engine (từ DB hoặc luật mặc định). */
export interface MaterialPlanning {
  catalog: MaterialSpec[];
  rules: MaterialRule[];
}

export interface MaterialLine {
  code: string;
  type: MaterialType;
  name: string;
  unit: string;
  quantity: number;
  /** quantity × weight_g_per_unit */
  weight_g: number;
  /** quantity × price_vnd_per_unit */
  cost_vnd: number;
}

export interface PackOk {
  status: 'ok';
  box: BoxSpec;
  placements: Placement[];
  /** Thể tích hàng / thể tích lòng thùng, 0..1 */
  fill_ratio: number;
  items_weight_g: number;
  materials: MaterialLine[];
  materials_weight_g: number;
  materials_cost_vnd: number;
  /** Hàng + bì + vật tư (theo danh mục). */
  estimated_package_weight_g: number;
  /** Khối lượng quy đổi theo thể tích ngoài (g), theo hệ số chia. */
  volumetric_weight_g: number;
  computation_time_ms: number;
  /**
   * (22/09/2026) Thùng NHỎ HƠN xếp vừa nhưng kho đã hết (còn trống = 0)
   * nên phải dùng thùng này — null nếu đã chọn được thùng vừa nhất.
   */
  preferred_box_out_of_stock: string | null;
}

/**
 * (30/09/2026) Mã lý do no_fit — máy đọc được (service/FE quyết định gợi ý
 * xử lý), song song với chuỗi `reason` cho người đọc.
 */
export type NoFitCode =
  | 'NO_ITEMS'
  | 'NO_BOXES'
  | 'TOO_MANY_UNITS'
  | 'ITEM_TOO_LARGE'
  | 'ITEM_TOO_HEAVY'
  | 'TOTAL_VOLUME'
  | 'TOTAL_WEIGHT'
  | 'NO_ARRANGEMENT'
  | 'OUT_OF_STOCK'
  | 'BUDGET_EXHAUSTED'
  | 'TIMEOUT';

/** Gợi ý xử lý khi no_fit: chia nhiều kiện / dùng thùng lớn hơn / xử lý tay. */
export type NoFitSuggestion = 'multi_carton' | 'bigger_box' | 'manual';

export interface NoFitReason {
  box_code: string;
  reason: string;
  code?: NoFitCode;
  /** Món liên quan (ITEM_TOO_LARGE / ITEM_TOO_HEAVY). */
  item_key?: string;
}

export interface PackNoFit {
  status: 'no_fit';
  /** Lý do ngắn cho từng thùng đã thử (để nhân viên hiểu vì sao). */
  reasons: NoFitReason[];
  /** Gợi ý xử lý tiếp theo; thiếu = không có gợi ý rõ ràng. */
  suggest?: NoFitSuggestion;
  /**
   * (Bước 1) true = có BẰNG CHỨNG không xếp được (thể tích/cân/món quá cỡ);
   * false = chỉ là "chưa tìm được" (hết ngân sách, không có thùng, hết tồn).
   */
  proven_infeasible?: boolean;
  computation_time_ms: number;
}

export type PackResult = PackOk | PackNoFit;
