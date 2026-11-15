import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../auth/auth_controller.dart';
import 'pending_action.dart';
import 'sync_service.dart';

class SyncState {
  const SyncState({
    this.pending = 0,
    this.failed = 0,
    this.running = false,
    this.online = true,
    this.stoppedBy,
    this.tick = 0,
  });

  final int pending;
  final int failed;
  final bool running;
  final bool online;
  final SyncStop? stoppedBy;

  /// Tăng mỗi khi có thay đổi (đã gửi xong / hàng đợi đổi) để màn hình tải lại.
  final int tick;

  SyncState copyWith({
    int? pending,
    int? failed,
    bool? running,
    bool? online,
    SyncStop? stoppedBy,
    bool clearStop = false,
    int? tick,
  }) =>
      SyncState(
        pending: pending ?? this.pending,
        failed: failed ?? this.failed,
        running: running ?? this.running,
        online: online ?? this.online,
        stoppedBy: clearStop ? null : (stoppedBy ?? this.stoppedBy),
        tick: tick ?? this.tick,
      );
}

/// Giữ hàng đợi ngoại tuyến và tự gửi: khi có mạng trở lại, khi vừa thêm thao tác, và 20 giây/lần.
class SyncController extends Notifier<SyncState> {
  Timer? _timer;
  StreamSubscription<List<ConnectivityResult>>? _connectivity;

  @override
  SyncState build() {
    _timer = Timer.periodic(const Duration(seconds: 20), (_) => kick());
    _connectivity = Connectivity().onConnectivityChanged.listen((results) {
      final online = results.any((r) => r != ConnectivityResult.none);
      state = state.copyWith(online: online);
      if (online) kick();
    });
    ref.onDispose(() {
      _timer?.cancel();
      _connectivity?.cancel();
    });
    // Đăng nhập lại là gửi tiếp được hàng đợi còn lại.
    ref.listen<AuthState>(authControllerProvider, (prev, next) {
      if (next.status == AuthStatus.signedIn) kick();
    });
    Future.microtask(refreshCounts);
    return const SyncState();
  }

  Future<void> refreshCounts() async {
    final queue = ref.read(actionQueueProvider);
    final pending = await queue.pending();
    final failed = await queue.failed();
    state = state.copyWith(pending: pending.length, failed: failed.length);
  }

  /// Lưu thao tác trên máy trước (không mất khi tắt app), rồi gửi ngay nếu có mạng.
  Future<void> enqueue(PendingAction action) async {
    await ref.read(actionQueueProvider).enqueue(action);
    await refreshCounts();
    state = state.copyWith(tick: state.tick + 1);
    unawaited(kick());
  }

  Future<void> kick() async {
    final service = ref.read(syncServiceProvider);
    if (service.isRunning) return;
    if (ref.read(authControllerProvider).status != AuthStatus.signedIn) return;
    state = state.copyWith(running: true);
    try {
      final report = await service.process();
      await refreshCounts();
      state = state.copyWith(
        running: false,
        stoppedBy: report.stoppedBy,
        clearStop: report.stoppedBy == null,
        tick: report.sent > 0 || report.failed > 0 ? state.tick + 1 : state.tick,
      );
    } catch (_) {
      state = state.copyWith(running: false);
    }
  }

  Future<void> retryFailed(String id) async {
    await ref.read(actionQueueProvider).requeue(id);
    await refreshCounts();
    unawaited(kick());
  }

  Future<void> discard(String id) async {
    await ref.read(actionQueueProvider).remove(id);
    await refreshCounts();
    state = state.copyWith(tick: state.tick + 1);
  }

  /// Số đã quét nhưng chưa gửi, theo SKU, của một nhóm — để hiện tiến độ đúng khi ngoại tuyến.
  Future<Map<String, int>> pendingPickBySku(String groupId) async {
    final items = await ref.read(actionQueueProvider).pending();
    final out = <String, int>{};
    for (final a in items) {
      if (a.kind != 'pick_item' || !a.path.contains(groupId)) continue;
      final sku = a.body['sku'];
      final qty = a.body['scanned_quantity'];
      if (sku is String && qty is num) {
        out[sku] = (out[sku] ?? 0) + qty.toInt();
      }
    }
    return out;
  }
}
