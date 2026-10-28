/**
 * 29/10/2026 — Danh sách phường (địa chỉ MỚI sau sáp nhập 7/2025, TP.HCM) MẶC ĐỊNH được giao hỏa tốc.
 *
 * Thuận chốt: hỏa tốc chỉ cho "nội thành" = 16 quận nội thành TP.HCM cũ + TP Thủ Đức cũ + Thủ Dầu Một,
 * Thuận An, Dĩ An (Bình Dương cũ). Địa chỉ mới chỉ còn Phường + Tỉnh nên không biết quận cũ — danh sách
 * này SINH TỪ bảng chuyển đổi phường cũ → mới của thư viện `vietnam-divisions-js@3`
 * (`Migration.getWardMappings()`, cùng thư viện trang thanh toán AURELLE dùng để chọn phường): lấy mọi
 * phường mới có ÍT NHẤT 1 phường cũ thuộc các quận/thành phố trên (comment cuối dòng = quận cũ).
 * 2 phường ghép từ khu được hỏa tốc + khu ngoài (Phường Bình Dương: Thủ Dầu Một + Tân Uyên; Phường Phú An:
 * Thủ Dầu Một + Bến Cát) vẫn được tính. Admin AURELLE thêm/bớt được (storefront_settings).
 */
export const DEFAULT_EXPRESS_WARDS: readonly string[] = [
  'Phường Bến Thành', // Quận 1
  'Phường Cầu Ông Lãnh', // Quận 1
  'Phường Sài Gòn', // Quận 1
  'Phường Tân Định', // Quận 1
  'Phường Diên Hồng', // Quận 10
  'Phường Hòa Hưng', // Quận 10
  'Phường Vườn Lài', // Quận 10
  'Phường Bình Thới', // Quận 11
  'Phường Hòa Bình', // Quận 11
  'Phường Minh Phụng', // Quận 11
  'Phường Phú Thọ', // Quận 11
  'Phường An Phú Đông', // Quận 12
  'Phường Đông Hưng Thuận', // Quận 12
  'Phường Tân Thới Hiệp', // Quận 12
  'Phường Thới An', // Quận 12
  'Phường Trung Mỹ Tây', // Quận 12
  'Phường Bàn Cờ', // Quận 3
  'Phường Nhiêu Lộc', // Quận 3
  'Phường Xuân Hòa', // Quận 3
  'Phường Khánh Hội', // Quận 4
  'Phường Vĩnh Hội', // Quận 4
  'Phường Xóm Chiếu', // Quận 4
  'Phường An Đông', // Quận 5
  'Phường Chợ Lớn', // Quận 5
  'Phường Chợ Quán', // Quận 5
  'Phường Bình Phú', // Quận 6
  'Phường Bình Tây', // Quận 6
  'Phường Bình Tiên', // Quận 6
  'Phường Phú Lâm', // Quận 6
  'Phường Phú Thuận', // Quận 7
  'Phường Tân Hưng', // Quận 7
  'Phường Tân Mỹ', // Quận 7
  'Phường Tân Thuận', // Quận 7
  'Phường Bình Đông', // Quận 8
  'Phường Chánh Hưng', // Quận 8
  'Phường Phú Định', // Quận 8
  'Phường An Lạc', // Quận Bình Tân
  'Phường Bình Hưng Hòa', // Quận Bình Tân
  'Phường Bình Tân', // Quận Bình Tân
  'Phường Bình Trị Đông', // Quận Bình Tân
  'Phường Tân Tạo', // Quận Bình Tân
  'Phường Bình Lợi Trung', // Quận Bình Thạnh
  'Phường Bình Quới', // Quận Bình Thạnh
  'Phường Bình Thạnh', // Quận Bình Thạnh
  'Phường Gia Định', // Quận Bình Thạnh
  'Phường Thạnh Mỹ Tây', // Quận Bình Thạnh
  'Phường An Hội Đông', // Quận Gò Vấp
  'Phường An Hội Tây', // Quận Gò Vấp
  'Phường An Nhơn', // Quận Gò Vấp
  'Phường Gò Vấp', // Quận Gò Vấp
  'Phường Hạnh Thông', // Quận Gò Vấp
  'Phường Thông Tây Hội', // Quận Gò Vấp
  'Phường Cầu Kiệu', // Quận Phú Nhuận
  'Phường Đức Nhuận', // Quận Phú Nhuận
  'Phường Phú Nhuận', // Quận Phú Nhuận
  'Phường Bảy Hiền', // Quận Tân Bình
  'Phường Tân Bình', // Quận Tân Bình
  'Phường Tân Hòa', // Quận Tân Bình
  'Phường Tân Sơn', // Quận Tân Bình
  'Phường Tân Sơn Hòa', // Quận Tân Bình
  'Phường Tân Sơn Nhất', // Quận Tân Bình
  'Phường Phú Thạnh', // Quận Tân Phú
  'Phường Phú Thọ Hòa', // Quận Tân Phú
  'Phường Tân Phú', // Quận Tân Phú
  'Phường Tân Sơn Nhì', // Quận Tân Phú
  'Phường Tây Thạnh', // Quận Tân Phú
  'Phường Dĩ An', // Thành phố Dĩ An
  'Phường Đông Hòa', // Thành phố Dĩ An
  'Phường Tân Đông Hiệp', // Thành phố Dĩ An
  'Phường Bình Dương', // Thành phố Thủ Dầu Một
  'Phường Chánh Hiệp', // Thành phố Thủ Dầu Một
  'Phường Phú An', // Thành phố Thủ Dầu Một
  'Phường Phú Lợi', // Thành phố Thủ Dầu Một
  'Phường Thủ Dầu Một', // Thành phố Thủ Dầu Một
  'Phường An Khánh', // Thành phố Thủ Đức
  'Phường Bình Trưng', // Thành phố Thủ Đức
  'Phường Cát Lái', // Thành phố Thủ Đức
  'Phường Hiệp Bình', // Thành phố Thủ Đức
  'Phường Linh Xuân', // Thành phố Thủ Đức
  'Phường Long Bình', // Thành phố Thủ Đức
  'Phường Long Phước', // Thành phố Thủ Đức
  'Phường Long Trường', // Thành phố Thủ Đức
  'Phường Phước Long', // Thành phố Thủ Đức
  'Phường Tam Bình', // Thành phố Thủ Đức
  'Phường Tăng Nhơn Phú', // Thành phố Thủ Đức
  'Phường Thủ Đức', // Thành phố Thủ Đức
  'Phường An Phú', // Thành phố Thuận An
  'Phường Bình Hòa', // Thành phố Thuận An
  'Phường Lái Thiêu', // Thành phố Thuận An
  'Phường Thuận An', // Thành phố Thuận An
  'Phường Thuận Giao', // Thành phố Thuận An
];
