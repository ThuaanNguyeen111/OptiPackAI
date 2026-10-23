import { UserRole } from '../../common/enums/user-role.enum';
import { ACTIVITY_CATEGORIES, type ActivityCategory } from '../activity-log/schemas/activity-log.schema';

/**
 * 23/10/2026 — Mỗi vai trò xem được lịch sử của những loại việc thuộc phần mình.
 * Admin xem tất cả (kể cả đăng nhập); Store Owner xem mọi thứ trừ nhật ký đăng nhập.
 */
export const ROLE_HISTORY_CATEGORIES: Record<UserRole, readonly ActivityCategory[]> = {
  [UserRole.ADMIN]: ACTIVITY_CATEGORIES,
  [UserRole.STORE_OWNER]: ACTIVITY_CATEGORIES.filter((c) => c !== 'auth'),
  [UserRole.WAREHOUSE_STAFF]: ['orders', 'picking', 'warehouse', 'returns', 'packaging_materials'],
  [UserRole.PACKAGING_STAFF]: ['orders', 'picking', 'packing', 'packaging_materials'],
  [UserRole.SHIPPING_COORDINATOR]: ['orders', 'shipping', 'returns'],
};

export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  orders: 'Đơn hàng',
  picking: 'Lấy hàng',
  packing: 'Đóng gói',
  shipping: 'Vận chuyển',
  returns: 'Trả / hoàn hàng',
  warehouse: 'Kho',
  packaging_materials: 'Vật liệu đóng gói',
  auth: 'Đăng nhập',
};

export const ROLE_LABELS: Record<number, string> = {
  [UserRole.STORE_OWNER]: 'Chủ cửa hàng',
  [UserRole.WAREHOUSE_STAFF]: 'Nhân viên kho',
  [UserRole.PACKAGING_STAFF]: 'Nhân viên đóng gói',
  [UserRole.SHIPPING_COORDINATOR]: 'Điều phối vận chuyển',
  [UserRole.ADMIN]: 'Quản trị',
};

/** Loại dòng sổ cái kho → nhóm lịch sử. */
export const MOVEMENT_CATEGORY: Record<string, ActivityCategory> = {
  assign_initial: 'warehouse',
  receive: 'warehouse',
  adjust: 'warehouse',
  transfer_out: 'warehouse',
  transfer_in: 'warehouse',
  pick: 'picking',
  pick_cancel: 'picking',
  cancel_return: 'picking',
  reject_return: 'picking',
  pack_replace: 'packing',
  cancel_unpack: 'packing',
  return_restock: 'returns',
};

export const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  awaiting_pickup: 'Chờ hãng lấy hàng',
  in_transit: 'Đang trung chuyển',
  out_for_delivery: 'Đang giao',
  delivery_failed: 'Giao thất bại',
  returning_to_warehouse: 'Đang hoàn về kho',
  delivered: 'Đã giao',
  returned_to_warehouse: 'Đã về kho',
  cancelled: 'Đã hủy vận đơn',
};

export const RETURN_TYPE_LABELS: Record<string, string> = {
  failed_delivery: 'Hoàn do giao thất bại',
  return_refund: 'Trả hàng hoàn tiền',
  refund_only: 'Hoàn tiền không trả hàng',
  exchange: 'Đổi hàng',
};

export const RETURN_SOURCE_LABELS: Record<string, string> = {
  marketplace: 'khách tự yêu cầu trên sàn',
  failed_delivery: 'tự tạo khi kiện giao thất bại về kho',
  simulated: 'tạo giả lập',
};

export const PLAN_ACTIVITY_LABELS: Record<string, string> = {
  start: 'Bắt đầu phiên đóng gói',
  unscan: 'Bỏ quét món',
  assign: 'Phân công người đóng',
  finish: 'Kết thúc phiên đóng gói',
  unseal: 'Mở lại kiện đã niêm phong',
  undo_approve: 'Hủy duyệt kế hoạch',
  box_source: 'Đổi nguồn thùng',
};

export const PACKAGING_MOVE_LABELS: Record<string, string> = {
  purchase: 'Nhập vật liệu',
  consume: 'Dùng vật liệu',
  recover: 'Thu hồi vật liệu',
  internal_use: 'Dùng nội bộ',
  discard: 'Loại bỏ vật liệu',
  waste: 'Hao hụt',
};
