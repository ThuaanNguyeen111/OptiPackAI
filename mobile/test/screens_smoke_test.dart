import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/app/mock_providers.dart';
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
      overrides: mockDataOverrides,
      child: MaterialApp(theme: buildTheme(), home: Scaffold(body: screen)),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('Thông báo: hiện danh sách, số chưa đọc, hướng dẫn bật push', (tester) async {
    await pumpScreen(tester, const NotificationsScreen());

    expect(find.text('Dữ liệu mẫu — chưa nối BE'), findsOneWidget);
    expect(find.textContaining('chưa đọc'), findsOneWidget);
    expect(find.text('Thiếu hàng: AOPOLO-030-BE-L'), findsOneWidget);

    expect(find.text('Thông báo đẩy'), findsOneWidget);
    expect(find.textContaining('Chờ BE hỗ trợ'), findsNothing);

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

  testWidgets('Hoàn hàng (kho): chờ nhận kiện, kiểm hàng có chụp ảnh tình trạng', (tester) async {
    await pumpScreen(tester, const WarehouseReturnsScreen());

    // Tab đầu: kiện giao thất bại đang hoàn về kho → nút nhận kiện (receive-return).
    expect(find.text('Nhận kiện hoàn về kho'), findsWidgets);

    await tester.tap(find.text('Chờ nhận'));
    await tester.pumpAndSettle();
    expect(find.text('RMA-261107-0009'), findsOneWidget);
    expect(find.text('Giao thất bại'), findsOneWidget, reason: 'phiếu tự tạo khi giao thất bại');

    await tester.tap(find.text('Chờ kiểm'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Kiểm hàng'));
    await tester.pumpAndSettle();

    expect(find.text('Hoàn tất kiểm hàng'), findsOneWidget);
    expect(find.textContaining('Ảnh tình trạng hàng (0/3) — không bắt buộc'), findsOneWidget);
    final photo = tester.widget<OutlinedButton>(find.widgetWithText(OutlinedButton, 'Chụp ảnh'));
    expect(photo.onPressed, isNotNull);
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
    expect(find.text('Báo lỗi kiện (hỏng / thiếu / nhầm)'), findsOneWidget);

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

  testWidgets('Giao hàng: tạo vận đơn; shop tự giao phải có ảnh mới xác nhận được', (tester) async {
    await pumpScreen(tester, const ShippingScreen());
    expect(find.text('Nguyễn Văn An'), findsOneWidget);
    expect(find.text('Tạo vận đơn'), findsWidgets);

    // 9 tab giống web, mỗi tab một trạng thái.
    expect(find.text('Chờ giao 2'), findsOneWidget);
    expect(find.text('Đang giao 2'), findsOneWidget);
    expect(find.text('Giao thất bại 1'), findsOneWidget);

    await tester.ensureVisible(find.text('Giao thất bại 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Giao thất bại 1'));
    await tester.pumpAndSettle();
    expect(find.text('Giao lại'), findsOneWidget, reason: 'ship42 thất bại lần 1 nên giao lại được');

    await tester.ensureVisible(find.text('Đang giao 2'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Đang giao 2'));
    await tester.pumpAndSettle();
    expect(find.text('SHP-261109-000041'), findsOneWidget);
    expect(find.text('Quá hạn giao'), findsOneWidget);
    expect(find.textContaining('giao thành công cần ảnh bằng chứng'), findsOneWidget);

    // Vận đơn đầu tiên (ship40) là shop tự giao: chưa có ảnh thì không xác nhận được.
    await tester.tap(find.text('Đã giao').first);
    await tester.pumpAndSettle();
    expect(find.textContaining('Ảnh giao hàng (0/3) — bắt buộc'), findsOneWidget);
    // AOFP-315: shop tự giao còn phải quét QR nhãn kiện (hoặc báo nhãn hỏng kèm lý do) mới xác nhận được.
    expect(find.widgetWithText(OutlinedButton, 'Quét QR nhãn kiện'), findsOneWidget);
    final confirm = tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Quét QR nhãn kiện trước'));
    expect(confirm.onPressed, isNull);

    // Nhãn hỏng: đổi sang nhập lý do bỏ quét (≥ 5 ký tự), nút vẫn khoá cho tới khi có ảnh và lý do.
    await tester.tap(find.text('Nhãn hỏng, không quét được'));
    await tester.pumpAndSettle();
    expect(find.text('Lý do bỏ quét (bắt buộc)'), findsOneWidget);
    final needReason = tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Nhập lý do bỏ quét'));
    expect(needReason.onPressed, isNull);
  });

  testWidgets('Tổng quan: thẻ số, hỏa tốc, tra cứu đơn', (tester) async {
    await pumpScreen(tester, const OverviewScreen());
    expect(find.text('Đơn nhận'), findsOneWidget);
    expect(find.text('42'), findsOneWidget);
    expect(find.text('12.450.000 đ'), findsOneWidget);
    expect(find.text('Cần xử lý ngay'), findsOneWidget);
    expect(find.text('Doanh thu đã giao'), findsOneWidget);
    expect(find.text('7 ngày'), findsOneWidget, reason: 'bộ chọn khoảng ngày');
    await tester.scrollUntilVisible(find.text('Hỏa tốc đang chạy'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Hỏa tốc đang chạy'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Tra cứu đơn'), 300, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Mã đơn hoặc tên người nhận'), 'bích');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('720000121'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('720000121'), findsOneWidget);
    expect(find.text('720000118'), findsNothing);
  });
}
