import { registerAs } from '@nestjs/config';

/** Kết nối tới microservice CP-SAT `packer/` (chứng minh tối ưu đóng gói). */
export interface PackerConfig {
  baseUrl: string;
  timeoutMs: number;
  /** Đơn tối đa bao nhiêu món thì mới hỏi CP-SAT (đo bằng scripts/cpsat-benchmark.ts). */
  maxUnits: number;
  /** Thời gian xác định (giây quy ước của CP-SAT) cho mỗi tổ hợp thùng. */
  deterministicTimePerCombo: number;
  /** Trần thời gian thật (giây) cho cả 1 lần hỏi. */
  wallTimeLimitS: number;
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : null;
}

function positive(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * ===================================================================
 * CP-SAT (04/10/2026, đợt 2 làm lại đóng gói)
 * ===================================================================
 * `PACKER_ENABLED=false` hoặc thiếu `PACKER_URL` → `packer: null`: hệ thống
 * vẫn chạy với BRKGA, chỉ không nâng nhãn lên `optimal_in_model`.
 * Số mặc định đã đo trên 300 đơn: 97,8% đơn ≤ 12 món được chứng minh,
 * p95 cả pipeline 2,5 s, kết quả xác định.
 * ===================================================================
 */
export default registerAs('packer', () => {
  const baseUrl = nonEmpty(process.env.PACKER_URL);
  const enabled = nonEmpty(process.env.PACKER_ENABLED)?.toLowerCase() !== 'false';
  const packer: PackerConfig | null =
    baseUrl && enabled
      ? {
          baseUrl,
          timeoutMs: positive(process.env.PACKER_TIMEOUT_MS, 15000),
          maxUnits: positive(process.env.PACKER_MAX_UNITS, 12),
          deterministicTimePerCombo: positive(process.env.PACKER_DET_TIME_PER_COMBO, 1),
          wallTimeLimitS: positive(process.env.PACKER_WALL_TIME_S, 6),
        }
      : null;
  return { packer };
});
