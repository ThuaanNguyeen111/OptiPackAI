import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/app/providers.dart';
import 'package:optipack_mobile/app/theme.dart';
import 'package:optipack_mobile/core/network/api_client.dart';
import 'package:optipack_mobile/features/admin/inventory_screen.dart';
import 'package:optipack_mobile/features/auth/auth_controller.dart';

class _SignedOut extends AuthController {
  @override
  AuthState build() => const AuthState(status: AuthStatus.signedOut);
}

class _FakeApi implements ApiClient {
  @override
  Future<Object?> get(String path, {Map<String, dynamic>? query, bool public = false}) async {
    if (path == '/warehouse/warehouses') {
      return [
        {'id': 'w0', 'warehouseCode': 'WH-OFF', 'isActive': false},
        {'id': 'w1', 'warehouseCode': 'WH-HCM-001', 'warehouseName': 'Kho HCM', 'isActive': true},
      ];
    }
    if (path.endsWith('/w1/sku-bin-assignments')) {
      return [
        _row('a2', 'b2', 'QUANDAI-006-TRANG-L', 0),
        _row('a1', 'b1', 'QUANDAI-006-TRANG-M', 19),
      ];
    }
    if (path.endsWith('/w1/bin-locations')) {
      return [
        {'id': 'b1', 'zoneId': 'z1', 'binCode': 'KB-D1-T02-T01-1', 'capacity': 20, 'pickSequence': 1},
        {'id': 'b2', 'zoneId': 'z1', 'binCode': 'KB-D1-T02-T01-2', 'capacity': 20, 'pickSequence': 2},
        {'id': 'b3', 'zoneId': 'z1', 'binCode': 'KB-D1-T02-T01-3', 'capacity': 20, 'pickSequence': 3},
      ];
    }
    if (path.endsWith('/w1/zones')) {
      return [
        {'id': 'z1', 'zoneCode': 'KB'},
      ];
    }
    throw StateError('không mong gọi $path');
  }

  static Map<String, dynamic> _row(String id, String bin, String sku, int quantity) => {
        'id': id,
        'binLocationId': bin,
        'sellerSku': sku,
        'platform': 'lazada',
        'shopId': '201182096267',
        'masterSku': sku,
        'quantityOnHand': quantity,
      };

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError('${invocation.memberName}');
}

Future<void> _pump(WidgetTester tester) async {
  tester.view.physicalSize = const Size(360, 640);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      apiClientProvider.overrideWithValue(_FakeApi()),
      authControllerProvider.overrideWith(_SignedOut.new),
    ],
    child: MaterialApp(theme: buildTheme(), home: const Scaffold(body: InventoryScreen(embedded: true))),
  ));
  await tester.pumpAndSettle();
}

Future<void> _reveal(WidgetTester tester, Finder finder) =>
    tester.scrollUntilVisible(finder, 200, scrollable: find.byType(Scrollable).first);

void main() {
  testWidgets('Tab Kho hiện sẵn danh sách tồn, không cần quét', (tester) async {
    await _pump(tester);

    expect(find.text('WH-HCM-001 · Kho HCM'), findsOneWidget);
    await _reveal(tester, find.text('2 dòng tồn · 19 cái · 1 dòng hết hàng'));
    await _reveal(tester, find.text('KB-D1-T02-T01-1'));
    await _reveal(tester, find.text('19 / 20'));
    expect(tester.takeException(), isNull);
  });

  testWidgets('Lọc hết hàng, tìm ô trống, bấm dòng mở thao tác', (tester) async {
    await _pump(tester);

    await tester.ensureVisible(find.text('Hết hàng'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Hết hàng'));
    await tester.pumpAndSettle();
    expect(find.text('KB-D1-T02-T01-1'), findsNothing);
    await _reveal(tester, find.text('KB-D1-T02-T01-2'));
    await tester.tap(find.text('KB-D1-T02-T01-2'));
    await tester.pumpAndSettle();
    expect(find.text('Nhập thêm, kiểm kê, chuyển ô'), findsOneWidget);
    expect(find.text('Sổ kho'), findsOneWidget);
    expect(find.text('Nhập thêm (được bỏ ảnh)'), findsNothing, reason: 'chỉ Admin');

    await tester.tap(find.text('Nhập thêm, kiểm kê, chuyển ô'));
    await tester.pumpAndSettle();
    expect(find.text('Chuyển ô'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Nhập mã ô chưa có hàng thì báo rõ', (tester) async {
    await _pump(tester);
    await tester.enterText(find.byType(TextField), 'kb-d1-t02-t01-3');
    await tester.pumpAndSettle();
    await _reveal(tester, find.text('Ô KB-D1-T02-T01-3 chưa có hàng.'));
    expect(tester.takeException(), isNull);
  });

  test('ghép khu, sức chứa và sắp theo thứ tự đi', () {
    final rows = joinStockRows(
      [
        {'id': 'x', 'binLocationId': 'b2'},
        {'id': 'y', 'binLocationId': 'b1'},
        {'id': 'z', 'binLocationId': 'mat'},
      ],
      [
        {'id': 'b1', 'zoneId': 'z1', 'binCode': 'A-1', 'capacity': 5, 'pickSequence': 1},
        {'id': 'b2', 'zoneId': 'z1', 'binCode': 'A-2', 'pickSequence': 2},
      ],
      [
        {'id': 'z1', 'zoneCode': 'KA'},
      ],
    );
    expect([for (final r in rows) r['id']], ['y', 'x', 'z']);
    expect(rows.first['zoneCode'], 'KA');
    expect(rows.first['capacity'], 5);
    expect(rows.last['binCode'], '—');
  });
}
