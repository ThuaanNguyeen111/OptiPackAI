import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sqflite/sqflite.dart';

import '../core/network/api_client.dart';
import '../core/network/api_exception.dart';
import '../core/push/push_service.dart';
import '../core/storage/json_cache.dart';
import '../core/storage/token_store.dart';
import '../features/auth/auth_controller.dart';
import '../features/auth/auth_repository.dart';
import '../features/auth/google_sign_in_service.dart';
import '../features/offline/action_queue.dart';
import '../features/offline/sqlite_action_queue.dart';
import '../features/offline/sync_controller.dart';
import '../features/offline/sync_service.dart';
import '../features/warehouse/warehouse_logic.dart';
import '../features/warehouse/warehouse_models.dart';
import '../features/warehouse/warehouse_repository.dart';
import 'router.dart';

/// Mở SQLite một lần ở `main()` rồi ghi đè provider này.
final databaseProvider = Provider<Database>(
  (ref) => throw UnimplementedError('databaseProvider chưa được ghi đè'),
);

final tokenStoreProvider = Provider<TokenStore>((ref) => SecureTokenStore());

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    tokenStore: ref.watch(tokenStoreProvider),
    // Refresh bị từ chối: về màn đăng nhập (hàng đợi vẫn còn).
    onSessionExpired: () => ref.read(authControllerProvider.notifier).sessionExpired(),
  );
});

final jsonCacheProvider =
    Provider<JsonCache>((ref) => SqliteJsonCache(ref.watch(databaseProvider)));

final actionQueueProvider = Provider<ActionQueue>(
  (ref) => SqliteActionQueue(ref.watch(databaseProvider)),
);

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(
    api: ref.watch(apiClientProvider),
    tokens: ref.watch(tokenStoreProvider),
  ),
);

final warehouseRepositoryProvider = Provider<WarehouseRepository>(
  (ref) => WarehouseRepository(
    api: ref.watch(apiClientProvider),
    cache: ref.watch(jsonCacheProvider),
  ),
);

final syncServiceProvider = Provider<SyncService>((ref) {
  final api = ref.watch(apiClientProvider);
  return SyncService(
    queue: ref.watch(actionQueueProvider),
    sender: (action) async {
      await api.post(action.path, body: action.body);
    },
  );
});

/// Lấy `id_token` cho đăng nhập Google. Test ghi đè bằng bản giả.
final googleIdTokenProvider = Provider<GoogleIdTokenProvider>((ref) => PlatformGoogleIdTokenProvider());

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);

/// 10/11/2026 — push FCM. `ref.read` (không watch) để không tạo lại service khi router đổi.
final pushServiceProvider = Provider<PushService>((ref) => PushService(
      api: ref.read(apiClientProvider),
      router: ref.read(routerProvider),
      canPick: () => ref.read(authControllerProvider).user?.isWarehouse ?? false,
    ));

final syncControllerProvider =
    NotifierProvider<SyncController, SyncState>(SyncController.new);

/// Nhân viên kho, để hiện tên người lấy hàng và để phân công.
final warehouseStaffProvider = FutureProvider.autoDispose<List<StaffOption>>(
  (ref) => ref.watch(warehouseRepositoryProvider).staff(),
);

/// Hàng đợi lấy hàng. Tải lại khi hàng đợi ngoại tuyến gửi xong thêm thao tác.
final myWorkProvider =
    FutureProvider.autoDispose<Loaded<List<OrderGroupSummary>>>((ref) async {
  ref.watch(syncControllerProvider.select((s) => s.tick));
  final user = ref.watch(authControllerProvider).user;
  if (user == null) return const Loaded(<OrderGroupSummary>[]);
  return ref.watch(warehouseRepositoryProvider).queue();
});

/// Tìm nhóm đơn trên máy chủ (mã đơn sàn chỉ BE biết).
final groupSearchProvider = FutureProvider.autoDispose
    .family<List<OrderGroupSummary>, String>(
  (ref, query) => ref.watch(warehouseRepositoryProvider).searchGroups(query),
);

class PickData {
  const PickData({
    required this.group,
    required this.lines,
    required this.warehouseId,
    this.warehouses = const [],
    this.groupWarehouseInactive = false,
    this.canChooseWarehouse = false,
    this.fromCache = false,
    this.savedAt,
  });

  final OrderGroupSummary group;
  final List<PickLine> lines;
  final String warehouseId;
  final List<WarehouseOption> warehouses;
  final bool groupWarehouseInactive;
  final bool canChooseWarehouse;
  final bool fromCache;
  final DateTime? savedAt;
}

/// Kho nhân viên tự chọn cho một nhóm (chỉ dùng khi nhóm không gắn kho còn hoạt động).
final pickWarehouseChoiceProvider =
    StateProvider.autoDispose.family<String?, String>((ref, groupId) => null);

/// Một nhóm đơn đang lấy: danh sách theo lộ trình kệ + tiến độ đã cộng cả thao tác chờ gửi.
final pickDataProvider =
    FutureProvider.autoDispose.family<PickData, String>((ref, groupId) async {
  ref.watch(syncControllerProvider.select((s) => s.tick));
  final repo = ref.watch(warehouseRepositoryProvider);
  final sync = ref.read(syncControllerProvider.notifier);

  OrderGroupSummary? group;
  var offline = false;
  try {
    group = await repo.groupDetail(groupId);
  } on ApiException catch (e) {
    if (!e.isRetryable) rethrow;
    offline = true;
    group = await repo.cachedGroup(groupId);
  }
  if (group == null) {
    throw const ApiException(
      message: 'Chưa có dữ liệu nhóm này trên máy. Hãy mở khi có mạng.',
      isNetwork: true,
    );
  }

  // Đọc lại danh sách kho mỗi lần tải, để nhóm không kẹt ở kho vừa bị tắt.
  final chosenId = ref.watch(pickWarehouseChoiceProvider(groupId));
  List<WarehouseOption>? warehouses;
  try {
    warehouses = await repo.activeWarehouses();
  } on ApiException {
    if (group.warehouseId == null) rethrow;
  }
  final target = warehouses == null
      ? PickWarehouse(id: group.warehouseId!)
      : resolvePickWarehouse(group.warehouseId, warehouses, chosenId: chosenId);
  if (target == null) {
    throw const ApiException(
      message: 'Chưa có kho nào đang hoạt động. Báo Admin bật lại hoặc tạo kho.',
    );
  }
  final warehouseId = target.id;

  final list = await repo.pickingList(warehouseId, groupId);
  final pending = await sync.pendingPickBySku(groupId);
  return PickData(
    group: group,
    lines: withPendingProgress(list.data, pending),
    warehouseId: warehouseId,
    warehouses: warehouses ?? const [],
    groupWarehouseInactive: target.groupWarehouseInactive,
    canChooseWarehouse: target.canChoose,
    fromCache: offline || list.fromCache,
    savedAt: list.savedAt,
  );
});
