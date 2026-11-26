/// Tổng quan cho Store Owner / Admin. **Đang là dữ liệu giả.**
/// BE đã có: `GET /dashboard/summary` (khối `actionQueue`, `sales`, `delivery`, `returns`, `express`),
/// `PATCH /order-groups/:id/priority`, `GET /orders`, `GET /orders/:id`.
/// Khoảng thời gian xem tổng quan (tính đến bây giờ).
enum OverviewRange {
  today('Hôm nay', 1),
  week('7 ngày', 7),
  month('30 ngày', 30);

  const OverviewRange(this.label, this.days);
  final String label;
  final int days;
}

/// Bộ lọc tổng quan: khoảng ngày + sàn (`null` = mọi sàn).
class OverviewFilter {
  const OverviewFilter({this.range = OverviewRange.today, this.platform});
  final OverviewRange range;
  final String? platform;

  OverviewFilter copyWith({OverviewRange? range, String? platform, bool clearPlatform = false}) => OverviewFilter(
        range: range ?? this.range,
        platform: clearPlatform ? null : (platform ?? this.platform),
      );

  @override
  bool operator ==(Object other) => other is OverviewFilter && other.range == range && other.platform == platform;

  @override
  int get hashCode => Object.hash(range, platform);
}

enum ActionSeverity { info, warning, danger }

/// Một hàng việc cần xử lý ngay (`actionQueue` của BE), chỉ hiện khi số > 0.
class ActionItem {
  const ActionItem({required this.label, required this.count, required this.severity});
  final String label;
  final int count;
  final ActionSeverity severity;
}

class DailyPoint {
  const DailyPoint({required this.date, required this.revenueVnd, required this.orders});
  final String date; // YYYY-MM-DD (giờ Việt Nam)
  final int revenueVnd;
  final int orders;
}

class PlatformSales {
  const PlatformSales({required this.platform, required this.orders, required this.revenueVnd});
  final String platform;
  final int orders;
  final int revenueVnd;
}

class LowMaterial {
  const LowMaterial({required this.name, required this.usable, required this.reorderLevel});
  final String name;
  final int usable;
  final int reorderLevel;
}

class ShortageSku {
  const ShortageSku({required this.sku, required this.shortage});
  final String sku;
  final int shortage;
}

class OverviewSummary {
  const OverviewSummary({
    required this.ordersToday,
    required this.pending,
    required this.overdue,
    required this.returnsOpen,
    required this.revenueVnd,
    required this.express,
    this.revenueDeliveredVnd = 0,
    this.ordersChange,
    this.revenueChange,
    this.revenueDeliveredChange,
    this.actions = const [],
    this.daily = const [],
    this.byPlatform = const [],
    this.firstAttemptRate,
    this.avgDeliveryHours,
    this.shippingCostPerOrderVnd,
    this.packagingCostPerOrderVnd,
    this.fulfillmentCostRate,
    this.returnRate,
    this.expressOnTimeRate,
    this.shortageSkuCount = 0,
    this.outOfStockSkuCount = 0,
    this.shortageSkus = const [],
    this.materialsLow = const [],
  });

  /// Đơn nhận trong khoảng đã chọn (tên cũ `ordersToday` giữ để code đang dùng không vỡ).
  final int ordersToday;
  final int pending;
  final int overdue;
  final int returnsOpen;
  final int revenueVnd;
  final List<ExpressItem> express;

  final int revenueDeliveredVnd;

  /// % thay đổi so với kỳ trước (0,125 = +12,5%); `null` khi kỳ trước bằng 0.
  final double? ordersChange;
  final double? revenueChange;
  final double? revenueDeliveredChange;
  final List<ActionItem> actions;
  final List<DailyPoint> daily;
  final List<PlatformSales> byPlatform;
  final double? firstAttemptRate;
  final double? avgDeliveryHours;
  final int? shippingCostPerOrderVnd;
  final int? packagingCostPerOrderVnd;
  final double? fulfillmentCostRate;
  final double? returnRate;
  final double? expressOnTimeRate;
  final int shortageSkuCount;
  final int outOfStockSkuCount;
  final List<ShortageSku> shortageSkus;
  final List<LowMaterial> materialsLow;
}

class ExpressItem {
  const ExpressItem({required this.shortId, required this.stage, required this.deadline});
  final String shortId;
  final String stage;
  final DateTime deadline;
}

class OrderLite {
  const OrderLite({
    this.id = '',
    this.groupId,
    required this.code,
    required this.platform,
    required this.recipient,
    required this.status,
    required this.totalVnd,
  });

  /// Id đơn trong OptiPack (để mở chi tiết `GET /orders/:id`).
  final String id;

  /// Nhóm đơn chứa đơn này (đánh dấu Hỏa Tốc theo nhóm). Null = chưa gom.
  final String? groupId;
  final String code;
  final String platform;
  final String recipient;
  final String status;
  final int totalVnd;
}

/// Một dòng hàng của đơn (đã gộp theo SKU + trạng thái).
class OrderLine {
  const OrderLine({required this.sku, required this.name, required this.quantity, required this.lineTotalVnd});
  final String sku;
  final String name;
  final int quantity;
  final int lineTotalVnd;
}

/// Chi tiết 1 đơn (`GET /orders/:id`) kèm trạng thái ưu tiên của nhóm đơn chứa nó.
class OrderDetail {
  const OrderDetail({
    required this.code,
    required this.platform,
    required this.status,
    required this.recipient,
    required this.phone,
    required this.address,
    required this.items,
    required this.totalVnd,
    this.groupId,
    this.groupExpress = false,
    this.needCancelConfirm = false,
  });

  final String code;
  final String platform;
  final String status;
  final String recipient;
  final String phone;
  final String address;
  final List<OrderLine> items;
  final int totalVnd;
  final String? groupId;

  /// Nhóm đơn đang đánh dấu Hỏa Tốc.
  final bool groupExpress;

  /// Khách yêu cầu hủy, đang chờ người bán xác nhận.
  final bool needCancelConfirm;

  OrderDetail withExpress(bool value) => OrderDetail(
        code: code,
        platform: platform,
        status: status,
        recipient: recipient,
        phone: phone,
        address: address,
        items: items,
        totalVnd: totalVnd,
        groupId: groupId,
        groupExpress: value,
        needCancelConfirm: needCancelConfirm,
      );
}

abstract class OverviewRepository {
  Future<OverviewSummary> summary({OverviewFilter filter = const OverviewFilter()});
  Future<List<OrderLite>> searchOrders(String query);

  /// `GET /orders/:id` (+ `GET /order-groups/:id` để biết nhóm có đang Hỏa Tốc không).
  Future<OrderDetail> orderDetail(OrderLite order);

  /// `PATCH /order-groups/:id/priority`. Hỏa Tốc đặt hạn đóng gói theo giờ làm việc (mặc định 4 giờ).
  Future<void> setExpress(String groupId, bool express, {int hours = 4});
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
  Future<OverviewSummary> summary({OverviewFilter filter = const OverviewFilter()}) async {
    await Future<void>.delayed(const Duration(milliseconds: 200));
    final now = DateTime.now();
    return OverviewSummary(
      ordersToday: 42,
      pending: 17,
      overdue: 3,
      returnsOpen: 2,
      revenueVnd: 12450000,
      revenueDeliveredVnd: 9800000,
      ordersChange: 0.125,
      revenueChange: 0.082,
      revenueDeliveredChange: -0.04,
      actions: const [
        ActionItem(label: 'Hỏa Tốc quá hạn', count: 3, severity: ActionSeverity.danger),
        ActionItem(label: 'Kế hoạch chờ duyệt', count: 4, severity: ActionSeverity.warning),
        ActionItem(label: 'Hoàn chờ duyệt', count: 2, severity: ActionSeverity.info),
      ],
      daily: [
        for (var i = 6; i >= 0; i--)
          DailyPoint(
            date: now.subtract(Duration(days: i)).toIso8601String().substring(0, 10),
            revenueVnd: 1200000 + (6 - i) * 310000 + (i.isEven ? 250000 : 0),
            orders: 5 + (6 - i),
          ),
      ],
      byPlatform: const [
        PlatformSales(platform: 'aurelle', orders: 28, revenueVnd: 8200000),
        PlatformSales(platform: 'lazada', orders: 14, revenueVnd: 4250000),
      ],
      firstAttemptRate: 0.86,
      avgDeliveryHours: 31.5,
      shippingCostPerOrderVnd: 24000,
      packagingCostPerOrderVnd: 6500,
      fulfillmentCostRate: 0.09,
      returnRate: 0.04,
      expressOnTimeRate: 0.92,
      shortageSkuCount: 2,
      outOfStockSkuCount: 1,
      shortageSkus: const [ShortageSku(sku: 'AOPOLO-030-BE-L', shortage: 3)],
      materialsLow: const [LowMaterial(name: 'Thùng CTN-001', usable: 6, reorderLevel: 10)],
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

  final Set<String> _expressGroups = {};

  @override
  Future<OrderDetail> orderDetail(OrderLite order) async {
    await Future<void>.delayed(const Duration(milliseconds: 150));
    final groupId = order.groupId ?? 'g-${order.code}';
    return OrderDetail(
      code: order.code,
      platform: order.platform,
      status: order.status,
      recipient: order.recipient,
      phone: '0377 168 254',
      address: '47/10 Nguyễn Văn Đậu, Phường Gia Định, TP Hồ Chí Minh',
      items: const [
        OrderLine(sku: 'AOPOLO-030-BE-L', name: 'Áo polo be size L', quantity: 1, lineTotalVnd: 215000),
      ],
      totalVnd: order.totalVnd,
      groupId: groupId,
      groupExpress: _expressGroups.contains(groupId),
    );
  }

  @override
  Future<void> setExpress(String groupId, bool express, {int hours = 4}) async {
    await Future<void>.delayed(const Duration(milliseconds: 150));
    if (express) {
      _expressGroups.add(groupId);
    } else {
      _expressGroups.remove(groupId);
    }
  }
}
