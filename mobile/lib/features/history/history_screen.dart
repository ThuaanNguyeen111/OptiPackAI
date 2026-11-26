import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/colors.dart';
import '../../app/mock_providers.dart';
import '../../app/providers.dart';
import '../../core/json.dart';
import '../../shared/admin_kit.dart';
import '../auth/auth_models.dart';
import '../../shared/widgets.dart';
import 'history_repository.dart';

const _weekdays = ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'];

String _two(int n) => n.toString().padLeft(2, '0');
String _date(DateTime t) => '${_two(t.day)}/${_two(t.month)}/${t.year}';
String _dayHeading(DateTime t) => '${_weekdays[t.weekday - 1]}, ${_date(t)}';

/// "Lịch sử thao tác" — cùng dữ liệu với trang Lịch sử trên web (BE tự giới hạn loại theo vai trò).
class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key});

  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen> {
  static const _pageSize = 30;

  final _sku = TextEditingController();
  final _orderCode = TextEditingController();
  List<HistoryCategory> _categories = const [];
  String? _category;
  DateTimeRange? _range;
  bool _mine = false;
  String? _actorId;
  Map<String, String> _actors = const {};

  final List<HistoryEntry> _items = [];
  int _total = 0;
  int _page = 0;
  bool _loading = false;
  Object? _error;

  /// Bỏ kết quả của lượt tải cũ khi người dùng đã đổi bộ lọc.
  int _request = 0;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      _loadCategories();
      _loadActors();
      _load(reset: true);
    });
  }

  @override
  void dispose() {
    _sku.dispose();
    _orderCode.dispose();
    super.dispose();
  }

  HistoryFilter get _filter => HistoryFilter(
        category: _category,
        from: _range?.start,
        to: _range?.end,
        mine: _mine,
        sku: _sku.text,
        orderCode: _orderCode.text,
        actorId: _actorId,
      );

  /// Admin / Chủ shop: lọc theo người làm và xuất CSV (BE chặn vai trò khác).
  bool get _isManager {
    if (ref.read(useMockDataProvider)) return false;
    final role = ref.read(authControllerProvider).user?.role;
    return role == UserRole.admin || role == UserRole.storeOwner;
  }

  Future<void> _loadActors() async {
    if (!_isManager) return;
    try {
      final rows = rowsOf(await ref.read(apiClientProvider).get('/users', query: {'limit': 100}));
      if (mounted) {
        setState(() => _actors = {
              for (final u in rows) pickString(u, ['id', '_id']): pickString(u, ['name', 'email']),
            });
      }
    } catch (_) {
      // Không lấy được danh sách người dùng thì chỉ thiếu bộ lọc này.
    }
  }

  Future<void> _copyCsv() => runAction(context, () async {
        final query = _filter.toQuery(page: 1, limit: 100)
          ..remove('page')
          ..remove('limit');
        final csv = await ref.read(apiClientProvider).get('/history/export', query: query);
        await Clipboard.setData(ClipboardData(text: '$csv'));
      }, success: 'Đã sao chép CSV — dán vào Excel hoặc email.').then((_) {});

  Future<void> _loadCategories() async {
    try {
      final list = await ref.read(historyRepositoryProvider).categories();
      if (mounted) setState(() => _categories = list);
    } catch (_) {
      // Không có bộ lọc loại thì vẫn xem được toàn bộ lịch sử.
    }
  }

  Future<void> _load({bool reset = false}) async {
    if (!mounted) return;
    final request = ++_request;
    final page = reset ? 1 : _page + 1;
    setState(() {
      _loading = true;
      _error = null;
      if (reset) {
        _items.clear();
        _total = 0;
        _page = 0;
      }
    });
    try {
      final result = await ref.read(historyRepositoryProvider).list(_filter, page: page, limit: _pageSize);
      if (!mounted || request != _request) return;
      setState(() {
        _page = page;
        _items.addAll(result.items);
        _total = result.total;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || request != _request) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  Future<void> _pickRange() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2026),
      lastDate: DateTime(now.year, now.month, now.day),
      initialDateRange: _range,
    );
    if (picked == null || !mounted) return;
    setState(() => _range = picked);
    await _load(reset: true);
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null && _items.isEmpty) {
      return ErrorState(error: _error!, onRetry: () => _load(reset: true));
    }
    final hasMore = _items.length < _total && (_page + 1) * _pageSize <= 5000;
    return RefreshIndicator(
      onRefresh: () => _load(reset: true),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          if (_categories.isNotEmpty)
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final c in [const HistoryCategory('', 'Mọi loại'), ..._categories])
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(c.label),
                        selected: (_category ?? '') == c.code,
                        onSelected: (_) {
                          setState(() => _category = c.code.isEmpty ? null : c.code);
                          _load(reset: true);
                        },
                      ),
                    ),
                ],
              ),
            ),
          ExpansionTile(
            tilePadding: EdgeInsets.zero,
            childrenPadding: const EdgeInsets.only(bottom: 8),
            title: const Text('Lọc thêm'),
            shape: const Border(),
            children: [
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Chỉ việc của tôi'),
                value: _mine,
                onChanged: (v) {
                  setState(() => _mine = v);
                  _load(reset: true);
                },
              ),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _pickRange,
                      icon: const Icon(Icons.date_range),
                      label: Text(_range == null
                          ? '30 ngày gần nhất'
                          : '${_date(_range!.start)} – ${_date(_range!.end)}'),
                    ),
                  ),
                  if (_range != null)
                    IconButton(
                      tooltip: 'Bỏ lọc ngày',
                      icon: const Icon(Icons.close),
                      onPressed: () {
                        setState(() => _range = null);
                        _load(reset: true);
                      },
                    ),
                ],
              ),
              if (_actors.isNotEmpty) ...[
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: _actorId ?? '',
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Người thao tác'),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('Mọi người')),
                    for (final a in _actors.entries) DropdownMenuItem(value: a.key, child: Text(a.value)),
                  ],
                  onChanged: (v) {
                    setState(() => _actorId = v == null || v.isEmpty ? null : v);
                    _load(reset: true);
                  },
                ),
              ],
              if (_isManager) ...[
                const SizedBox(height: 10),
                OutlinedButton.icon(
                    onPressed: _copyCsv, icon: const Icon(Icons.copy), label: const Text('Sao chép CSV theo bộ lọc')),
              ],
              const SizedBox(height: 10),
              TextField(
                controller: _orderCode,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _load(reset: true),
                decoration: const InputDecoration(labelText: 'Mã đơn sàn'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _sku,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _load(reset: true),
                decoration: const InputDecoration(labelText: 'SKU'),
              ),
            ],
          ),
          if (_items.isEmpty && !_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: EmptyState(icon: Icons.history, text: 'Không có thao tác nào khớp bộ lọc.'),
            ),
          ..._entryWidgets(_items, onOpenGroup: (id) => context.push('/timeline/$id')),
          if (_loading)
            const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()))
          else if (_error != null)
            OutlinedButton(onPressed: _load, child: const Text('Tải lỗi — thử lại'))
          else if (hasMore)
            TextButton(onPressed: _load, child: Text('Xem thêm (${_items.length}/$_total)')),
        ],
      ),
    );
  }
}

/// Danh sách mốc, chèn tiêu đề mỗi khi sang ngày khác.
List<Widget> _entryWidgets(List<HistoryEntry> items, {void Function(String groupId)? onOpenGroup}) {
  final widgets = <Widget>[];
  String? day;
  for (final item in items) {
    final heading = _dayHeading(item.occurredAt);
    if (heading != day) {
      day = heading;
      widgets.add(Padding(
        padding: const EdgeInsets.only(top: 12, bottom: 8),
        child: Text(heading, style: const TextStyle(fontWeight: FontWeight.w800)),
      ));
    }
    widgets.add(_EntryCard(item: item, onOpenGroup: onOpenGroup));
    widgets.add(const SizedBox(height: 8));
  }
  return widgets;
}

class _EntryCard extends StatelessWidget {
  const _EntryCard({required this.item, this.onOpenGroup});

  final HistoryEntry item;
  final void Function(String groupId)? onOpenGroup;

  @override
  Widget build(BuildContext context) {
    final groupId = item.orderGroupId;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(
                  '${_two(item.occurredAt.hour)}:${_two(item.occurredAt.minute)}',
                  style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w800),
                ),
                const SizedBox(width: 8),
                Flexible(child: Pill(item.categoryLabel, AppColors.primary)),
              ],
            ),
            const SizedBox(height: 6),
            Text(item.summary),
            if (item.actorName != null)
              Text(item.actorName!, style: TextStyle(fontSize: 12, color: AppColors.inkSubtle)),
            if (item.photoUrls.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [for (final url in item.photoUrls) _Thumb(url: url)],
                ),
              ),
            if (groupId != null && onOpenGroup != null)
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(onPressed: () => onOpenGroup!(groupId), child: const Text('Xem cả đơn')),
              ),
          ],
        ),
      ),
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.url});
  final String url;

  Widget _broken(BuildContext _, Object _, StackTrace? _) =>
      Icon(Icons.broken_image_outlined, color: AppColors.inkTertiary);

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => showDialog<void>(
        context: context,
        builder: (_) => Dialog(child: InteractiveViewer(child: Image.network(url, errorBuilder: _broken))),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.network(url, width: 64, height: 64, fit: BoxFit.cover, errorBuilder: _broken),
      ),
    );
  }
}

/// Dòng thời gian đầy đủ của 1 nhóm đơn (cũ → mới).
class TimelineScreen extends ConsumerStatefulWidget {
  const TimelineScreen({super.key, required this.groupId});

  final String groupId;

  @override
  ConsumerState<TimelineScreen> createState() => _TimelineScreenState();
}

class _TimelineScreenState extends ConsumerState<TimelineScreen> {
  late Future<List<HistoryEntry>> _future = _fetch();

  Future<List<HistoryEntry>> _fetch() => ref.read(historyRepositoryProvider).timeline(widget.groupId);

  void _reload() => setState(() => _future = _fetch());

  @override
  Widget build(BuildContext context) {
    final id = widget.groupId;
    final shortId = id.length > 10 ? id.substring(id.length - 10) : id;
    return Scaffold(
      appBar: AppBar(
        title: Text('Lịch sử nhóm $shortId'),
        actions: [IconButton(tooltip: 'Tải lại', icon: const Icon(Icons.refresh), onPressed: _reload)],
      ),
      body: FutureBuilder<List<HistoryEntry>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) return ErrorState(error: snap.error!, onRetry: _reload);
          final items = snap.data ?? const <HistoryEntry>[];
          if (items.isEmpty) {
            return const EmptyState(icon: Icons.history, text: 'Nhóm này chưa có mốc nào.');
          }
          return ListView(padding: const EdgeInsets.all(16), children: _entryWidgets(items));
        },
      ),
    );
  }
}
