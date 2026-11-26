import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/colors.dart';
import '../../app/providers.dart';
import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';
import '../auth/role_permissions.dart';
import '../history/history_screen.dart';
import '../warehouse/warehouse_models.dart';
import 'marketplace_screen.dart';
import 'orders_screen.dart';

const _groupStatuses = [
  'awaiting_packaging',
  'picking',
  'partial_needs_review',
  'picked',
  'pending_approval',
  'approved_for_packing',
  'packed',
  'shipped',
  'delivered',
  'returned',
  'canceled',
];

List<Widget> _groupPills(Map<String, dynamic> g) => [
      Pill(fulfillmentLabel(pickString(g, ['fulfillmentStatus'])), AppColors.primary),
      if (g['orderPriority'] == 'express') Pill('Hỏa tốc', Colors.deepOrange),
      if (g['isOverdue'] == true) Pill('Quá hạn', AppColors.danger),
      if (g['stockShortage'] == true) Pill('Thiếu hàng', AppColors.danger),
      if (g['recipientNamesDiffer'] == true) Pill('Nhiều người nhận', AppColors.stagePack),
      if (g['manualLink'] != null) Pill('Liên kết tay', AppColors.primary),
      if (g['packingBlocked'] != null) Pill('Kẹt đóng gói: thiếu số đo', AppColors.warning),
    ];

/// Ba màn tách riêng như web: toàn bộ nhóm, đơn hỏa tốc, nhóm thiếu hàng.
enum OrderGroupsView {
  all('Nhóm đơn', 'Không có nhóm đơn nào khớp.'),
  express('Đơn hỏa tốc', 'Không có đơn hỏa tốc.'),
  shortage('Thiếu hàng', 'Không có nhóm nào thiếu hàng.');

  const OrderGroupsView(this.title, this.emptyText);

  final String title;
  final String emptyText;
}

const _awaitingReview = 'partial_needs_review';

bool _isShort(Map<String, dynamic> g) =>
    g['stockShortage'] == true || g['fulfillmentStatus'] == _awaitingReview;

/// BE không lọc được "thiếu tồn HOẶC chờ duyệt" nên màn Thiếu hàng gọi 2 lần rồi gộp.
Future<List<Map<String, dynamic>>> fetchViewGroups(
  ApiClient api,
  OrderGroupsView view, {
  String status = '',
  String q = '',
}) async {
  Future<List<Map<String, dynamic>>> list(Map<String, dynamic> query) async =>
      rowsOf(await api.get('/order-groups', query: {...query, 'q': q, 'limit': 100}));

  switch (view) {
    case OrderGroupsView.all:
      return list({'fulfillment_status': status});
    case OrderGroupsView.express:
      final rows = await list({'fulfillment_status': status, 'order_priority': 'express'});
      // Quá hạn lên đầu, như web.
      return [...rows.where((g) => g['isOverdue'] == true), ...rows.where((g) => g['isOverdue'] != true)];
    case OrderGroupsView.shortage:
      // Tìm theo mã: BE tìm một lần rồi lọc lại ở đây.
      if (q.isNotEmpty) return (await list(const {})).where(_isShort).toList();
      final results = await Future.wait([
        list({'fulfillment_status': _awaitingReview}),
        list({'stock_shortage': true}),
      ]);
      final seen = {for (final g in results[0]) g['id']};
      return [...results[0], ...results[1].where((g) => !seen.contains(g['id']))];
  }
}

List<String> _viewLines(Map<String, dynamic> g, OrderGroupsView view) {
  switch (view) {
    case OrderGroupsView.all:
      return const [];
    case OrderGroupsView.express:
      final deadline = dateTimeText(g['packagingDeadline']);
      return ['Hạn đóng gói: ${deadline.isEmpty ? '—' : deadline}'];
    case OrderGroupsView.shortage:
      return [
        if (g['fulfillmentStatus'] == _awaitingReview) 'Chờ duyệt lấy thiếu',
        for (final i in rowsOf(g['stockShortageItems'])) '${pickString(i, ['sku'])} thiếu ${pickInt(i, ['shortage'])}',
      ];
  }
}

class OrderGroupsScreen extends ConsumerStatefulWidget {
  const OrderGroupsScreen({super.key, this.view = OrderGroupsView.all});

  final OrderGroupsView view;

  @override
  ConsumerState<OrderGroupsScreen> createState() => _OrderGroupsScreenState();
}

class _OrderGroupsScreenState extends ConsumerState<OrderGroupsScreen> {
  final _list = GlobalKey<LoadListState<List<Map<String, dynamic>>>>();
  String _status = '';
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final view = widget.view;
    void filter(VoidCallback change) {
      setState(change);
      _list.currentState?.reload();
    }

    return SubPage(
      title: view.title,
      child: LoadList<List<Map<String, dynamic>>>(
        key: _list,
        load: () => fetchViewGroups(ref.read(apiClientProvider), view, status: _status, q: _q),
        header: [
          TextField(
            textInputAction: TextInputAction.search,
            onSubmitted: (v) => filter(() => _q = v.trim()),
            decoration: const InputDecoration(
                hintText: 'Mã nhóm hoặc mã đơn sàn', prefixIcon: Icon(Icons.search), isDense: true),
          ),
          const SizedBox(height: 8),
          // Trang Thiếu hàng đã cố định theo tình trạng thiếu nên không lọc thêm trạng thái.
          if (view != OrderGroupsView.shortage)
            chipRow<String>([('', 'Mọi trạng thái'), for (final s in _groupStatuses) (s, fulfillmentLabel(s))],
                _status, (v) => filter(() => _status = v)),
          const SizedBox(height: 8),
        ],
        builder: (context, groups, reload) => [
          if (groups.isEmpty) emptyNote(view.emptyText),
          for (final g in groups)
            RecordCard(
              mono: true,
              title: shortId(pickString(g, ['id'])),
              lines: [
                '${platformNames[g['platform']] ?? g['platform']} · '
                    '${pickInt(g, ['activeOrderCount'])}/${pickInt(g, ['orderCount'])} đơn còn hiệu lực',
                ..._viewLines(g, view),
                dateTimeText(g['createdAt']),
              ],
              pills: _groupPills(g),
              onTap: () async {
                await openPage(context,
                    OrderGroupDetailScreen(groupId: pickString(g, ['id']), canSetExpress: view != OrderGroupsView.shortage));
                await reload();
              },
            ),
        ],
      ),
    );
  }
}

class _GroupData {
  const _GroupData(this.group, this.linked, this.reservations);
  final Map<String, dynamic> group;
  final List<Map<String, dynamic>> linked;
  final List<Map<String, dynamic>> reservations;
}

class OrderGroupDetailScreen extends ConsumerStatefulWidget {
  const OrderGroupDetailScreen({super.key, required this.groupId, this.canSetExpress = true});

  final String groupId;

  /// Mở từ màn Thiếu hàng thì không đặt hỏa tốc (như web).
  final bool canSetExpress;

  @override
  ConsumerState<OrderGroupDetailScreen> createState() => _OrderGroupDetailScreenState();
}

class _OrderGroupDetailScreenState extends ConsumerState<OrderGroupDetailScreen> {
  final _list = GlobalKey<LoadListState<_GroupData>>();

  ApiClient get _api => ref.read(apiClientProvider);
  String get _base => '/order-groups/${widget.groupId}';
  Future<void> _reload() async => _list.currentState?.reload();

  Future<_GroupData> _load() async {
    final group = asMap(await _api.get(_base)) ?? {};
    // Hai phần phụ: lỗi (không có quyền, BE cũ) thì bỏ qua, không chặn trang.
    Future<List<Map<String, dynamic>>> optional(String path, String key) async {
      try {
        return rowsOf(await _api.get(path), key);
      } catch (_) {
        return const [];
      }
    }

    return _GroupData(
      group,
      await optional('$_base/linked', 'linkedGroups'),
      await optional('$_base/stock-reservation', 'lines'),
    );
  }

  Future<void> _act(Future<Object?> Function() call, String success) async {
    await runAction(context, () async => call(), success: success);
    await _reload();
  }

  Future<void> _setExpress(bool express) async {
    var body = <String, dynamic>{'order_priority': express ? 'express' : 'normal'};
    if (express) {
      final v = await showFormSheet(context, title: 'Đánh dấu hỏa tốc', fields: const [
        FormFieldSpec('deadline_hours', 'Phải đóng gói trong (giờ làm việc)',
            type: FieldType.integer, required: true, initial: 4),
      ]);
      if (v == null || !mounted) return;
      body = {...body, ...v};
    }
    await _act(() => _api.patch('$_base/priority', body: body), 'Đã đổi mức ưu tiên.');
  }

  Future<void> _link() async {
    final v = await showFormSheet(context, title: 'Liên kết với nhóm khác', fields: const [
      FormFieldSpec('target_group_id', 'Mã nhóm đầy đủ (24 ký tự)', required: true),
      FormFieldSpec('note', 'Ghi chú'),
    ]);
    if (v == null || !mounted) return;
    await _act(() => _api.post('$_base/link', body: v), 'Đã liên kết.');
  }

  Future<void> _split(String orderId, int version) async {
    final v = await showFormSheet(context,
        title: 'Tách đơn ra nhóm mới',
        note: 'Chỉ tách được khi nhóm chưa quét món nào.',
        submitLabel: 'Tách',
        fields: const [FormFieldSpec('note', 'Lý do', required: true)]);
    if (v == null || !mounted) return;
    await _act(() => _api.post('$_base/orders/$orderId/split', body: {...v, 'expected_version': version}),
        'Đã tách đơn.');
  }

  Future<void> _merge(int version) async {
    final v = await showFormSheet(context,
        title: 'Gộp nhóm khác vào nhóm này',
        note: 'Cùng sàn, cùng shop, cùng số điện thoại và chưa quét món nào.',
        submitLabel: 'Gộp',
        fields: const [
          FormFieldSpec('source_group_id', 'Mã nhóm cần gộp vào (24 ký tự)', required: true),
          FormFieldSpec('note', 'Lý do', required: true),
        ]);
    if (v == null || !mounted) return;
    await _act(() => _api.post('$_base/merge', body: {...v, 'expected_version': version}), 'Đã gộp nhóm.');
  }

  Future<void> _decidePartial(bool approve, int version) async {
    final ok = await confirmDialog(context,
        title: approve ? 'Giao phần có sẵn?' : 'Lấy lại hàng?',
        message: approve
            ? 'Nhóm tiếp tục đóng gói với số hàng đã lấy được.'
            : 'Hàng đã lấy được trả về kệ và nhóm bắt đầu lượt lấy mới.');
    if (!ok || !mounted) return;
    await _act(
        () => _api.post('$_base/fulfillment/decide-partial',
            body: {'approve': approve, 'expected_version': version}),
        'Đã ghi quyết định.');
  }

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: 'Nhóm ${shortId(widget.groupId)}',
      actions: [
        IconButton(
          tooltip: 'Lịch sử nhóm',
          icon: const Icon(Icons.history),
          onPressed: () => openPage(context, TimelineScreen(groupId: widget.groupId)),
        ),
      ],
      child: LoadList<_GroupData>(
        key: _list,
        load: _load,
        builder: (context, data, _) {
          final owner = ref.watch(isStoreOwnerProvider);
          final g = data.group;
          final version = pickInt(g, ['version']);
          final status = pickString(g, ['fulfillmentStatus']);
          final express = g['orderPriority'] == 'express';
          final orders = rowsOf(g['orders']);
          final regroupable = status == 'awaiting_packaging' || status == 'picking';
          final missing = asMap(g['missingReport']);
          return [
            SelectableText('Mã đầy đủ: ${widget.groupId}', style: TextStyle(fontSize: 12, color: AppColors.inkSubtle)),
            const SizedBox(height: 8),
            Wrap(spacing: 6, runSpacing: 6, children: _groupPills(g)),
            if (pickStringOrNull(g, ['packagingDeadline']) != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text('Hạn đóng gói: ${dateTimeText(g['packagingDeadline'])}'),
              ),
            if (missing != null) ...[
              sectionTitle('Báo thiếu hàng'),
              Text('${pickString(missing, ['sku'])} thiếu ${pickInt(missing, ['quantity'])} · '
                  '${pickString(missing, ['reporterName'])} ${pickString(missing, ['note'])}'),
            ],
            if (status == 'partial_needs_review' && owner) ...[
              const SizedBox(height: 10),
              emptyNote('Nhân viên đóng gói hoặc Admin sẽ quyết định giao phần có sẵn hay lấy lại.'),
            ],
            if (status == 'partial_needs_review' && !owner) ...[
              const SizedBox(height: 10),
              FilledButton(onPressed: () => _decidePartial(true, version), child: const Text('Giao phần có sẵn')),
              const SizedBox(height: 8),
              OutlinedButton(
                  onPressed: () => _decidePartial(false, version), child: const Text('Trả hàng về kệ, lấy lại')),
            ],
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              children: [
                if (widget.canSetExpress && g['requiresSelfDelivery'] != true)
                  OutlinedButton(
                      onPressed: () => _setExpress(!express),
                      child: Text(express ? 'Bỏ hỏa tốc' : 'Đánh dấu hỏa tốc')),
                if (!owner) OutlinedButton(onPressed: _link, child: const Text('Liên kết nhóm')),
                if (!owner && g['manualLink'] != null)
                  OutlinedButton(
                      onPressed: () => _act(() => _api.delete('$_base/link'), 'Đã bỏ liên kết.'),
                      child: const Text('Bỏ liên kết')),
                if (regroupable) OutlinedButton(onPressed: () => _merge(version), child: const Text('Gộp nhóm khác')),
              ],
            ),
            sectionTitle('Đơn trong nhóm'),
            if (orders.isEmpty) emptyNote('Máy chủ không trả danh sách đơn của nhóm.'),
            for (final o in orders)
              RecordCard(
                title: pickString(o, ['platformOrderNumber', 'platformOrderId', 'id']),
                lines: [
                  pickString(o, ['recipientName']),
                  orderStatusLabel(pickString(o, ['status'])),
                  for (final i in rowsOf(o['items'])) '${pickInt(i, ['quantity'])} × ${pickString(i, ['sku'])}',
                ],
                onTap: () => openPage(context, OrderDetailScreen(orderId: pickString(o, ['id']))),
                actions: [
                  if (regroupable && orders.length > 1)
                    CardAction('Tách ra nhóm mới', () => _split(pickString(o, ['id']), version),
                        icon: Icons.call_split),
                ],
              ),
            if (data.linked.isNotEmpty) ...[
              sectionTitle('Nhóm liên kết (giao chung được)'),
              for (final l in data.linked)
                RecordCard(
                  mono: true,
                  title: shortId(pickString(l, ['id'])),
                  pills: _groupPills(l),
                  onTap: () => openPage(context, OrderGroupDetailScreen(groupId: pickString(l, ['id']))),
                ),
            ],
            if (data.reservations.isNotEmpty) ...[
              sectionTitle('Giữ chỗ tồn kho'),
              for (final r in data.reservations)
                RecordCard(
                  mono: true,
                  title: pickString(r, ['sellerSku']),
                  lines: [
                    'Cần ${pickInt(r, ['quantityNeeded'])} · đã lấy ${pickInt(r, ['quantityPicked'])} · '
                        'giữ ${pickInt(r, ['quantityReserved'])} · thiếu ${pickInt(r, ['shortage'])}',
                    pickString(r, ['status']),
                  ],
                ),
              Wrap(
                spacing: 8,
                children: [
                  OutlinedButton(
                      onPressed: () => _act(() => _api.post('$_base/stock-reservation/recheck'), 'Đã tính lại.'),
                      child: const Text('Tính lại giữ chỗ')),
                  if (!owner)
                    OutlinedButton(
                        onPressed: () => _act(() => _api.post('$_base/stock-reservation/release'), 'Đã nhả giữ chỗ.'),
                        child: const Text('Nhả giữ chỗ')),
                ],
              ),
            ],
          ];
        },
      ),
    );
  }
}
