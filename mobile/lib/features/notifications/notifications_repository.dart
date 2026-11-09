/// Thông báo trong app. **Đang là dữ liệu giả.** BE đã có sẵn:
/// `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`,
/// `PATCH /notifications/read-all` (xem GUIDE_DOC/API_LIST.md mục 15).
/// Chỉ **push (FCM)** là BE chưa có.
enum NotificationSeverity { info, warning, critical }

class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.severity,
    required this.title,
    required this.message,
    required this.createdAt,
    this.isRead = false,
    this.relatedEntityType,
    this.relatedEntityId,
  });

  final String id;
  final String type;
  final NotificationSeverity severity;
  final String title;
  final String message;
  final DateTime createdAt;
  final bool isRead;
  final String? relatedEntityType;
  final String? relatedEntityId;

  AppNotification markRead() => AppNotification(
        id: id,
        type: type,
        severity: severity,
        title: title,
        message: message,
        createdAt: createdAt,
        isRead: true,
        relatedEntityType: relatedEntityType,
        relatedEntityId: relatedEntityId,
      );
}

abstract class NotificationsRepository {
  Future<List<AppNotification>> list();
  Future<int> unreadCount();
  Future<void> markRead(String id);
  Future<void> markAllRead();
}

class MockNotificationsRepository implements NotificationsRepository {
  MockNotificationsRepository() {
    final now = DateTime.now();
    _items = [
      AppNotification(
        id: 'n1',
        type: 'stock_shortage',
        severity: NotificationSeverity.critical,
        title: 'Thiếu hàng: AOPOLO-030-BE-L',
        message: 'Nhóm 6ae76ee49b cần 2, chỉ giữ được 1. Nhập thêm hàng hoặc báo thiếu.',
        createdAt: now.subtract(const Duration(minutes: 12)),
        relatedEntityType: 'order_group',
        relatedEntityId: '6ae76ee49b1f1227a7eeeca4',
      ),
      AppNotification(
        id: 'n2',
        type: 'delivery_overdue',
        severity: NotificationSeverity.critical,
        title: 'Đơn hỏa tốc quá hạn giao',
        message: 'Vận đơn SHP-261109-000041 quá hạn 18 phút.',
        createdAt: now.subtract(const Duration(minutes: 35)),
        relatedEntityType: 'shipment',
        relatedEntityId: 'ship41',
      ),
      AppNotification(
        id: 'n3',
        type: 'packing_blocked',
        severity: NotificationSeverity.warning,
        title: 'Chưa tính được kế hoạch đóng gói',
        message: 'SKU SLL-BRN-37 chưa có số đo. Cần đo và xác nhận hồ sơ trên web.',
        createdAt: now.subtract(const Duration(hours: 2)),
        relatedEntityType: 'order_group',
        relatedEntityId: 'g-blocked',
      ),
      AppNotification(
        id: 'n4',
        type: 'low_box_stock',
        severity: NotificationSeverity.warning,
        title: 'Thùng BOX-M sắp hết',
        message: 'Còn 12, ngưỡng cảnh báo 10.',
        createdAt: now.subtract(const Duration(hours: 5)),
        isRead: true,
      ),
      AppNotification(
        id: 'n5',
        type: 'return_requested',
        severity: NotificationSeverity.info,
        title: 'Khách yêu cầu trả hàng',
        message: 'Đơn 720000118 — lý do: sai size.',
        createdAt: now.subtract(const Duration(days: 1)),
        isRead: true,
        relatedEntityType: 'return',
        relatedEntityId: 'rma-1',
      ),
    ];
  }

  late List<AppNotification> _items;

  Future<void> _latency() => Future<void>.delayed(const Duration(milliseconds: 150));

  @override
  Future<List<AppNotification>> list() async {
    await _latency();
    return List.unmodifiable(_items);
  }

  @override
  Future<int> unreadCount() async => _items.where((n) => !n.isRead).length;

  @override
  Future<void> markRead(String id) async {
    _items = [for (final n in _items) n.id == id ? n.markRead() : n];
  }

  @override
  Future<void> markAllRead() async {
    _items = [for (final n in _items) n.markRead()];
  }
}
