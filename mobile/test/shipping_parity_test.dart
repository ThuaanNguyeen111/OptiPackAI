import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/app/providers.dart';
import 'package:optipack_mobile/app/theme.dart';
import 'package:optipack_mobile/core/network/api_client.dart';
import 'package:optipack_mobile/features/auth/auth_controller.dart';
import 'package:optipack_mobile/features/shipping/api_shipping_repository.dart';
import 'package:optipack_mobile/features/shipping/handover_slip.dart';
import 'package:optipack_mobile/features/shipping/shipment_detail_screen.dart';
import 'package:optipack_mobile/features/shipping/shipping_repository.dart';
import 'package:optipack_mobile/features/shipping/shipping_screen.dart';
import 'package:optipack_mobile/features/shipping/shipping_tools.dart';

// Chạy với BE giả theo hình dạng BE thật, giao diện thật, khổ điện thoại nhỏ.
class _SignedOut extends AuthController {
  @override
  AuthState build() => const AuthState(status: AuthStatus.signedOut);
}

const _gid = '6af72141baaa343d89a3ca54';

class _FakeApi implements ApiClient {
  final gets = <String, Map<String, dynamic>?>{};
  final posts = <String, Object?>{};
  bool express = false;
  String platform = 'lazada';

  Map<String, dynamic> get _group => {
        'id': _gid,
        'platform': platform,
        'fulfillmentStatus': 'packed',
        'recipientNames': ['Khách A'],
        'orderPriority': express ? 'express' : 'normal',
        'requiresSelfDelivery': express,
      };

  static const _shipment = {
    'id': 's1',
    'shipmentCode': 'SHP-261122-967692',
    'orderGroupId': _gid,
    'status': 'awaiting_pickup',
    'attemptCount': 1,
    'maxAttempts': 2,
    'carrierCode': 'GHN',
    'carrierName': 'Giao Hàng Nhanh (GHN)',
    'carrierManaged': true,
    'carrierStatus': 'ready_to_pick',
    'carrierStatusLabel': 'Chờ lấy hàng',
    'estimatedCostVnd': 20900,
    'dueAt': '2026-11-23T16:59:00.000Z',
    'version': 2,
    'carrierParcels': [
      {'parcelNo': 1, 'carrierOrderCode': 'LYCM97', 'sortCode': 'GXT-M-11-00', 'recipientName': 'Khách E2E'},
      {'parcelNo': 2, 'bookingError': 'GHN_ERROR: Sai phường'},
    ],
  };

  @override
  Future<Object?> get(String path, {Map<String, dynamic>? query, bool public = false}) async {
    gets[path] = query;
    if (path == '/order-groups') return [_group];
    if (path == '/order-groups/$_gid') return _group;
    if (path.endsWith('/packing-plan')) {
      return {
        'plan': {
          'parcels': [
            {
              'actualWeightKg': null,
              'estimatedWeightG': 1020,
              'box': {
                'outerMm': {'lengthMm': 400, 'widthMm': 300, 'heightMm': 200},
              },
            },
          ],
        },
      };
    }
    if (path == '/packing-plans/summary') {
      return {'summaries': [{'orderGroupId': _gid, 'parcels': 1}], 'groups': []};
    }
    if (path == '/shipments') return {'items': [_shipment], 'total': 1};
    if (path == '/shipments/s1') return _shipment;
    if (path == '/shipments/s1/events') {
      return [
        {'id': 'e1', 'eventType': 'carrier_booked', 'actorId': 'system', 'occurredAt': '2026-11-22T14:33:00.000Z'},
      ];
    }
    if (path == '/returns') {
      return {
        'items': [
          {'orderGroupId': _gid, 'rmaCode': 'RMA-1', 'status': 'received'},
          {'orderGroupId': 'khac', 'rmaCode': 'RMA-2', 'status': 'closed'},
        ],
      };
    }
    if (path == '/shipping/recipients/$_gid') {
      return {
        'recipients': [
          {'street': '47/10 Nguyễn Văn Đậu', 'wardName': 'Phường Gia Định', 'provinceName': 'Hồ Chí Minh', 'phone': '0377168254', 'isDemo': true},
        ],
      };
    }
    if (path == '/shipping/quote/$_gid') {
      return {
        'quotes': [
          {'carrierCode': 'GHN', 'carrierName': 'GHN', 'serviceCode': 'LIGHT', 'serviceName': 'Hàng nhẹ', 'totalCostVnd': 20900, 'etaMinDays': 1, 'etaMaxDays': 2},
        ],
      };
    }
    if (path == '/shipping/carriers') {
      return [
        {'code': 'GHN', 'name': 'GHN', 'services': [{'code': 'LIGHT', 'name': 'Hàng nhẹ'}]},
      ];
    }
    if (path == '/shipments/shippers') {
      return [
        {'id': 'u9', 'name': 'Anh Shipper', 'phone': '0900000000'},
      ];
    }
    throw StateError('không mong gọi $path');
  }

  @override
  Future<Object?> post(String path, {Object? body, bool public = false, Map<String, dynamic>? query}) async {
    posts[path] = body;
    return _shipment;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError('${invocation.memberName}');
}

Future<_FakeApi> _pump(WidgetTester tester, Widget child, {_FakeApi? api}) async {
  final fake = api ?? _FakeApi();
  tester.view.physicalSize = const Size(360, 720);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      apiClientProvider.overrideWithValue(fake),
      authControllerProvider.overrideWith(_SignedOut.new),
    ],
    child: MaterialApp(theme: buildTheme(), home: Scaffold(body: child)),
  ));
  await tester.pumpAndSettle();
  return fake;
}

Future<void> _tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('Danh sách: 9 tab, mặc định xem tất cả, tìm mã ra vận đơn ở tab khác', (tester) async {
    final api = await _pump(tester, const ShippingScreen());

    expect(api.gets['/shipments'], isNot(contains('shipper_id')), reason: 'mặc định không lọc "Của tôi"');
    expect(find.text('Chờ giao 1'), findsOneWidget);
    expect(find.text('Chờ hãng lấy 1'), findsOneWidget);
    expect(find.text('Đã huỷ 0'), findsOneWidget);
    expect(find.text('SHP-261122-967692'), findsNothing);

    await tester.enterText(find.byType(TextField).first, 'shp-261122');
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('SHP-261122-967692'), 200, scrollable: find.byType(Scrollable).at(0));
    expect(tester.takeException(), isNull);
  });

  testWidgets('Tạo vận đơn: điền sẵn địa chỉ, báo giá và gửi đúng hãng + địa chỉ + ghi chú', (tester) async {
    final api = await _pump(tester, const ShippingScreen());
    await _tapVisible(tester, find.widgetWithText(FilledButton, 'Tạo vận đơn'));

    expect(api.gets['/shipping/quote/$_gid']?['ward_name'], 'Phường Gia Định');
    expect(find.textContaining('địa chỉ mô phỏng'), findsOneWidget);

    await _tapVisible(tester, find.text('GHN · Hàng nhẹ'));
    expect(find.text('So chi phí thùng'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Ghi chú (tùy chọn)'), 'Gọi trước');
    await _tapVisible(tester, find.widgetWithText(FilledButton, 'Tạo vận đơn').last);

    final body = api.posts['/shipments'] as Map;
    expect(body['carrier_code'], 'GHN');
    expect(body['service_code'], 'LIGHT');
    expect(body['note'], 'Gọi trước');
    expect((body['to_location'] as Map)['phone'], '0377168254');
    expect(body.containsKey('shipper_id'), isFalse);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Đơn hỏa tốc: bắt chọn người giao, chỉ gửi shipper_id', (tester) async {
    final api = await _pump(tester, const ShippingScreen(), api: _FakeApi()..express = true);
    await _tapVisible(tester, find.widgetWithText(FilledButton, 'Tạo vận đơn'));

    FilledButton submit() => tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Tạo vận đơn').last);
    expect(submit().onPressed, isNull);
    await _tapVisible(tester, find.byType(DropdownButtonFormField<String>));
    await tester.tap(find.textContaining('Anh Shipper').last);
    await tester.pumpAndSettle();
    await _tapVisible(tester, find.widgetWithText(FilledButton, 'Tạo vận đơn').last);

    expect(api.posts['/shipments'], {'order_group_id': _gid, 'shipper_id': 'u9'});
    expect(api.gets.containsKey('/shipping/quote/$_gid'), isFalse);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Đơn Tiki: không báo giá, tạo vận đơn chỉ gửi mã nhóm', (tester) async {
    final api = await _pump(tester, const ShippingScreen(), api: _FakeApi()..platform = 'tiki');
    expect(find.text('Chọn giao chung chuyến'), findsNothing);
    await _tapVisible(tester, find.widgetWithText(FilledButton, 'Tạo vận đơn'));
    expect(find.textContaining('shipper Tiki tự tới lấy'), findsOneWidget);
    await _tapVisible(tester, find.widgetWithText(FilledButton, 'Tạo vận đơn').last);
    expect(api.posts['/shipments'], {'order_group_id': _gid});
    expect(tester.takeException(), isNull);
  });

  testWidgets('Chi tiết vận đơn hãng: tổng hợp, kiện, thao tác, dòng thời gian, quyền giấy tờ', (tester) async {
    await _pump(tester, const ShipmentDetailScreen(shipmentId: 's1'));
    final list = find.byType(Scrollable).first;
    Future<void> see(Finder f) async {
      try {
        await tester.scrollUntilVisible(f, 150, scrollable: list);
      } on StateError {
        fail('Không thấy $f');
      }
    }

    await see(find.textContaining('Tổng cân 1,02 kg · thể tích 0,0240 m³'));
    await see(find.text('RMA-1'));
    expect(find.text('RMA-2'), findsNothing, reason: 'phiếu của nhóm khác');
    await see(find.textContaining('Chưa tạo được vận đơn cho kiện 2: Sai phường'));
    for (final label in ['Mô phỏng', 'Đồng bộ', 'Nhãn hãng', 'Tạo lại ở hãng', 'Huỷ ở hãng']) {
      await see(find.text(label));
    }
    await see(find.text('Đã tạo vận đơn ở hãng'));
    await see(find.text('Nhãn PDF'));
    expect(find.text('Hẹn lấy hàng'), findsOneWidget, reason: 'chưa gán người giao, chưa kết thúc');
    expect(find.text('Phiếu đóng gói'), findsNothing, reason: 'BE không cho Điều phối in');
    expect(tester.takeException(), isNull);
  });

  testWidgets('Giao chung chuyến: điền sẵn địa chỉ, sửa được và gửi kèm', (tester) async {
    final api = await _pump(tester, const ShippingScreen());
    await _tapVisible(tester, find.text('Chọn giao chung chuyến'));
    await _tapVisible(tester, find.textContaining('Giao chung chuyến (1)'));
    expect(find.text('47/10 Nguyễn Văn Đậu'), findsOneWidget);

    await _tapVisible(tester, find.byType(DropdownButtonFormField<String>));
    await tester.tap(find.text('GHN · Hàng nhẹ').last);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('47/10 Nguyễn Văn Đậu'));
    await tester.enterText(find.text('47/10 Nguyễn Văn Đậu'), '47/11 Nguyễn Văn Đậu');
    await _tapVisible(tester, find.widgetWithText(FilledButton, 'Tạo chuyến'));

    final body = api.posts['/shipments/batch'] as Map;
    expect(body['order_group_ids'], [_gid]);
    expect(body['carrier_code'], 'GHN');
    expect(body['to_location'], {
      'province_name': 'Hồ Chí Minh',
      'ward_name': 'Phường Gia Định',
      'street': '47/11 Nguyễn Văn Đậu',
      'phone': '0377168254',
    });
    expect(body.containsKey('pickup_at'), isFalse);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Màn Giao hàng có nút Lưu CSV và In phiếu bàn giao', (tester) async {
    await _pump(tester, const ShippingScreen());
    expect(find.text('Lưu CSV'), findsOneWidget);
    expect(find.text('In phiếu bàn giao'), findsOneWidget);
  });

  test('CSV và phiếu bàn giao PDF', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    const view = ShipmentView(id: 'a', code: 'SHP-1', groupShortId: 'g', recipientName: 'Đỗ Thị Ánh', status: ShipmentStatus.outForDelivery, carrierName: 'x', trackingCode: 't', groupId: _gid);

    final csv = shipmentQueueCsv(const [], const [view]);
    expect(csv.split('\n').first, 'kind,shipment_code,order_group_id,status,attempts');
    expect(csv, contains('shipment,SHP-1,$_gid,out_for_delivery,'));
    expect(csvBytes(csv).take(3), [0xEF, 0xBB, 0xBF]);

    final rows = handoverRows(const [], const [view], (_) => 'Đang giao');
    expect(rows.single.first, '1');
    expect(rows.single.last, 'Đang giao');
    expect(rows.single[3], contains('Đỗ Thị Ánh'));

    final pdf = await buildHandoverSlip(rows: rows, queueLabel: 'Đang giao', preparedBy: 'Điều phối', at: DateTime(2026, 11, 26, 9));
    expect(String.fromCharCodes(pdf.take(4)), '%PDF');
  });

  test('quy tắc dùng chung', () {
    expect(humanCarrierError('GHN_ERROR: Sai phường'), 'Sai phường');
    expect(hasUnbookedParcels([{'carrierOrderCode': 'A', 'carrierStatus': 'cancel'}]), isTrue);
    expect(hasUnbookedParcels([{'carrierOrderCode': 'A'}]), isFalse);

    final draft = parseRecipientDraft({
      'recipients': [{'errorCode': 'X', 'errorMessage': 'Thiếu phường'}],
    });
    expect(draft.error, 'Thiếu phường');
    expect(draft.location.isEmpty, isTrue);

    expect(const ShipLocation(wardName: ' P1 ', phone: '').toBody(), {'ward_name': 'P1'});
    expect(carrierServices([{'code': 'GHN', 'name': 'GHN', 'isActive': false, 'services': [{'code': 'L'}]}]), isEmpty);
    expect(boxComparisonLines({'parcels': [{'parcelNo': 1, 'current': {'boxCode': 'M'}, 'best': {'boxCode': 'S'}, 'savingVnd': 2000}]}).first,
        'Kiện 1: đang M, rẻ nhất S (−2.000 đ)');

    const mine = ShipmentView(id: 'a', code: 'c', groupShortId: 'g', recipientName: 'r', status: ShipmentStatus.outForDelivery, carrierName: 'x', trackingCode: 't', shipperId: 'u1');
    expect(mine.actionsAllowedFor('u1', isAdmin: false), isTrue);
    expect(mine.actionsAllowedFor('u2', isAdmin: false), isFalse);
    expect(mine.actionsAllowedFor('u2', isAdmin: true), isTrue);
  });
}
