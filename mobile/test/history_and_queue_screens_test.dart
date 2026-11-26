import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/app/theme.dart';
import 'package:optipack_mobile/app/mock_providers.dart';
import 'package:optipack_mobile/app/providers.dart';
import 'package:optipack_mobile/features/auth/auth_controller.dart';
import 'package:optipack_mobile/features/history/history_repository.dart';
import 'package:optipack_mobile/features/history/history_screen.dart';
import 'package:optipack_mobile/features/home/my_work_view.dart';
import 'package:optipack_mobile/features/warehouse/warehouse_models.dart';
import 'package:optipack_mobile/features/warehouse/warehouse_repository.dart';

class _SignedOut extends AuthController {
  @override
  AuthState build() => const AuthState(status: AuthStatus.signedOut);
}

Future<void> _pump(WidgetTester tester, Widget child, List<Override> overrides) async {
  tester.view.physicalSize = const Size(360, 640);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(ProviderScope(
    overrides: overrides,
    child: MaterialApp(theme: buildTheme(), home: Scaffold(body: child)),
  ));
  await tester.pumpAndSettle();
}

OrderGroupSummary _group(String id, String status, {int orders = 1}) => OrderGroupSummary(
      id: id,
      platform: 'lazada',
      fulfillmentStatus: status,
      version: 1,
      orderCount: orders,
      activeOrderCount: orders,
      assignedStaffId: 'someone',
    );

void main() {
  testWidgets('Lịch sử: hiện mốc theo ngày, người làm và nút xem cả đơn', (tester) async {
    await _pump(tester, const HistoryScreen(), mockDataOverrides);

    expect(find.text('Thứ sáu, 20/11/2026'), findsOneWidget);
    expect(find.text('09:30'), findsOneWidget);
    expect(find.text('Xem cả đơn'), findsOneWidget);
    await tester.tap(find.text('Lọc thêm'));
    await tester.pumpAndSettle();
    expect(find.text('Chỉ việc của tôi'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Lấy hàng: thấy nhóm của người khác, đổi mục thì đổi danh sách', (tester) async {
    await _pump(tester, const MyWorkView(), [
      ...mockDataOverrides,
      authControllerProvider.overrideWith(_SignedOut.new),
      warehouseStaffProvider.overrideWith((ref) async => const [StaffOption(id: 'someone', name: 'An')]),
      myWorkProvider.overrideWith(
        (ref) async => Loaded([_group('aaaaaaaaaa11', 'picking'), _group('bbbbbbbbbb22', 'pending_approval')]),
      ),
    ]);

    expect(find.text('Cần lấy 1'), findsOneWidget);
    expect(find.text('Đã lấy 1'), findsOneWidget);
    expect(find.text('Người lấy: An'), findsOneWidget);
    expect(find.text('1 đơn · Đang lấy hàng'), findsOneWidget);
    await tester.ensureVisible(find.text('Đã lấy 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Đã lấy 1'));
    await tester.pumpAndSettle();
    expect(find.text('1 đơn · Chờ chấp nhận kế hoạch'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Lấy hàng: có mục Đã giao vận, tìm mã đơn ra nhóm ở mục khác', (tester) async {
    final delivered = _group('cccccccccc33', 'delivered');
    final asked = <String>[];
    await _pump(tester, const MyWorkView(), [
      ...mockDataOverrides,
      authControllerProvider.overrideWith(_SignedOut.new),
      warehouseStaffProvider.overrideWith((ref) async => const <StaffOption>[]),
      myWorkProvider.overrideWith(
        (ref) async => Loaded([_group('aaaaaaaaaa11', 'picking'), delivered]),
      ),
      groupSearchProvider.overrideWith((ref, query) async {
        asked.add(query);
        return [delivered];
      }),
    ]);

    expect(find.text('Đã giao vận 1'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '531055092970722');
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();

    expect(asked, ['531055092970722']);
    expect(find.text('Ở mục khác'), findsOneWidget);
    expect(find.text('Mục: Đã giao vận'), findsOneWidget);
    expect(find.text('1 đơn · Đã giao'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test('bộ lọc lịch sử gửi đúng tham số, tính cả ngày cuối', () {
    final q = HistoryFilter(
      category: 'picking',
      from: DateTime(2026, 11, 1),
      to: DateTime(2026, 11, 30),
      mine: true,
      sku: ' ABC ',
    ).toQuery(page: 2, limit: 30);
    expect(q['page'], 2);
    expect(q['category'], 'picking');
    expect(q['mine'], 'true');
    expect(q['sku'], 'ABC');
    expect(q['from'], DateTime(2026, 11, 1).toUtc().toIso8601String());
    expect(q['to'], DateTime(2026, 12, 1).toUtc().toIso8601String());
    expect(q.containsKey('order_code'), isFalse);
  });
}
