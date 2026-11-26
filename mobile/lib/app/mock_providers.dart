import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/config/env.dart';
import '../features/history/history_repository.dart';
import '../features/notifications/api_notifications_repository.dart';
import '../features/notifications/notifications_repository.dart';
import '../features/overview/api_overview_repository.dart';
import '../features/overview/overview_repository.dart';
import '../features/returns/api_returns_repository.dart';
import '../features/returns/returns_repository.dart';
import '../features/shipping/api_shipping_repository.dart';
import '../features/shipping/shipping_repository.dart';
import '../features/stock/api_stock_repository.dart';
import '../features/stock/stock_repository.dart';
import 'providers.dart';

// ============================================================================
// Nguồn dữ liệu của các màn: mặc định gọi BE thật (`Api*Repository`).
// Dữ liệu giả (`Mock*Repository`) chỉ dùng khi chạy
// `flutter run --dart-define=USE_MOCK_DATA=true` (trình diễn không cần BE) và trong test
// (`mockDataOverrides`). Khi dùng dữ liệu giả, mỗi màn hiện biểu ngữ "Dữ liệu mẫu".
//
// Bảng nối (xem GUIDE_DOC/API_LIST.md):
//   notifications  → /notifications*
//   stock          → /warehouse/warehouses/:wid/bins/by-code, …/restock|adjust|transfer
//   returns        → /returns*  (ảnh: POST /proof-photos)
//   (đóng gói luôn gọi BE thật qua packing_api.dart, không có dữ liệu mẫu)
//   shipping       → /shipping/quote, /packing-plans/summary, /shipments*  (ảnh: POST /proof-photos)
//   overview       → /dashboard/summary, /order-groups?order_priority=express, /orders
// ============================================================================

/// true = các màn dùng dữ liệu giả. Test ghi đè bằng [mockDataOverrides].
final useMockDataProvider = Provider<bool>((ref) => Env.useMockData);

String? _userId(Ref ref) => ref.read(authControllerProvider).user?.id;
Future<String?> _warehouseId(Ref ref) => ref.read(warehouseRepositoryProvider).defaultWarehouseId();

final notificationsRepositoryProvider = Provider<NotificationsRepository>((ref) =>
    ref.watch(useMockDataProvider)
        ? MockNotificationsRepository()
        : ApiNotificationsRepository(ref.watch(apiClientProvider)));

final stockRepositoryProvider = Provider<StockRepository>((ref) => ref.watch(useMockDataProvider)
    ? MockStockRepository()
    : ApiStockRepository(api: ref.watch(apiClientProvider), warehouseId: () => _warehouseId(ref)));

final returnsRepositoryProvider = Provider<ReturnsRepository>((ref) {
  if (ref.watch(useMockDataProvider)) return MockReturnsRepository();
  final stock = ref.watch(stockRepositoryProvider);
  return ApiReturnsRepository(
    api: ref.watch(apiClientProvider),
    resolveBin: (code) async {
      final bin = await stock.findBin(code);
      final wid = await _warehouseId(ref);
      if (bin?.binId == null || wid == null) return null;
      return (warehouseId: wid, binId: bin!.binId!);
    },
  );
});

final shippingRepositoryProvider = Provider<ShippingRepository>((ref) => ref.watch(useMockDataProvider)
    ? MockShippingRepository()
    : ApiShippingRepository(api: ref.watch(apiClientProvider), currentUserId: () => _userId(ref)));

final overviewRepositoryProvider = Provider<OverviewRepository>((ref) => ref.watch(useMockDataProvider)
    ? MockOverviewRepository()
    : ApiOverviewRepository(ref.watch(apiClientProvider)));

final historyRepositoryProvider = Provider<HistoryRepository>((ref) => ref.watch(useMockDataProvider)
    ? MockHistoryRepository()
    : ApiHistoryRepository(ref.watch(apiClientProvider)));

/// Dùng trong test và bản trình diễn: mọi màn chạy dữ liệu giả.
final mockDataOverrides = [useMockDataProvider.overrideWithValue(true)];

// ---- Dữ liệu dùng chung cho nhiều màn ----

final notificationsProvider = FutureProvider.autoDispose<List<AppNotification>>(
  (ref) => ref.watch(notificationsRepositoryProvider).list(),
);

final unreadCountProvider = FutureProvider.autoDispose<int>(
  (ref) => ref.watch(notificationsRepositoryProvider).unreadCount(),
);

/// Kiện giao thất bại đang hoàn về kho (Warehouse Staff nhận kiện).
final returningShipmentsProvider = FutureProvider.autoDispose<List<ShipmentView>>(
  (ref) => ref.watch(returnsRepositoryProvider).returningShipments(),
);

final returnsByStatusProvider =
    FutureProvider.autoDispose.family<List<ReturnRequest>, ReturnStatus>(
  (ref, status) => ref.watch(returnsRepositoryProvider).list(status),
);

final readyToShipProvider = FutureProvider.autoDispose<List<ShipGroup>>(
  (ref) => ref.watch(shippingRepositoryProvider).readyToShip(),
);

/// Lọc "Của tôi" (`shipper_id=me`). Mặc định tắt, giống web: đa số vận đơn không gán người giao.
final shipmentsMineOnlyProvider = StateProvider<bool>((ref) => false);

final shipmentsProvider = FutureProvider.autoDispose<List<ShipmentView>>(
  (ref) => ref.watch(shippingRepositoryProvider).shipments(mine: ref.watch(shipmentsMineOnlyProvider)),
);

/// Khoảng ngày + sàn đang chọn trên tab Tổng quan.
final overviewFilterProvider = StateProvider<OverviewFilter>((ref) => const OverviewFilter());

final overviewSummaryProvider = FutureProvider.autoDispose<OverviewSummary>(
  (ref) => ref.watch(overviewRepositoryProvider).summary(filter: ref.watch(overviewFilterProvider)),
);
