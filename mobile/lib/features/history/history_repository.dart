import '../../core/json.dart';
import '../../core/network/api_client.dart';

/// Một mốc trong lịch sử thao tác (`GET /history`).
class HistoryEntry {
  const HistoryEntry({
    required this.id,
    required this.occurredAt,
    required this.category,
    required this.categoryLabel,
    required this.summary,
    this.actorName,
    this.orderGroupId,
    this.photoUrls = const [],
  });

  final String id;
  final DateTime occurredAt;
  final String category;
  final String categoryLabel;
  final String summary;
  final String? actorName;
  final String? orderGroupId;
  final List<String> photoUrls;

  static HistoryEntry? tryParse(Object? raw) {
    final m = asMap(raw);
    if (m == null) return null;
    final id = pickString(m, ['id', '_id']);
    final at = pickDate(m, ['occurredAt', 'occurred_at']);
    if (id.isEmpty || at == null) return null;
    final photos = m['photoUrls'] ?? m['photo_urls'];
    return HistoryEntry(
      id: id,
      occurredAt: at.toLocal(),
      category: pickString(m, ['category']),
      categoryLabel: pickString(m, ['categoryLabel', 'category_label']),
      summary: pickString(m, ['summary']),
      actorName: pickStringOrNull(asMap(m['actor']), ['name']),
      orderGroupId: pickStringOrNull(m, ['orderGroupId', 'order_group_id']),
      photoUrls: [
        if (photos is List)
          for (final url in photos)
            if (url is String && url.isNotEmpty) url,
      ],
    );
  }
}

class HistoryCategory {
  const HistoryCategory(this.code, this.label);
  final String code;
  final String label;
}

class HistoryFilter {
  const HistoryFilter(
      {this.category, this.from, this.to, this.mine = false, this.sku = '', this.orderCode = '', this.actorId});

  /// Chỉ Admin / Chủ shop lọc được theo người làm.
  final String? actorId;

  final String? category;

  /// Ngày đầu và ngày cuối theo giờ máy (tính cả ngày cuối).
  final DateTime? from;
  final DateTime? to;
  final bool mine;
  final String sku;
  final String orderCode;

  Map<String, dynamic> toQuery({required int page, required int limit}) {
    final end = to;
    return {
      'page': page,
      'limit': limit,
      'category': ?category,
      if (from case final f?) 'from': DateTime(f.year, f.month, f.day).toUtc().toIso8601String(),
      // BE không tính mốc `to`, nên gửi đầu ngày hôm sau.
      if (end != null) 'to': DateTime(end.year, end.month, end.day + 1).toUtc().toIso8601String(),
      if (mine) 'mine': 'true',
      'actor_id': ?actorId,
      if (sku.trim().isNotEmpty) 'sku': sku.trim(),
      if (orderCode.trim().isNotEmpty) 'order_code': orderCode.trim(),
    };
  }
}

class HistoryPageResult {
  const HistoryPageResult(this.items, this.total);
  final List<HistoryEntry> items;
  final int total;
}

abstract class HistoryRepository {
  Future<List<HistoryCategory>> categories();
  Future<HistoryPageResult> list(HistoryFilter filter, {required int page, int limit = 30});
  Future<List<HistoryEntry>> timeline(String groupId);
}

List<HistoryEntry> _entries(Object? raw) => [
      if (raw is List)
        for (final row in raw) ?HistoryEntry.tryParse(row),
    ];

class ApiHistoryRepository implements HistoryRepository {
  ApiHistoryRepository(this.api);
  final ApiClient api;

  @override
  Future<List<HistoryCategory>> categories() async {
    final raw = await api.get('/history/categories');
    final list = raw is List ? raw : asMap(raw)?['categories'];
    return [
      if (list is List)
        for (final row in list)
          if (row is String)
            HistoryCategory(row, categoryName(row))
          else if (asMap(row) case final m?)
            HistoryCategory(pickString(m, ['code']), pickString(m, ['label'], categoryName(pickString(m, ['code'])))),
    ];
  }

  @override
  Future<HistoryPageResult> list(HistoryFilter filter, {required int page, int limit = 30}) async {
    final m = asMap(await api.get('/history', query: filter.toQuery(page: page, limit: limit)));
    final items = _entries(m?['items']);
    return HistoryPageResult(items, pickInt(m, ['total'], items.length));
  }

  @override
  Future<List<HistoryEntry>> timeline(String groupId) async {
    final m = asMap(await api.get('/history/order-groups/${Uri.encodeComponent(groupId)}/timeline'));
    return _entries(m?['items']);
  }
}

/// Tên loại lịch sử khi BE chỉ trả mã (giống `CATEGORY_LABELS` của BE).
String categoryName(String code) => switch (code) {
      'orders' => 'Đơn hàng',
      'picking' => 'Lấy hàng',
      'packing' => 'Đóng gói',
      'shipping' => 'Vận chuyển',
      'returns' => 'Trả / hoàn hàng',
      'warehouse' => 'Kho',
      'packaging_materials' => 'Vật liệu đóng gói',
      'auth' => 'Đăng nhập',
      _ => code,
    };

class MockHistoryRepository implements HistoryRepository {
  final _items = [
    HistoryEntry(
      id: 'h1',
      occurredAt: DateTime(2026, 11, 20, 9, 30),
      category: 'picking',
      categoryLabel: 'Lấy hàng',
      summary: 'Lấy 2 × AOPOLO-030-BE-L ở ô KA-D1-P01-T01-1',
      actorName: 'Nhân viên kho',
      orderGroupId: 'g1',
    ),
  ];

  @override
  Future<List<HistoryCategory>> categories() async =>
      const [HistoryCategory('picking', 'Lấy hàng'), HistoryCategory('warehouse', 'Kho')];

  @override
  Future<HistoryPageResult> list(HistoryFilter filter, {required int page, int limit = 30}) async =>
      HistoryPageResult(page == 1 ? _items : const [], _items.length);

  @override
  Future<List<HistoryEntry>> timeline(String groupId) async => _items;
}
