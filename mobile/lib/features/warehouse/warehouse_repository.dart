import 'package:uuid/uuid.dart';

import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/storage/json_cache.dart';
import '../offline/pending_action.dart';
import 'warehouse_models.dart';

/// Dữ liệu kèm dấu cho biết lấy từ máy (có thể cũ) hay từ máy chủ.
class Loaded<T> {
  const Loaded(this.data, {this.fromCache = false, this.savedAt});
  final T data;
  final bool fromCache;
  final DateTime? savedAt;
}

enum ScanMethod { barcode, manual }

class WarehouseRepository {
  WarehouseRepository({
    required this.api,
    required this.cache,
    Uuid? uuid,
  }) : _uuid = uuid ?? const Uuid();

  final ApiClient api;
  final JsonCache cache;
  final Uuid _uuid;

  /// Mất mạng hay máy chủ lỗi thì đọc bản đã lưu; lỗi nghiệp vụ (403…) thì báo thật.
  Future<Loaded<T>> _liveOrCache<T>({
    required String key,
    required Future<Object?> Function() fetch,
    required T Function(Object? raw) parse,
  }) async {
    try {
      final raw = await fetch();
      await cache.write(key, raw);
      return Loaded(parse(raw));
    } on ApiException catch (e) {
      if (!e.isRetryable) rethrow;
      final cached = await cache.read(key);
      if (cached == null) rethrow;
      return Loaded(parse(cached.value), fromCache: true, savedAt: cached.savedAt);
    }
  }

  List<OrderGroupSummary> _parseGroups(Object? raw) => [
        if (raw is List)
          for (final row in raw)
            if (asMap(row) case final m?) OrderGroupSummary.fromJson(m),
      ];

  /// `GET /order-groups` (100 nhóm mới nhất, giống web) — app tự chia theo mục (xem [queueGroups]).
  Future<Loaded<List<OrderGroupSummary>>> queue() => _liveOrCache(
        key: 'groups:queue',
        fetch: () => api.get('/order-groups', query: {'limit': 100}),
        parse: _parseGroups,
      );

  /// `GET /order-groups?q=` — tìm ở mọi trạng thái theo mã đơn sàn (nhập đủ) hoặc đuôi mã nhóm.
  Future<List<OrderGroupSummary>> searchGroups(String query) async =>
      _parseGroups(await api.get('/order-groups', query: {'q': query}));

  /// `GET /order-groups/staff/search` — nhân viên kho kèm số việc đang xử lý.
  Future<List<StaffOption>> staff() async {
    final raw = await api.get('/order-groups/staff/search');
    return [
      if (raw is List)
        for (final row in raw)
          if (asMap(row) case final m?)
            if (pickStringOrNull(m, ['staffId', 'staff_id']) case final id?)
              StaffOption(
                id: id,
                name: pickString(m, ['fullName', 'name', 'email'], id),
                workload: pickInt(m, ['activeWorkload']),
                onLeave: pickBool(m, ['onLeave']),
              ),
    ];
  }

  /// `POST /order-groups/:id/assign` — không truyền [staffId] = BE tự chọn người ít việc nhất.
  Future<void> assign(String groupId, {String? staffId}) async {
    await api.post(
      '/order-groups/${Uri.encodeComponent(groupId)}/assign',
      body: {'staff_id': ?staffId},
    );
  }

  /// `GET /warehouse/:warehouseId/picking-list/:groupId` — đã sắp theo lộ trình kệ.
  Future<Loaded<List<PickLine>>> pickingList(String warehouseId, String groupId) =>
      _liveOrCache(
        key: 'picking:$groupId:$warehouseId',
        fetch: () => api.get(
          '/warehouse/${Uri.encodeComponent(warehouseId)}/picking-list/${Uri.encodeComponent(groupId)}',
        ),
        parse: (raw) => [
          if (raw is List)
            for (final row in raw)
              if (asMap(row) case final m? when pickString(m, ['sku']).isNotEmpty)
                PickLine.fromJson(m),
        ],
      );

  /// `GET /warehouse/warehouses` — chỉ giữ kho đang hoạt động. Có mạng thì luôn đọc mới.
  Future<List<WarehouseOption>> activeWarehouses() async {
    final loaded = await _liveOrCache<List<WarehouseOption>>(
      key: 'warehouses',
      fetch: () => api.get('/warehouse/warehouses'),
      parse: (raw) => [
        if (raw is List)
          for (final row in raw)
            if (asMap(row) case final m? when m['isActive'] != false && m['is_active'] != false)
              if (pickStringOrNull(m, ['id', '_id']) case final id?)
                WarehouseOption(
                  id: id,
                  code: pickString(m, ['warehouseCode', 'warehouse_code']),
                  name: pickString(m, ['warehouseName', 'warehouse_name']),
                ),
      ],
    );
    return loaded.data;
  }

  /// Kho mặc định khi nhóm chưa có `warehouseId`: kho đầu tiên đang hoạt động.
  Future<String?> defaultWarehouseId() async {
    final list = await activeWarehouses();
    return list.isEmpty ? null : list.first.id;
  }

  /// Tạo thao tác lấy hàng chờ gửi. `id` chính là `client_event_id`, sinh ngay lúc bấm.
  PendingAction buildPickItemAction({
    required String groupId,
    required PickLine line,
    required int quantity,
    required ScanMethod method,
    required String warehouseId,
    String? binLocationId, // AOFP-327 — ô phụ vừa quét; null = ô chính của dòng
  }) {
    final id = _uuid.v4();
    final bin = binLocationId ?? line.binLocationId;
    return PendingAction(
      id: id,
      kind: 'pick_item',
      label: 'Lấy $quantity × ${line.sku}',
      path: '/order-groups/${Uri.encodeComponent(groupId)}/fulfillment/pick-item',
      body: {
        'sku': line.sku,
        'scanned_quantity': quantity,
        'scan_method': method.name,
        'warehouse_id': warehouseId,
        'bin_location_id': ?bin,
        'client_event_id': id,
      },
      createdAt: DateTime.now(),
    );
  }

  /// `POST …/fulfillment/pick` — chỉ gửi khi có mạng (dùng `expected_version`, không vào hàng đợi).
  /// Còn món chưa quét đủ → 409 `ORD_GROUP_PICK_INCOMPLETE` kèm danh sách món thiếu.
  Future<void> completePick(String groupId, int expectedVersion) async {
    await api.post(
      '/order-groups/${Uri.encodeComponent(groupId)}/fulfillment/pick',
      body: {'expected_version': expectedVersion},
    );
  }

  /// `POST …/fulfillment/report-missing` — chỉ gửi khi có mạng.
  Future<void> reportMissing({
    required String groupId,
    required String sku,
    required int missingQuantity,
    required String warehouseId,
    required int expectedVersion,
    String? note,
  }) async {
    await api.post(
      '/order-groups/${Uri.encodeComponent(groupId)}/fulfillment/report-missing',
      body: {
        'sku': sku,
        'missing_quantity': missingQuantity,
        'warehouse_id': warehouseId,
        'expected_version': expectedVersion,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
      },
    );
  }

  /// Nhóm trong danh sách đã lưu (dùng khi mở lúc mất mạng).
  Future<OrderGroupSummary?> cachedGroup(String groupId) async {
    final cached = await cache.read('groups:queue');
    if (cached == null) return null;
    for (final g in _parseGroups(cached.value)) {
      if (g.id == groupId) return g;
    }
    return null;
  }

  /// `GET /order-groups/:id` để lấy `version` mới nhất trước khi gửi nút đổi trạng thái.
  Future<OrderGroupSummary> groupDetail(String groupId) async {
    final m = asMap(await api.get('/order-groups/${Uri.encodeComponent(groupId)}'));
    if (m == null) {
      throw const ApiException(message: 'Không đọc được nhóm đơn.');
    }
    return OrderGroupSummary.fromJson(m);
  }
}
