import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/app/mock_providers.dart';
import 'package:optipack_mobile/app/theme.dart';
import 'package:optipack_mobile/features/notifications/notifications_screen.dart';
import 'package:optipack_mobile/features/overview/overview_screen.dart';
import 'package:optipack_mobile/features/returns/returns_screens.dart';
import 'package:optipack_mobile/features/shipping/shipping_screen.dart';
import 'package:optipack_mobile/features/stock/stock_screen.dart';

/// Dựng từng màn ở khung điện thoại **thấp và hẹp** (360 × 640 dp, chữ lớn 1,3 lần) để bắt lỗi tràn pixel
/// ("BOTTOM OVERFLOWED BY … PIXELS"). Phông Ahem trong test rộng gấp ~2 lần phông thật, nên khung là 720 px
/// với tỷ lệ chữ 1,3 — tương đương máy thật chữ lớn.
Future<void> pumpSmall(WidgetTester tester, Widget screen) async {
  tester.view.physicalSize = const Size(720, 1100);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: mockDataOverrides,
      child: MaterialApp(
        theme: buildTheme(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: const TextScaler.linear(1.3)),
          child: child!,
        ),
        home: Scaffold(body: screen),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  final screens = <String, Widget Function()>{
    'Thông báo': () => const NotificationsScreen(),
    'Tồn kho': () => const StockScreen(),
    'Tổng quan': () => const OverviewScreen(),
    'Hoàn hàng (kho)': () => const WarehouseReturnsScreen(),
    'Duyệt hoàn': () => const ReturnsApprovalScreen(),
    'Giao hàng': () => const ShippingScreen(),
  };
  for (final e in screens.entries) {
    testWidgets('Không tràn pixel: ${e.key}', (tester) async {
      await pumpSmall(tester, e.value());
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('Không tràn pixel: bảng chọn đơn vị vận chuyển (nhiều hãng, hãng lỗi)', (tester) async {
    await pumpSmall(tester, const ShippingScreen());
    // Mở bảng chọn hãng cho nhóm đầu tiên nếu có nút.
    final create = find.textContaining('Tạo vận đơn');
    if (create.evaluate().isNotEmpty) {
      await tester.tap(create.first);
      await tester.pumpAndSettle();
    }
    expect(tester.takeException(), isNull);
  });
}
