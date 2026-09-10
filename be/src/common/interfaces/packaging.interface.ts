/**
 * Hợp đồng interface CỐ ĐỊNH giữa Product Master/Order Groups (Thuận)
 * và thuật toán AI Packaging (thành viên khác trong nhóm). File dùng
 * chung — cả 2 phía cùng import, không ai tự định nghĩa lại shape
 * riêng (tránh lệch nhau giữa chừng khi code song song).
 */
export interface PackableItem {
  sku: string;
  quantity: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  weight_kg: number;
  is_fragile: boolean;
}

export interface OrderGroupForPackaging {
  order_group_id: string;
  items: PackableItem[];
}

export interface PackagingRecommendation {
  order_group_id: string;
  box_size: { length_cm: number; width_cm: number; height_cm: number };
  material_type: string;
  material_quantity: number;
  // BỔ SUNG (2026-09-09) — đề bài (Phieu_FA26SE036.docx) giao "Estimate
  // shipping costs" cho ĐÚNG actor AI Recommendation Engine — bản đầu
  // của interface này THIẾU field, phát hiện khi đối chiếu lại đề bài
  // gốc. Đơn vị: VND, số nguyên (không dùng số thập phân cho tiền VND).
  estimated_shipping_cost_vnd: number;
  computation_time_ms: number;
  fallback_used: boolean;
}
