import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/notifications/notifications_repository.dart';
import '../features/overview/overview_repository.dart';
import '../features/packing/packing_repository.dart';
import '../features/returns/returns_repository.dart';
import '../features/shipping/shipping_repository.dart';
import '../features/stock/stock_repository.dart';

// ============================================================================
// DỮ LIỆU GIẢ — toàn bộ chỗ "chưa nối BE" nằm ở file này.
//
// Mỗi repository dưới đây có interface (`*Repository`) mô phỏng đúng route BE.
// Khi nối thật: viết `Api*Repository` dùng `ApiClient` (xem `warehouse_repository.dart` làm mẫu),
// rồi thay dòng `Mock*Repository()` tương ứng. Màn hình không phải sửa.
//
// Bảng nối (route BE đã có, xem GUIDE_DOC/API_LIST.md):
//   notifications  → /notifications*                  (push FCM: BE CHƯA có)
//   stock          → /warehouse/.../restock|adjust|transfer   (→ hàng đợi ngoại tuyến)
//   returns        → /returns*, /shipments/:id/receive-return (ảnh: BE CHƯA có upload)
//   packing        → /order-groups/:id/packing-plan/*  (scan → hàng đợi ngoại tuyến)
//   shipping       → /shipping/quote, /shipments*      (ảnh bằng chứng: BE CHƯA có upload)
//   overview       → /dashboard/summary, /orders*
// ============================================================================

final notificationsRepositoryProvider =
    Provider<NotificationsRepository>((ref) => MockNotificationsRepository());

final stockRepositoryProvider =
    Provider<StockRepository>((ref) => MockStockRepository());

final returnsRepositoryProvider =
    Provider<ReturnsRepository>((ref) => MockReturnsRepository());

final packingRepositoryProvider =
    Provider<PackingRepository>((ref) => MockPackingRepository());

final shippingRepositoryProvider =
    Provider<ShippingRepository>((ref) => MockShippingRepository());

final overviewRepositoryProvider =
    Provider<OverviewRepository>((ref) => MockOverviewRepository());

// ---- Dữ liệu dùng chung cho nhiều màn ----

final notificationsProvider = FutureProvider.autoDispose<List<AppNotification>>(
  (ref) => ref.watch(notificationsRepositoryProvider).list(),
);

final unreadCountProvider = FutureProvider.autoDispose<int>(
  (ref) => ref.watch(notificationsRepositoryProvider).unreadCount(),
);

final returnsByStatusProvider =
    FutureProvider.autoDispose.family<List<ReturnRequest>, ReturnStatus>(
  (ref, status) => ref.watch(returnsRepositoryProvider).list(status),
);

final packingQueueProvider =
    FutureProvider.autoDispose.family<List<PackingGroup>, PackingStage>(
  (ref, stage) => ref.watch(packingRepositoryProvider).queue(stage),
);

final packingGroupProvider =
    FutureProvider.autoDispose.family<PackingGroup, String>(
  (ref, id) => ref.watch(packingRepositoryProvider).get(id),
);

final readyToShipProvider = FutureProvider.autoDispose<List<ShipGroup>>(
  (ref) => ref.watch(shippingRepositoryProvider).readyToShip(),
);

final shipmentsProvider = FutureProvider.autoDispose<List<ShipmentView>>(
  (ref) => ref.watch(shippingRepositoryProvider).shipments(),
);

final overviewSummaryProvider = FutureProvider.autoDispose<OverviewSummary>(
  (ref) => ref.watch(overviewRepositoryProvider).summary(),
);
