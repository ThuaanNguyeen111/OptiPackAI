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

export const ALL_ORIENTATIONS: readonly Orientation[] = ['LWH', 'WLH', 'LHW', 'HLW', 'WHL', 'HWL'];
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

export interface MaterialLine {
  type: 'bubble_wrap';
  quantity: number;
}

export interface PackOk {
  status: 'ok';
  box: BoxSpec;
  placements: Placement[];
  /** Thể tích hàng / thể tích lòng thùng, 0..1 */
  fill_ratio: number;
  items_weight_g: number;
  materials: MaterialLine[];
  /** Hàng + bì + vật tư đã biết khối lượng. */
  estimated_package_weight_g: number;
  /** Khối lượng quy đổi theo thể tích ngoài (g), theo hệ số chia. */
  volumetric_weight_g: number;
  computation_time_ms: number;
}

export interface PackNoFit {
  status: 'no_fit';
  /** Lý do ngắn cho từng thùng đã thử (để nhân viên hiểu vì sao). */
  reasons: { box_code: string; reason: string }[];
  computation_time_ms: number;
}

export type PackResult = PackOk | PackNoFit;
