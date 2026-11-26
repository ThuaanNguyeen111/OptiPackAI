// AOFP-344/346/348 trên mobile: luật chèn kín, FEFCO + số lớp, lý do xếp sau của thùng.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/app/providers.dart';
import 'package:optipack_mobile/app/theme.dart';
import 'package:optipack_mobile/core/network/api_client.dart';
import 'package:optipack_mobile/features/admin/material_rules.dart';
import 'package:optipack_mobile/features/admin/materials_screen.dart';
import 'package:optipack_mobile/features/auth/auth_controller.dart';
import 'package:optipack_mobile/features/packing/plan_widgets.dart';

const _fillRule = <String, dynamic>{
  'materialType': 'air_pillow',
  'appliesTo': 'fragile',
  'basis': 'void_fill',
  'minUnits': 1,
  'quantity': 0,
  'voidBands': <Object>[],
  'targetFillRatio': 0.85,
  'unitFillMl': 600,
};

class _Api implements ApiClient {
  final puts = <Object?>[];
  final patches = <Object?>[];

  @override
  Future<Object?> get(String path, {Map<String, dynamic>? query, bool public = false}) async {
    if (path == '/packaging/materials/rules') {
      return {
        'version': 3,
        'isDefault': false,
        'rules': [
          _fillRule,
          {'materialType': 'bubble_wrap', 'appliesTo': 'any', 'basis': 'per_carton', 'minUnits': 1, 'quantity': 1},
        ],
      };
    }
    if (path == '/packaging/boxes') {
      return [
        {
          'id': 'b1',
          'code': 'CTN-001',
          'name': 'Thùng carton',
          'inner': {'lengthMm': 240, 'widthMm': 230, 'heightMm': 100},
          'outer': {'lengthMm': 246, 'widthMm': 236, 'heightMm': 106},
          'tareG': 150,
          'maxLoadG': 5000,
          'priceVnd': 4000,
          'quantityOnHand': 20,
          'reorderLevel': 5,
          'fefcoCode': '0201',
          'ply': 3,
          'isActive': true,
        },
      ];
    }
    return <Object>[];
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    final args = invocation.namedArguments;
    if (invocation.memberName == #put) {
      puts.add(args[#body]);
      return Future<Object?>.value(<String, dynamic>{});
    }
    if (invocation.memberName == #patch) {
      patches.add(args[#body]);
      return Future<Object?>.value(<String, dynamic>{});
    }
    return super.noSuchMethod(invocation);
  }
}

class _SignedOut extends AuthController {
  @override
  AuthState build() => const AuthState(status: AuthStatus.signedOut);
}

Future<_Api> _pump(WidgetTester tester) async {
  tester.view.physicalSize = const Size(420, 900);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final api = _Api();
  await tester.pumpWidget(ProviderScope(
    overrides: [
      apiClientProvider.overrideWithValue(api),
      authControllerProvider.overrideWith(_SignedOut.new),
    ],
    child: MaterialApp(theme: buildTheme(), home: const MaterialsScreen()),
  ));
  await tester.pumpAndSettle();
  return api;
}

Future<void> _menu(WidgetTester tester, int card, String action) async {
  await tester.tap(find.byTooltip('Thao tác').at(card));
  await tester.pumpAndSettle();
  await tester.tap(find.text(action).last);
  await tester.pumpAndSettle();
}

void main() {
  group('luật vật tư', () {
    test('chèn kín gửi đủ hai thông số BE bắt buộc', () {
      expect(ruleBody(_fillRule), containsPair('target_fill_ratio', 0.85));
      expect(ruleBody(_fillRule), containsPair('unit_fill_ml', 600));
      expect(ruleBody(_fillRule).containsKey('void_bands'), isFalse);
    });

    test('cách tính khác không gửi thông số chèn kín', () {
      final body = ruleBody({'materialType': 'bubble_wrap', 'appliesTo': 'any', 'basis': 'per_carton', 'quantity': 1});
      expect(body.containsKey('target_fill_ratio'), isFalse);
      expect(body['min_units'], 1);
    });

    test('diễn giải thành câu', () {
      expect(describeRule(_fillRule),
          'Kiện có hàng dễ vỡ: chèn túi khí đến khi thùng kín 85%, mỗi cái lấp 600 ml.');
      expect(
        describeRule({
          'materialType': 'air_pillow',
          'appliesTo': 'any',
          'basis': 'void_band',
          'minUnits': 2,
          'voidBands': [
            {'minVoidRatio': 0.7, 'quantity': 4},
            {'minVoidRatio': 0.5, 'quantity': 2},
          ],
        }),
        'Mỗi kiện: thùng trống từ 50% dùng 2 túi khí; trống từ 70% dùng 4 túi khí. '
        'Trống dưới 50% thì không dùng. Chỉ áp dụng khi kiện có từ 2 món hàng.',
      );
    });

    testWidgets('xoá luật khác không làm mất thông số của luật chèn kín', (tester) async {
      final api = await _pump(tester);
      await tester.ensureVisible(find.text('Quy tắc chọn'));
      await tester.tap(find.text('Quy tắc chọn'));
      await tester.pumpAndSettle();
      expect(find.textContaining('thùng kín 85%'), findsOneWidget);

      await _menu(tester, 1, 'Xóa');
      final rules = (api.puts.single as Map)['rules'] as List;
      expect(rules.single, containsPair('target_fill_ratio', 0.85));
      expect(rules.single, containsPair('unit_fill_ml', 600));
    });
  });

  testWidgets('thùng: hiện FEFCO + số lớp; để trống khi sửa thì gửi null', (tester) async {
    final api = await _pump(tester);
    expect(find.textContaining('FEFCO 0201 · 3 lớp'), findsOneWidget);

    await _menu(tester, 0, 'Sửa');
    final fefco = find.widgetWithText(TextField, 'Kiểu thùng (mã FEFCO)');
    await tester.ensureVisible(fefco);
    await tester.enterText(fefco, '');
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Lưu'));
    await tester.tap(find.widgetWithText(FilledButton, 'Lưu'));
    await tester.pumpAndSettle();

    final body = api.patches.single as Map;
    expect(body.containsKey('fefco_code'), isTrue);
    expect(body['fefco_code'], isNull);
    expect(body['ply'], 3);
  });

  testWidgets('so sánh thùng: hiện lý do xếp sau, nêu rõ khi điểm cao hơn mà xếp sau', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: buildTheme(),
      home: const Scaffold(
        body: SingleChildScrollView(
          child: BoxComparisonList(comparison: {
            'scoresConsistent': false,
            'prefer': 'fewest_parcels',
            'rows': [
              {'rank': 1, 'boxCode': 'CTN-005', 'boxName': 'A', 'eligible': true, 'isChosen': true, 'score': 8.0, 'verdict': 'Thùng đang chọn.'},
              {
                'rank': 2,
                'boxCode': 'CTN-006',
                'boxName': 'B',
                'eligible': true,
                'score': 9.0,
                'verdict': 'Nhận xét trùng ý.',
                'rankReason': 'Xếp sau CTN-005: giá cao hơn.',
              },
            ],
          }),
        ),
      ),
    ));

    expect(find.text('Xếp sau CTN-005: giá cao hơn. Điểm cao hơn nhưng thua ở tiêu chí này.'), findsOneWidget);
    expect(find.textContaining('dòng tô vàng'), findsOneWidget);
    expect(find.text('Nhận xét trùng ý.'), findsNothing);
  });
}
