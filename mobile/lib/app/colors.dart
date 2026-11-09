import 'package:flutter/material.dart';

/// Bảng màu của app, lấy đúng từ web (`fe/src/styles/stages.css`, vỏ `.owner-shell`),
/// có cả chế độ sáng và tối (`html.dark`).
///
/// Màu đổi theo [dark]. [OptiPackApp] đặt cờ này trước khi dựng giao diện và dựng lại cả cây khi đổi chế độ,
/// nên chỗ nào đọc `AppColors.x` đều nhận đúng màu. Vì vậy các màu này là getter, không dùng trong `const`.
/// Màu bước xử lý luôn đi kèm icon hoặc chữ, không đứng một mình.
class AppColors {
  AppColors._();

  /// Đang ở chế độ tối.
  static bool dark = false;

  static Color _pick(int light, int night) => Color(dark ? night : light);

  // Màu chủ đạo (xanh ngọc) và nền.
  static Color get primary => _pick(0xFF0F766E, 0xFF14B8A6); // --app-primary
  static Color get onPrimary => _pick(0xFFFFFFFF, 0xFF06241F);
  static Color get canvas => _pick(0xFFD3E8E4, 0xFF0B2428); // nền trang
  static Color get topbar => _pick(0xFFE4F2EF, 0xFF0E2C31); // thanh trên / thanh tab
  static Color get surface => _pick(0xFFF7FCFB, 0xFF103138); // thẻ
  static Color get surface2 => _pick(0xFFE6F3F0, 0xFF15393E);
  static Color get surface3 => _pick(0xFFD9ECE8, 0xFF1B444A);
  static Color get hairline => _pick(0xFFB9D8D3, 0xFF235058); // viền
  static Color get hairlineStrong => _pick(0xFF9EC8C2, 0xFF2F646C);

  // Chữ.
  static Color get ink => _pick(0xFF10312F, 0xFFE6F6F3);
  static Color get inkMuted => _pick(0xFF2F514F, 0xFFC4DFDB);
  static Color get inkSubtle => _pick(0xFF456664, 0xFF9FC4C0);
  static Color get inkTertiary => _pick(0xFF5D7D7A, 0xFF7FA6A2);

  // Màu theo bước xử lý.
  static Color get stagePick => _pick(0xFF1D4ED8, 0xFF3B82F6); // lấy hàng
  static Color get stagePack => const Color(0xFFD946EF); // đóng gói
  static Color get stageShip => _pick(0xFF0D9488, 0xFF2DD4BF); // giao hàng
  static Color get stageReturn => _pick(0xFFEA580C, 0xFFFB923C); // hoàn hàng

  // Trạng thái.
  static Color get danger => _pick(0xFFDC2626, 0xFFF87171);
  static Color get warning => _pick(0xFFD97706, 0xFFFBBF24);
  static Color get good => _pick(0xFF059669, 0xFF34D399);

  /// Chữ đậm hơn của màu cảnh báo để đủ tương phản trên nền nhạt (sáng: trộn đen; tối: chính màu cảnh báo).
  static Color get warningText => _pick(0xFF945004, 0xFFFBBF24);

  /// Nền nhạt 14% của màu trạng thái (như nhãn `.tone-*` trên web).
  static Color get warningBg => warning.withValues(alpha: 0.14);
  static Color get goodBg => good.withValues(alpha: 0.14);
  static Color get dangerBg => danger.withValues(alpha: 0.14);
}
