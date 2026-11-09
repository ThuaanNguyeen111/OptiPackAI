import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/features/auth/login/login_logic.dart';

void main() {
  group('Kiểm tra nhập liệu (cùng câu chữ với web)', () {
    test('email', () {
      expect(validateEmail(''), 'Vui lòng nhập email.');
      expect(validateEmail('   '), 'Vui lòng nhập email.');
      expect(validateEmail('khong-hop-le'), 'Email không hợp lệ.');
      expect(validateEmail('a@b'), 'Email không hợp lệ.');
      expect(validateEmail('ten@congty.vn'), isNull);
      expect(validateEmail('  ten@congty.vn  '), isNull, reason: 'bỏ khoảng trắng hai đầu');
    });

    test('mật khẩu tối thiểu 6 ký tự', () {
      expect(validatePassword(''), 'Vui lòng nhập mật khẩu.');
      expect(validatePassword('12345'), 'Mật khẩu tối thiểu 6 ký tự.');
      expect(validatePassword('123456'), isNull);
    });

    test('mã xác thực đúng 6 chữ số', () {
      expect(isValidTotp('482913'), isTrue);
      expect(isValidTotp(' 482913 '), isTrue);
      expect(isValidTotp('48291'), isFalse);
      expect(isValidTotp('4829135'), isFalse);
      expect(isValidTotp('48291a'), isFalse);
    });

    test('nhận ra tài khoản bị khóa cứng 72 giờ', () {
      expect(isAccountLockedMessage('Tài khoản bị khóa do quá 72 giờ chưa đổi mật khẩu'), isTrue);
      expect(isAccountLockedMessage('Sai mật khẩu'), isFalse);
      expect(accountLockedMessage, contains('72 giờ'));
    });
  });

  group('Biểu cảm của cú', () {
    test('mới vào: chào, kể cả khi chưa gõ gì', () {
      final s = deriveOwl(email: '', password: '', greetDone: false);
      expect(s.mood, OwlMood.greet);
      expect(s.message, owlGreeting);
    });

    test('hết giờ chào mà chưa gõ gì thì ở trạng thái nghỉ', () {
      expect(deriveOwl(email: '', password: '').mood, OwlMood.idle);
    });

    test('lỗi luôn hiện ngay, kể cả đang chào hoặc đang gõ', () {
      final s = deriveOwl(
        email: '',
        password: '',
        emailError: 'Vui lòng nhập email.',
        greetDone: false,
        passwordFocused: true,
      );
      expect(s.mood, OwlMood.error);
      expect(s.message, 'Vui lòng nhập email.');
    });

    test('thứ tự ưu tiên lỗi: form > email > mật khẩu', () {
      expect(
        deriveOwl(email: '', password: '', formError: 'Sai mật khẩu', emailError: 'e', passwordError: 'p').message,
        'Sai mật khẩu',
      );
      expect(deriveOwl(email: '', password: '', emailError: 'e', passwordError: 'p').message, 'e');
      expect(deriveOwl(email: '', password: '', passwordError: 'p').message, 'p');
    });

    test('đang gõ mật khẩu: che mắt; đang gõ email: nhìn theo', () {
      expect(deriveOwl(email: 'a@b.vn', password: '', passwordFocused: true).mood, OwlMood.shy);
      expect(deriveOwl(email: '', password: '', emailFocused: true).mood, OwlMood.watch);
      // Mật khẩu có ưu tiên hơn email khi cả hai cùng focus (không xảy ra thật nhưng luật phải rõ).
      expect(deriveOwl(email: '', password: '', emailFocused: true, passwordFocused: true).mood, OwlMood.shy);
    });

    test('form hợp lệ thì vui, email hợp lệ thì nhắc nhập mật khẩu', () {
      final ready = deriveOwl(email: 'ten@congty.vn', password: '123456');
      expect(ready.mood, OwlMood.ok);
      expect(ready.message, 'Ổn rồi — bấm Đăng nhập khi sẵn sàng!');

      final emailOnly = deriveOwl(email: 'ten@congty.vn', password: '123');
      expect(emailOnly.mood, OwlMood.ok);
      expect(emailOnly.message, startsWith('Email hợp lệ rồi'));
    });

    test('chào mừng trở lại: lời khác nhau khi phải đổi mật khẩu', () {
      expect(welcomeOwl(mustChangePassword: false).message, contains('vào trang làm việc'));
      expect(welcomeOwl(mustChangePassword: true).message, contains('đổi mật khẩu'));
      expect(welcomeOwl(mustChangePassword: false).mood, OwlMood.welcome);
    });
  });
}
