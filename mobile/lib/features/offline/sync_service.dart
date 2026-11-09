import '../../core/network/api_exception.dart';
import 'action_queue.dart';
import 'pending_action.dart';

/// Gửi một thao tác lên BE. Ném [ApiException] khi lỗi.
typedef ActionSender = Future<void> Function(PendingAction action);

class SyncReport {
  const SyncReport({
    this.sent = 0,
    this.failed = 0,
    this.deferred = 0,
    this.stoppedBy,
  });

  final int sent;

  /// Số thao tác bị lỗi nghiệp vụ, chuyển sang danh sách "Thao tác lỗi".
  final int failed;

  /// Số thao tác còn chờ (chưa tới giờ thử lại hoặc bị dừng giữa chừng).
  final int deferred;

  /// Lý do dừng sớm: mất mạng / phiên hết hạn. `null` khi chạy hết hàng đợi.
  final SyncStop? stoppedBy;
}

enum SyncStop { network, sessionExpired }

/// Xử lý hàng đợi theo luật của docs `MOBILE_UPDATE_CHECKLIST.md` mục 2 và 3:
///
/// * Gửi **từng cái một, đúng thứ tự** thao tác.
/// * Lỗi tạm thời (mất mạng, timeout, 408, 429, 5xx): tăng thời gian chờ rồi **dừng cả lượt**
///   (cái sau cũng sẽ lỗi, và phải giữ thứ tự).
/// * 401: dừng, không đánh dấu lỗi (người dùng đăng nhập lại là gửi tiếp được).
/// * Lỗi nghiệp vụ (400, 404, 409, 422…): **không thử lại**, giữ lại kèm `message` thật của BE.
class SyncService {
  SyncService({
    required this.queue,
    required this.sender,
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now;

  final ActionQueue queue;
  final ActionSender sender;
  final DateTime Function() _now;

  bool _running = false;
  bool get isRunning => _running;

  /// Chờ tăng dần 2 s → 4 s → 8 s … tối đa 5 phút.
  static Duration backoff(int attempts) {
    final seconds = 2 * (1 << attempts.clamp(0, 8));
    return Duration(seconds: seconds > 300 ? 300 : seconds);
  }

  Future<SyncReport> process() async {
    if (_running) return const SyncReport();
    _running = true;
    var sent = 0;
    var failed = 0;
    var deferred = 0;
    SyncStop? stopped;
    try {
      final items = await queue.pending();
      for (var i = 0; i < items.length; i++) {
        final action = items[i];
        final due = action.nextAttemptAt;
        if (due != null && due.isAfter(_now())) {
          deferred++;
          continue;
        }
        try {
          await sender(action);
          await queue.remove(action.id);
          sent++;
        } on ApiException catch (e) {
          if (e.isUnauthorized) {
            stopped = SyncStop.sessionExpired;
            deferred += items.length - i;
            break;
          }
          if (e.isRetryable) {
            final attempts = action.attempts + 1;
            await queue.reschedule(
              action.id,
              attempts: attempts,
              nextAttemptAt: _now().add(backoff(attempts)),
            );
            stopped = SyncStop.network;
            deferred += items.length - i;
            break;
          }
          await queue.markFailed(action.id, message: e.message, code: e.errorCode);
          failed++;
        }
      }
    } finally {
      _running = false;
    }
    return SyncReport(
      sent: sent,
      failed: failed,
      deferred: deferred,
      stoppedBy: stopped,
    );
  }
}
