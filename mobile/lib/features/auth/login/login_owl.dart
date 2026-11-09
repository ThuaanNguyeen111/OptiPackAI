import 'package:flutter/material.dart';

import 'login_logic.dart';
import 'login_palette.dart';

/// Cú OptiPack: vẽ lại từ SVG của web (`fe/src/components/auth/LoginOwl.tsx`, khung 64 × 64).
class LoginOwl extends StatelessWidget {
  const LoginOwl({super.key, required this.mood, this.size = 72});

  final OwlMood mood;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      excludeSemantics: true,
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 220),
        child: SizedBox(
          key: ValueKey(mood),
          width: size,
          height: size,
          child: CustomPaint(painter: _OwlPainter(mood)),
        ),
      ),
    );
  }
}

class _OwlPainter extends CustomPainter {
  _OwlPainter(this.mood);

  final OwlMood mood;

  static const _dark = Color(0xFF152D35);
  static const _belly = Color(0xFF2A4A54);
  static const _face = Color(0xFFD4ECDD);
  static const _wing = Color(0xFF0F2228);
  static const _beak = Color(0xFFE8A54B);

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 64, size.height / 64);
    canvas.translate(0, -2);

    final eyesShut = mood == OwlMood.shy;
    final browsDown = mood == OwlMood.error;
    final happy = mood == OwlMood.ok || mood == OwlMood.greet || mood == OwlMood.welcome;

    Paint fill(Color c, [double opacity = 1]) => Paint()..color = c.withValues(alpha: opacity);
    Paint stroke(Color c, double w) => Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = w
      ..strokeCap = StrokeCap.round
      ..color = c;

    // thân + bụng
    canvas.drawOval(Rect.fromCenter(center: const Offset(32, 42), width: 44, height: 48), fill(_dark));
    canvas.drawOval(Rect.fromCenter(center: const Offset(32, 46), width: 28, height: 32), fill(_belly));
    canvas.drawCircle(const Offset(26, 48), 2.2, fill(_face, 0.35));
    canvas.drawCircle(const Offset(34, 52), 1.8, fill(_face, 0.30));
    canvas.drawCircle(const Offset(38, 44), 1.6, fill(_face, 0.28));

    // đầu + tai
    canvas.drawCircle(const Offset(32, 26), 18, fill(_dark));
    canvas.drawPath(
      Path()
        ..moveTo(16, 18)
        ..lineTo(12, 6)
        ..lineTo(24, 14)
        ..close(),
      fill(_dark),
    );
    canvas.drawPath(
      Path()
        ..moveTo(48, 18)
        ..lineTo(52, 6)
        ..lineTo(40, 14)
        ..close(),
      fill(_dark),
    );

    // mặt
    canvas.drawOval(Rect.fromCenter(center: const Offset(32, 28), width: 28, height: 24), fill(_face));

    // lông mày
    final left = Path()..moveTo(20, browsDown ? 22 : (happy ? 23 : 22));
    final right = Path()..moveTo(34, browsDown ? 23 : 22);
    if (browsDown) {
      left.quadraticBezierTo(26, 26, 30, 23);
      right.quadraticBezierTo(38, 26, 44, 22);
    } else if (happy) {
      left.quadraticBezierTo(26, 20, 30, 22);
      right
        ..reset()
        ..moveTo(34, 22)
        ..quadraticBezierTo(38, 20, 44, 23);
    } else {
      left.quadraticBezierTo(26, 20, 30, 22);
      right.quadraticBezierTo(38, 20, 44, 22);
    }
    canvas.drawPath(left, stroke(_dark, 1.8));
    canvas.drawPath(right, stroke(_dark, 1.8));

    // mắt
    if (eyesShut) {
      canvas.drawPath(Path()..moveTo(22, 28)..quadraticBezierTo(26, 31, 30, 28), stroke(_dark, 2));
      canvas.drawPath(Path()..moveTo(34, 28)..quadraticBezierTo(38, 31, 42, 28), stroke(_dark, 2));
    } else {
      final dx = mood == OwlMood.watch ? 1.2 : 0.0;
      final dy = mood == OwlMood.watch ? 0.5 : 0.0;
      for (final cx in [26.0, 38.0]) {
        canvas.drawCircle(Offset(cx, 28), 4.5, fill(Colors.white));
        canvas.drawCircle(Offset(cx + dx, 28 + dy), 2.2, fill(_dark));
      }
    }

    // mỏ
    canvas.drawPath(
      Path()
        ..moveTo(32, 32)
        ..lineTo(28, 36)
        ..lineTo(36, 36)
        ..close(),
      fill(_beak),
    );

    // cánh (xoay ±20°)
    void wing(double cx, double angleDeg) {
      canvas.save();
      canvas.translate(cx, 48);
      canvas.rotate(angleDeg * 3.1415926535 / 180);
      canvas.drawOval(Rect.fromCenter(center: Offset.zero, width: 12, height: 20), fill(_wing));
      canvas.restore();
    }

    wing(14, -20);
    wing(50, 20);

    // chân
    final feet = stroke(_beak, 2);
    for (final x in [24.0, 30.0, 36.0]) {
      canvas.drawPath(Path()..moveTo(x, 64)..quadraticBezierTo(x + 2, 61, x + 4, 64), feet);
    }
  }

  @override
  bool shouldRepaint(covariant _OwlPainter old) => old.mood != mood;
}

/// Bong bóng thoại của cú (đổi màu theo biểu cảm, đuôi chỉ xuống đầu cú).
class OwlBubble extends StatelessWidget {
  const OwlBubble({super.key, required this.state, required this.palette});

  final OwlState state;
  final LoginPalette palette;

  @override
  Widget build(BuildContext context) {
    final isError = state.mood == OwlMood.error;
    final bg = isError
        ? (palette.night ? const Color(0x38B43C3C) : const Color(0xFFFDECEC))
        : (palette.night ? const Color(0x29D4ECDD) : const Color(0xFFEDF8F1));
    final border = isError
        ? (palette.night ? const Color(0x59F5A0A0) : const Color(0x8CE57373))
        : (palette.night ? const Color(0x59A7D4B8) : const Color(0xCCA7D4B8));
    final text = isError
        ? (palette.night ? const Color(0xFFFCA5A5) : const Color(0xFF9B2C2C))
        : (palette.night ? const Color(0xFFE6F5EC) : const Color(0xFF14532D));

    return Semantics(
      liveRegion: true,
      label: state.message,
      child: ExcludeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              constraints: const BoxConstraints(maxWidth: 300),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: bg,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: border),
              ),
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: Text(
                  state.message,
                  key: ValueKey(state.message),
                  style: TextStyle(color: text, fontSize: 13, height: 1.35, fontWeight: FontWeight.w500),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(left: 28),
              child: CustomPaint(
                size: const Size(12, 6),
                painter: _TailPainter(bg, border),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TailPainter extends CustomPainter {
  _TailPainter(this.fill, this.border);

  final Color fill;
  final Color border;

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width / 2, size.height)
      ..lineTo(size.width, 0);
    canvas.drawPath(path, Paint()..color = fill);
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = border,
    );
  }

  @override
  bool shouldRepaint(covariant _TailPainter old) => old.fill != fill || old.border != border;
}
