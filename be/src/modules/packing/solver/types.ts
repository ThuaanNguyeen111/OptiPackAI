import type {
  BoxSpec,
  MaterialLine,
  MaterialPlanning,
  NoFitCode,
  Orientation,
  PackingUnit,
  Placement,
} from '../../packaging/engine/types';

/**
 * ===================================================================
 * Bộ giải đóng gói mới (BRKGA + EMS, chứng minh tối ưu) — kiểu dữ liệu
 * ===================================================================
 * Đơn vị lõi giữ như engine cũ: mm và gram, số nguyên; trục x = dài,
 * y = rộng, z = cao (hướng lên). Hàm thuần, không gọi DB/mạng.
 * ===================================================================
 */

/** Ưu tiên khi so hai phương án: ít kiện trước (mặc định) hay rẻ trước. */
export type SolvePreference = 'fewest_parcels' | 'cheapest';

/**
 * Nhãn chứng minh — KHÔNG dùng chữ "tối ưu" chung chung:
 *  - optimal_global: số kiện = cận dưới VÀ mọi tổ hợp thùng rẻ hơn bị loại bằng
 *    điều kiện cần (thể tích, cân, kích thước, diện tích sàn) — đúng với mọi mô hình.
 *  - optimal_in_model: CP-SAT chứng minh mọi tổ hợp rẻ hơn không xếp được theo
 *    luật chồng CHẶT HƠN của mô hình (đợt 2).
 *  - heuristic: chưa chứng minh; kèm khoảng cách tới cận dưới.
 */
export type ProofLabel = 'optimal_global' | 'optimal_in_model' | 'heuristic';

export type SolveStrategy = 'exhaustive' | 'brkga';

export interface SolveOptions {
  /** Tồn còn trống theo mã thùng (đã trừ giữ chỗ); bỏ qua = không xét tồn. */
  availability?: Map<string, number>;
  materials?: MaterialPlanning;
  /** Không dùng các thùng này (tính lại có điều kiện). */
  excludeBoxCodes?: string[];
  prefer?: SolvePreference;
  /** Seed PRNG — cùng seed + cùng đầu vào → cùng kết quả. */
  seed?: number;
  /** Trần số lần giải mã (đánh giá) của BRKGA — giới hạn xác định, không dùng đồng hồ. */
  maxEvaluations?: number;
  volumetricDivisor?: number;
  /** Bước chia đều cặp kiện lệch tải (v2). Mặc định bật; `false` để so trước/sau. */
  balance?: boolean;
}

/** Một cách đặt món: dạng (gập hay không) + hướng xoay + kích thước sau xoay. */
export interface Variant {
  unit: PackingUnit;
  orientation: Orientation;
  dx: number;
  dy: number;
  dz: number;
}

export interface SolvedParcel {
  box: BoxSpec;
  /** Món ĐÚNG DẠNG đã đặt (dạng gập nếu phải gập) — dùng để validate lại. */
  units: PackingUnit[];
  placements: Placement[];
  fill_ratio: number;
  items_weight_g: number;
  materials: MaterialLine[];
  materials_weight_g: number;
  materials_cost_vnd: number;
  /** Hàng + bì thùng + vật tư. */
  estimated_package_weight_g: number;
  /** Cân quy đổi theo thể tích NGOÀI thùng. */
  volumetric_weight_g: number;
}

export interface UnplacedUnit {
  item_key: string;
  code: NoFitCode;
  reason: string;
}

/** Mục tiêu theo bậc — so từ trái sang (nhỏ hơn = tốt hơn). */
export interface Objective {
  unplaced: number;
  parcels: number;
  /** Giá thùng + vật tư (VND). */
  packaging_cost_vnd: number;
  /** Tổng cân quy đổi (g) — thay cho cước khi chưa có bảng cước. */
  volumetric_g: number;
  folds: number;
  /** Độ lệch tải chuẩn hóa giữa các kiện (0 = đều). */
  imbalance: number;
  /** Trọng tâm tương đối (0 = sát đáy) — càng thấp càng vững. */
  cog: number;
}

export interface SolveResult {
  status: 'ok' | 'partial' | 'no_fit';
  parcels: SolvedParcel[];
  unplaced: UnplacedUnit[];
  lower_bound_parcels: number;
  proof: ProofLabel;
  strategy: SolveStrategy;
  objective: Objective;
  /** Lời giải thích máy sinh (vì sao chọn phương án này / vì sao không rẻ hơn được). */
  explanation: string[];
  /**
   * Tổ hợp thùng tốt hơn (ít kiện hơn / rẻ hơn) chưa loại được bằng kiểm tra
   * nhanh — đầu vào cho CP-SAT. Rỗng khi đã có nhãn tối ưu.
   */
  open_candidates: BoxSpec[][];
  stats: { evaluations: number; generations: number; computation_ms: number };
}
