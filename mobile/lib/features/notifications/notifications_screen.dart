import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/mock_providers.dart';
import '../../app/providers.dart';
import '../../shared/widgets.dart';
import 'notifications_repository.dart';
import '../../app/colors.dart';
import '../../core/push/push_service.dart';
import '../auth/auth_models.dart';

/// Mã 24 ký tự trong chữ của BE chỉ giữ 8 ký tự cuối — đúng mã đang hiện ở hàng đợi.
String shortenIds(String text) =>
    text.replaceAllMapped(RegExp(r'\b[0-9a-f]{24}\b'), (m) => m[0]!.substring(16));

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
    // Cùng nguồn với huy hiệu ở chuông: đếm trên BE, không đếm trong 30 dòng đã tải.
    final serverUnread = ref.watch(unreadCountProvider).valueOrNull;

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
                final unread = serverUnread ?? items.where((n) => !n.isRead).length;
                return ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(16),
                  children: [
                    Row(
                      children: [
                        Text(
                          '$unread chưa đọc',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        const Spacer(),
                        TextButton(
                          onPressed: unread > 0
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
    // Mở đúng màn việc theo vai trò (cùng quy tắc với bấm thông báo đẩy).
    final user = ref.read(authControllerProvider).user;
    final target = !isGroup
        ? '/'
        : routeForPush(
            {'type': n.type, 'related_entity_type': n.relatedEntityType, 'related_entity_id': entityId},
            canPick: user?.isWarehouse ?? false,
            canPack: user?.role == UserRole.packagingStaff || user?.role == UserRole.admin,
          );
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        scrollable: true,
        title: Text(shortenIds(n.title)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(shortenIds(n.message)),
            const SizedBox(height: 12),
            Text(
              formatDateTime(n.createdAt),
              style: TextStyle(color: AppColors.inkSubtle),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Đóng'),
          ),
          if (target != '/')
            TextButton(
              onPressed: () {
                Navigator.pop(ctx);
                context.push(target);
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
      // Pha sẵn với màu thẻ: màu trong suốt sẽ ăn theo nền xanh phía sau, thành khối đậm.
      color: item.isRead ? null : Color.alphaBlend(color.withValues(alpha: 0.05), AppColors.surface),
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
                      shortenIds(item.title),
                      style: TextStyle(
                        fontWeight: item.isRead
                            ? FontWeight.w500
                            : FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      shortenIds(item.message),
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
    // Thu gọn: chỉ cần đọc khi không thấy push, không nên đẩy danh sách xuống.
    return const Card(
      child: ExpansionTile(
        dense: true,
        shape: Border(),
        leading: Icon(Icons.notifications_active_outlined),
        title: Text('Thông báo đẩy'),
        childrenPadding: EdgeInsets.fromLTRB(16, 0, 16, 14),
        children: [
          Text(
            'Việc gấp và việc được giao báo ngay cả khi app đóng. '
            'Không thấy thông báo thì bật quyền Thông báo cho OptiPackAI trong Cài đặt của máy.',
          ),
        ],
      ),
    );
  }
}
