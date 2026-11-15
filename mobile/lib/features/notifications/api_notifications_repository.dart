import '../../core/json.dart';
import '../../core/network/api_client.dart';
import 'notifications_repository.dart';

/// Đọc một dòng của `GET /notifications` (snake_case, `NotificationView` của BE).
AppNotification? parseNotification(Object? raw) {
  final m = asMap(raw);
  final id = pickString(m, ['id', '_id']);
  if (m == null || id.isEmpty) return null;
  return AppNotification(
    id: id,
    type: pickString(m, ['type']),
    severity: switch (pickString(m, ['severity'])) {
      'critical' => NotificationSeverity.critical,
      'warning' => NotificationSeverity.warning,
      _ => NotificationSeverity.info,
    },
    title: pickString(m, ['title']),
    message: pickString(m, ['message']),
    createdAt: pickDate(m, ['created_at', 'createdAt']) ?? DateTime.now(),
    isRead: pickBool(m, ['is_read', 'isRead']),
    relatedEntityType: pickStringOrNull(m, ['related_entity_type']),
    relatedEntityId: pickStringOrNull(m, ['related_entity_id']),
  );
}

/// Thông báo trong app gọi BE thật (`GUIDE_DOC/API_LIST.md` mục 15).
class ApiNotificationsRepository implements NotificationsRepository {
  const ApiNotificationsRepository(this.api);

  final ApiClient api;

  @override
  Future<List<AppNotification>> list() async {
    final raw = await api.get('/notifications', query: {'limit': 100});
    final rows = raw is List ? raw : (asMap(raw)?['items'] as List? ?? const []);
    return [for (final r in rows) ?parseNotification(r)];
  }

  @override
  Future<int> unreadCount() async =>
      pickInt(asMap(await api.get('/notifications/unread-count')), ['count']);

  @override
  Future<void> markRead(String id) async {
    await api.patch('/notifications/${Uri.encodeComponent(id)}/read');
  }

  @override
  Future<void> markAllRead() async {
    await api.patch('/notifications/read-all');
  }
}
