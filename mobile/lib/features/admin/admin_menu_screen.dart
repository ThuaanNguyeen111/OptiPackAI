import 'package:flutter/material.dart';

import '../../app/colors.dart';
import '../../shared/admin_kit.dart';
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
  const AdminEntry(this.label, this.icon, this.build);
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
    AdminEntry('Nhóm đơn & Hỏa tốc', Icons.bolt_outlined, () => const OrderGroupsScreen()),
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

class AdminMenuScreen extends StatelessWidget {
  const AdminMenuScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      children: [
        for (final section in adminSections.entries) ...[
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
