import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/auth_controller.dart';
import '../features/auth/forgot_password_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/home/app_shell.dart';
import '../features/warehouse/pick_screen.dart';
import 'providers.dart';

/// Điều hướng theo trạng thái đăng nhập: chưa đăng nhập thì chỉ ở màn đăng nhập.
/// Ẩn menu theo role chỉ để gọn; **quyền thật do BE kiểm** (403 thì hiện thông báo).
final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen<AuthState>(authControllerProvider, (_, _) => refresh.value++);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      // Hai màn công khai khi chưa đăng nhập.
      final atLogin =
          state.matchedLocation == '/login' || state.matchedLocation == '/forgot-password';
      switch (auth.status) {
        case AuthStatus.loading:
          return state.matchedLocation == '/splash' ? null : '/splash';
        case AuthStatus.signedOut:
          return atLogin ? null : '/login';
        case AuthStatus.signedIn:
          if (atLogin || state.matchedLocation == '/splash') return '/';
          return null;
      }
    },
    routes: [
      GoRoute(
        path: '/splash',
        builder: (_, _) => const Scaffold(body: Center(child: CircularProgressIndicator())),
      ),
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(path: '/forgot-password', builder: (_, _) => const ForgotPasswordScreen()),
      GoRoute(path: '/', builder: (_, _) => const AppShell()),
      GoRoute(
        path: '/pick/:groupId',
        builder: (_, state) => PickScreen(groupId: state.pathParameters['groupId']!),
      ),
    ],
  );
});
