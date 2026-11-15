import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/mock_providers.dart';
import '../../app/providers.dart';
import '../../app/theme_mode.dart';
import '../auth/auth_models.dart';
import '../auth/role_permissions.dart';
import '../notifications/notifications_screen.dart';
import '../offline/sync_status_bar.dart';
import '../overview/overview_screen.dart';
import '../packing/packing_screens.dart';
import '../returns/returns_screens.dart';
import '../shipping/shipping_screen.dart';
import '../stock/stock_screen.dart';
import 'my_work_view.dart';

class _TabSpec {
  const _TabSpec(
    this.label,
    this.icon,
    this.selectedIcon,
    this.builder, {
    this.isNotifications = false,
    this.needs = const {},
  });

  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final Widget Function() builder;
  final bool isNotifications;

  /// Cần ít nhất 1 trang trong số này (rỗng = luôn hiện).
  final Set<String> needs;

  bool allowedBy(Set<String> features) => needs.isEmpty || needs.any(features.contains);
}

_TabSpec _notifications() => _TabSpec(
      'Thông báo',
      Icons.notifications_none,
      Icons.notifications,
      () => const NotificationsScreen(),
      isNotifications: true,
    );

_TabSpec _myWork() => _TabSpec(
      'Việc của tôi',
      Icons.checklist_outlined,
      Icons.checklist,
      () => const MyWorkView(),
      needs: const {'picking'},
    );

_TabSpec _stock() => _TabSpec(
      'Kho',
      Icons.warehouse_outlined,
      Icons.warehouse,
      () => const StockScreen(),
      needs: const {'inventory'},
    );

_TabSpec _warehouseReturns() => _TabSpec(
      'Hoàn hàng',
      Icons.assignment_return_outlined,
      Icons.assignment_return,
      () => const WarehouseReturnsScreen(),
      needs: const {'picking', 'inventory'},
    );

_TabSpec _packing() => _TabSpec(
      'Đóng gói',
      Icons.inventory_2_outlined,
      Icons.inventory_2,
      () => const PackingQueueScreen(),
      needs: const {'packing'},
    );

_TabSpec _shipping() => _TabSpec(
      'Giao hàng',
      Icons.local_shipping_outlined,
      Icons.local_shipping,
      () => const ShippingScreen(),
      needs: const {'shipping'},
    );

_TabSpec _overview() => _TabSpec(
      'Tổng quan',
      Icons.dashboard_outlined,
      Icons.dashboard,
      () => const OverviewScreen(),
      needs: const {'dashboard'},
    );

_TabSpec _returnsApproval() => _TabSpec(
      'Duyệt hoàn',
      Icons.fact_check_outlined,
      Icons.fact_check,
      () => const ReturnsApprovalScreen(),
      needs: const {'returns'},
    );

/// Thanh dưới tối đa 5 mục (4 tab việc + Thông báo).
const _maxWorkTabs = 4;

/// Các tab theo vai trò, lọc theo trang Admin bật cho vai trò đó (`GET /role-permissions/me`).
/// Thứ tự: tab quen thuộc của vai trò trước, rồi tab của trang được bật thêm.
/// Ẩn tab chỉ để gọn; **quyền thật do BE kiểm** (403 thì hiện thông báo).
/// Tab "Việc của tôi" của kho là phần đã nối BE thật; các tab còn lại đang dùng dữ liệu giả
/// (xem `app/mock_providers.dart`).
List<_TabSpec> _tabsFor(UserRole role, Set<String> features) {
  final preferred = switch (role) {
    UserRole.warehouseStaff => [_myWork(), _stock(), _warehouseReturns()],
    UserRole.packagingStaff => [_packing()],
    UserRole.shippingCoordinator => [_shipping()],
    UserRole.storeOwner => [_overview(), _returnsApproval()],
    UserRole.admin => [_overview(), _myWork(), _packing(), _shipping()],
  };
  final all = [_overview(), _myWork(), _stock(), _warehouseReturns(), _packing(), _shipping(), _returnsApproval()];
  final tabs = <_TabSpec>[];
  for (final t in [...preferred, ...all]) {
    if (tabs.length >= _maxWorkTabs) break;
    if (t.allowedBy(features) && tabs.every((x) => x.label != t.label)) tabs.add(t);
  }
  return [...tabs, _notifications()];
}

/// Dùng trong test: nhãn các tab sẽ hiện.
List<String> tabLabelsFor(UserRole role, Set<String> features) =>
    [for (final t in _tabsFor(role, features)) t.label];

class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key});

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  int _index = 0;

  Future<void> _confirmLogout() async {
    final pending = ref.read(syncControllerProvider).pending;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Đăng xuất?'),
        content: Text(
          pending > 0
              ? 'Còn $pending thao tác chưa gửi. Chúng vẫn được giữ trên máy và sẽ gửi khi bạn đăng nhập lại.'
              : 'Bạn sẽ cần đăng nhập lại.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Hủy')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Đăng xuất')),
        ],
      ),
    );
    if (ok == true) await ref.read(authControllerProvider.notifier).logout();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final user = auth.user;
    if (user == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (auth.mustChangePassword) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('Đổi mật khẩu'),
          actions: [IconButton(icon: const Icon(Icons.logout), onPressed: _confirmLogout)],
        ),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(32),
            child: Text(
              'Tài khoản cần đổi mật khẩu trước khi dùng.\nHãy đăng nhập trên web để đổi mật khẩu, rồi quay lại app.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }

    // Chưa tải xong quyền thì dùng mặc định của vai trò, để không nhấp nháy tab.
    final features = ref.watch(myFeaturesProvider).valueOrNull ?? defaultFeaturesFor(user.role);
    final tabs = _tabsFor(user.role, features);
    final index = _index.clamp(0, tabs.length - 1);
    final unread = ref.watch(unreadCountProvider).valueOrNull ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(tabs[index].label, style: const TextStyle(fontWeight: FontWeight.w700)),
            Text(
              '${user.name} · ${user.role.label}',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w400),
            ),
          ],
        ),
        actions: [
          const _ThemeMenu(),
          IconButton(tooltip: 'Đăng xuất', icon: const Icon(Icons.logout), onPressed: _confirmLogout),
        ],
      ),
      body: Column(
        children: [
          const SyncStatusBar(),
          // IndexedStack giữ trạng thái từng tab (ô đang quét, tab đang chọn…) khi chuyển qua lại.
          Expanded(
            child: IndexedStack(
              index: index,
              children: [for (final t in tabs) t.builder()],
            ),
          ),
        ],
      ),
      bottomNavigationBar: tabs.length < 2
          ? null
          : NavigationBar(
              selectedIndex: index,
              onDestinationSelected: (i) => setState(() => _index = i),
              destinations: [
                for (final t in tabs)
                  NavigationDestination(
                    label: t.label,
                    icon: t.isNotifications && unread > 0
                        ? Badge(label: Text('$unread'), child: Icon(t.icon))
                        : Icon(t.icon),
                    selectedIcon: t.isNotifications && unread > 0
                        ? Badge(label: Text('$unread'), child: Icon(t.selectedIcon))
                        : Icon(t.selectedIcon),
                  ),
              ],
            ),
    );
  }
}

/// Chọn giao diện: theo hệ thống / sáng / tối (lưu trên máy).
class _ThemeMenu extends ConsumerWidget {
  const _ThemeMenu();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeModeProvider);
    return PopupMenuButton<ThemeMode>(
      tooltip: 'Giao diện',
      icon: Icon(switch (mode) {
        ThemeMode.dark => Icons.dark_mode_outlined,
        ThemeMode.light => Icons.light_mode_outlined,
        ThemeMode.system => Icons.brightness_auto_outlined,
      }),
      initialValue: mode,
      onSelected: (m) => ref.read(themeModeProvider.notifier).set(m),
      itemBuilder: (_) => [
        for (final m in ThemeMode.values)
          CheckedPopupMenuItem(value: m, checked: m == mode, child: Text(themeModeLabel(m))),
      ],
    );
  }
}
