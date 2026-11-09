import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/mock_providers.dart';
import '../../shared/widgets.dart';
import 'notifications_repository.dart';
import '../../app/colors.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(notificationsProvider);

    Future<void> refresh() async {
      ref.invalidate(notificationsProvider);
      ref.invalidate(unreadCountProvider);
    }

    return Column(
      children: [
        const MockBanner(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: refresh,
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => EmptyState(icon: Icons.error_outline, text: '$e'),
              data: (items) => ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                children: [
                  Row(
                    children: [
                      Text(
                        '${items.where((n) => !n.isRead).length} chưa đọc',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const Spacer(),
                      TextButton(
                        onPressed: items.any((n) => !n.isRead)
                            ? () async {
                                await ref.read(notificationsRepositoryProvider).markAllRead();
                                await refresh();
                              }
                            : null,
                        child: const Text('Đọc hết'),
                      ),
                    ],
                  ),
                  const _PushSettingsCard(),
                  const SizedBox(height: 12),
                  if (items.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 48),
                      child: EmptyState(icon: Icons.notifications_none, text: 'Chưa có thông báo.'),
                    ),
                  for (final n in items) ...[
                    _NotificationTile(
                      item: n,
                      onTap: () async {
                        await ref.read(notificationsRepositoryProvider).markRead(n.id);
                        await refresh();
                        if (context.mounted) _showDetail(context, n);
                      },
                    ),
                    const SizedBox(height: 10),
                  ],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  void _showDetail(BuildContext context, AppNotification n) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(n.title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(n.message),
            const SizedBox(height: 12),
            Text(formatDateTime(n.createdAt), style: TextStyle(color: AppColors.inkSubtle)),
            if (n.relatedEntityType != null)
              Text(
                'Liên quan: ${n.relatedEntityType} ${n.relatedEntityId ?? ''}',
                style: TextStyle(color: AppColors.inkSubtle, fontSize: 12),
              ),
          ],
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Đóng'))],
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({required this.item, required this.onTap});

  final AppNotification item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final (color, icon) = switch (item.severity) {
      NotificationSeverity.critical => (AppColors.danger, Icons.error),
      NotificationSeverity.warning => (AppColors.warning, Icons.warning_amber_rounded),
      NotificationSeverity.info => (AppColors.stagePick, Icons.info_outline),
    };
    return Card(
      color: item.isRead ? null : color.withValues(alpha: 0.05),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: color),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title,
                      style: TextStyle(
                        fontWeight: item.isRead ? FontWeight.w500 : FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(item.message, style: TextStyle(color: AppColors.ink, fontSize: 13)),
                    const SizedBox(height: 4),
                    Text(
                      formatDateTime(item.createdAt),
                      style: TextStyle(color: AppColors.inkSubtle, fontSize: 12),
                    ),
                  ],
                ),
              ),
              if (!item.isRead)
                Container(
                  width: 10,
                  height: 10,
                  margin: const EdgeInsets.only(top: 4),
                  decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Thông báo đẩy (FCM): **BE chưa có** đăng ký thiết bị và gửi push. Công tắc bị khoá.
class _PushSettingsCard extends StatelessWidget {
  const _PushSettingsCard();

  @override
  Widget build(BuildContext context) {
    return Card(
      child: SwitchListTile(
        value: false,
        onChanged: null,
        secondary: const Icon(Icons.notifications_active_outlined),
        title: const Text('Thông báo đẩy'),
        subtitle: const Text('Báo ngay cả khi app đóng. Chờ BE hỗ trợ (đăng ký thiết bị + FCM).'),
      ),
    );
  }
}
