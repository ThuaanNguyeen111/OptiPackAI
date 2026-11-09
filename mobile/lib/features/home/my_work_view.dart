import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/format/deadline.dart';
import '../../core/network/api_exception.dart';
import '../../shared/widgets.dart';
import '../warehouse/warehouse_models.dart';
import '../warehouse/warehouse_repository.dart';
import '../../app/colors.dart';

/// "Việc của tôi" của Warehouse Staff — **đã nối BE thật** (`GET /order-groups?assigned_staff_id=`).
class MyWorkView extends ConsumerWidget {
  const MyWorkView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final work = ref.watch(myWorkProvider);
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(myWorkProvider);
        await ref
            .read(myWorkProvider.future)
            .catchError((_) => const Loaded(<OrderGroupSummary>[]));
      },
      child: work.when(
        skipLoadingOnRefresh: true,
        data: (loaded) => _WorkList(loaded: loaded),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorView(
          message: e is ApiException ? e.message : 'Không tải được danh sách.',
          onRetry: () => ref.invalidate(myWorkProvider),
        ),
      ),
    );
  }
}

class _WorkList extends StatelessWidget {
  const _WorkList({required this.loaded});

  final Loaded<List<OrderGroupSummary>> loaded;

  @override
  Widget build(BuildContext context) {
    final groups = loaded.data;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        if (loaded.fromCache)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              'Đang xem bản lưu trên máy — số liệu có thể cũ.',
              style: TextStyle(color: AppColors.warning, fontWeight: FontWeight.w600),
            ),
          ),
        if (groups.isEmpty)
          Padding(
            padding: EdgeInsets.symmetric(vertical: 64),
            child: Column(
              children: [
                Icon(Icons.inventory_2_outlined, size: 56, color: AppColors.inkTertiary),
                SizedBox(height: 12),
                Text('Chưa có nhóm đơn nào giao cho bạn.', textAlign: TextAlign.center),
                SizedBox(height: 4),
                Text('Kéo xuống để tải lại.', style: TextStyle(color: AppColors.inkSubtle)),
              ],
            ),
          )
        else
          for (final g in groups) ...[
            _GroupCard(group: g),
            const SizedBox(height: 12),
          ],
      ],
    );
  }
}

class _GroupCard extends StatelessWidget {
  const _GroupCard({required this.group});

  final OrderGroupSummary group;

  @override
  Widget build(BuildContext context) {
    final deadline = group.isExpress && group.packagingDeadline != null
        ? deadlineLabel(group.packagingDeadline!, DateTime.now())
        : null;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => context.push('/pick/${group.id}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    group.shortId,
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(_platform(group.platform), style: TextStyle(color: AppColors.inkSubtle)),
                  const Spacer(),
                  const Icon(Icons.chevron_right),
                ],
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  if (group.isExpress) const Pill('Hỏa tốc', Colors.deepOrange),
                  if (deadline != null)
                    Pill(
                      deadline.text,
                      switch (deadline.tone) {
                        DeadlineTone.late => AppColors.danger,
                        DeadlineTone.soon => AppColors.warning,
                        DeadlineTone.ok => Colors.deepOrange,
                      },
                    ),
                  if (group.isOverdue) Pill('Quá hạn', AppColors.danger),
                  if (group.stockShortage) Pill('Thiếu hàng', AppColors.danger),
                  if (group.recipientNamesDiffer) Pill('Nhiều người nhận', AppColors.stagePack),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                '${group.activeOrderCount} đơn · ${_status(group.fulfillmentStatus)}',
                style: TextStyle(color: AppColors.inkSubtle),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _platform(String p) => switch (p.toLowerCase()) {
        'lazada' => 'Lazada',
        'tiktok' => 'TikTok',
        'tiki' => 'Tiki',
        'aurelle' => 'AURELLE',
        _ => p,
      };

  static String _status(String s) => switch (s) {
        'picking' => 'Đang lấy hàng',
        _ => 'Cần lấy hàng',
      };
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(32),
      children: [
        const SizedBox(height: 48),
        Icon(Icons.cloud_off_outlined, size: 56, color: AppColors.inkTertiary),
        const SizedBox(height: 12),
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: 16),
        OutlinedButton(onPressed: onRetry, child: const Text('Thử lại')),
      ],
    );
  }
}
