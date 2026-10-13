/**
 * ===================================================================
 * Ngân sách tính toán XÁC ĐỊNH (Bước 1, tin cậy kết quả)
 * ===================================================================
 * Trước đây engine dừng theo đồng hồ tường (ms) nên cùng một đơn có thể ra
 * kết quả khác nhau giữa hai lần chạy khi máy bận. Giờ giới hạn chính là SỐ
 * LẦN KIỂM TRA VỊ TRÍ (mỗi lần `checkDeadline` gọi = 1 lần) — cùng đầu vào thì
 * dừng đúng chỗ cũ. Đồng hồ tường chỉ còn là chốt chặn an toàn rất lớn.
 * ===================================================================
 */

/** Tổng số lần kiểm tra cho 1 đơn một thùng (≈ 2 s trên máy dev, ~1.400 lần/ms; ca hợp lệ nặng nhất đo được ~420k). */
export const DEFAULT_MAX_CHECKS = 3_000_000;
/** Tổng số lần kiểm tra cho 1 đơn đa kiện (mặc định). */
export const DEFAULT_MULTI_MAX_CHECKS = 15_000_000;
/** Chốt chặn đồng hồ tường: chỉ để chống treo, không phải giới hạn thường dùng. */
export const SAFETY_WALL_CLOCK_MS = 60_000;

/** Bộ đếm dùng chung; có thể chia sẻ giữa nhiều lệnh gọi để trừ dần. */
export class CheckBudget {
  used = 0;
  constructor(public readonly limit: number) {}

  get remaining(): number {
    return Math.max(0, this.limit - this.used);
  }

  get exhausted(): boolean {
    return this.used >= this.limit;
  }
}
