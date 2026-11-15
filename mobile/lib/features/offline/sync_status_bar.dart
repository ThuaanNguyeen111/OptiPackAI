import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import 'pending_action.dart';
import 'sync_service.dart';
import '../../app/colors.dart';

/// Thanh trạng thái đồng bộ, luôn hiện ở đầu màn hình (docs/MOBILE_UPDATE_CHECKLIST mục 2).
class SyncStatusBar extends ConsumerWidget {
  const SyncStatusBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(syncControllerProvider);

    late final String text;
    late final Color color;
    late final IconData icon;
    var tappable = false;

    if (s.failed > 0) {
      text = '${s.failed} thao tác lỗi — bấm để xem';
      color = AppColors.danger;
      icon = Icons.error_outline;
      tappable = true;
    } else if (s.stoppedBy == SyncStop.sessionExpired && s.pending > 0) {
      text = 'Cần đăng nhập lại để gửi ${s.pending} thao tác chờ';
      color = AppColors.warning;
      icon = Icons.lock_outline;
    } else if (!s.online) {
      text = s.pending > 0
          ? 'Ngoại tuyến — ${s.pending} thao tác chờ gửi'
          : 'Ngoại tuyến — số trên máy có thể cũ';
      color = AppColors.warning;
      icon = Icons.cloud_off_outlined;
    } else if (s.running || s.pending > 0) {
      text = s.pending > 0 ? 'Đang gửi ${s.pending} thao tác…' : 'Đang đồng bộ…';
      color = AppColors.stagePick;
      icon = Icons.sync;
    } else {
      text = 'Đã đồng bộ';
      color = AppColors.good;
      icon = Icons.check_circle_outline;
    }

    final bar = Container(
      width: double.infinity,
      color: color.withValues(alpha: 0.10),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 13),
            ),
          ),
        ],
      ),
    );
    if (!tappable) return bar;
    return InkWell(onTap: () => showFailedActions(context), child: bar);
  }
}

/// Danh sách thao tác đã lỗi nghiệp vụ: giữ nguyên `message` thật của BE, không tự xoá.
Future<void> showFailedActions(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => const _FailedActionsSheet(),
  );
}

class _FailedActionsSheet extends ConsumerStatefulWidget {
  const _FailedActionsSheet();

  @override
  ConsumerState<_FailedActionsSheet> createState() => _FailedActionsSheetState();
}

class _FailedActionsSheetState extends ConsumerState<_FailedActionsSheet> {
  late Future<List<PendingAction>> _future = ref.read(actionQueueProvider).failed();

  void _reload() => setState(() => _future = ref.read(actionQueueProvider).failed());

  @override
  Widget build(BuildContext context) {
    final sync = ref.read(syncControllerProvider.notifier);
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.7),
        child: FutureBuilder<List<PendingAction>>(
          future: _future,
          builder: (context, snap) {
            final items = snap.data ?? const <PendingAction>[];
            if (snap.connectionState != ConnectionState.done) {
              return const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: CircularProgressIndicator()),
              );
            }
            if (items.isEmpty) {
              return const Padding(
                padding: EdgeInsets.all(32),
                child: Center(child: Text('Không có thao tác lỗi.')),
              );
            }
            return ListView.separated(
              shrinkWrap: true,
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (context, i) {
                final a = items[i];
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(a.label, style: const TextStyle(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 4),
                        Text(
                          a.lastError ?? 'Lỗi không rõ',
                          style: TextStyle(color: AppColors.danger),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
                                onPressed: () async {
                                  await sync.discard(a.id);
                                  _reload();
                                },
                                child: const Text('Bỏ'),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: FilledButton(
                                style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                                onPressed: () async {
                                  await sync.retryFailed(a.id);
                                  _reload();
                                },
                                child: const Text('Gửi lại'),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
