import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/network/api_exception.dart';
import 'login/login_logic.dart';
import 'login/login_palette.dart';
import 'login/login_widgets.dart';

/// Số giây chờ giữa hai lần gửi lại — bằng web (`RESEND_SECONDS`).
const resendSeconds = 60;

/// Quên mật khẩu: nhập email → BE gửi liên kết đặt lại. Đặt lại mật khẩu làm trên trang web qua liên kết trong email.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _email = TextEditingController();
  Timer? _timer;
  String? _error;
  String? _info;
  String _sentTo = '';
  bool _loading = false;
  bool _sent = false;
  int _cooldown = 0;

  @override
  void dispose() {
    _timer?.cancel();
    _email.dispose();
    super.dispose();
  }

  void _startCooldown() {
    _timer?.cancel();
    setState(() => _cooldown = resendSeconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _cooldown = _cooldown <= 1 ? 0 : _cooldown - 1);
      if (_cooldown == 0) t.cancel();
    });
  }

  Future<void> _send({bool resend = false}) async {
    final email = resend ? _sentTo : _email.text;
    final error = validateEmail(email);
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final message = await ref.read(authRepositoryProvider).forgotPassword(email);
      if (!mounted) return;
      setState(() {
        _sent = true;
        _sentTo = email.trim();
        _info = message;
      });
      _startCooldown();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    const p = LoginPalette.day;
    return LoginBackdrop(
      palette: p,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LoginBrand(palette: p),
          const SizedBox(height: 28),
          if (!_sent) ..._form(p) else ..._done(p),
          const SizedBox(height: 16),
          TextButton(
            onPressed: () => context.go('/login'),
            style: TextButton.styleFrom(foregroundColor: p.ink),
            child: const Text('← Quay lại đăng nhập'),
          ),
        ],
      ),
    );
  }

  List<Widget> _form(LoginPalette p) {
    return [
      LoginTitle('Quên mật khẩu?', palette: p, lead: 'Nhập email của bạn để nhận liên kết đặt lại mật khẩu'),
      const SizedBox(height: 22),
      LoginLabel('Email', palette: p),
      TextField(
        controller: _email,
        enabled: !_loading,
        autofocus: true,
        keyboardType: TextInputType.emailAddress,
        autofillHints: const [AutofillHints.email],
        textInputAction: TextInputAction.done,
        style: TextStyle(color: p.fieldInk, fontSize: 15),
        onSubmitted: (_) => _send(),
        decoration: loginFieldDecoration(p, hint: 'ten@congty.vn', invalid: _error != null),
      ),
      if (_error != null) ...[
        const SizedBox(height: 8),
        Text(_error!, style: TextStyle(color: p.errText, fontSize: 12.8, fontWeight: FontWeight.w600)),
      ],
      const SizedBox(height: 16),
      LoginCta(
        palette: p,
        onPressed: _loading ? null : () => _send(),
        child: _loading
            ? Row(
                mainAxisSize: MainAxisSize.min,
                children: [LoginSpinner(color: p.ctaFg), const SizedBox(width: 10), const Text('Đang gửi…')],
              )
            : const Text('Gửi liên kết khôi phục'),
      ),
    ];
  }

  List<Widget> _done(LoginPalette p) {
    return [
      Center(
        child: Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(color: p.cta.withValues(alpha: 0.12), shape: BoxShape.circle),
          child: Icon(Icons.mark_email_read_outlined, color: p.ink, size: 28),
        ),
      ),
      const SizedBox(height: 16),
      LoginTitle(
        'Kiểm tra hòm thư',
        palette: p,
        lead: '${_info ?? 'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.'} $_sentTo',
      ),
      if (_error != null) ...[
        const SizedBox(height: 8),
        Text(_error!, textAlign: TextAlign.center, style: TextStyle(color: p.errText, fontSize: 12.8)),
      ],
      const SizedBox(height: 20),
      OutlinedButton(
        onPressed: _cooldown > 0 || _loading ? null : () => _send(resend: true),
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(44),
          foregroundColor: p.ink,
          side: BorderSide(color: p.fieldBorder),
          backgroundColor: p.fieldBg.withValues(alpha: 0.7),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
        child: _loading
            ? const Text('Đang gửi lại…')
            : Text(_cooldown > 0 ? 'Gửi lại sau ${_cooldown}s' : 'Gửi lại liên kết'),
      ),
    ];
  }
}
