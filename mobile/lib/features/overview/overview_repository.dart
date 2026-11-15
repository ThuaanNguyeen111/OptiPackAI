/// Tổng quan cho Store Owner / Admin. **Đang là dữ liệu giả.**
/// BE đã có: `GET /dashboard/summary` (khối `actionQueue`, `sales`, `delivery`, `returns`, `express`),
/// `PATCH /order-groups/:id/priority`, `GET /orders`, `GET /orders/:id`.
class OverviewSummary {
  const OverviewSummary({
    required this.ordersToday,
    required this.pending,
    required this.overdue,
    required this.returnsOpen,
    required this.revenueVnd,
    required this.express,
  });

  final int ordersToday;
  final int pending;
  final int overdue;
  final int returnsOpen;
  final int revenueVnd;
  final List<ExpressItem> express;
}

class ExpressItem {
  const ExpressItem({required this.shortId, required this.stage, required this.deadline});
  final String shortId;
  final String stage;
  final DateTime deadline;
}

class OrderLite {
  const OrderLite({
    required this.code,
    required this.platform,
    required this.recipient,
    required this.status,
    required this.totalVnd,
  });

  final String code;
  final String platform;
  final String recipient;
  final String status;
  final int totalVnd;
}

abstract class OverviewRepository {
  Future<OverviewSummary> summary();
  Future<List<OrderLite>> searchOrders(String query);
}

class MockOverviewRepository implements OverviewRepository {
  static const _orders = [
    OrderLite(code: '720000118', platform: 'aurelle', recipient: 'Nguyễn Văn An', status: 'Đã giao', totalVnd: 489000),
    OrderLite(code: '720000121', platform: 'aurelle', recipient: 'Lê Thị Bích', status: 'Đang giao', totalVnd: 1250000),
    OrderLite(code: '720000130', platform: 'aurelle', recipient: 'Trần Quốc Cường', status: 'Giao thất bại', totalVnd: 326000),
    OrderLite(code: '532953751471670', platform: 'lazada', recipient: 'T**h', status: 'Đã đóng gói', totalVnd: 215000),
    OrderLite(code: '532953751471671', platform: 'lazada', recipient: 'N**n', status: 'Đang lấy hàng', totalVnd: 98000),
    OrderLite(code: 'TK-2290417', platform: 'tiki', recipient: 'Phạm Minh Đức', status: 'Chờ xác nhận', totalVnd: 640000),
  ];

  @override
  Future<OverviewSummary> summary() async {
    await Future<void>.delayed(const Duration(milliseconds: 200));
    final now = DateTime.now();
    return OverviewSummary(
      ordersToday: 42,
      pending: 17,
      overdue: 3,
      returnsOpen: 2,
      revenueVnd: 12450000,
      express: [
        ExpressItem(shortId: '6ae76ee49b', stage: 'đóng gói', deadline: now.add(const Duration(minutes: 42))),
        ExpressItem(shortId: '7f3a1c9e00', stage: 'giao khách', deadline: now.subtract(const Duration(minutes: 18))),
      ],
    );
  }

  @override
  Future<List<OrderLite>> searchOrders(String query) async {
    await Future<void>.delayed(const Duration(milliseconds: 150));
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return _orders;
    return [
      for (final o in _orders)
        if (o.code.toLowerCase().contains(q) || o.recipient.toLowerCase().contains(q)) o,
    ];
  }
}
