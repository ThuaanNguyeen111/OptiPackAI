import 'package:flutter/material.dart';

/// Bảng màu trang đăng nhập, lấy từ `fe/src/components/auth/login-scene.css`.
/// Hiện mật khẩu thì chuyển sang "ban đêm" (như đèn pin của web).
class LoginPalette {
  const LoginPalette({
    required this.skyA,
    required this.skyB,
    required this.ink,
    required this.muted,
    required this.fieldBg,
    required this.fieldBorder,
    required this.fieldInk,
    required this.cta,
    required this.ctaFg,
    required this.okText,
    required this.errText,
    required this.night,
  });

  final Color skyA;
  final Color skyB;
  final Color ink;
  final Color muted;
  final Color fieldBg;
  final Color fieldBorder;
  final Color fieldInk;
  final Color cta;
  final Color ctaFg;
  final Color okText;
  final Color errText;
  final bool night;

  static const day = LoginPalette(
    skyA: Color(0xFFD4ECDD),
    skyB: Color(0xFFC5E3D0),
    ink: Color(0xFF152D35),
    muted: Color(0xFF4A6B6F),
    fieldBg: Color(0xD9FFFFFF),
    fieldBorder: Color(0xF0FFFFFF),
    fieldInk: Color(0xFF152D35),
    cta: Color(0xFF152D35),
    ctaFg: Color(0xFFD4ECDD),
    okText: Color(0xFF0F7A4A),
    errText: Color(0xFFB42318),
    night: false,
  );

  static const nightMode = LoginPalette(
    skyA: Color(0xFF152D35),
    skyB: Color(0xFF0C1C22),
    ink: Color(0xFFD4ECDD),
    muted: Color(0xFFA8C4B8),
    fieldBg: Color(0xCC0C1C21),
    fieldBorder: Color(0x29D4ECDD),
    fieldInk: Color(0xFFEEF8F2),
    cta: Color(0xFFD4ECDD),
    ctaFg: Color(0xFF152D35),
    okText: Color(0xFF6EE7B7),
    errText: Color(0xFFFCA5A5),
    night: true,
  );
}
