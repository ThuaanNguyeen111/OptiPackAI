import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:optipack_mobile/app/mock_providers.dart';
import 'package:optipack_mobile/app/providers.dart';
import 'package:optipack_mobile/app/theme.dart';
import 'package:optipack_mobile/features/auth/auth_controller.dart';
import 'package:optipack_mobile/features/offline/sync_controller.dart';
import 'package:optipack_mobile/features/warehouse/pick_screen.dart';
import 'package:optipack_mobile/features/warehouse/warehouse_models.dart';

class _SignedOut extends AuthController {
  @override
  AuthState build() => const AuthState(status: AuthStatus.signedOut);
}

class _IdleSync extends SyncController {
  @override
  SyncState build() => const SyncState();
}

// Phải dùng theme thật: theme đặt nút rộng hết cỡ, đặt nút trong Row sẽ vỡ bố cục.
void main() {
  for (final status in ['awaiting_packaging', 'picking', 'delivered']) {
    testWidgets('Màn lấy hàng hiện được nội dung khi nhóm $status', (tester) async {
      tester.view.physicalSize = const Size(360, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      final data = PickData(
        group: OrderGroupSummary(
          id: 'aaaaaaaaaa11',
          platform: 'aurelle',
          fulfillmentStatus: status,
          version: 1,
          orderCount: 1,
          activeOrderCount: 1,
          assignedStaffId: 'someone',
        ),
        lines: const [
          PickLine(sku: 'AO-1', quantity: 1, pickedQuantity: 0, binCode: 'CHƯA GÁN VỊ TRÍ', zoneCode: 'ZZZ'),
        ],
        warehouseId: 'w1',
        warehouses: const [WarehouseOption(id: 'w1', code: 'WH-1', name: 'Kho 1')],
        groupWarehouseInactive: true,
        canChooseWarehouse: true,
      );

      await tester.pumpWidget(ProviderScope(
        overrides: [
          ...mockDataOverrides,
          authControllerProvider.overrideWith(_SignedOut.new),
          syncControllerProvider.overrideWith(_IdleSync.new),
          warehouseStaffProvider.overrideWith((ref) async => const [StaffOption(id: 'someone', name: 'An')]),
          pickDataProvider('aaaaaaaaaa11').overrideWith((ref) async => data),
        ],
        child: MaterialApp.router(
          theme: buildTheme(),
          routerConfig: GoRouter(routes: [
            GoRoute(path: '/', builder: (_, _) => const PickScreen(groupId: 'aaaaaaaaaa11')),
          ]),
        ),
      ));
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.textContaining('Người lấy: An'), findsOneWidget);
    });
  }
}
