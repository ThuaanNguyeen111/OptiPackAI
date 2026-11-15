/// Kiểm tra nhập liệu và biểu cảm của cú — cùng câu chữ với trang đăng nhập web
/// (`fe/src/pages/LoginPage.tsx`) để hai bên giống nhau.
library;

final _emailPattern = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

bool isValidEmail(String value) => _emailPattern.hasMatch(value.trim());

String? validateEmail(String value) {
  final v = value.trim();
  if (v.isEmpty) return 'Vui lòng nhập email.';
  if (!isValidEmail(v)) return 'Email không hợp lệ.';
  return null;
}

String? validatePassword(String value) {
  if (value.isEmpty) return 'Vui lòng nhập mật khẩu.';
  if (value.length < 6) return 'Mật khẩu tối thiểu 6 ký tự.';
  return null;
}

/// Mã xác thực 2 lớp: đúng 6 chữ số.
bool isValidTotp(String value) => RegExp(r'^\d{6}$').hasMatch(value.trim());

const accountLockedMessage =
    'Tài khoản đã bị khóa do chưa đổi mật khẩu trong 72 giờ. Vui lòng liên hệ Admin để được mở khóa.';

/// BE báo khóa cứng bằng message có chữ "72 giờ" (xem INTEGRATION_GUIDE.md mục 5).
bool isAccountLockedMessage(String message) => message.contains('72 giờ');

enum OwlMood { idle, greet, watch, shy, error, ok, welcome }

class OwlState {
  const OwlState(this.mood, this.message);

  final OwlMood mood;
  final String message;

  @override
  bool operator ==(Object other) =>
      other is OwlState && other.mood == mood && other.message == message;

  @override
  int get hashCode => Object.hash(mood, message);
}

const owlGreeting = 'Xin chào! Mình là cú OptiPack — nhập email để bắt đầu nhé.';

/// Cú đổi biểu cảm theo tình trạng form. Thứ tự ưu tiên giống web:
/// lỗi (luôn hiện ngay) → đang gõ mật khẩu (che mắt) → đang gõ email → form hợp lệ → mặc định.
OwlState deriveOwl({
  required String email,
  required String password,
  String? formError,
  String? emailError,
  String? passwordError,
  bool emailFocused = false,
  bool passwordFocused = false,
  bool greetDone = true,
}) {
  if (formError != null) return OwlState(OwlMood.error, formError);
  if (emailError != null) return OwlState(OwlMood.error, emailError);
  if (passwordError != null) return OwlState(OwlMood.error, passwordError);
  if (!greetDone) return const OwlState(OwlMood.greet, owlGreeting);
  if (passwordFocused) {
    return const OwlState(OwlMood.shy, 'Mình che mắt để bạn gõ mật khẩu nhé.');
  }
  if (emailFocused) {
    return const OwlState(OwlMood.watch, 'Email công việc của bạn…');
  }
  final validEmail = isValidEmail(email);
  if (validEmail && password.length >= 6) {
    return const OwlState(OwlMood.ok, 'Ổn rồi — bấm Đăng nhập khi sẵn sàng!');
  }
  if (validEmail) {
    return const OwlState(OwlMood.ok, 'Email hợp lệ rồi. Tiếp tục với mật khẩu nhé.');
  }
  return const OwlState(OwlMood.idle, 'Nhập email và mật khẩu để vào hệ thống.');
}

OwlState welcomeOwl({required bool mustChangePassword}) => OwlState(
      OwlMood.welcome,
      mustChangePassword
          ? 'Chào mừng trở lại! Bấm bên dưới để đổi mật khẩu nhé.'
          : 'Chào mừng trở lại! Bấm bên dưới để vào trang làm việc.',
    );
