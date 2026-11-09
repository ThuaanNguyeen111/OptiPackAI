import 'pending_action.dart';

/// Kho lưu thao tác chờ gửi. Bản thật lưu SQLite (không giữ trong RAM để không mất khi tắt app).
abstract class ActionQueue {
  Future<void> enqueue(PendingAction action);

  /// Các thao tác `pending`, cũ nhất trước (gửi đúng thứ tự đã thao tác).
  Future<List<PendingAction>> pending();

  /// Các thao tác đã lỗi nghiệp vụ, giữ lại cho người dùng xem.
  Future<List<PendingAction>> failed();

  Future<void> remove(String id);

  Future<void> markFailed(String id, {required String message, String? code});

  /// Lỗi tạm thời: giữ `pending`, hẹn giờ thử lại.
  Future<void> reschedule(String id, {required int attempts, required DateTime nextAttemptAt});

  /// Cho người dùng gửi lại một thao tác đã lỗi (giữ nguyên `client_event_id`).
  Future<void> requeue(String id);
}

/// Dùng cho test và khi chưa có DB.
class InMemoryActionQueue implements ActionQueue {
  final Map<String, PendingAction> _items = {};

  @override
  Future<void> enqueue(PendingAction action) async => _items[action.id] = action;

  List<PendingAction> _sorted(PendingStatus status) {
    final list = _items.values.where((a) => a.status == status).toList()
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return list;
  }

  @override
  Future<List<PendingAction>> pending() async => _sorted(PendingStatus.pending);

  @override
  Future<List<PendingAction>> failed() async => _sorted(PendingStatus.failed);

  @override
  Future<void> remove(String id) async => _items.remove(id);

  @override
  Future<void> markFailed(String id, {required String message, String? code}) async {
    final item = _items[id];
    if (item == null) return;
    _items[id] = item.copyWith(
      status: PendingStatus.failed,
      lastError: message,
      lastErrorCode: code,
      clearNextAttempt: true,
    );
  }

  @override
  Future<void> reschedule(String id, {required int attempts, required DateTime nextAttemptAt}) async {
    final item = _items[id];
    if (item == null) return;
    _items[id] = item.copyWith(attempts: attempts, nextAttemptAt: nextAttemptAt);
  }

  @override
  Future<void> requeue(String id) async {
    final item = _items[id];
    if (item == null) return;
    _items[id] = item.copyWith(
      status: PendingStatus.pending,
      attempts: 0,
      clearNextAttempt: true,
      clearError: true,
    );
  }
}
