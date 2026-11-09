import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:optipack_mobile/app/providers.dart';
import 'package:optipack_mobile/app/theme.dart';
import 'package:optipack_mobile/core/network/api_client.dart';
import 'package:optipack_mobile/core/network/api_exception.dart';
import 'package:optipack_mobile/core/storage/token_store.dart';
import 'package:optipack_mobile/features/auth/auth_controller.dart';
import 'package:optipack_mobile/features/auth/auth_models.dart';
import 'package:optipack_mobile/features/auth/auth_repository.dart';
import 'package:optipack_mobile/features/auth/forgot_password_screen.dart';
import 'package:optipack_mobile/features/auth/login_screen.dart';

/// Repository giả: ghi lại mọi lần gọi để kiểm tra, không dùng mạng.
class FakeAuthRepository extends AuthRepository {
  FakeAuthRepository()
      : super(
          api: ApiClient(tokenStore: InMemoryTokenStore()),
          tokens: InMemoryTokenStore(),
        );

  final List<Map<String, String?>> logins = [];
  final List<String> forgot = [];
  String? remembered;
  String? savedRemembered = 'chua-luu';

  /// Mỗi lần login lấy một kết quả từ hàng này; hết thì thành công.
  final List<Object> script = [];
  bool mustChangePassword = false;

  @override
  Future<LoginOutcome> login({
    required String email,
    required String password,
    String? mfaToken,
    String? backupCode,
  }) async {
    logins.add({'email': email, 'password': password, 'mfa': mfaToken, 'backup': backupCode});
    if (script.isNotEmpty) {
      final next = script.removeAt(0);
      if (next is ApiException) throw next;
      if (next is LoginOutcome) return next;
    }
    return LoginSuccess(mustChangePassword: mustChangePassword);
  }

  @override
  Future<CurrentUser> fetchMe() async =>
      const CurrentUser(id: 'u1', name: 'Việt', email: 'a@b.vn', role: UserRole.warehouseStaff);

  @override
  Future<bool> hasSession() async => false;

  @override
  Future<CurrentUser?> cachedUser() async => null;

  @override
  Future<String?> rememberedEmail() async => remembered;

  @override
  Future<void> setRememberedEmail(String? email) async => savedRemembered = email;

  @override
  Future<String?> forgotPassword(String email) async {
    forgot.add(email);
    return null;
  }

  @override
  Future<void> logout() async {}
}

late FakeAuthRepository fake;
late ProviderContainer container;

Future<void> pumpLogin(WidgetTester tester, {Widget? home}) async {
  tester.view.physicalSize = const Size(720, 1600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  container = ProviderContainer(overrides: [authRepositoryProvider.overrideWithValue(fake)]);
  addTearDown(container.dispose);

  final router = GoRouter(
    initialLocation: '/login',
    routes: [
      GoRoute(path: '/login', builder: (_, _) => home ?? const LoginScreen()),
      GoRoute(path: '/forgot-password', builder: (_, _) => const ForgotPasswordScreen()),
    ],
  );
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(theme: buildTheme(), routerConfig: router),
    ),
  );
  await tester.pump();
  await tester.pump();
}

Finder field(String hint) => find.widgetWithText(TextField, hint);

Future<void> fill(WidgetTester tester, {String email = 'ten@congty.vn', String password = '123456'}) async {
  await tester.enterText(find.byType(TextField).at(0), email);
  await tester.enterText(find.byType(TextField).at(1), password);
  await tester.pump();
}

Future<void> tapLogin(WidgetTester tester) async {
  await tester.tap(find.widgetWithText(FilledButton, 'Đăng nhập'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  setUp(() => fake = FakeAuthRepository());

  testWidgets('hiện đủ các thành phần như trang web', (tester) async {
    await pumpLogin(tester);

    expect(find.text('OptiPackAI'), findsOneWidget);
    expect(find.text('Đăng nhập'), findsWidgets);
    expect(find.text('Dùng tài khoản nhân viên do Admin cấp.'), findsOneWidget);
    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Mật khẩu'), findsOneWidget);
    expect(find.text('Ghi nhớ'), findsOneWidget);
    expect(find.text('Quên mật khẩu?'), findsOneWidget);
    expect(find.text('hoặc'), findsOneWidget);
    expect(find.textContaining('Tiếp tục với Google'), findsOneWidget);
    expect(find.textContaining('Liên hệ Admin'), findsOneWidget);
    expect(find.text(' Xin chào! Mình là cú OptiPack — nhập email để bắt đầu nhé.'.trim()), findsOneWidget);

    final google = tester.widget<OutlinedButton>(find.widgetWithText(OutlinedButton, 'Tiếp tục với Google (chờ BE)'));
    expect(google.onPressed, isNull, reason: 'Google chờ BE hỗ trợ chuyển hướng về app');
  });

  testWidgets('bấm đăng nhập khi để trống: báo lỗi, không gọi BE', (tester) async {
    await pumpLogin(tester);
    await tapLogin(tester);

    expect(find.text('Vui lòng nhập email.'), findsOneWidget);
    expect(fake.logins, isEmpty);
  });

  testWidgets('email sai định dạng và mật khẩu ngắn', (tester) async {
    await pumpLogin(tester);

    await fill(tester, email: 'khong-hop-le', password: '123456');
    await tapLogin(tester);
    expect(find.text('Email không hợp lệ.'), findsOneWidget);

    await fill(tester, email: 'ten@congty.vn', password: '123');
    await tapLogin(tester);
    expect(find.text('Mật khẩu tối thiểu 6 ký tự.'), findsOneWidget);
    expect(fake.logins, isEmpty);
  });

  testWidgets('email đã ghi nhớ được điền sẵn và tích "Ghi nhớ"', (tester) async {
    fake.remembered = 'da-nho@congty.vn';
    await pumpLogin(tester);
    await tester.pump();

    expect(find.text('da-nho@congty.vn'), findsOneWidget);
    final box = tester.widget<Checkbox>(find.byType(Checkbox));
    expect(box.value, isTrue);
  });

  testWidgets('đăng nhập thành công: màn chào mừng, bấm nút mới vào app, và lưu email nếu tích ghi nhớ', (tester) async {
    await pumpLogin(tester);
    await fill(tester);
    await tester.tap(find.byType(Checkbox));
    await tester.pump();
    await tapLogin(tester);
    await tester.pump(const Duration(milliseconds: 100));

    expect(fake.logins.single['email'], 'ten@congty.vn');
    expect(fake.savedRemembered, 'ten@congty.vn');
    expect(find.text('Chào mừng trở lại'), findsOneWidget);
    expect(find.text('Đăng nhập thành công'), findsOneWidget);
    expect(find.text('Vào trang làm việc'), findsOneWidget);
    expect(container.read(authControllerProvider).status, AuthStatus.signedOut,
        reason: 'chưa vào app cho tới khi bấm nút');

    await tester.tap(find.text('Vào trang làm việc'));
    await tester.pump();
    expect(container.read(authControllerProvider).status, AuthStatus.signedIn);
  });

  testWidgets('không tích ghi nhớ thì xoá email đã lưu', (tester) async {
    fake.savedRemembered = 'cu@congty.vn';
    await pumpLogin(tester);
    await fill(tester);
    await tapLogin(tester);
    await tester.pump(const Duration(milliseconds: 100));
    expect(fake.savedRemembered, isNull);
  });

  testWidgets('tài khoản phải đổi mật khẩu: nút ghi "Đổi mật khẩu"', (tester) async {
    fake.mustChangePassword = true;
    await pumpLogin(tester);
    await fill(tester);
    await tapLogin(tester);
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Đổi mật khẩu'), findsOneWidget);
    expect(find.textContaining('đổi mật khẩu nhé'), findsOneWidget);
  });

  testWidgets('sai mật khẩu: hiện lỗi của BE trong bong bóng cú', (tester) async {
    fake.script.add(const ApiException(message: 'Email hoặc mật khẩu không đúng', statusCode: 401));
    await pumpLogin(tester);
    await fill(tester);
    await tapLogin(tester);
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Email hoặc mật khẩu không đúng'), findsOneWidget);
    expect(find.text('Chào mừng trở lại'), findsNothing);
  });

  testWidgets('bị khóa 72 giờ: màn khóa riêng, quay lại được', (tester) async {
    fake.script.add(const ApiException(message: 'Tài khoản bị khóa vì quá 72 giờ chưa đổi mật khẩu', statusCode: 403));
    await pumpLogin(tester);
    await fill(tester);
    await tapLogin(tester);
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Tài khoản đã bị khóa'), findsOneWidget);
    expect(find.textContaining('liên hệ Admin để được mở khóa'), findsOneWidget);

    await tester.tap(find.text('Quay lại đăng nhập'));
    await tester.pump();
    expect(find.text('Tài khoản đã bị khóa'), findsNothing);
    expect(find.text('Quên mật khẩu?'), findsOneWidget);
  });

  testWidgets('MFA: hỏi mã 6 số, kiểm tra độ dài, rồi đăng nhập lần 2 kèm mfa_token', (tester) async {
    fake.script.add(const LoginMfaRequired());
    await pumpLogin(tester);
    await fill(tester);
    await tapLogin(tester);
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Xác thực 2 lớp'), findsOneWidget);
    expect(find.text('Mã 6 số'), findsOneWidget);
    expect(find.text('Mã dự phòng'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '123');
    await tester.tap(find.widgetWithText(FilledButton, 'Xác nhận MFA'));
    await tester.pump();
    expect(find.text('Nhập mã xác thực 6 số.'), findsOneWidget);
    expect(fake.logins, hasLength(1), reason: 'chưa gửi mã sai độ dài');

    await tester.enterText(find.byType(TextField), '482913');
    await tester.tap(find.widgetWithText(FilledButton, 'Xác nhận MFA'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(fake.logins.last['mfa'], '482913');
    expect(fake.logins.last['backup'], isNull);
    expect(find.text('Chào mừng trở lại'), findsOneWidget);
  });

  testWidgets('MFA bằng mã dự phòng gửi backup_code, không gửi mfa_token', (tester) async {
    fake.script.add(const LoginMfaRequired());
    await pumpLogin(tester);
    await fill(tester);
    await tapLogin(tester);
    await tester.pump(const Duration(milliseconds: 100));

    await tester.tap(find.text('Mã dự phòng'));
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Xác nhận MFA'));
    await tester.pump();
    expect(find.text('Nhập mã dự phòng.'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '48213096');
    await tester.tap(find.widgetWithText(FilledButton, 'Xác nhận MFA'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(fake.logins.last['backup'], '48213096');
    expect(fake.logins.last['mfa'], isNull);
  });

  testWidgets('MFA: "Quay lại đăng nhập" về form ban đầu', (tester) async {
    fake.script.add(const LoginMfaRequired());
    await pumpLogin(tester);
    await fill(tester);
    await tapLogin(tester);
    await tester.pump(const Duration(milliseconds: 100));

    await tester.tap(find.text('← Quay lại đăng nhập'));
    await tester.pump();
    expect(find.text('Xác thực 2 lớp'), findsNothing);
    expect(find.text('Quên mật khẩu?'), findsOneWidget);
  });

  testWidgets('nút hiện/ẩn mật khẩu', (tester) async {
    await pumpLogin(tester);
    expect(tester.widget<TextField>(find.byType(TextField).at(1)).obscureText, isTrue);

    await tester.tap(find.byTooltip('Hiện mật khẩu'));
    await tester.pump();
    expect(tester.widget<TextField>(find.byType(TextField).at(1)).obscureText, isFalse);
    expect(find.byTooltip('Ẩn mật khẩu'), findsOneWidget);
  });

  testWidgets('phiên hết hạn: báo ở đầu màn đăng nhập và nói rõ hàng đợi vẫn được giữ', (tester) async {
    await pumpLogin(tester);
    container.read(authControllerProvider.notifier).sessionExpired();
    await tester.pump();

    expect(find.textContaining('Phiên đăng nhập đã hết hạn'), findsOneWidget);
    expect(find.textContaining('vẫn được giữ'), findsOneWidget);
  });

  testWidgets('Quên mật khẩu: mở màn riêng, kiểm tra email, gửi, rồi chờ 60 giây mới gửi lại', (tester) async {
    await pumpLogin(tester);
    await tester.tap(find.text('Quên mật khẩu?'));
    await tester.pumpAndSettle();

    expect(find.text('Quên mật khẩu?'), findsOneWidget);
    expect(find.text('Gửi liên kết khôi phục'), findsOneWidget);

    await tester.tap(find.text('Gửi liên kết khôi phục'));
    await tester.pump();
    expect(find.text('Vui lòng nhập email.'), findsOneWidget);
    expect(fake.forgot, isEmpty);

    await tester.enterText(find.byType(TextField), 'ten@congty.vn');
    await tester.tap(find.text('Gửi liên kết khôi phục'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(fake.forgot, ['ten@congty.vn']);
    expect(find.text('Kiểm tra hòm thư'), findsOneWidget);
    expect(find.textContaining('ten@congty.vn'), findsOneWidget);
    expect(find.text('Gửi lại sau 60s'), findsOneWidget);

    await tester.pump(const Duration(seconds: 61));
    expect(find.text('Gửi lại liên kết'), findsOneWidget);
    await tester.tap(find.text('Gửi lại liên kết'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(fake.forgot, hasLength(2));

    // Dọn bộ đếm 60 giây còn chạy để test kết thúc sạch.
    await tester.pumpWidget(const SizedBox());
  });
}
