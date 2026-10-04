/**
 * ===================================================================
 * K2 (26/09/2026) — BỐ CỤC KHO CHUẨN MỚI (layout v2)
 * ===================================================================
 * Mã ô 5 phần:   KA - D1 - P02 - T03 - 1
 *                │    │    │     │     └ Ô (thùng trên tầng)   -> 1 MÀU
 *                │    │    │     └────── Tầng                   -> 1 SIZE
 *                │    │    └──────────── Bên (T/P) + số kệ      -> 1 loại (danh mục cấp 2)
 *                │    └───────────────── Dãy                    -> nhóm hàng
 *                └────────────────────── Khu (KA..KZ)
 * Mọi ký hiệu/giới hạn gom vào 1 file — đổi quy ước (VD bên "T/P" sang
 * "TR/PH") chỉ sửa ở đây, không phải lùng khắp code.
 * Document kệ tạo TRƯỚC K2 (dạng "A-03-01-01") = layout v1, vẫn chạy.
 */
export const SIDE_LABELS = { LEFT: 'T', RIGHT: 'P' } as const; // Trái / Phải — theo quy ước user đặt
export type SideLabel = (typeof SIDE_LABELS)[keyof typeof SIDE_LABELS];
export const SIDE_VALUES: SideLabel[] = [SIDE_LABELS.LEFT, SIDE_LABELS.RIGHT];

export const ZONE_CODE_V2_REGEX = /^K[A-Z]$/; // KA, KB, ... KZ
export const AISLE_CODE_REGEX = /^D([1-9][0-9]?)$/; // D1 .. D99

export const LAYOUT_LIMITS = {
  MAX_AISLE: 99,
  MAX_BAY: 99, // số kệ mỗi bên của 1 dãy
  MAX_TIER: 9, // kệ lấy hàng tay ~2m — 9 là giới hạn cứng, khuyến nghị 5
  MAX_CELL: 9, // số thùng/ô mỗi tầng — khuyến nghị 3 (tầng 1.2m, thùng ~40cm)
} as const;

export function aisleNumber(aisleCode: string): number {
  const m = AISLE_CODE_REGEX.exec(aisleCode);
  if (!m?.[1]) throw new Error(`Mã dãy không hợp lệ: ${aisleCode}`);
  return Number(m[1]);
}

export function buildBinCodeV2(p: { zoneCode: string; aisle: string; side: SideLabel; bay: number; tier: number; cell: number }): string {
  return `${p.zoneCode}-${p.aisle}-${p.side}${String(p.bay).padStart(2, '0')}-T${String(p.tier).padStart(2, '0')}-${String(p.cell)}`;
}

/**
 * Thứ tự lấy hàng theo LỘ TRÌNH HÌNH RẮN — thay cho sắp xếp chuỗi bin_code
 * (sắp chuỗi làm nhân viên đi hết dãy rồi vòng về đầu dãy sau, và đi hết
 * bên P rồi mới quay lại bên T). Quy tắc:
 * - Khu theo thứ tự chữ cái; trong khu, dãy tăng dần.
 * - Dãy LẺ đi xuôi (kệ 1 -> 99), dãy CHẴN đi ngược (99 -> 1): hết dãy này
 *   là đang đứng ở đầu dãy kế tiếp, không đi quãng trống.
 * - Đứng ở 1 vị trí trong lối đi thì lấy cả 2 bên (T trước, P sau).
 * - Trong 1 kệ: tầng rồi ô.
 * Kết quả là 1 số nguyên — Picking List chỉ cần sắp theo số này.
 */
export function computePickSequence(p: { zoneCode: string; aisle: string; side: SideLabel; bay: number; tier: number; cell: number }): number {
  const zoneOrd = p.zoneCode.charCodeAt(1) - 64; // KA -> 1, KB -> 2 ...
  const aisleNum = aisleNumber(p.aisle);
  const bayKey = aisleNum % 2 === 1 ? p.bay : LAYOUT_LIMITS.MAX_BAY + 1 - p.bay;
  const sideIdx = p.side === SIDE_LABELS.LEFT ? 0 : 1;
  return ((((zoneOrd * 100 + aisleNum) * 100 + bayKey) * 2 + sideIdx) * 10 + p.tier) * 10 + p.cell;
}
