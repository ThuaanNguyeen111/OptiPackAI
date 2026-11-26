// Dựng mọi màn quản trị với máy chủ giả, ở khổ điện thoại nhỏ: bắt lỗi dựng màn, ép kiểu và tràn chữ.
// Dữ liệu giả mô phỏng hình dạng BE trả về; đây không phải kiểm thử với BE thật.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/app/theme.dart';
import 'package:optipack_mobile/app/providers.dart';
import 'package:optipack_mobile/core/network/api_client.dart';
import 'package:optipack_mobile/features/admin/admin_menu_screen.dart';
import 'package:optipack_mobile/features/admin/catalog_screen.dart';
import 'package:optipack_mobile/features/admin/inventory_screen.dart';
import 'package:optipack_mobile/features/admin/marketplace_screen.dart';
import 'package:optipack_mobile/features/admin/materials_screen.dart';
import 'package:optipack_mobile/features/admin/order_groups_screen.dart';
import 'package:optipack_mobile/features/admin/order_sync_screen.dart';
import 'package:optipack_mobile/features/admin/orders_screen.dart';
import 'package:optipack_mobile/features/admin/packing_admin_screen.dart';
import 'package:optipack_mobile/features/admin/returns_manage_screen.dart';
import 'package:optipack_mobile/features/admin/role_permissions_screen.dart';
import 'package:optipack_mobile/features/admin/settings_reports_screen.dart';
import 'package:optipack_mobile/features/admin/shipping_admin_screen.dart';
import 'package:optipack_mobile/features/admin/users_screen.dart';
import 'package:optipack_mobile/features/admin/warehouse_config_screen.dart';
import 'package:optipack_mobile/features/auth/auth_controller.dart';
import 'package:optipack_mobile/features/auth/auth_models.dart';
import 'package:optipack_mobile/features/auth/role_permissions.dart';
import 'package:optipack_mobile/features/profile/profile_screen.dart';
import 'package:optipack_mobile/features/warehouse/combined_pick_screen.dart';
import 'package:optipack_mobile/features/warehouse/warehouse_logic.dart';
import 'package:optipack_mobile/features/warehouse/warehouse_models.dart';

const _longId = '6af72141baaa343d89a3ca54';

const _group = {
  'id': _longId,
  'platform': 'aurelle',
  'fulfillmentStatus': 'picking',
  'version': 3,
  'orderCount': 2,
  'activeOrderCount': 2,
  'orderPriority': 'express',
  'stockShortage': true,
  'isOverdue': true,
  'createdAt': '2026-11-20T02:00:00.000Z',
  'orders': [
    {
      'id': 'o1',
      'platformOrderId': '5329537514716701234567',
      'recipientName': 'Nguyễn Thị Tên Rất Dài Để Thử Tràn',
      'status': 'pending',
      'items': [
        {'sku': 'AOPOLO-030-BE-L', 'quantity': 2},
      ],
    },
  ],
};

const _sample = <String, dynamic>{
  'id': _longId,
  '_id': _longId,
  'name': 'Tên hiển thị khá dài để thử xuống dòng trên màn hình hẹp',
  'code': 'SAMPLE-LONG-CODE-01',
  'email': 'mot.dia.chi.email.rat.dai@congty-optipack.vn',
  'role': 1,
  'is_active': true,
  'mfa_enabled': true,
  'shopId': '201182096267',
  'shopName': 'Cửa hàng thử nghiệm',
  'isActive': true,
  'platform': 'lazada',
  'platformOrderId': '532953751471670',
  'recipientName': 'N**n',
  'status': 'ready',
  'itemCount': 2,
  'totalAmount': 1250000,
  'sellerSku': 'MATKINH-010-DEN-48-SKU-RAT-DAI',
  'masterSku': 'TUIXACH-009-XANHDUONG-18',
  'binCode': 'KE-D1-T02-T01-1',
  'quantityOnHand': 3,
  'reorderLevel': 10,
  'packagingProfileStatus': 'needs_measurement',
  'warehouseCode': 'WH-HCM-001',
  'warehouseName': 'Kho Thành phố Hồ Chí Minh',
  'zoneCode': 'KA',
  'zoneName': 'Khu A',
  'rmaCode': 'RMA-261126-000123',
  'items': [
    {'sellerSku': 'A', 'quantity': 1},
  ],
  'shipmentCode': 'SHP-261126-000123',
  'carrierManaged': true,
  'carrierName': 'Giao Hàng Nhanh',
  'orderGroupId': _longId,
  'lotCode': 'LO-261126',
  'receiptCode': 'PN-261126-01',
  'inner': {'lengthMm': 300, 'widthMm': 200, 'heightMm': 150},
  'outer': {'lengthMm': 306, 'widthMm': 206, 'heightMm': 156},
  'tareG': 250,
  'maxLoadG': 10000,
};

const _plan = {
  'status': 'ready',
  'version': 2,
  'session': {'assignedPackerName': 'Người đóng'},
  'totals': {'parcels': 1, 'packagingCostVnd': 6000},
  'orders': [
    {
      'explanation': ['Đã đạt số kiện tối thiểu.'],
    },
  ],
  'parcels': [
    {
      'parcelNo': 1,
      'orderId': 'o1',
      'status': 'held',
      'box': {'code': 'SAMPLE-LT'},
      'estimatedWeightG': 900,
      'actualWeightKg': 1.4,
      'recipientName': 'An',
      'placements': [
        {'itemKey': 'A#1', 'sku': 'A'},
      ],
    },
  ],
};

class _FakeApi implements ApiClient {
  final calls = <String>[];

  @override
  Future<Object?> get(String path, {Map<String, dynamic>? query, bool public = false}) async {
    calls.add(path);
    if (path.endsWith('/packing-plan')) return {'plan': _plan};
    if (path == '/order-groups/$_longId') return _group;
    if (path.endsWith('/linked')) {
      return {
        'linkedGroups': [
          {..._group, 'id': 'bbbbbbbbbbbbbbbbbbbbbbbb'},
        ],
      };
    }
    if (path.endsWith('/picking-list')) {
      return [
        {'sku': 'AOPOLO-030-BE-L', 'bin_code': 'KA-D1-P01-T01-1', 'quantity': 2, 'order_group_id': _longId},
      ];
    }
    if (path.startsWith('/order-groups')) return [_group];
    if (path == '/orders') {
      return {
        'orders': [_sample],
        'nextCursor': 'abc',
      };
    }
    if (path.startsWith('/orders/')) return {..._sample, 'status': 'pending', 'platform': 'tiki'};
    if (path == '/role-permissions') {
      return {
        'matrix': {
          '1': ['picking'],
        },
        'defaults': {
          '1': ['picking', 'inventory'],
        },
      };
    }
    if (path == '/users/me') return _sample;
    if (path == '/order-sync-settings') {
      return {
        'version': 1,
        'sync': {
          'intervalMinutes': 5,
          'platforms': [
            {'platform': 'lazada', 'autoSyncEnabled': true},
          ],
        },
        'consolidation': {
          'enabled': true,
          'keyFields': ['phone', 'address_line1'],
        },
        'statuses': <String, dynamic>{},
        'options': <String, dynamic>{},
      };
    }
    if (path == '/order-sync-settings/rules') {
      return {
        'version': 1,
        'rules': [
          {
            'id': 'r1',
            'name': 'Cùng SĐT',
            'enabled': true,
            'fields': [
              {'field': 'phone', 'match': 'normalized'},
            ],
          },
        ],
      };
    }
    if (path == '/packing/settings') {
      return {'version': 1, 'requireScan': true, 'abnormalWeightThreshold': 0.2, 'maxParcelsPerOrder': null};
    }
    if (path == '/ai-settings') {
      return {
        'settings': {'provider': 'groq', 'model': 'openai/gpt-oss-120b', 'hasApiKey': true},
      };
    }
    if (path == '/packing/reports/summary') {
      return {
        'plans': 3,
        'cost': {'packaging': 12000},
        'byStaff': [
          {'name': 'An', 'parcels': 4},
        ],
      };
    }
    if (path == '/packing/reports/feedback') return {'suggestions': <Object>[]};
    if (path == '/packaging-materials/savings') return {'totalSavingVnd': 12000};
    if (path == '/shipping/settings') {
      return {'strategy': 'cheapest', 'sender': <String, dynamic>{}};
    }
    if (path == '/packaging/materials/rules') {
      return {
        'isDefault': true,
        'rules': [
          {'materialType': 'air_pillow', 'appliesTo': 'any', 'basis': 'void_band', 'minUnits': 1},
        ],
      };
    }
    return [_sample];
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _SignedOut extends AuthController {
  @override
  AuthState build() => const AuthState(status: AuthStatus.signedOut);
}

Future<void> _pump(WidgetTester tester, Widget screen, {bool owner = false}) async {
  tester.view.physicalSize = const Size(360, 640);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      apiClientProvider.overrideWithValue(_FakeApi()),
      authControllerProvider.overrideWith(_SignedOut.new),
      if (owner) isStoreOwnerProvider.overrideWithValue(true),
      if (owner) myFeaturesProvider.overrideWith((ref) async => defaultFeaturesFor(UserRole.storeOwner)),
    ],
    child: MaterialApp(theme: buildTheme(), home: Scaffold(body: screen)),
  ));
  await tester.pumpAndSettle();
}

/// Cuộn hết trang để mọi thẻ đều được dựng.
Future<void> _scrollThrough(WidgetTester tester) async {
  final list = find.byType(ListView);
  if (list.evaluate().isEmpty) return;
  for (var i = 0; i < 6; i++) {
    await tester.drag(list.last, const Offset(0, -400), warnIfMissed: false);
    await tester.pumpAndSettle();
  }
}

void main() {
  final screens = <String, Widget Function()>{
    'menu': () => const AdminMenuScreen(),
    'người dùng': () => const UsersScreen(),
    'phân quyền': () => const RolePermissionsScreen(),
    'hồ sơ': () => const ProfileScreen(),
    'kết nối sàn': () => const MarketplaceScreen(),
    'đơn hàng': () => const OrdersScreen(),
    'chi tiết đơn': () => const OrderDetailScreen(orderId: 'o1'),
    'nhóm đơn': () => const OrderGroupsScreen(),
    'đơn hỏa tốc': () => const OrderGroupsScreen(view: OrderGroupsView.express),
    'thiếu hàng': () => const OrderGroupsScreen(view: OrderGroupsView.shortage),
    'chi tiết nhóm': () => const OrderGroupDetailScreen(groupId: _longId),
    'đồng bộ đơn': () => const OrderSyncScreen(),
    'trả hàng': () => const ReturnsManageScreen(),
    'cấu hình kho': () => const WarehouseConfigScreen(),
    'chi tiết kho': () => const WarehouseDetailScreen(warehouse: _sample),
    'sku và danh mục': () => const CatalogScreen(),
    'tình trạng kho': () => const InventoryScreen(),
    'vật liệu': () => const MaterialsScreen(),
    'quản lý đóng gói': () => const PackingAdminScreen(),
    'kế hoạch': () => const PlanManageScreen(groupId: _longId),
    'quản lý vận chuyển': () => const ShippingAdminScreen(),
    'cài đặt đóng gói': () => const PackingSettingsScreen(),
    'báo cáo': () => const ReportsScreen(),
    'lấy chung': () => const CombinedPickScreen(groupId: _longId, warehouseId: 'w1'),
  };

  for (final entry in screens.entries) {
    testWidgets('màn ${entry.key} dựng được', (tester) async {
      await _pump(tester, entry.value());
      expect(find.text('Thử lại'), findsNothing, reason: 'màn tải lỗi');
      await _scrollThrough(tester);
      expect(tester.takeException(), isNull);
    });
  }

  /// Đổi từng tab của các màn nhiều tab: dữ liệu mỗi tab có hình dạng khác nhau.
  final tabbed = <String, (Widget Function(), List<String>)>{
    'sku và danh mục': (() => const CatalogScreen(), ['SKU nội bộ', 'SKU sàn chưa nối', 'Danh mục', 'Màu']),
    'tình trạng kho': (() => const InventoryScreen(), ['Theo lô', 'Phiếu nhập']),
    'vật liệu': (() => const MaterialsScreen(), ['Túi zip', 'Vật tư chèn', 'Kho tái sử dụng', 'Quy tắc chọn']),
    'chi tiết kho': (() => const WarehouseDetailScreen(warehouse: _sample), ['Ô kệ', 'Gán SKU']),
    'quản lý vận chuyển': (() => const ShippingAdminScreen(), ['Chờ tạo vận đơn', 'Hãng & người gửi']),
  };

  for (final entry in tabbed.entries) {
    testWidgets('màn ${entry.key} đổi tab được', (tester) async {
      await _pump(tester, entry.value.$1());
      for (final label in entry.value.$2) {
        await tester.ensureVisible(find.text(label));
        await tester.pumpAndSettle();
        await tester.tap(find.text(label));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: 'tab $label');
        expect(find.text('Thử lại'), findsNothing, reason: 'tab tải lỗi');
      }
    });
  }

  group('Chủ cửa hàng', () {
    testWidgets('menu "Thêm" giống thanh bên web, không có trang của Admin', (tester) async {
      await _pump(tester, const AdminMenuScreen(), owner: true);
      final seen = <String>{};
      for (var i = 0; i < 8; i++) {
        seen.addAll(tester.widgetList<ListTile>(find.byType(ListTile)).map((t) => (t.title! as Text).data!));
        await tester.drag(find.byType(ListView).first, const Offset(0, -300));
        await tester.pumpAndSettle();
      }
      expect(seen, containsAll([
        'Đơn đa kênh', 'Nhóm đơn', 'Đơn hỏa tốc', 'Thiếu hàng', 'Trả hàng', 'Đồng bộ đơn',
        'Cài đặt đóng gói & AI', 'Nhân viên', 'Vật liệu đóng gói', 'Báo cáo', 'Lịch sử thao tác',
      ]));
      for (final adminOnly in ['Người dùng', 'Phân quyền', 'Kết nối sàn', 'Cấu hình kho', 'Quản lý vận chuyển']) {
        expect(seen, isNot(contains(adminOnly)));
      }
    });

    test('trang bị Admin tắt thì mất khỏi menu', () {
      final labels = [
        for (final list in visibleSections(storeOwnerSections, {'orders'}).values)
          for (final e in list) e.label,
      ];
      expect(labels, ['Đơn đa kênh', 'Hồ sơ & Bảo mật']);
    });

    for (final entry in <String, Widget Function()>{
      'nhân viên': () => const UsersScreen(),
      'đồng bộ đơn': () => const OrderSyncScreen(),
      'vật liệu': () => const MaterialsScreen(),
      'chi tiết nhóm': () => const OrderGroupDetailScreen(groupId: _longId),
      'cài đặt đóng gói': () => const PackingSettingsScreen(),
      'trả hàng': () => const ReturnsManageScreen(),
    }.entries) {
      testWidgets('màn ${entry.key} dựng được và không có nút chỉ dành cho Admin', (tester) async {
        await _pump(tester, entry.value(), owner: true);
        expect(find.text('Thử lại'), findsNothing, reason: 'màn tải lỗi');
        await _scrollThrough(tester);
        for (final label in ['Liên kết nhóm', 'Nhả giữ chỗ', 'Thêm quy tắc', 'Tạo từ câu mô tả', 'Kết nối AI', 'Thử kết nối AI']) {
          expect(find.text(label), findsNothing, reason: label);
        }
        expect(find.byType(FloatingActionButton), findsNothing);
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('đồng bộ đơn và vật liệu: không thẻ nào có menu thao tác', (tester) async {
      await _pump(tester, const OrderSyncScreen(), owner: true);
      expect(find.byTooltip('Thao tác'), findsNothing);
      await _pump(tester, const MaterialsScreen(), owner: true);
      expect(find.byTooltip('Thao tác'), findsNothing);
    });

    testWidgets('cài đặt đóng gói: có "Người gửi trên nhãn"', (tester) async {
      await _pump(tester, const PackingSettingsScreen(), owner: true);
      await tester.scrollUntilVisible(find.text('Người gửi trên nhãn'), 200, scrollable: find.byType(Scrollable).first);
      expect(find.text('Người gửi trên nhãn'), findsOneWidget);
    });
  });

  test('khay A/B theo thứ tự đơn trong nhóm', () {
    PickLine line(List<String> orders) => PickLine(
          sku: 'A',
          quantity: 1,
          pickedQuantity: 0,
          binCode: '',
          zoneCode: '',
          allocations: [for (final o in orders) OrderAllocation(orderId: o, quantity: 1)],
        );
    expect(trayLetters(['o1', 'o2', 'o3'], [line(['o3']), line(['o2', 'x'])]), {'o2': 'A', 'o3': 'B', 'x': 'C'});
  });

  test('lấy chung chỉ gồm nhóm còn lấy hàng và cùng kho', () {
    expect(
      combinablePickGroups('g1', 'w1', [
        {'id': 'g2', 'fulfillmentStatus': 'picking', 'warehouseId': 'w1'},
        {'id': 'g3', 'fulfillmentStatus': 'packed', 'warehouseId': 'w1'},
        {'id': 'g4', 'fulfillmentStatus': 'picking', 'warehouseId': 'w2'},
        {'id': 'g5', 'fulfillmentStatus': 'awaiting_packaging'},
      ]),
      ['g1', 'g2', 'g5'],
    );
  });
}
