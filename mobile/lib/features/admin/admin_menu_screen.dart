import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/colors.dart';
import '../auth/role_permissions.dart';
import '../../shared/admin_kit.dart';
import '../auth/auth_models.dart';
import '../history/history_screen.dart';
import '../profile/profile_screen.dart';
import '../returns/returns_screens.dart';
import '../shipping/shipping_screen.dart';
import 'catalog_screen.dart';
import 'inventory_screen.dart';
import 'marketplace_screen.dart';
import 'materials_screen.dart';
import 'order_groups_screen.dart';
import 'order_sync_screen.dart';
import 'orders_screen.dart';
import 'packing_admin_screen.dart';
import 'returns_manage_screen.dart';
import 'role_permissions_screen.dart';
import 'settings_reports_screen.dart';
import 'shipping_admin_screen.dart';
import 'users_screen.dart';
import 'warehouse_config_screen.dart';

class AdminEntry {
  const AdminEntry(this.label, this.icon, this.build, {this.feature});

  /// Trang web tương ứng (bật/tắt ở Phân quyền). Null = luôn hiện.
  final String? feature;
  final String label;
  final IconData icon;
  final Widget Function() build;
}

/// Mục của tab "Thêm", chia nhóm giống thanh bên của admin trên web.
final adminSections = <String, List<AdminEntry>>{
  'Quản trị': [
    AdminEntry('Người dùng', Icons.group_outlined, () => const UsersScreen()),
    AdminEntry('Phân quyền', Icons.shield_outlined, () => const RolePermissionsScreen()),
  ],
  'Sàn & đơn hàng': [
    AdminEntry('Kết nối sàn', Icons.storefront_outlined, () => const MarketplaceScreen()),
    AdminEntry('Đơn hàng', Icons.receipt_long_outlined, () => const OrdersScreen()),
    AdminEntry('Nhóm đơn', Icons.assignment_outlined, () => const OrderGroupsScreen()),
    AdminEntry('Đơn hỏa tốc', Icons.bolt_outlined,
        () => const OrderGroupsScreen(view: OrderGroupsView.express)),
    AdminEntry('Thiếu hàng', Icons.warning_amber_outlined,
        () => const OrderGroupsScreen(view: OrderGroupsView.shortage)),
    AdminEntry('Đồng bộ đơn', Icons.tune, () => const OrderSyncScreen()),
    AdminEntry('Trả hàng', Icons.fact_check_outlined, () => const ReturnsManageScreen()),
  ],
  'Vận hành kho': [
    AdminEntry('Cấu hình kho', Icons.settings_input_component_outlined, () => const WarehouseConfigScreen()),
    AdminEntry('SKU & danh mục', Icons.category_outlined, () => const CatalogScreen()),
    AdminEntry('Tình trạng kho', Icons.inventory_outlined, () => const InventoryScreen()),
    AdminEntry('Vật liệu đóng gói', Icons.inventory_2_outlined, () => const MaterialsScreen()),
    AdminEntry('Nhận & kiểm hàng hoàn', Icons.assignment_return_outlined,
        () => const SubPage(title: 'Hoàn hàng', child: WarehouseReturnsScreen())),
  ],
  'Đóng gói & giao hàng': [
    AdminEntry('Quản lý đóng gói', Icons.fact_check_outlined, () => const PackingAdminScreen()),
    AdminEntry('Giao hàng', Icons.local_shipping_outlined,
        () => const SubPage(title: 'Giao hàng', child: ShippingScreen())),
    AdminEntry('Quản lý vận chuyển', Icons.route_outlined, () => const ShippingAdminScreen()),
    AdminEntry('Cài đặt đóng gói & AI', Icons.auto_awesome_outlined, () => const PackingSettingsScreen()),
  ],
  'Báo cáo': [
    AdminEntry('Báo cáo', Icons.bar_chart, () => const ReportsScreen()),
    AdminEntry('Lịch sử thao tác', Icons.history,
        () => const SubPage(title: 'Lịch sử thao tác', child: HistoryScreen())),
  ],
  'Hệ thống': [
    AdminEntry('Hồ sơ & Bảo mật', Icons.settings_outlined, () => const ProfileScreen()),
  ],
};

/// Menu của chủ cửa hàng, cùng các trang với thanh bên trên web.
final storeOwnerSections = <String, List<AdminEntry>>{
  'Cửa hàng': [
    AdminEntry('Đơn đa kênh', Icons.receipt_long_outlined, () => const OrdersScreen(), feature: 'orders'),
    AdminEntry('Nhóm đơn', Icons.assignment_outlined, () => const OrderGroupsScreen(), feature: 'order_groups'),
    AdminEntry('Đơn hỏa tốc', Icons.bolt_outlined,
        () => const OrderGroupsScreen(view: OrderGroupsView.express), feature: 'order_groups'),
    AdminEntry('Thiếu hàng', Icons.warning_amber_outlined,
        () => const OrderGroupsScreen(view: OrderGroupsView.shortage), feature: 'order_groups'),
    AdminEntry('Trả hàng', Icons.fact_check_outlined, () => const ReturnsManageScreen(), feature: 'returns'),
    AdminEntry('Đồng bộ đơn', Icons.tune, () => const OrderSyncScreen(), feature: 'order_sync'),
    AdminEntry('Cài đặt đóng gói & AI', Icons.auto_awesome_outlined, () => const PackingSettingsScreen(),
        feature: 'packaging_rules'),
    AdminEntry('Nhân viên', Icons.group_outlined, () => const UsersScreen(), feature: 'staff'),
  ],
  'Vận hành kho': [
    AdminEntry('Vật liệu đóng gói', Icons.inventory_2_outlined, () => const MaterialsScreen(),
        feature: 'packaging_materials'),
  ],
  'Báo cáo & phân tích': [
    AdminEntry('Báo cáo', Icons.bar_chart, () => const ReportsScreen(), feature: 'analytics'),
    AdminEntry('Lịch sử thao tác', Icons.history,
        () => const SubPage(title: 'Lịch sử thao tác', child: HistoryScreen()), feature: 'history'),
  ],
  'Hệ thống': [
    AdminEntry('Hồ sơ & Bảo mật', Icons.settings_outlined, () => const ProfileScreen()),
  ],
};

/// Bỏ trang Admin đã tắt cho vai trò; nhóm trống thì ẩn cả tiêu đề.
Map<String, List<AdminEntry>> visibleSections(Map<String, List<AdminEntry>> sections, Set<String> features) => {
      for (final section in sections.entries)
        if (section.value.where((e) => e.feature == null || features.contains(e.feature)).toList()
            case final entries when entries.isNotEmpty)
          section.key: entries,
    };

class AdminMenuScreen extends ConsumerWidget {
  const AdminMenuScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    var sections = adminSections;
    if (ref.watch(isStoreOwnerProvider)) {
      final features =
          ref.watch(myFeaturesProvider).valueOrNull ?? defaultFeaturesFor(UserRole.storeOwner);
      sections = visibleSections(storeOwnerSections, features);
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      children: [
        for (final section in sections.entries) ...[
          sectionTitle(section.key),
          Card(
            child: Column(
              children: [
                for (final entry in section.value)
                  ListTile(
                    leading: Icon(entry.icon, color: AppColors.primary),
                    title: Text(entry.label),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => openPage(context, entry.build()),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
