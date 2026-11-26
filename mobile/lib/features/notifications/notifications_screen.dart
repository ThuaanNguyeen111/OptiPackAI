import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/mock_providers.dart';
import '../../app/providers.dart';
import '../../shared/widgets.dart';
import 'notifications_repository.dart';
import '../../app/colors.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  /// Các trang cũ hơn đã tải thêm (trang mới nhất nằm ở [notificationsProvider]).
  final List<AppNotification> _older = [];
  bool _hasMore = true;
  bool _loadingMore = false;

  Future<void> _loadMore(List<AppNotification> first) async {
    final all = [...first, ..._older];
    if (all.isEmpty) {
      return;
    }
    setState(() => _loadingMore = true);
    try {
      final page = await ref
          .read(notificationsRepositoryProvider)
          .list(before: all.last.createdAt);
      if (!mounted) return;
      setState(() {
        _older.addAll(page);
        _hasMore = page.length >= notificationsPageSize;
      });
    } catch (_) {
      if (mounted) {
        showToast(context, 'Không tải được thông báo cũ hơn.', error: true);
      }
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ref = this.ref;
    final async = ref.watch(notificationsProvider);

    Future<void> refresh() async {
      setState(() {
        _older.clear();
        _hasMore = true;
      });
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
              error: (e, _) => ErrorState(error: e, onRetry: refresh),
              data: (first) {
                final items = [...first, ..._older];
                final more = _hasMore && first.length >= notificationsPageSize;
                return ListView(
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
                                  await ref
                                      .read(notificationsRepositoryProvider)
                                      .markAllRead();
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
                        child: EmptyState(
                          icon: Icons.notifications_none,
                          text: 'Chưa có thông báo.',
                        ),
                      ),
                    for (final n in items) ...[
                      _NotificationTile(
                        item: n,
                        onTap: () async {
                          await ref
                              .read(notificationsRepositoryProvider)
                              .markRead(n.id);
                          await refresh();
                          if (context.mounted) _showDetail(context, n);
                        },
                      ),
                      const SizedBox(height: 10),
                    ],
                    if (more)
                      Center(
                        child: TextButton(
                          onPressed: _loadingMore
                              ? null
                              : () => _loadMore(first),
                          child: Text(
                            _loadingMore ? 'Đang tải…' : 'Xem thông báo cũ hơn',
                          ),
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
        ),
      ],
    );
  }

  void _showDetail(BuildContext context, AppNotification n) {
    final entityId = n.relatedEntityId ?? '';
    final isGroup = n.relatedEntityType == 'order_group' && entityId.isNotEmpty;
    // Chỉ người được lấy hàng mới mở được màn lấy hàng (giống khi bấm thông báo đẩy).
    final canOpenGroup =
        isGroup && (ref.read(authControllerProvider).user?.isWarehouse ?? false);
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        scrollable: true,
        title: Text(n.title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(n.message),
            const SizedBox(height: 12),
            Text(
              formatDateTime(n.createdAt),
              style: TextStyle(color: AppColors.inkSubtle),
            ),
            if (n.relatedEntityType != null)
              Text(
                'Liên quan: ${n.relatedEntityType} ${n.relatedEntityId ?? ''}',
                style: TextStyle(color: AppColors.inkSubtle, fontSize: 12),
              ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Đóng'),
          ),
          if (canOpenGroup)
            TextButton(
              onPressed: () {
                Navigator.pop(ctx);
                context.push('/pick/$entityId');
              },
              child: const Text('Mở nhóm đơn'),
            ),
        ],
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
      NotificationSeverity.warning => (
        AppColors.warning,
        Icons.warning_amber_rounded,
      ),
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
                        fontWeight: item.isRead
                            ? FontWeight.w500
                            : FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      item.message,
                      style: TextStyle(color: AppColors.ink, fontSize: 13),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      formatDateTime(item.createdAt),
                      style: TextStyle(
                        color: AppColors.inkSubtle,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              if (!item.isRead)
                Container(
                  width: 10,
                  height: 10,
                  margin: const EdgeInsets.only(top: 4),
                  decoration: BoxDecoration(
                    color: color,
                    shape: BoxShape.circle,
                  ),
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
      child: ListTile(
        leading: const Icon(Icons.notifications_active_outlined),
        title: const Text('Thông báo đẩy'),
        subtitle: const Text(
          'Việc gấp và việc được giao báo ngay cả khi app đóng. '
          'Không thấy thông báo thì bật quyền Thông báo cho OptiPackAI trong Cài đặt của máy.',
        ),
      ),
    );
  }
}
