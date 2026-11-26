import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../core/format/deadline.dart';
import '../../core/network/api_exception.dart';
import '../../shared/widgets.dart';
import '../warehouse/warehouse_logic.dart';
import '../warehouse/warehouse_models.dart';
import '../warehouse/warehouse_repository.dart';
import '../../app/colors.dart';

/// Hàng đợi lấy hàng — các mục và bộ lọc giống trang "Lấy hàng trong kho" trên web.
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

class _WorkList extends ConsumerStatefulWidget {
  const _WorkList({required this.loaded});

  final Loaded<List<OrderGroupSummary>> loaded;

  @override
  ConsumerState<_WorkList> createState() => _WorkListState();
}

class _WorkListState extends ConsumerState<_WorkList> {
  WorkTab _tab = WorkTab.toPick;
  WorkFilter _filter = WorkFilter.all;
  String _search = '';

  /// Từ khóa đã ngừng gõ, dùng để hỏi máy chủ.
  String _remoteQuery = '';
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  void _onSearch(String value) {
    setState(() => _search = value);
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      if (mounted) setState(() => _remoteQuery = value.trim());
    });
  }

  @override
  Widget build(BuildContext context) {
    final all = widget.loaded.data;
    final userId = ref.watch(authControllerProvider.select((s) => s.user?.id));
    final names = {
      for (final s in ref.watch(warehouseStaffProvider).valueOrNull ?? const <StaffOption>[])
        s.id: s.name,
    };
    final groups = queueGroups(all, tab: _tab, filter: _filter, userId: userId, search: _search);
    final query = _search.trim();
    final searchRemote = query.length >= 4;
    final remote = searchRemote && _remoteQuery == query
        ? ref.watch(groupSearchProvider(query))
        : null;
    final shown = {for (final g in groups) g.id};
    final elsewhere = [
      for (final g in remote?.valueOrNull ?? const <OrderGroupSummary>[])
        if (!shown.contains(g.id) && workTabOf(g) != null) g,
    ];
    final searching = searchRemote && (remote == null || remote.isLoading);

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        if (widget.loaded.fromCache)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              'Đang xem bản lưu trên máy — số liệu có thể cũ.',
              style: TextStyle(
                color: AppColors.warning,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final t in WorkTab.values)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text('${t.label} ${all.where((g) => inWorkTab(g, t)).length}'),
                    selected: _tab == t,
                    onSelected: (_) => setState(() => _tab = t),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: [
            for (final f in WorkFilter.values)
              FilterChip(
                label: Text(f.label),
                selected: _filter == f,
                onSelected: (_) => setState(() => _filter = f),
              ),
          ],
        ),
        const SizedBox(height: 8),
        TextField(
          onChanged: _onSearch,
          decoration: const InputDecoration(
            hintText: 'Tìm mã đơn sàn, mã nhóm, sàn',
            prefixIcon: Icon(Icons.search),
            isDense: true,
          ),
        ),
        const SizedBox(height: 12),
        if (searching)
          const Padding(
            padding: EdgeInsets.only(bottom: 12),
            child: Text('Đang tìm ở các mục khác…'),
          )
        else if (remote != null && remote.hasError)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              'Không tìm được trên máy chủ, chỉ lọc trong danh sách đang có.',
              style: TextStyle(color: AppColors.warning),
            ),
          ),
        if (groups.isEmpty && elsewhere.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 48),
            child: Column(
              children: [
                Icon(
                  Icons.inventory_2_outlined,
                  size: 56,
                  color: AppColors.inkTertiary,
                ),
                const SizedBox(height: 12),
                const Text(
                  'Không có nhóm đơn nào ở mục này.',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 4),
                Text(
                  'Kéo xuống để tải lại.',
                  style: TextStyle(color: AppColors.inkSubtle),
                ),
              ],
            ),
          )
        else
          for (final g in groups) ...[
            _GroupCard(
              key: ValueKey(g.id),
              group: g,
              assignee: assigneeLabel(g.assignedStaffId, userId, names),
            ),
            const SizedBox(height: 12),
          ],
        if (elsewhere.isNotEmpty) ...[
          const Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: Text('Ở mục khác', style: TextStyle(fontWeight: FontWeight.w700)),
          ),
          for (final g in elsewhere) ...[
            Text(
              'Mục: ${workTabOf(g)!.label}',
              style: TextStyle(fontSize: 12, color: AppColors.inkSubtle),
            ),
            const SizedBox(height: 4),
            _GroupCard(
              key: ValueKey('elsewhere-${g.id}'),
              group: g,
              assignee: assigneeLabel(g.assignedStaffId, userId, names),
            ),
            const SizedBox(height: 12),
          ],
        ],
      ],
    );
  }
}

class _GroupCard extends StatelessWidget {
  const _GroupCard({super.key, required this.group, required this.assignee});

  final OrderGroupSummary group;
  final String assignee;

  @override
  Widget build(BuildContext context) {
    final deadline = group.isExpress && group.packagingDeadline != null
        ? deadlineLabel(group.packagingDeadline!, DateTime.now())
        : null;
    return StageCard(
      accent: group.isExpress ? AppColors.stageReturn : AppColors.stagePick,
      icon: group.isExpress ? Icons.bolt : Icons.shopping_basket_outlined,
      onTap: () => context.push('/pick/${group.id}'),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Flexible(
                  child: Text(
                    group.shortId,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _platform(group.platform),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: AppColors.inkSubtle),
                  ),
                ),
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
                  Pill(deadline.text, switch (deadline.tone) {
                    DeadlineTone.late => AppColors.danger,
                    DeadlineTone.soon => AppColors.warning,
                    DeadlineTone.ok => Colors.deepOrange,
                  }),
                if (group.isOverdue) Pill('Quá hạn', AppColors.danger),
                if (group.stockShortage) Pill('Thiếu hàng', AppColors.danger),
                if (group.recipientNamesDiffer)
                  Pill('Nhiều người nhận', AppColors.stagePack),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '${group.activeOrderCount} đơn · ${fulfillmentLabel(group.fulfillmentStatus)}',
              style: TextStyle(color: AppColors.inkSubtle),
            ),
            Text(
              'Người lấy: $assignee',
              style: TextStyle(fontSize: 12, color: AppColors.inkSubtle),
            ),
          ],
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
