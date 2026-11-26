import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/app/providers.dart';
import 'package:optipack_mobile/app/theme.dart';
import 'package:optipack_mobile/core/network/api_client.dart';
import 'package:optipack_mobile/core/network/api_exception.dart';
import 'package:optipack_mobile/features/auth/auth_controller.dart';
import 'package:optipack_mobile/features/auth/auth_models.dart';
import 'package:optipack_mobile/features/packing/packing_logic.dart';
import 'package:optipack_mobile/features/packing/packing_screens.dart';

class _SignedIn extends AuthController {
  _SignedIn(this.role);
  final UserRole role;

  @override
  AuthState build() => AuthState(
        status: AuthStatus.signedIn,
        user: CurrentUser(id: 'me', name: 'Tôi', email: 'a@b.vn', role: role),
      );
}

const _gid = 'aaaaaaaaaaaaaaaa11112222';

Map<String, dynamic> _group(String status, [Map<String, dynamic> extra = const {}]) => {
      'id': _gid,
      'platform': 'lazada',
      'fulfillmentStatus': status,
      'orderCount': 1,
      'activeOrderCount': 1,
      'orderPriority': 'normal',
      'version': 5,
      'orders': [
        {
          'id': 'o1',
          'platformOrderId': 'LZ-1',
          'recipient': {'fullName': 'An', 'phone': '0900000000'},
          'status': 'pending',
          'items': [
            {'sku': 'AO-001', 'name': 'Áo thun cổ tròn dài tay phiên bản giới hạn', 'quantity': 2},
          ],
        },
      ],
      ...extra,
    };

Map<String, dynamic> _parcel([Map<String, dynamic> extra = const {}]) => {
      'parcelNo': 1,
      'status': 'pending',
      'itemCount': 2,
      'scannedCount': 0,
      'estimatedWeightG': 1180,
      'box': {
        'code': 'BOX-M',
        'name': 'Thùng carton cỡ vừa',
        'kind': 'box',
        'outerMm': {'lengthMm': 360, 'widthMm': 260, 'heightMm': 160},
        'innerMm': {'lengthMm': 350, 'widthMm': 250, 'heightMm': 150},
      },
      'placements': [
        {'itemKey': 'AO-001#1', 'sku': 'AO-001', 'step': 1},
        {'itemKey': 'AO-001#2', 'sku': 'AO-001', 'step': 2},
      ],
      'materials': [
        {'name': 'Gối hơi', 'quantity': 2, 'code': 'AIR'},
      ],
      'guide': {
        'source': 'template',
        'summary': 'Xếp hai áo chồng lên nhau.',
        'steps': [
          {'step': 1, 'instruction': 'Đặt áo thứ nhất sát đáy.', 'tip': null},
        ],
      },
      'boxComparison': {
        'prefer': 'cheapest',
        'scoresConsistent': true,
        'weights': {'billable': 0.4, 'packaging': 0.3, 'fill': 0.2, 'handling': 0.1},
        'rows': [
          {
            'boxCode': 'BOX-M',
            'boxName': 'Thùng carton cỡ vừa',
            'eligible': true,
            'isChosen': true,
            'rank': 1,
            'score': 9.4,
            'billableWeightG': 1300,
            'packagingCostVnd': 8000,
            'fillRatio': 0.62,
            'available': 4,
            'criteria': {'billable': 10, 'packaging': 9, 'fill': 8, 'handling': 10},
          },
          {'boxCode': 'BOX-S', 'boxName': 'Thùng nhỏ', 'eligible': false, 'verdict': 'Không vừa'},
        ],
      },
      ...extra,
    };

Map<String, dynamic> _plan(String status, [Map<String, dynamic> extra = const {}, Map<String, dynamic>? parcel]) => {
      'id': 'plan1',
      'orderGroupId': _gid,
      'status': status,
      'version': 3,
      'orders': [
        {'orderId': 'o1', 'platformOrderId': 'LZ-1', 'overParcelLimit': false},
      ],
      'parcels': [parcel ?? _parcel()],
      'totals': {'parcels': 1},
      'session': {'assignedPackerId': 'other', 'assignedPackerName': 'Bình'},
      ...extra,
    };

class _FakeApi implements ApiClient {
  _FakeApi({required this.group, this.plan});

  Map<String, dynamic> group;
  Map<String, dynamic>? plan;
  Map<String, dynamic> settings = {'requireScan': false, 'requireSealPhoto': false};
  List<Map<String, dynamic>> blocked = const [];
  final posts = <(String, Map<String, dynamic>)>[];
  final listQueries = <Map<String, dynamic>>[];
  ApiException? scanError;

  @override
  Future<Object?> get(String path, {Map<String, dynamic>? query, bool public = false}) async {
    if (path == '/order-groups') {
      listQueries.add(query ?? const {});
      if (query?['packing_blocked'] == 'true') return blocked;
      final status = query?['fulfillment_status'];
      return status == null || status == group['fulfillmentStatus'] ? [group] : <Object?>[];
    }
    if (path == '/packing-plans/summary') {
      return {
        'summaries': [
          {'orderGroupId': _gid, 'parcels': 1},
        ],
      };
    }
    if (path.endsWith('/box-sources')) {
      return {
        'parcels': [
          {'parcelNo': 1, 'planned': 'new', 'reusedAllowed': true, 'outOfStock': false},
        ],
      };
    }
    if (path.endsWith('/replacement-warehouses')) {
      return [
        {'id': 'w1', 'code': 'KHO1', 'name': 'Kho chính'},
      ];
    }
    if (path.endsWith('/packing-plan')) return {'plan': plan};
    if (path == '/packaging-materials') {
      return [
        {'code': 'BOX-M', 'name': 'Thùng carton cỡ vừa', 'kind': 'box', 'qtyNew': 4, 'qtyReused': 1, 'isActive': true},
        {'code': 'BOX-L', 'name': 'Thùng lớn', 'kind': 'box', 'qtyNew': 0, 'qtyReused': 0, 'isActive': true},
      ];
    }
    if (path == '/packing/staff') {
      return {
        'staff': [
          {'staffId': 'other', 'fullName': 'Bình', 'activeWorkload': 3},
        ],
      };
    }
    if (path == '/packing/settings') return {'settings': settings};
    return group;
  }

  @override
  Future<Object?> post(String path, {Object? body, bool public = false}) async {
    posts.add((path, Map<String, dynamic>.from((body as Map?) ?? const {})));
    if (path.endsWith('/scan') && scanError != null) throw scanError!;
    if (path.endsWith('/scan')) {
      return {
        'plan': plan,
        'scan': {'parcelNo': 1, 'sku': 'AO-001', 'remainingInParcel': 1, 'duplicate': false},
      };
    }
    if (path.endsWith('/pack')) return {'plan': plan, 'completed': true};
    return {'plan': plan};
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Future<void> _pump(WidgetTester tester, Widget screen, _FakeApi api,
    {UserRole role = UserRole.packagingStaff, Size size = const Size(720, 1600), double textScale = 1}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      apiClientProvider.overrideWithValue(api),
      authControllerProvider.overrideWith(() => _SignedIn(role)),
    ],
    child: MaterialApp(
      theme: buildTheme(),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)),
        child: child!,
      ),
      home: Scaffold(body: screen),
    ),
  ));
  await tester.pumpAndSettle();
}

Future<void> _tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<void> _scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(finder, 300, scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
}

(String, Map<String, dynamic>) _lastPost(_FakeApi api, String suffix) =>
    api.posts.lastWhere((p) => p.$1.endsWith(suffix));

void main() {
  group('Hàng đợi', () {
    testWidgets('đủ 6 tab có số đếm, mở sẵn tab Chờ chấp nhận, thẻ giống web', (tester) async {
      final api = _FakeApi(group: _group('pending_approval', {'assignedPackerId': 'me', 'assignedPackerName': 'Tôi'}));
      await _pump(tester, const PackingQueueScreen(), api);

      for (final label in [
        'Đã lấy hàng · 0',
        'Chờ chấp nhận kế hoạch · 1',
        'Kẹt — SKU chưa đo · 0',
        'Thiếu hàng · 0',
        'Đang đóng gói · 0',
        'Kho đang lấy · 0',
      ]) {
        expect(find.text(label, skipOffstage: false), findsOneWidget, reason: label);
      }
      expect(find.text('11112222'), findsOneWidget);
      expect(find.text('Tôi (bạn)'), findsOneWidget);
      expect(find.text('1 đơn · 1 kiện'), findsOneWidget);
      // "Việc của tôi": lọc theo người đóng, cộng các bước chưa có người đóng.
      expect(api.listQueries.where((q) => q['assigned_packer_id'] == 'me'), hasLength(1));
      expect(api.listQueries.where((q) => q['fulfillment_status'] == 'partial_needs_review'), hasLength(1));

      api.listQueries.clear();
      await _tapVisible(tester, find.text('Tất cả'));
      expect(api.listQueries, [<String, dynamic>{}]);
    });

    testWidgets('tìm mã không có ở đây thì hỏi BE', (tester) async {
      final api = _FakeApi(group: _group('pending_approval'));
      await _pump(tester, const PackingQueueScreen(), api);

      await tester.enterText(find.byType(TextField), 'LZ-9999');
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      expect(api.listQueries.last, {'q': 'LZ-9999'});
    });

    testWidgets('không tràn ở máy nhỏ, chữ lớn', (tester) async {
      final api = _FakeApi(
          group: _group('pending_approval', {'orderPriority': 'express', 'packagingDeadline': '2020-01-01T00:00:00Z'}));
      await _pump(tester, const PackingQueueScreen(), api, size: const Size(720, 1100), textScale: 1.3);
      expect(tester.takeException(), isNull);
      expect(find.textContaining('Quá hạn đóng gói'), findsOneWidget);
    });
  });

  group('Chờ chấp nhận', () {
    testWidgets('đủ các khối như web và chấp nhận gửi đúng phiên bản', (tester) async {
      final api = _FakeApi(group: _group('pending_approval'), plan: _plan('ready'));
      await _pump(tester, const PackingGroupScreen(groupId: _gid), api);

      expect(find.text('Giao cho tôi'), findsOneWidget);
      for (final text in [
        'Hàng cần đóng (2)',
        'Kế hoạch đóng gói',
        'Tồn thùng',
        'Xem trước 3D',
        'Xem 3D',
        'Hướng dẫn mẫu (không do AI viết).',
      ]) {
        await _scrollTo(tester, find.text(text));
        expect(find.text(text), findsWidgets, reason: text);
      }
      await _scrollTo(tester, find.text('So sánh thùng'));
      await _tapVisible(tester, find.text('So sánh thùng'));
      await _scrollTo(tester, find.text('Cách chấm điểm'));
      expect(find.text('Không dùng được (1)'), findsOneWidget);

      await tester.tap(find.widgetWithText(FilledButton, 'Chấp nhận thực hiện'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Xác nhận'));
      await tester.pumpAndSettle();
      expect(_lastPost(api, '/approve').$2, {'expected_version': 3});
    });

    testWidgets('từ chối: lý do mặc định, hỏi lại rồi mới gửi', (tester) async {
      final api = _FakeApi(group: _group('pending_approval'), plan: _plan('ready'));
      await _pump(tester, const PackingGroupScreen(groupId: _gid), api);

      await tester.tap(find.widgetWithText(OutlinedButton, 'Từ chối & gửi Admin'));
      await tester.pumpAndSettle();
      await _tapVisible(tester, find.widgetWithText(FilledButton, 'Gửi từ chối'));
      expect(api.posts, isEmpty);
      await tester.tap(find.widgetWithText(FilledButton, 'Từ chối'));
      await tester.pumpAndSettle();
      expect(_lastPost(api, '/reject').$2, {'expected_version': 3, 'reason': 'BOX_TOO_LOOSE'});
    });

    testWidgets('giao cho tôi gửi assign manual', (tester) async {
      final api = _FakeApi(group: _group('pending_approval'), plan: _plan('ready'));
      await _pump(tester, const PackingGroupScreen(groupId: _gid), api);
      await _tapVisible(tester, find.text('Giao cho tôi'));
      expect(_lastPost(api, '/assign').$2, {'mode': 'manual', 'staff_id': 'me'});
    });

    testWidgets('không tràn ở máy nhỏ, chữ lớn (cả bảng so sánh)', (tester) async {
      final api = _FakeApi(
          group: _group('pending_approval'),
          plan: _plan('ready', {
            'catalogStale': true,
            'catalogChanges': ['Thùng BOX-M đổi kích thước lòng từ 35 × 25 × 15 cm'],
          }));
      await _pump(tester, const PackingGroupScreen(groupId: _gid), api, size: const Size(720, 1100), textScale: 1.3);
      await _scrollTo(tester, find.text('So sánh thùng'));
      await _tapVisible(tester, find.text('So sánh thùng'));
      await _scrollTo(tester, find.text('Cách chấm điểm'));
      expect(tester.takeException(), isNull);
    });
  });

  group('Đang đóng gói', () {
    testWidgets('quét món gửi giống web; sai kiện thì chỉ ra kiện đúng', (tester) async {
      final api = _FakeApi(group: _group('approved_for_packing'), plan: _plan('packing'));
      await _pump(tester, const PackingGroupScreen(groupId: _gid), api);

      final field = find.widgetWithText(TextField, 'Quét món kiện 1');
      await _scrollTo(tester, field);
      await tester.enterText(field, 'AO-001');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      final body = _lastPost(api, '/parcels/1/scan').$2;
      expect(body['code'], 'AO-001');
      expect(body['quantity'], 1);
      expect(body['scan_method'], 'manual');
      expect(body['client_event_id'], isNotEmpty);
      expect(find.text('Đã quét AO-001 · kiện 1 còn 1 món'), findsOneWidget);

      api.scanError = const ApiException(
          message: 'sai', statusCode: 400, errorCode: 'PACKING_SCAN_WRONG_PARCEL', details: {'belongsToParcels': [2]});
      await tester.enterText(field, 'AO-002');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(find.text('Món này thuộc kiện 2'), findsOneWidget);
    });

    testWidgets('quét đủ thì cân rồi niêm phong, gửi cân và phiên bản', (tester) async {
      final api = _FakeApi(
          group: _group('approved_for_packing'),
          plan: _plan('packing', const {}, _parcel({'scannedCount': 2})));
      await _pump(tester, const PackingGroupScreen(groupId: _gid), api);

      // Phiên đã bắt đầu thì không còn đóng nhanh.
      await _scrollTo(tester, find.textContaining('đóng tiếp bằng phiên đóng gói'));
      expect(find.text('Xác nhận đã đóng gói'), findsNothing);

      final weight = find.widgetWithText(TextField, 'Cân kiện 1 (kg)');
      await tester.ensureVisible(weight);
      await tester.pumpAndSettle();
      await tester.enterText(weight, '1,2');
      await tester.pumpAndSettle();
      await _tapVisible(tester, find.widgetWithText(FilledButton, 'Niêm phong kiện 1'));
      expect(_lastPost(api, '/parcels/1/seal').$2, {'expected_version': 3, 'weight_kg': 1.2});
    });

    testWidgets('đóng nhanh: bắt nhập cân, hỏi lại rồi gửi /pack', (tester) async {
      final api = _FakeApi(group: _group('approved_for_packing'), plan: _plan('approved'));
      await _pump(tester, const PackingGroupScreen(groupId: _gid), api);

      expect(find.text('Bắt đầu đóng'), findsOneWidget);
      final button = find.widgetWithText(FilledButton, 'Xác nhận đã đóng gói');
      await _scrollTo(tester, button);
      await _tapVisible(tester, button);
      expect(api.posts, isEmpty);

      final weight = find.byType(TextFormField).first;
      await tester.ensureVisible(weight);
      await tester.pumpAndSettle();
      await tester.enterText(weight, '1,25');
      await _scrollTo(tester, button);
      await _tapVisible(tester, button);
      await tester.tap(find.widgetWithText(FilledButton, 'Đã đóng gói'));
      await tester.pumpAndSettle();
      expect(_lastPost(api, '/pack').$2, {
        'expected_version': 3,
        'parcels': [
          {'parcel_no': 1, 'weight_kg': 1.25},
        ],
      });
    });

    testWidgets('bắt buộc quét thì ẩn đóng nhanh', (tester) async {
      final api = _FakeApi(group: _group('approved_for_packing'), plan: _plan('approved'))
        ..settings = {'requireScan': true};
      await _pump(tester, const PackingGroupScreen(groupId: _gid), api);
      await _scrollTo(tester, find.textContaining('bắt buộc quét từng món'));
      expect(find.text('Xác nhận đã đóng gói'), findsNothing);
    });

    testWidgets('kiện lệch cân mình niêm phong: chỉ được mở ra đóng lại', (tester) async {
      final api = _FakeApi(
        group: _group('approved_for_packing'),
        plan: _plan('packing', const {},
            _parcel({'status': 'held', 'actualWeightKg': 1.6, 'sealedBy': 'me', 'scannedCount': 2})),
      );
      await _pump(tester, const PackingGroupScreen(groupId: _gid), api,
          size: const Size(720, 1100), textScale: 1.3);
      await _scrollTo(tester, find.text('Mở ra đóng lại'));
      expect(find.textContaining('Cần người khác xem lại kiện này'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Chấp nhận'), findsNothing);
      expect(tester.takeException(), isNull);
      await _tapVisible(tester, find.text('Mở ra đóng lại'));
      expect(_lastPost(api, '/parcels/1/review').$2,
          {'expected_version': 3, 'action': 'reopen', 'reason': 'SCALE_ERROR'});
    });
  });

  testWidgets('Thiếu hàng: giao phần có sẵn gửi phiên bản của nhóm', (tester) async {
    final api = _FakeApi(
        group: _group('partial_needs_review', {
      'missingReport': {'sku': 'AO-001', 'quantity': 1, 'ordered': 2, 'reporterName': 'Quang'},
    }));
    await _pump(tester, const PackingGroupScreen(groupId: _gid), api);
    expect(find.textContaining('Thiếu: AO-001 1/2'), findsOneWidget);
    await _tapVisible(tester, find.text('Giao phần có sẵn'));
    final post = _lastPost(api, '/fulfillment/decide-partial');
    expect(post.$2, {'approve': true, 'expected_version': 5});
  });

  testWidgets('Kẹt SKU chưa đo: Admin mở được hồ sơ SKU', (tester) async {
    final api = _FakeApi(
        group: _group('picked', {
      'packingBlocked': {'skus': ['AO-001']},
    }));
    await _pump(tester, const PackingGroupScreen(groupId: _gid, fromTab: QueueTab.blocked), api, role: UserRole.admin);
    expect(find.textContaining('chưa đo hồ sơ đóng gói'), findsOneWidget);
    expect(find.text('Mở hồ sơ kho / SKU'), findsOneWidget);
  });

  testWidgets('Kế hoạch bị từ chối: hiện lý do và tính lại được', (tester) async {
    final api = _FakeApi(
      group: _group('picked'),
      plan: _plan('rejected', {
        'rejectionReason': 'BOX_TOO_TIGHT: không đậy được nắp',
        'rejection': {'reasonCode': 'BOX_TOO_TIGHT', 'rejectedByName': 'Bình', 'overdue': true},
      }),
    );
    await _pump(tester, const PackingGroupScreen(groupId: _gid), api);
    await _scrollTo(tester, find.text('Tính lại kế hoạch'));
    expect(find.textContaining('Thùng quá chật — không đậy được nắp'), findsOneWidget);
    expect(find.text('Đóng gói thủ công'), findsOneWidget);
    expect(find.text('Trả về lấy hàng'), findsOneWidget);
    await _tapVisible(tester, find.text('Tính lại kế hoạch'));
    expect(_lastPost(api, '/recompute').$2, {'expected_version': 3});
  });

  group('quy tắc chép từ web', () {
    test('tên và SĐT người nhận đọc đúng hình dạng chi tiết nhóm của BE', () {
      final g = _group('picked');
      expect(recipientNameOf((g['orders'] as List).first as Map<String, dynamic>), 'An');
      expect(matchesSearch(g, 'an'), isTrue);
      expect(matchesSearch(g, '0900000000'), isTrue);
      expect(matchesSearch(g, 'khong-co'), isFalse);
    });

    test('cân hợp lệ 0,001–100 kg, nhận dấu phẩy', () {
      expect(parseWeight('1,25'), 1.25);
      expect(parseWeight('0'), isNull);
      expect(parseWeight('101'), isNull);
      expect(parseWeight('abc'), isNull);
    });

    test('nguồn thùng khác gợi ý phải có lý do; Khác phải có ghi chú', () {
      const info = {'planned': 'new'};
      expect(const BoxSourceInput().errorFor(info), isNull);
      expect(const BoxSourceInput(source: 'new').errorFor(info), isNull);
      expect(const BoxSourceInput(source: 'reused').errorFor(info), isNotNull);
      expect(const BoxSourceInput(source: 'reused', reason: 'OTHER').errorFor(info), isNotNull);
      expect(const BoxSourceInput(source: 'reused', reason: 'OTHER', note: ' gấp ').toBody(),
          {'box_source': 'reused', 'box_source_reason': 'OTHER', 'box_source_note': 'gấp'});
    });

    test('nhiều người nhận thì nhóm kiện theo đơn; tên bị che không tính', () {
      Map<String, dynamic> p(int no, String order, String name) =>
          {'parcelNo': no, 'orderId': order, 'platformOrderId': order, 'recipientName': name};
      expect(groupParcelsByOrder([p(1, 'A', 'An'), p(2, 'B', 'N**n')]).multi, isFalse);
      final two = groupParcelsByOrder([p(1, 'A', 'An'), p(2, 'B', 'Bình'), p(3, 'A', 'An')]);
      expect(two.multi, isTrue);
      expect(two.groups.first.heading, 'Đơn A — An (2 kiện)');
    });

    test('đóng thủ công: mọi món phải vào kiện có thùng, có lý do', () {
      final plan = _plan('rejected');
      final units = unitsOfPlan(plan);
      final draft = initialManualDraft(plan, units);
      expect(manualDraftProblem(units, draft.parcels, draft.assign, 'quá chật'), isNull);
      expect(manualDraftProblem(units, draft.parcels, draft.assign, 'x'), contains('lý do'));
      draft.assign.remove('AO-001#2');
      expect(manualDraftProblem(units, draft.parcels, draft.assign, 'quá chật'), contains('Còn 1 món'));
    });

    test('đã quét hoặc đã niêm phong thì không đóng nhanh', () {
      expect(quickPackStarted(_plan('approved')), isFalse);
      expect(quickPackStarted(_plan('packing', const {}, _parcel({'scannedCount': 1}))), isTrue);
      expect(quickPackStarted(_plan('packing', const {}, _parcel({'status': 'sealed'}))), isTrue);
    });
  });
}
