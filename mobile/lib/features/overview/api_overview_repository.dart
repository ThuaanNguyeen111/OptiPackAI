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
OverviewSummary parseOverview(Map<String, dynamic>? summary, List<Object?> expressGroups) {
  final q = asMap(summary?['actionQueue']);
  final sales = asMap(asMap(summary?['sales'])?['current']);
  int n(String key) => pickInt(q, [key]);
  return OverviewSummary(
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
  Future<OverviewSummary> summary() async {
    final now = DateTime.now();
    final startOfDay = DateTime(now.year, now.month, now.day);
    final results = await Future.wait([
      api.get('/dashboard/summary', query: {
        'from': startOfDay.toUtc().toIso8601String(),
        'to': now.toUtc().toIso8601String(),
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
              code: pickString(m, ['platformOrderId']),
              platform: pickString(m, ['platform']),
              recipient: pickString(m, ['recipientName']),
              status: orderStatusLabel(pickString(m, ['status'])),
              totalVnd: pickDouble(m, ['totalAmount']).round(),
            ),
    ];
  }
}
