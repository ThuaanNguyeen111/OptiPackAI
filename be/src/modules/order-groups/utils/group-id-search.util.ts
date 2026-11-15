/**
 * 10/11/2026 — Tìm nhóm đơn theo ĐUÔI mã (BE_MOBILE_CHECKLIST mục 9).
 *
 * Nhân viên gõ / quét vài ký tự CUỐI của mã nhóm (màn kho, đóng gói, nhãn chỉ in đuôi mã).
 * Tìm "đuôi" trên `_id` buộc Mongo đổi từng `_id` ra chuỗi rồi so (quét cả bảng). Cách làm:
 * lưu thêm `id_reversed` = mã nhóm viết NGƯỢC; đuôi mã viết ngược thành ĐẦU chuỗi, nên
 * tìm bằng regex neo đầu `^…` — Mongo dùng được index (chỉ duyệt khoảng khớp).
 *   _id          6af210305755b14ad13f632a
 *   id_reversed  a236f31da41b557503012fa6
 *   gõ "13f632a" → tìm id_reversed bắt đầu bằng "a236f31".
 */
export function reverseHexId(hexId: string): string {
  return hexId.toLowerCase().split('').reverse().join('');
}

/** Điều kiện Mongo cho đuôi mã `suffix` (chỉ chữ số hex, đã kiểm tra trước khi gọi). */
export function groupIdSuffixFilters(suffix: string): Record<string, unknown>[] {
  const lower = suffix.toLowerCase();
  return [
    { id_reversed: { $regex: `^${reverseHexId(lower)}` } },
    // Nhóm cũ chưa chạy backfill (id_reversed = null): vẫn tìm được theo cách cũ. Index
    // id_reversed lọc trước đúng các nhóm còn null nên không quét cả bảng; chạy
    // scripts/backfill-order-group-id-reversed.ts xong thì nhánh này không còn nhóm nào.
    { id_reversed: null, $expr: { $regexMatch: { input: { $toString: '$_id' }, regex: `${lower}$` } } },
  ];
}
