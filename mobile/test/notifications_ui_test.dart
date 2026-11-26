import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/app/mock_providers.dart';
import 'package:optipack_mobile/app/providers.dart';
import 'package:optipack_mobile/app/theme.dart';
import 'package:optipack_mobile/features/auth/auth_controller.dart';
import 'package:optipack_mobile/features/auth/auth_models.dart';
import 'package:optipack_mobile/features/notifications/notifications_repository.dart';
import 'package:optipack_mobile/features/notifications/notifications_screen.dart';

const _gid = '6b0804c5e3de38ace3aeba0e';

class _Repo implements NotificationsRepository {
  @override
  Future<List<AppNotification>> list({DateTime? before}) async => [
        AppNotification(
          id: 'n1',
          type: 'packing_assigned',
          severity: NotificationSeverity.info,
          title: 'Bạn được giao đóng gói — Đơn hàng #$_gid',
          message: 'Nhóm #$_gid đang chờ bạn.',
          createdAt: DateTime(2026, 11, 27, 1, 13),
          isRead: false,
          relatedEntityType: 'order_group',
          relatedEntityId: _gid,
        ),
      ];

  /// BE đếm tất cả, nhiều hơn số dòng đã tải.
  @override
  Future<int> unreadCount() async => 114;

  @override
  Future<void> markRead(String id) async {}

  @override
  Future<void> markAllRead() async {}
}

class _Packer extends AuthController {
  @override
  AuthState build() => const AuthState(
        status: AuthStatus.signedIn,
        user: CurrentUser(id: 'me', name: 'Tôi', email: 'a@b.vn', role: UserRole.packagingStaff),
      );
}

void main() {
  testWidgets('số chưa đọc khớp huy hiệu; không lộ mã dài; đóng gói mở được nhóm', (tester) async {
    tester.view.physicalSize = const Size(720, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        notificationsRepositoryProvider.overrideWithValue(_Repo()),
        authControllerProvider.overrideWith(_Packer.new),
      ],
      child: MaterialApp(theme: buildTheme(), home: const Scaffold(body: NotificationsScreen())),
    ));
    await tester.pumpAndSettle();

    expect(find.text('114 chưa đọc'), findsOneWidget);
    expect(find.text('Bạn được giao đóng gói — Đơn hàng #e3aeba0e'), findsOneWidget);
    expect(find.textContaining(_gid), findsNothing);

    await tester.tap(find.text('Bạn được giao đóng gói — Đơn hàng #e3aeba0e'));
    await tester.pumpAndSettle();
    expect(find.text('Mở nhóm đơn'), findsOneWidget);
    expect(find.textContaining('Liên quan'), findsNothing);
    expect(find.textContaining(_gid), findsNothing);
  });

  testWidgets('chip đang chọn tô màu chính, chữ nổi', (tester) async {
    final theme = buildTheme();
    expect(theme.chipTheme.selectedColor, theme.colorScheme.primary);
    await tester.pumpWidget(MaterialApp(
      theme: theme,
      home: Scaffold(body: ChoiceChip(label: const Text('A'), selected: true, onSelected: (_) {})),
    ));
    final label = tester.renderObject(find.text('A')) as dynamic;
    expect((label.text.style as TextStyle).color, theme.colorScheme.onPrimary);
  });
}
