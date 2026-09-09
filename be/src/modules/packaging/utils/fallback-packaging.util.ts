import { PackableItem, PackagingRecommendation } from '../../../common/interfaces/packaging.interface';

/**
 * ===================================================================
 * Thuật toán fallback ĐƠN GIẢN — First Fit Decreasing cơ bản, đúng
 * theo UC-03 Alt Flow (Report 1) đã note từ trước: "Thuật toán vượt
 * quá 5 giây (timeout) -> hệ thống dùng thuật toán fallback đơn giản
 * (First Fit Decreasing) và đánh dấu 'Fallback Used'".
 * ===================================================================
 * KHÔNG PHẢI code test bỏ đi — đây là phần LƯỚI AN TOÀN thật sự cần
 * có trong hệ thống production, chỉ là được code SỚM hơn dự kiến để
 * mở khóa việc test UC-04 + 5 endpoint fulfillment mà không cần chờ
 * thuật toán AI thật (thành viên khác đang làm, Package 3). Khi AI
 * thật xong, code của họ là đường CHÍNH — hàm này vẫn giữ nguyên,
 * đóng đúng vai trò fallback như thiết kế ban đầu, KHÔNG cần viết lại.
 * ===================================================================
 */

// Danh sách thùng chuẩn cố định — tạm hard-code, sẽ chuyển thành cấu
// hình động (Admin quản lý qua UC-09) khi module đó được code — KHÔNG
// thuộc phạm vi lượt này, chỉ cần đủ dùng để test luồng.
const STANDARD_BOX_SIZES = [
  { length_cm: 20, width_cm: 15, height_cm: 10, max_volume_cm3: 3000, material_type: 'Small Box' },
  { length_cm: 35, width_cm: 25, height_cm: 20, max_volume_cm3: 17500, material_type: 'Medium Box' },
  { length_cm: 50, width_cm: 40, height_cm: 35, max_volume_cm3: 70000, material_type: 'Large Box' },
] as const;

const SAFETY_PADDING_FACTOR = 0.1; // BR-05 (Report 1) — 10% mặc định
const SHIPPING_COST_PER_KG_VND = 15000; // ước tính thô, đơn giá cố định tạm thời

export function computeFallbackPackaging(
  input: PackableItem[],
): Omit<PackagingRecommendation, 'order_group_id'> {
  const startedAt = Date.now();

  const totalVolumeCm3 = input.reduce(
    (sum, item) => sum + item.length_cm * item.width_cm * item.height_cm * item.quantity,
    0,
  );
  const totalWeightKg = input.reduce((sum, item) => sum + item.weight_kg * item.quantity, 0);
  const hasFragileItem = input.some((item) => item.is_fragile);

  const volumeWithPadding = totalVolumeCm3 * (1 + SAFETY_PADDING_FACTOR);

  // noUncheckedIndexedAccess (tsconfig strict) khiến index truy cập
  // mảng luôn trả về T | undefined — tách riêng, guard rõ ràng thay vì
  // ép kiểu (đúng CLAUDE.md, tránh non-null assertion không cần thiết).
  const largestBox = STANDARD_BOX_SIZES.at(-1);
  if (!largestBox) {
    throw new Error('STANDARD_BOX_SIZES không được để rỗng.'); // không thể xảy ra thực tế (literal cố định 3 phần tử), chỉ để thỏa strict null check
  }

  // First Fit — chọn thùng NHỎ NHẤT đủ chứa, duyệt theo thứ tự tăng dần.
  const chosenBox =
    STANDARD_BOX_SIZES.find((box) => box.max_volume_cm3 >= volumeWithPadding) ?? largestBox; // vượt cả thùng lớn nhất -> vẫn trả thùng lớn nhất, KHÔNG throw (để UC-04 Alt Flow "Multi-package required" xử lý ở tầng trên, không phải việc của thuật toán này)

  return {
    box_size: {
      length_cm: chosenBox.length_cm,
      width_cm: chosenBox.width_cm,
      height_cm: chosenBox.height_cm,
    },
    material_type: hasFragileItem ? 'Bubble Wrap' : chosenBox.material_type, // BR-06 (Report 1) — sản phẩm fragile bắt buộc Bubble Wrap
    material_quantity: hasFragileItem ? 2 : 1,
    estimated_shipping_cost_vnd: Math.round(totalWeightKg * SHIPPING_COST_PER_KG_VND),
    computation_time_ms: Date.now() - startedAt,
    fallback_used: true,
  };
}
