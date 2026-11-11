import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/network/api_exception.dart';
import 'auth_models.dart';

enum AuthStatus { loading, signedOut, signedIn }

class AuthState {
  const AuthState({
    required this.status,
    this.user,
    this.mustChangePassword = false,
    this.sessionExpired = false,
    this.pendingUser,
    this.pendingMustChange = false,
  });

  const AuthState.loading() : this(status: AuthStatus.loading);
  const AuthState.signedOut({bool expired = false})
      : this(status: AuthStatus.signedOut, sessionExpired: expired);

  final AuthStatus status;
  final CurrentUser? user;
  final bool mustChangePassword;

  /// true khi BE từ chối refresh token: phải đăng nhập lại. Hàng đợi ngoại tuyến vẫn được giữ.
  final bool sessionExpired;

  /// Vừa đăng nhập xong nhưng chưa bấm "Vào trang làm việc" (màn chào mừng như web).
  /// Lúc này [status] vẫn là signedOut để router giữ ở màn đăng nhập.
  final CurrentUser? pendingUser;
  final bool pendingMustChange;
}

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    Future.microtask(_restore);
    return const AuthState.loading();
  }

  /// Mở app: có phiên + hồ sơ đã lưu thì vào thẳng (kể cả khi mất mạng), rồi làm mới hồ sơ ở nền.
  Future<void> _restore() async {
    final repo = ref.read(authRepositoryProvider);
    if (!await repo.hasSession()) {
      state = const AuthState.signedOut();
      return;
    }
    final cached = await repo.cachedUser();
    if (cached != null) {
      state = AuthState(status: AuthStatus.signedIn, user: cached);
    }
    try {
      final fresh = await repo.fetchMe();
      state = AuthState(status: AuthStatus.signedIn, user: fresh);
    } on ApiException catch (e) {
      // Mất mạng thì giữ hồ sơ cũ; 401 đã được ApiClient xử lý qua onSessionExpired.
      if (cached == null && !e.isUnauthorized) {
        state = const AuthState.signedOut();
      }
    }
    if (state.status == AuthStatus.signedIn) ref.read(pushServiceProvider).start();
  }

  /// Trả [LoginMfaRequired] khi cần nhập mã 6 số; gọi lại với `mfaToken`.
  Future<LoginOutcome> login(
    String email,
    String password, {
    String? mfaToken,
    String? backupCode,
  }) async {
    final repo = ref.read(authRepositoryProvider);
    final outcome = await repo.login(
      email: email,
      password: password,
      mfaToken: mfaToken,
      backupCode: backupCode,
    );
    if (outcome is LoginSuccess) {
      final user = await repo.fetchMe();
      // Chưa vào app: hiện màn "Chào mừng trở lại", bấm nút mới vào (giống web).
      state = AuthState(
        status: AuthStatus.signedOut,
        pendingUser: user,
        pendingMustChange: outcome.mustChangePassword,
      );
    }
    return outcome;
  }

  /// Bấm "Vào trang làm việc" ở màn chào mừng.
  void enterWorkspace() {
    final user = state.pendingUser;
    if (user == null) return;
    state = AuthState(
      status: AuthStatus.signedIn,
      user: user,
      mustChangePassword: state.pendingMustChange,
    );
    ref.read(pushServiceProvider).start();
  }

  Future<void> logout() async {
    await ref.read(pushServiceProvider).stop(); // gỡ máy khỏi BE trước khi xoá phiên
    await ref.read(authRepositoryProvider).logout();
    state = const AuthState.signedOut();
  }

  /// ApiClient báo refresh bị từ chối.
  void sessionExpired() {
    state = const AuthState.signedOut(expired: true);
  }
}
