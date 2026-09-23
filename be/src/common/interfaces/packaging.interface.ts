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
  // BỔ SUNG (21/09/2026, engine 3D) — CHỈ thêm field optional, không đổi
  // field cũ (warehouse/picking-list vẫn dùng interface này).
  /** 'upright_only' = chỉ xoay quanh trục đứng; thiếu = 'any'. */
  orientation_rule?: 'any' | 'upright_only';
  /** Tải tối đa được đặt lên trên (kg); null/thiếu = không cho đặt gì lên. */
  max_stack_load_kg?: number | null;
  // BỔ SUNG (21/09/2026) — chỉ dùng cho hướng dẫn/hình 3D, engine bỏ qua.
  /** Giá trị của enum ProductCategory (common/enums). */
  product_category?: string | null;
  /** Mã túi zip bọc món này; null = không dùng túi. */
  zip_bag_code?: string | null;
  zip_bag_folded?: boolean;
  /** (22/09/2026) Hàng mềm được gập đôi thêm khi cần — engine tự tính số đo gập. */
  can_fold_in_half?: boolean;
}

/**
 * BỔ SUNG (21/09/2026) — 1 dòng trong danh sách LẤY HÀNG. Khác
 * PackableItem: KHÔNG bắt buộc hồ sơ đóng gói (lấy hàng trước, đo/đóng
 * gói sau) — số đo null khi SKU chưa được kho xác nhận.
 */
export interface PickableItem {
  sku: string;
  /** Số lượng ĐẶT còn phải giao (đơn còn hiệu lực, item chưa hủy). */
  quantity: number;
  /** Đã quét trong LƯỢT LẤY hiện tại. */
  picked_quantity: number;
  packaging_profile_ready: boolean;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  is_fragile: boolean | null;
}

export interface OrderGroupForPicking {
  order_group_id: string;
  items: PickableItem[];
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
