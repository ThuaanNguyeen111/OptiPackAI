/// Hàng đợi đóng gói — cột "Hàng đợi" của trang Đóng gói trên web (`PackagingWorkbench.tsx`):
/// 6 tab, tìm mã đơn, phạm vi "Việc của tôi / Tất cả", phân trang 10 dòng.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/colors.dart';
import '../../app/providers.dart';
import '../../core/format/deadline.dart';
import '../../core/json.dart';
import '../../core/network/api_exception.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';
import '../auth/auth_models.dart';
import 'packing_api.dart';
import 'packing_group_screen.dart';
import 'packing_logic.dart';
import 'plan_widgets.dart';

export 'packing_group_screen.dart';

const _pageSize = 10;

class PackingQueueScreen extends ConsumerStatefulWidget {
  const PackingQueueScreen({super.key});

  @override
  ConsumerState<PackingQueueScreen> createState() => _PackingQueueScreenState();
}

class _PackingQueueScreenState extends ConsumerState<PackingQueueScreen> {
  QueueTab _tab = QueueTab.picked;
  bool _tabChosen = false;
  bool _mineOnly = true;
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _all = const [];
  List<Map<String, dynamic>> _blocked = const [];
  Map<String, Map<String, dynamic>> _summaries = const {};
  final _search = TextEditingController();
  List<Map<String, dynamic>>? _remote;
  bool _searching = false;
  int _page = 1;
  int _request = 0;
  Timer? _searchTimer;
  late final Timer _clock;
  late final Timer _blockedTimer;

  PackingApi get _api => ref.read(packingApiProvider);

  @override
  void initState() {
    super.initState();
    // Đếm ngược đơn hỏa tốc; nhóm kẹt tự làm mới như web.
    _clock = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() {});
    });
    _blockedTimer = Timer.periodic(const Duration(seconds: 15), (_) => _loadBlocked());
    _load();
    _loadBlocked();
  }

  @override
  void dispose() {
    _clock.cancel();
    _blockedTimer.cancel();
    _searchTimer?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _loadBlocked() async {
    try {
      final rows = await _api.listGroups({'packing_blocked': 'true'});
      if (mounted) setState(() => _blocked = rows);
    } on ApiException {
      if (mounted) setState(() => _blocked = const []);
    }
  }

  Future<void> _load() async {
    final request = ++_request;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final user = ref.read(authControllerProvider).user;
      final List<Map<String, dynamic>> rows;
      if (user?.role == UserRole.packagingStaff && _mineOnly) {
        // Nhóm chưa có kế hoạch thì chưa có người đóng: lọc theo người đóng sẽ làm các tab này luôn trống.
        final lists = await Future.wait([
          _api.listGroups({'assigned_packer_id': user!.id}),
          for (final status in unassignedQueueStatuses) _api.listGroups({'fulfillment_status': status}),
        ]);
        rows = {for (final row in lists.expand((l) => l)) pickString(row, ['id']): row}.values.toList();
      } else {
        rows = await _api.listGroups();
      }
      var summaries = <String, Map<String, dynamic>>{};
      var withInfo = rows;
      try {
        final res = await _api.summaries([for (final r in rows) pickString(r, ['id'])]);
        summaries = res.plans;
        withInfo = [
          for (final r in rows) {...r, 'queueInfo': ?res.groups[pickString(r, ['id'])]},
        ];
      } on ApiException {
        // Không có tóm tắt thì chỉ thiếu số kiện trên thẻ.
      }
      if (!mounted || request != _request) return;
      setState(() {
        _all = withInfo;
        _summaries = summaries;
        _loading = false;
        if (!_tabChosen) {
          _tab = initialTab(rows);
          _tabChosen = true;
        }
      });
    } catch (e) {
      if (!mounted || request != _request) return;
      setState(() {
        _error = errorText(e);
        _all = const [];
        _loading = false;
      });
    }
  }

  Future<void> _refresh() => Future.wait([_load(), _loadBlocked()]);

  void _selectTab(QueueTab tab) => setState(() {
        _tab = tab;
        _page = 1;
        _remote = null;
        _onSearchChanged(_search.text);
      });

  /// Lọc tại chỗ trước; không ra kết quả mới hỏi BE (mã đơn sàn / đuôi mã nhóm).
  void _onSearchChanged(String text) {
    _searchTimer?.cancel();
    setState(() {
      _page = 1;
      _remote = null;
      _searching = false;
    });
    final query = text.trim();
    final local = groupsForTab(_tab, _all, _blocked).where((g) => matchesSearch(g, query));
    if (query.length < 4 || local.isNotEmpty) return;
    _searchTimer = Timer(const Duration(milliseconds: 400), () async {
      setState(() => _searching = true);
      var rows = <Map<String, dynamic>>[];
      try {
        rows = await _api.listGroups({'q': query});
      } on ApiException {
        rows = [];
      }
      if (mounted && _search.text.trim() == query) {
        setState(() {
          _remote = rows;
          _searching = false;
        });
      }
    });
  }

  Future<void> _open(Map<String, dynamic> group) async {
    await openPage<void>(context, PackingGroupScreen(groupId: pickString(group, ['id']), fromTab: _tab));
    if (mounted) await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).user;
    final isStaff = user?.role == UserRole.packagingStaff;
    final groups = groupsForTab(_tab, _all, _blocked);
    final local = [for (final g in groups) if (matchesSearch(g, _search.text)) g];
    final visible = _remote != null && local.isEmpty ? _remote! : local;
    final totalPages = visible.isEmpty ? 1 : (visible.length + _pageSize - 1) ~/ _pageSize;
    final page = _page.clamp(1, totalPages);
    final paged = visible.skip((page - 1) * _pageSize).take(_pageSize);
    final empty = emptyCopy(
      _tab,
      awaiting: groupsForTab(QueueTab.awaiting, _all, _blocked).length,
      picked: groupsForTab(QueueTab.picked, _all, _blocked).length,
    );

    return Column(
      children: [
        // Xuống hàng thay vì cuộn ngang: cả 6 tab và số đếm đều thấy ngay.
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Wrap(
            spacing: 6,
            children: [
              for (final tab in QueueTab.values)
                ChoiceChip(
                  showCheckmark: false,
                  visualDensity: VisualDensity.compact,
                  tooltip: tab.viewOnly ? '${tab.label} (chỉ xem)' : tab.label,
                  avatar: tab.viewOnly
                      ? Icon(Icons.visibility_outlined,
                          size: 16, color: tab == _tab ? AppColors.onPrimary : AppColors.inkSubtle)
                      : null,
                  label: Text('${tab.shortLabel} · ${groupsForTab(tab, _all, _blocked).length}'),
                  selected: tab == _tab,
                  onSelected: (_) => _selectTab(tab),
                ),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _search,
                        textInputAction: TextInputAction.search,
                        onChanged: _onSearchChanged,
                        decoration: InputDecoration(
                          hintText: 'Tìm mã đơn…',
                          isDense: true,
                          prefixIcon: const Icon(Icons.search),
                          suffixIcon: _searching
                              ? const Padding(
                                  padding: EdgeInsets.all(12),
                                  child: SizedBox(
                                      width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                                )
                              : null,
                        ),
                      ),
                    ),
                    IconButton(tooltip: 'Tải lại', onPressed: _refresh, icon: const Icon(Icons.refresh)),
                  ],
                ),
                if (_tab.viewOnly)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text('${_tab.label} — chỉ xem', style: subtle()),
                  ),
                if (isStaff)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: SegmentedButton<bool>(
                      style: const ButtonStyle(visualDensity: VisualDensity.compact),
                      segments: const [
                        ButtonSegment(value: true, label: Text('Việc của tôi')),
                        ButtonSegment(value: false, label: Text('Tất cả')),
                      ],
                      selected: {_mineOnly},
                      onSelectionChanged: (s) {
                        setState(() {
                          _mineOnly = s.first;
                          _page = 1;
                        });
                        _load();
                      },
                    ),
                  ),
                const SizedBox(height: 10),
                if (_loading) const LinearProgressIndicator(),
                if (_error != null) Text(_error!, style: TextStyle(color: AppColors.danger)),
                if (!_loading && _error == null && visible.isEmpty)
                  if (groups.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 24),
                      child: Column(
                        children: [
                          Text(empty.title, style: boldText, textAlign: TextAlign.center),
                          const SizedBox(height: 6),
                          Text(empty.body, style: subtle(13), textAlign: TextAlign.center),
                        ],
                      ),
                    )
                  else
                    emptyNote('Không có đơn khớp «${_search.text.trim()}».'),
                if (_error == null)
                  for (final g in paged)
                    QueueCard(
                      group: g,
                      summary: _summaries[pickString(g, ['id'])],
                      myUserId: isStaff ? user!.id : null,
                      onTap: () => _open(g),
                    ),
                if (visible.length > _pageSize)
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      IconButton(
                        tooltip: 'Trang trước',
                        onPressed: page > 1 ? () => setState(() => _page = page - 1) : null,
                        icon: const Icon(Icons.chevron_left),
                      ),
                      Text(
                        '${(page - 1) * _pageSize + 1}–${(page * _pageSize).clamp(0, visible.length)} / ${visible.length}',
                        style: subtle(13),
                      ),
                      IconButton(
                        tooltip: 'Trang sau',
                        onPressed: page < totalPages ? () => setState(() => _page = page + 1) : null,
                        icon: const Icon(Icons.chevron_right),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class QueueCard extends StatelessWidget {
  const QueueCard({super.key, required this.group, required this.onTap, this.summary, this.myUserId});

  final Map<String, dynamic> group;
  final Map<String, dynamic>? summary;
  final String? myUserId;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final express = group['orderPriority'] == 'express';
    final packer = pickString(group, ['assignedPackerName']);
    final mine = myUserId != null && group['assignedPackerId'] == myUserId;
    final active = activeOrders(group);
    final total = pickInt(group, ['orderCount']);
    final clock = expressClock(group, DateTime.now());
    final skus = blockedSkus(group);
    final info = queueInfoLines(group);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(tail(pickString(group, ['id'])),
                          style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w800, fontSize: 15)),
                    ),
                    if (express)
                      Pill('Hỏa tốc', AppColors.warning)
                    else
                      Text(pickString(group, ['platform']), style: subtle()),
                  ],
                ),
                if (info != null) ...[
                  const SizedBox(height: 6),
                  if (info.who.isNotEmpty)
                    Text(info.who,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
                  if (info.items.isNotEmpty)
                    Text(info.items, maxLines: 1, overflow: TextOverflow.ellipsis, style: subtle()),
                ],
                const SizedBox(height: 8),
                Row(
                  children: [
                    CircleAvatar(
                      radius: 11,
                      backgroundColor: AppColors.primary.withValues(alpha: 0.14),
                      child: Text(packer.isEmpty ? '' : packer.trim()[0].toUpperCase(),
                          style: TextStyle(fontSize: 11, color: AppColors.primary, fontWeight: FontWeight.w700)),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '${packer.isEmpty ? 'Chưa giao' : packer}${mine ? ' (bạn)' : ''}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12.5, fontStyle: packer.isEmpty ? FontStyle.italic : null),
                      ),
                    ),
                    Text(
                      '${active == total ? '$total' : '$active/$total'} đơn'
                      '${summary == null ? '' : ' · ${pickInt(summary, ['parcels'])} kiện'}',
                      style: subtle(),
                    ),
                  ],
                ),
                if (express)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text.rich(TextSpan(children: [
                      TextSpan(text: '${pickString(group, ['platform'])} · ', style: subtle()),
                      if (clock != null)
                        TextSpan(
                          text: clock.text,
                          style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: clockColor(clock.tone)),
                        ),
                    ])),
                  ),
                if (isPartiallyCanceled(group))
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('Một phần đơn đã hủy',
                        style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.warningText)),
                  ),
                if (skus.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('Chưa đo: ${skus.join(', ')}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.danger)),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

Color clockColor(DeadlineTone tone) => switch (tone) {
      DeadlineTone.late => AppColors.danger,
      DeadlineTone.soon => AppColors.warningText,
      DeadlineTone.ok => AppColors.inkMuted,
    };
