import '../../core/json.dart';
import '../../core/network/api_client.dart';
import 'overview_repository.dart';

/// Nhãn tiếng Việt cho `status` của đơn sàn (OrderStatus của BE).
const _orderStatusLabels = {
  'unpaid': 'Chờ thanh toán',
  'pending': 'Chờ xử lý',
  'topack': 'Chờ đóng gói',
  'packed': 'Đã đóng gói',
  'toship': 'Chờ giao',
  'ready_to_ship': 'Sẵn sàng giao',
  'shipped': 'Đang giao',
  'delivered': 'Đã giao',
  'failed_delivery': 'Giao thất bại',
  'canceled': 'Đã huỷ',
  'returned': 'Đã hoàn',
  'shipped_back': 'Đang hoàn',
  'shipped_back_success': 'Đã hoàn về',
  'lost': 'Thất lạc',
  'lost_by_3pl': 'Hãng làm thất lạc',
  'damaged_by_3pl': 'Hãng làm hỏng',
};

String orderStatusLabel(String code) => _orderStatusLabels[code] ?? code;

/// Bước hiện tại của nhóm hỏa tốc (để nói "còn X phút để ...").
const _expressStage = {
  'awaiting_packaging': 'lấy hàng',
  'picking': 'lấy hàng',
  'partial_needs_review': 'lấy hàng',
  'picked': 'đóng gói',
  'pending_approval': 'đóng gói',
  'approved_for_packing': 'đóng gói',
  'packed': 'giao khách',
  'shipped': 'giao khách',
};

/// `GET /dashboard/summary` → [OverviewSummary] (chỉ số trong ngày + việc đang chờ).
/// Nhãn + mức độ của từng hàng việc `actionQueue`. Chỉ hiện hàng có số > 0.
const _actionDefs = <(String key, String label, ActionSeverity severity)>[
  ('expressOverdue', 'Hỏa Tốc quá hạn', ActionSeverity.danger),
  ('expressDueSoon', 'Hỏa Tốc sắp đến hạn', ActionSeverity.warning),
  ('deliveryFailed', 'Giao thất bại', ActionSeverity.danger),
  ('stockShortageGroups', 'Nhóm đơn thiếu hàng', ActionSeverity.danger),
  ('carrierBookingErrors', 'Lỗi tạo vận đơn', ActionSeverity.danger),
  ('marketplaceWritebackFailed', 'Lỗi báo trạng thái lên sàn', ActionSeverity.danger),
  ('partialNeedsReview', 'Lấy thiếu chờ duyệt', ActionSeverity.warning),
  ('plansWithHeldParcels', 'Kiện bị giữ (lệch cân)', ActionSeverity.warning),
  ('ordersAwaitingCancelConfirm', 'Chờ xác nhận hủy đơn', ActionSeverity.warning),
  ('plansAwaitingApproval', 'Kế hoạch đóng gói chờ duyệt', ActionSeverity.warning),
  ('returnsToReview', 'Hoàn hàng chờ duyệt', ActionSeverity.warning),
  ('awaitingPick', 'Chờ lấy hàng', ActionSeverity.info),
  ('picking', 'Đang lấy hàng', ActionSeverity.info),
  ('plansAwaitingPacking', 'Chờ đóng gói', ActionSeverity.info),
  ('readyToShip', 'Sẵn sàng giao', ActionSeverity.info),
  ('shipmentsInFlight', 'Đang giao', ActionSeverity.info),
  ('returningToWarehouse', 'Đang hoàn về kho', ActionSeverity.info),
  ('returnsToReceive', 'Hoàn hàng chờ nhận', ActionSeverity.info),
  ('returnsToInspect', 'Hoàn hàng chờ kiểm', ActionSeverity.info),
];

double? _ratioOf(Map<String, dynamic>? m, String key) {
  final v = m?[key];
  return v is num ? v.toDouble() : null;
}

OverviewSummary parseOverview(Map<String, dynamic>? raw, List<Object?> expressGroups) {
  // BE trả `{ "summary": { ... } }`; chịu cả dạng đã bóc lớp ngoài.
  final summary = asMap(raw?['summary']) ?? raw;
  final q = asMap(summary?['actionQueue']);
  final salesBlock = asMap(summary?['sales']);
  final sales = asMap(salesBlock?['current']);
  final change = asMap(salesBlock?['change']);
  final delivery = asMap(summary?['delivery']);
  final costs = asMap(summary?['costs']);
  final returns = asMap(summary?['returns']);
  final expressBlock = asMap(summary?['express']);
  final warehouse = asMap(summary?['warehouse']);
  int n(String key) => pickInt(q, [key]);
  int? nInt(Map<String, dynamic>? m, String key) => m?[key] is num ? (m![key] as num).round() : null;
  return OverviewSummary(
    actions: [
      for (final d in _actionDefs)
        if (n(d.$1) > 0) ActionItem(label: d.$2, count: n(d.$1), severity: d.$3),
    ],
    revenueDeliveredVnd: pickInt(sales, ['revenueDeliveredVnd']),
    ordersChange: _ratioOf(change, 'ordersReceived'),
    revenueChange: _ratioOf(change, 'revenuePlacedVnd'),
    revenueDeliveredChange: _ratioOf(change, 'revenueDeliveredVnd'),
    daily: [
      for (final d in (salesBlock?['daily'] as List? ?? const []))
        if (asMap(d) case final m?)
          DailyPoint(
            date: pickString(m, ['date']),
            revenueVnd: pickInt(m, ['revenuePlacedVnd']),
            orders: pickInt(m, ['ordersReceived']),
          ),
    ],
    byPlatform: [
      for (final p in (salesBlock?['byPlatform'] as List? ?? const []))
        if (asMap(p) case final m?)
          PlatformSales(
            platform: pickString(m, ['platform']),
            orders: pickInt(m, ['ordersReceived']),
            revenueVnd: pickInt(m, ['revenuePlacedVnd']),
          ),
    ],
    firstAttemptRate: _ratioOf(delivery, 'firstAttemptSuccessRate'),
    avgDeliveryHours: _ratioOf(delivery, 'avgDeliveryHours'),
    shippingCostPerOrderVnd: nInt(costs, 'shippingCostPerOrderVnd'),
    packagingCostPerOrderVnd: nInt(costs, 'packagingCostPerOrderVnd'),
    fulfillmentCostRate: _ratioOf(costs, 'fulfillmentCostRate'),
    returnRate: _ratioOf(returns, 'returnRate'),
    expressOnTimeRate: _ratioOf(expressBlock, 'onTimeRate'),
    shortageSkuCount: pickInt(warehouse, ['shortageSkuCount']),
    outOfStockSkuCount: pickInt(warehouse, ['outOfStockSkuCount']),
    shortageSkus: [
      for (final k in (warehouse?['shortageSkus'] as List? ?? const []).take(5))
        if (asMap(k) case final m?) ShortageSku(sku: pickString(m, ['sku']), shortage: pickInt(m, ['shortage'])),
    ],
    materialsLow: [
      for (final k in (warehouse?['materialsBelowReorder'] as List? ?? const []).take(5))
        if (asMap(k) case final m?)
          LowMaterial(
            name: pickString(m, ['name', 'code']),
            usable: pickInt(m, ['usable']),
            reorderLevel: pickInt(m, ['reorderLevel']),
          ),
    ],
    ordersToday: pickInt(sales, ['ordersReceived']),
    pending: n('awaitingPick') +
        n('picking') +
        n('partialNeedsReview') +
        n('plansAwaitingApproval') +
        n('plansAwaitingPacking') +
        n('readyToShip'),
    overdue: n('expressOverdue'),
    returnsOpen: n('returnsToReview') + n('returnsToReceive') + n('returnsToInspect'),
    revenueVnd: pickInt(sales, ['revenuePlacedVnd']),
    express: [
      for (final g in expressGroups)
        if (asMap(g) case final m?)
          if (_expressStage[pickString(m, ['fulfillmentStatus'])] case final stage?)
            if (pickDate(m, ['deliveryDeadline', 'packagingDeadline']) case final deadline?)
              ExpressItem(
                shortId: () {
                  final id = pickString(m, ['id']);
                  return id.length > 10 ? id.substring(id.length - 10) : id;
                }(),
                stage: stage,
                deadline: deadline,
              ),
    ]..sort((a, b) => a.deadline.compareTo(b.deadline)),
  );
}

/// Tổng quan cho chủ shop gọi BE thật.
class ApiOverviewRepository implements OverviewRepository {
  const ApiOverviewRepository(this.api);

  final ApiClient api;

  @override
  Future<OverviewSummary> summary({OverviewFilter filter = const OverviewFilter()}) async {
    final now = DateTime.now();
    final startOfDay = DateTime(now.year, now.month, now.day);
    final from = startOfDay.subtract(Duration(days: filter.range.days - 1));
    final results = await Future.wait([
      api.get('/dashboard/summary', query: {
        'from': from.toUtc().toIso8601String(),
        'to': now.toUtc().toIso8601String(),
        'platform': filter.platform,
      }),
      api.get('/order-groups', query: {'order_priority': 'express', 'limit': 50}),
    ]);
    final groups = results[1];
    return parseOverview(asMap(results[0]), groups is List ? groups : const []);
  }

  @override
  Future<List<OrderLite>> searchOrders(String query) async {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return const [];
    // BE chưa có tìm kiếm đơn theo chữ: lấy 100 đơn mới nhất rồi lọc trên máy.
    final raw = asMap(await api.get('/orders', query: {'limit': 100}));
    final orders = raw?['orders'] is List ? raw!['orders'] as List : const [];
    return [
      for (final o in orders)
        if (asMap(o) case final m?)
          if (pickString(m, ['platformOrderId']).toLowerCase().contains(q) ||
              pickString(m, ['recipientName']).toLowerCase().contains(q))
            OrderLite(
              id: pickString(m, ['id', '_id']),
              groupId: pickStringOrNull(m, ['consolidatedGroupId']),
              code: pickString(m, ['platformOrderId']),
              platform: pickString(m, ['platform']),
              recipient: pickString(m, ['recipientName']),
              status: orderStatusLabel(pickString(m, ['status'])),
              totalVnd: pickDouble(m, ['totalAmount']).round(),
            ),
    ];
  }

  @override
  Future<OrderDetail> orderDetail(OrderLite order) async {
    final m = asMap(await api.get('/orders/${Uri.encodeComponent(order.id)}'));
    if (m == null) throw const FormatException('Máy chủ trả chi tiết đơn không đọc được.');
    final groupId = pickStringOrNull(m, ['consolidatedGroupId']);
    var express = false;
    if (groupId != null) {
      final g = asMap(await api.get('/order-groups/${Uri.encodeComponent(groupId)}'));
      express = pickString(g, ['orderPriority']) == 'express';
    }
    final address = [
      pickString(m, ['recipientAddressLine1']),
      pickString(m, ['recipientWard']),
      pickString(m, ['recipientCity']),
    ].where((p) => p.isNotEmpty).join(', ');
    return OrderDetail(
      code: pickString(m, ['platformOrderId']),
      platform: pickString(m, ['platform']),
      status: orderStatusLabel(pickString(m, ['status'])),
      recipient: pickString(m, ['recipientName']),
      phone: pickString(m, ['recipientPhone']),
      address: address,
      items: [
        for (final i in (m['items'] as List? ?? const []))
          if (asMap(i) case final r?)
            OrderLine(
              sku: pickString(r, ['sku']),
              name: pickString(r, ['name']),
              quantity: pickInt(r, ['quantity']),
              lineTotalVnd: pickDouble(r, ['lineTotal']).round(),
            ),
      ],
      totalVnd: pickDouble(m, ['totalAmount']).round(),
      groupId: groupId,
      groupExpress: express,
      needCancelConfirm: pickBool(m, ['needCancelConfirm']),
    );
  }

  @override
  Future<void> setExpress(String groupId, bool express, {int hours = 4}) async {
    await api.patch('/order-groups/${Uri.encodeComponent(groupId)}/priority', body: {
      'order_priority': express ? 'express' : 'normal',
      if (express) 'deadline_hours': hours,
    });
  }
}
