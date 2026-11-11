import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/app/theme.dart';
import 'package:optipack_mobile/features/notifications/notifications_screen.dart';
import 'package:optipack_mobile/features/overview/overview_screen.dart';
import 'package:optipack_mobile/features/packing/packing_screens.dart';
import 'package:optipack_mobile/features/returns/returns_screens.dart';
import 'package:optipack_mobile/features/shipping/shipping_screen.dart';
import 'package:optipack_mobile/features/stock/stock_screen.dart';

/// Dựng thật từng màn để bắt lỗi bố cục (overflow) và lỗi hiển thị.
///
/// Trong test mọi chữ dùng phông Ahem (mỗi ký tự rộng đúng 1 em), rộng gấp khoảng 2 lần phông thật.
/// Nên khung thử nghiệm rộng 720 (≈ 2 × điện thoại 360) để độ rộng chữ tương đương máy thật,
/// thay vì 400 làm xuất hiện lỗi tràn giả.
Future<void> pumpScreen(WidgetTester tester, Widget screen) async {
  tester.view.physicalSize = const Size(720, 1600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(theme: buildTheme(), home: Scaffold(body: screen)),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('Thông báo: hiện danh sách, số chưa đọc, công tắc push bị khoá', (tester) async {
    await pumpScreen(tester, const NotificationsScreen());

    expect(find.text('Dữ liệu mẫu — chưa nối BE'), findsOneWidget);
    expect(find.textContaining('chưa đọc'), findsOneWidget);
    expect(find.text('Thiếu hàng: AOPOLO-030-BE-L'), findsOneWidget);

    final push = tester.widget<SwitchListTile>(find.byType(SwitchListTile));
    expect(push.onChanged, isNull, reason: 'push chờ BE nên khoá');
    expect(find.textContaining('Chờ BE hỗ trợ'), findsOneWidget);

    await tester.tap(find.text('Đọc hết'));
    await tester.pumpAndSettle();
    expect(find.text('0 chưa đọc'), findsOneWidget);
  });

  testWidgets('Kho: tìm ô, hiện SKU, mở form thao tác', (tester) async {
    await pumpScreen(tester, const StockScreen());

    expect(find.textContaining('Quét hoặc nhập mã ô'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'ka-d1-p01-t01-1');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();

    expect(find.text('AOPOLO-030-BE-L'), findsOneWidget);
    await tester.tap(find.text('AOPOLO-030-BE-L'));
    await tester.pumpAndSettle();
    expect(find.text('Nhập thêm'), findsOneWidget);
    expect(find.text('Kiểm kê'), findsOneWidget);
    expect(find.text('Chuyển ô'), findsOneWidget);
  });

  testWidgets('Kho: ô không tồn tại thì báo rõ', (tester) async {
    await pumpScreen(tester, const StockScreen());
    await tester.enterText(find.byType(TextField), 'KHONG-CO');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    expect(find.textContaining('Không tìm thấy ô'), findsOneWidget);
  });

  testWidgets('Hoàn hàng (kho): chờ nhận kiện, kiểm hàng có nút ảnh bị khoá', (tester) async {
    await pumpScreen(tester, const WarehouseReturnsScreen());

    expect(find.text('RMA-261107-0009'), findsOneWidget);
    expect(find.text('Giao thất bại'), findsOneWidget, reason: 'phiếu tự tạo khi giao thất bại');

    await tester.tap(find.text('Chờ kiểm hàng'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Kiểm hàng'));
    await tester.pumpAndSettle();

    expect(find.text('Hoàn tất kiểm hàng'), findsOneWidget);
    expect(find.textContaining('Chụp ảnh tình trạng hàng'), findsOneWidget);
    final photo = tester.widget<OutlinedButton>(find.widgetWithText(OutlinedButton, 'Chụp ảnh tình trạng hàng (chờ BE)'));
    expect(photo.onPressed, isNull);
  });

  testWidgets('Duyệt hoàn (chủ shop): hiện yêu cầu chờ duyệt', (tester) async {
    await pumpScreen(tester, const ReturnsApprovalScreen());
    expect(find.text('RMA-261108-0001'), findsOneWidget);
    expect(find.text('Duyệt'), findsWidgets);
    expect(find.text('Từ chối'), findsWidgets);
  });

  testWidgets('Đóng gói: hàng đợi và màn xem kế hoạch có nút chấp nhận / từ chối', (tester) async {
    await pumpScreen(tester, const PackingQueueScreen());
    expect(find.text('6ae76ee49b'), findsOneWidget);
    expect(find.text('Hỏa tốc'), findsOneWidget);

    await tester.tap(find.text('6ae76ee49b'));
    await tester.pumpAndSettle();

    expect(find.text('Chấp nhận'), findsWidgets);
    expect(find.text('Từ chối'), findsOneWidget);
    expect(find.textContaining('Cắt hạ thùng còn'), findsOneWidget, reason: 'BOX-M có cắt hạ');
    expect(find.textContaining('Đang hiện 4/4 món'), findsOneWidget);
  });

  testWidgets('Đóng gói: phiên đóng quét món rồi niêm phong', (tester) async {
    await pumpScreen(tester, const PackingGroupScreen(groupId: 'pg2'));

    expect(find.text('Quét đủ món để niêm phong'), findsOneWidget);
    expect(find.textContaining('Chụp ảnh lỗi'), findsOneWidget);

    for (final sku in ['AOPOLO-030-BE-M', 'QJEAN-012-XA-30']) {
      await tester.enterText(find.widgetWithText(TextField, 'Quét / nhập SKU món'), sku);
      await tester.testTextInput.receiveAction(TextInputAction.done);
      // Repository giả trễ 200 ms khi quét rồi 200 ms khi tải lại: phải tua thời gian thì mới chạy.
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();
    }
    expect(find.text('Đã quét 2/2 món'), findsOneWidget);
    expect(find.text('Niêm phong kiện 1'), findsOneWidget);
  });

  testWidgets('Giao hàng: tạo vận đơn, đang giao có nút ảnh bị khoá', (tester) async {
    await pumpScreen(tester, const ShippingScreen());
    expect(find.text('Nguyễn Văn An'), findsOneWidget);
    expect(find.text('Tạo vận đơn'), findsWidgets);

    await tester.tap(find.text('Đang giao'));
    await tester.pumpAndSettle();
    expect(find.text('SHP-261109-000041'), findsOneWidget);
    expect(find.text('Quá hạn giao'), findsOneWidget);
    expect(find.text('Giao lại'), findsOneWidget, reason: 'ship42 thất bại lần 1 nên giao lại được');
    expect(find.textContaining('Chụp ảnh giao hàng'), findsOneWidget);
  });

  testWidgets('Tổng quan: thẻ số, hỏa tốc, tra cứu đơn', (tester) async {
    await pumpScreen(tester, const OverviewScreen());
    expect(find.text('Đơn hôm nay'), findsOneWidget);
    expect(find.text('42'), findsOneWidget);
    expect(find.text('12.450.000 đ'), findsOneWidget);
    expect(find.text('Hỏa tốc đang chạy'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Mã đơn hoặc tên người nhận'), 'bích');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('720000121'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('720000121'), findsOneWidget);
    expect(find.text('720000118'), findsNothing);
  });
}
