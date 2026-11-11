import 'package:flutter/material.dart';

import 'login_palette.dart';

/// Nền gradient ngày/đêm + khung cuộn dùng chung cho các màn đăng nhập.
class LoginBackdrop extends StatelessWidget {
  const LoginBackdrop({super.key, required this.palette, required this.child});

  final LoginPalette palette;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: palette.skyA,
      body: AnimatedContainer(
        duration: const Duration(milliseconds: 600),
        curve: Curves.easeInOut,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [palette.skyA, palette.skyB],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: child,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class LoginBrand extends StatelessWidget {
  const LoginBrand({super.key, required this.palette});

  final LoginPalette palette;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Image.asset('assets/brand/optipack-mark.png', width: 36, height: 36),
        ),
        const SizedBox(width: 10),
        Text(
          'OptiPackAI',
          style: TextStyle(color: palette.ink, fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: -0.3),
        ),
      ],
    );
  }
}

class LoginTitle extends StatelessWidget {
  const LoginTitle(this.text, {super.key, required this.palette, this.lead, this.align = TextAlign.center});

  final String text;
  final String? lead;
  final LoginPalette palette;
  final TextAlign align;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: align == TextAlign.center ? CrossAxisAlignment.center : CrossAxisAlignment.start,
      children: [
        Text(
          text,
          textAlign: align,
          style: TextStyle(color: palette.ink, fontSize: 26, fontWeight: FontWeight.w700, letterSpacing: -0.6),
        ),
        if (lead != null) ...[
          const SizedBox(height: 6),
          Text(lead!, textAlign: align, style: TextStyle(color: palette.muted, fontSize: 13.5, height: 1.5)),
        ],
      ],
    );
  }
}

class LoginLabel extends StatelessWidget {
  const LoginLabel(this.text, {super.key, required this.palette});

  final String text;
  final LoginPalette palette;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text, style: TextStyle(color: palette.muted, fontSize: 12.5, fontWeight: FontWeight.w500)),
      );
}

InputDecoration loginFieldDecoration(LoginPalette palette, {String? hint, bool invalid = false, Widget? suffix}) {
  OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: c, width: w),
      );
  return InputDecoration(
    hintText: hint,
    hintStyle: TextStyle(color: palette.muted.withValues(alpha: 0.8)),
    filled: true,
    fillColor: palette.fieldBg,
    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    border: border(invalid ? const Color(0xFFE57373) : palette.fieldBorder),
    enabledBorder: border(invalid ? const Color(0xFFE57373) : palette.fieldBorder),
    focusedBorder: border(invalid ? const Color(0xFFE57373) : palette.cta.withValues(alpha: 0.6), 1.6),
    disabledBorder: border(palette.fieldBorder),
    suffixIcon: suffix,
  );
}

/// Nút chính (màu `--ls-cta` của web), cao 48, bo 14.
class LoginCta extends StatelessWidget {
  const LoginCta({
    super.key,
    required this.palette,
    required this.onPressed,
    required this.child,
  });

  final LoginPalette palette;
  final VoidCallback? onPressed;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      child: FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: palette.cta,
          foregroundColor: palette.ctaFg,
          disabledBackgroundColor: palette.cta.withValues(alpha: 0.55),
          disabledForegroundColor: palette.ctaFg.withValues(alpha: 0.8),
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
        child: child,
      ),
    );
  }
}

class LoginAlert extends StatelessWidget {
  const LoginAlert({super.key, required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.13), borderRadius: BorderRadius.circular(12)),
      child: Text(text, style: TextStyle(color: color, fontSize: 12.8, fontWeight: FontWeight.w600)),
    );
  }
}

class LoginSpinner extends StatelessWidget {
  const LoginSpinner({super.key, required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) =>
      SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2.4, color: color));
}
