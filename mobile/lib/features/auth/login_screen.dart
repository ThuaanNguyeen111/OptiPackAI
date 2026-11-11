import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/network/api_exception.dart';
import 'auth_models.dart';
import 'login/login_logic.dart';
import 'login/login_owl.dart';
import 'login/login_palette.dart';
import 'login/login_widgets.dart';

enum _MfaMode { totp, backup }

/// Trang đăng nhập — giống trang web (`fe/src/pages/LoginPage.tsx`): cú OptiPack đổi biểu cảm theo form,
/// hiện mật khẩu thì chuyển nền "ban đêm", ghi nhớ email, quên mật khẩu, xác thực 2 lớp (mã 6 số hoặc mã dự phòng),
/// màn khóa tài khoản 72 giờ và màn "Chào mừng trở lại" trước khi vào app.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _mfa = TextEditingController();
  final _backup = TextEditingController();
  final _emailFocus = FocusNode();
  final _passwordFocus = FocusNode();

  bool _showPassword = false;
  bool _remember = false;
  bool _loading = false;
  bool _mfaStep = false;
  bool _locked = false;
  bool _greetDone = false;
  _MfaMode _mfaMode = _MfaMode.totp;

  String? _emailError;
  String? _passwordError;
  String? _mfaError;
  String? _formError;

  Timer? _greetTimer;

  @override
  void initState() {
    super.initState();
    _emailFocus.addListener(_rebuild);
    _passwordFocus.addListener(_rebuild);
    _email.addListener(_rebuild);
    _password.addListener(_rebuild);
    _greetTimer = Timer(const Duration(milliseconds: 3200), () {
      if (mounted) setState(() => _greetDone = true);
    });
    _loadRemembered();
  }

  Future<void> _loadRemembered() async {
    final saved = await ref.read(authRepositoryProvider).rememberedEmail();
    if (!mounted || saved == null || saved.isEmpty) return;
    setState(() {
      _email.text = saved;
      _remember = true;
    });
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _greetTimer?.cancel();
    _email.dispose();
    _password.dispose();
    _mfa.dispose();
    _backup.dispose();
    _emailFocus.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  bool _validateCredentials() {
    final e = validateEmail(_email.text);
    final p = validatePassword(_password.text);
    setState(() {
      _emailError = e;
      _passwordError = p;
      _formError = null;
    });
    return e == null && p == null;
  }

  Future<void> _submit() async {
    if (_loading) return;
    if (_mfaStep) {
      if (_mfaMode == _MfaMode.totp) {
        if (!isValidTotp(_mfa.text)) {
          setState(() => _mfaError = 'Nhập mã xác thực 6 số.');
          return;
        }
        await _login(mfaToken: _mfa.text.trim());
      } else {
        if (_backup.text.trim().isEmpty) {
          setState(() => _mfaError = 'Nhập mã dự phòng.');
          return;
        }
        await _login(backupCode: _backup.text.trim());
      }
      return;
    }
    if (!_validateCredentials()) return;
    await _login();
  }

  Future<void> _login({String? mfaToken, String? backupCode}) async {
    FocusScope.of(context).unfocus();
    setState(() {
      _loading = true;
      _emailError = null;
      _passwordError = null;
      _mfaError = null;
      _formError = null;
      _locked = false;
    });
    try {
      final outcome = await ref.read(authControllerProvider.notifier).login(
            _email.text,
            _password.text,
            mfaToken: mfaToken,
            backupCode: backupCode,
          );
      if (!mounted) return;
      if (outcome is LoginMfaRequired) {
        setState(() => _mfaStep = true);
        return;
      }
      // Đăng nhập thành công: AuthState có pendingUser → màn "Chào mừng trở lại" hiện ra.
      await ref
          .read(authRepositoryProvider)
          .setRememberedEmail(_remember ? _email.text.trim() : null);
    } on ApiException catch (e) {
      if (!mounted) return;
      if (isAccountLockedMessage(e.message)) {
        setState(() {
          _locked = true;
          _formError = accountLockedMessage;
        });
      } else {
        setState(() {
          _formError = e.message;
          if (_mfaStep) _mfaError = e.message;
        });
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _backToLogin() {
    setState(() {
      _mfaStep = false;
      _mfa.clear();
      _backup.clear();
      _mfaError = null;
      _formError = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final pending = auth.pendingUser;

    if (pending != null) {
      return _WelcomeBack(
        mustChangePassword: auth.pendingMustChange,
        onContinue: () => ref.read(authControllerProvider.notifier).enterWorkspace(),
      );
    }

    if (_locked) {
      final p = LoginPalette.day;
      return LoginBackdrop(
        palette: p,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            LoginBrand(palette: p),
            const SizedBox(height: 28),
            LoginTitle('Tài khoản đã bị khóa', palette: p, lead: accountLockedMessage),
            const SizedBox(height: 24),
            LoginCta(
              palette: p,
              onPressed: () => setState(() {
                _locked = false;
                _formError = null;
              }),
              child: const Text('Quay lại đăng nhập'),
            ),
          ],
        ),
      );
    }

    // Hiện mật khẩu thì chuyển nền ban đêm (đèn pin của web).
    final night = _showPassword && !_mfaStep;
    final p = night ? LoginPalette.nightMode : LoginPalette.day;
    final owl = deriveOwl(
      email: _email.text,
      password: _password.text,
      formError: _formError,
      emailError: _emailError,
      passwordError: _passwordError,
      emailFocused: _emailFocus.hasFocus,
      passwordFocused: _passwordFocus.hasFocus,
      greetDone: _greetDone,
    );

    return LoginBackdrop(
      palette: p,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LoginBrand(palette: p),
          const SizedBox(height: 24),
          if (auth.sessionExpired && !_mfaStep)
            LoginAlert(
              text: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại — các thao tác chưa gửi vẫn được giữ.',
              color: p.errText,
            ),
          if (_mfaStep) ..._mfaForm(p) else ..._credentialsForm(p, owl),
        ],
      ),
    );
  }

  List<Widget> _credentialsForm(LoginPalette p, OwlState owl) {
    return [
      LoginTitle(
        'Đăng nhập',
        palette: p,
        lead: 'Dùng tài khoản nhân viên do Admin cấp.',
        align: TextAlign.left,
      ),
      const SizedBox(height: 14),
      OwlBubble(state: owl, palette: p),
      Padding(
        padding: const EdgeInsets.only(left: 18),
        child: Align(alignment: Alignment.centerLeft, child: LoginOwl(mood: owl.mood, size: 52)),
      ),
      LoginLabel('Email', palette: p),
      TextField(
        controller: _email,
        focusNode: _emailFocus,
        enabled: !_loading,
        keyboardType: TextInputType.emailAddress,
        autofillHints: const [AutofillHints.username],
        textInputAction: TextInputAction.next,
        style: TextStyle(color: p.fieldInk, fontSize: 15),
        onSubmitted: (_) => _passwordFocus.requestFocus(),
        decoration: loginFieldDecoration(p, hint: 'ten@congty.vn', invalid: _emailError != null),
      ),
      const SizedBox(height: 14),
      LoginLabel('Mật khẩu', palette: p),
      TextField(
        controller: _password,
        focusNode: _passwordFocus,
        enabled: !_loading,
        obscureText: !_showPassword,
        autofillHints: const [AutofillHints.password],
        textInputAction: TextInputAction.done,
        style: TextStyle(color: p.fieldInk, fontSize: 15),
        onSubmitted: (_) => _submit(),
        decoration: loginFieldDecoration(
          p,
          invalid: _passwordError != null,
          suffix: IconButton(
            tooltip: _showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu',
            icon: Icon(_showPassword ? Icons.visibility_off_outlined : Icons.visibility_outlined, color: p.muted),
            onPressed: () => setState(() => _showPassword = !_showPassword),
          ),
        ),
      ),
      const SizedBox(height: 6),
      Row(
        children: [
          Checkbox(
            value: _remember,
            visualDensity: VisualDensity.compact,
            activeColor: p.cta,
            checkColor: p.ctaFg,
            side: BorderSide(color: p.muted),
            onChanged: _loading ? null : (v) => setState(() => _remember = v ?? false),
          ),
          GestureDetector(
            onTap: _loading ? null : () => setState(() => _remember = !_remember),
            child: Text('Ghi nhớ', style: TextStyle(color: p.muted, fontSize: 13)),
          ),
          const Spacer(),
          TextButton(
            onPressed: _loading ? null : () => context.push('/forgot-password'),
            style: TextButton.styleFrom(foregroundColor: p.ink, padding: const EdgeInsets.symmetric(horizontal: 4)),
            child: const Text('Quên mật khẩu?', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
      const SizedBox(height: 8),
      LoginCta(
        palette: p,
        onPressed: _loading ? null : _submit,
        child: _loading
            ? Row(
                mainAxisSize: MainAxisSize.min,
                children: [LoginSpinner(color: p.ctaFg), const SizedBox(width: 10), const Text('Đang đăng nhập…')],
              )
            : const Row(
                mainAxisSize: MainAxisSize.min,
                children: [Text('Đăng nhập'), SizedBox(width: 8), Icon(Icons.arrow_forward, size: 18)],
              ),
      ),
      const SizedBox(height: 16),
      _Divider(palette: p),
      const SizedBox(height: 16),
      // Đăng nhập Google của BE chuyển hướng về trang web; app chưa có deep link nên chờ BE hỗ trợ.
      Tooltip(
        message: 'Chờ BE hỗ trợ (cần chuyển hướng về app)',
        child: OutlinedButton.icon(
          onPressed: null,
          icon: const Text('G', style: TextStyle(color: Color(0xFFEA4335), fontWeight: FontWeight.w800, fontSize: 16)),
          label: const Text('Tiếp tục với Google (chờ BE)'),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(44),
            foregroundColor: p.ink,
            disabledForegroundColor: p.ink.withValues(alpha: 0.65),
            side: BorderSide(color: p.fieldBorder),
            backgroundColor: p.fieldBg.withValues(alpha: 0.7),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            textStyle: const TextStyle(fontSize: 13.5),
          ),
        ),
      ),
      const SizedBox(height: 20),
      Text(
        'Chưa có tài khoản? Liên hệ Admin để được cấp.',
        textAlign: TextAlign.center,
        style: TextStyle(color: p.muted, fontSize: 12.5),
      ),
    ];
  }

  List<Widget> _mfaForm(LoginPalette p) {
    final totp = _mfaMode == _MfaMode.totp;
    return [
      LoginTitle('Xác thực 2 lớp', palette: p),
      const SizedBox(height: 18),
      Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: p.fieldBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: p.fieldBorder),
        ),
        child: Row(
          children: [
            _MfaTab(label: 'Mã 6 số', on: totp, palette: p, onTap: () => setState(() {
                  _mfaMode = _MfaMode.totp;
                  _mfaError = null;
                })),
            _MfaTab(label: 'Mã dự phòng', on: !totp, palette: p, onTap: () => setState(() {
                  _mfaMode = _MfaMode.backup;
                  _mfaError = null;
                })),
          ],
        ),
      ),
      const SizedBox(height: 14),
      if (totp)
        TextField(
          key: const ValueKey('mfa-totp'),
          controller: _mfa,
          enabled: !_loading,
          autofocus: true,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
          autofillHints: const [AutofillHints.oneTimeCode],
          style: TextStyle(color: p.fieldInk, fontSize: 20, letterSpacing: 4),
          textAlign: TextAlign.center,
          onSubmitted: (_) => _submit(),
          decoration: loginFieldDecoration(p, hint: '482913', invalid: _mfaError != null),
        )
      else
        TextField(
          key: const ValueKey('mfa-backup'),
          controller: _backup,
          enabled: !_loading,
          autofocus: true,
          style: TextStyle(color: p.fieldInk, fontSize: 18, letterSpacing: 2),
          textAlign: TextAlign.center,
          onSubmitted: (_) => _submit(),
          decoration: loginFieldDecoration(p, hint: '48213096', invalid: _mfaError != null),
        ),
      if (_mfaError != null) ...[
        const SizedBox(height: 8),
        Text(_mfaError!, style: TextStyle(color: p.errText, fontSize: 12.8, fontWeight: FontWeight.w600)),
      ],
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton(
          onPressed: _loading ? null : _backToLogin,
          style: TextButton.styleFrom(foregroundColor: p.muted, padding: const EdgeInsets.symmetric(horizontal: 2)),
          child: const Text('← Quay lại đăng nhập', style: TextStyle(fontSize: 12.5)),
        ),
      ),
      const SizedBox(height: 4),
      LoginCta(
        palette: p,
        onPressed: _loading ? null : _submit,
        child: _loading
            ? Row(
                mainAxisSize: MainAxisSize.min,
                children: [LoginSpinner(color: p.ctaFg), const SizedBox(width: 10), const Text('Đang xác thực…')],
              )
            : const Text('Xác nhận MFA'),
      ),
    ];
  }
}

class _MfaTab extends StatelessWidget {
  const _MfaTab({required this.label, required this.on, required this.palette, required this.onTap});

  final String label;
  final bool on;
  final LoginPalette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: on ? palette.cta.withValues(alpha: 0.16) : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: on ? palette.ink : palette.muted,
              fontSize: 13,
              fontWeight: on ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider({required this.palette});

  final LoginPalette palette;

  @override
  Widget build(BuildContext context) {
    final line = Expanded(child: Divider(color: palette.fieldBorder, thickness: 1, height: 1));
    return Row(
      children: [
        line,
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text('hoặc', style: TextStyle(color: palette.muted, fontSize: 12.5)),
        ),
        line,
      ],
    );
  }
}

/// "Chào mừng trở lại" — hiện sau khi đăng nhập thành công, bấm nút mới vào app (giống web).
class _WelcomeBack extends StatelessWidget {
  const _WelcomeBack({required this.mustChangePassword, required this.onContinue});

  final bool mustChangePassword;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    final p = LoginPalette.day;
    final owl = welcomeOwl(mustChangePassword: mustChangePassword);
    return LoginBackdrop(
      palette: p,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LoginBrand(palette: p),
          const SizedBox(height: 28),
          LoginTitle('Chào mừng trở lại', palette: p, align: TextAlign.left),
          const SizedBox(height: 14),
          OwlBubble(state: owl, palette: p),
          Padding(
            padding: const EdgeInsets.only(left: 18),
            child: Align(alignment: Alignment.centerLeft, child: LoginOwl(mood: owl.mood, size: 64)),
          ),
          const SizedBox(height: 8),
          Text(
            'Đăng nhập thành công',
            style: TextStyle(color: p.ink.withValues(alpha: 0.62), fontSize: 14, fontWeight: FontWeight.w500),
          ),
          const SizedBox(height: 16),
          LoginCta(
            palette: p,
            onPressed: onContinue,
            child: mustChangePassword
                ? const Text('Đổi mật khẩu')
                : const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [Text('Vào trang làm việc'), SizedBox(width: 8), Icon(Icons.arrow_forward, size: 18)],
                  ),
          ),
        ],
      ),
    );
  }
}
