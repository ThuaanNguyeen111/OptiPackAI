import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/colors.dart';
import '../../app/providers.dart';
import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';
import 'marketplace_screen.dart';

const orderStatusLabels = {
  'unpaid': 'Chưa thanh toán',
  'pending': 'Chờ xử lý',
  'topack': 'Chờ đóng gói',
  'packed': 'Đã đóng gói',
  'toship': 'Chờ giao',
  'ready_to_ship': 'Sẵn sàng giao',
  'shipped': 'Đang giao',
  'delivered': 'Đã giao',
  'canceled': 'Đã hủy',
  'returned': 'Đã hoàn',
  'failed': 'Thất bại',
  'failed_delivery': 'Giao thất bại',
};

String orderStatusLabel(String s) => orderStatusLabels[s] ?? s;

/// Danh sách đơn đa sàn, có tìm kiếm, lọc trạng thái và xem tiếp.
class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  final _search = TextEditingController();
  final List<Map<String, dynamic>> _orders = [];
  String _status = '';
  String? _cursor;
  bool _loading = false;
  String? _error;
  int _request = 0;

  @override
  void initState() {
    super.initState();
    Future.microtask(() => _load(reset: true));
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load({bool reset = false}) async {
    if (!mounted) return;
    final request = ++_request;
    setState(() {
      _loading = true;
      _error = null;
      if (reset) {
        _orders.clear();
        _cursor = null;
      }
    });
    try {
      final res = asMap(await ref.read(apiClientProvider).get('/orders', query: {
        'limit': 30,
        'status': _status,
        'q': _search.text.trim(),
        'before': _cursor,
      }));
      if (!mounted || request != _request) return;
      setState(() {
        _orders.addAll(rowsOf(res, 'orders'));
        _cursor = pickStringOrNull(res, ['nextCursor']);
        _loading = false;
      });
    } catch (e) {
      if (!mounted || request != _request) return;
      setState(() {
        _error = errorText(e);
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: 'Đơn hàng',
      child: RefreshIndicator(
        onRefresh: () => _load(reset: true),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            TextField(
              controller: _search,
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _load(reset: true),
              decoration: const InputDecoration(
                  hintText: 'Mã đơn hoặc tên người nhận', prefixIcon: Icon(Icons.search), isDense: true),
            ),
            const SizedBox(height: 8),
            chipRow<String>(
              [('', 'Tất cả'), for (final e in orderStatusLabels.entries) (e.key, e.value)],
              _status,
              (v) {
                setState(() => _status = v);
                _load(reset: true);
              },
            ),
            const SizedBox(height: 10),
            for (final o in _orders)
              RecordCard(
                title: pickString(o, ['platformOrderNumber', 'platformOrderId']),
                lines: [
                  '${pickString(o, ['recipientName'])} · ${pickString(o, ['recipientCity'])}',
                  '${platformNames[o['platform']] ?? o['platform']} · ${pickInt(o, ['itemCount'])} món · '
                      '${formatVnd(pickDouble(o, ['totalAmount']))}',
                  dateTimeText(o['createdAt']),
                ],
                pills: [
                  Pill(orderStatusLabel(pickString(o, ['status'])), AppColors.primary),
                  if (o['isConsolidated'] == true) Pill('Đã gộp', AppColors.stagePack),
                ],
                onTap: () async {
                  await openPage(context, OrderDetailScreen(orderId: pickString(o, ['id'])));
                },
              ),
            if (_error != null) ...[
              emptyNote(_error!),
              OutlinedButton(onPressed: _load, child: const Text('Thử lại')),
            ] else if (_loading)
              const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()))
            else if (_orders.isEmpty)
              emptyNote('Không có đơn nào khớp.')
            else if (_cursor != null)
              TextButton(onPressed: _load, child: const Text('Xem thêm đơn cũ hơn')),
          ],
        ),
      ),
    );
  }
}

class OrderDetailScreen extends ConsumerStatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  final _list = GlobalKey<LoadListState<Map<String, dynamic>>>();

  ApiClient get _api => ref.read(apiClientProvider);

  Future<void> _sellerCancel() async {
    final v = await showFormSheet(context,
        title: 'Hủy đơn (người bán)',
        note: 'Khách sẽ thấy đơn bị người bán hủy. Không hoàn tác được.',
        submitLabel: 'Hủy đơn',
        fields: const [FormFieldSpec('reason', 'Lý do', type: FieldType.multiline, required: true)]);
    if (v == null || !mounted) return;
    if (await runAction(context,
        () async => _api.post('/order-groups/orders/${widget.orderId}/seller-cancel', body: v),
        success: 'Đã hủy đơn.')) {
      await _list.currentState?.reload();
    }
  }

  Future<void> _labels() async {
    Map<String, dynamic>? res;
    await runAction(context, () async {
      res = asMap(await _api.get('/orders/${widget.orderId}/marketplace-labels'));
    });
    if (res == null || !mounted) return;
    final links = [res!['shippingLabelUrl'], res!['shippingStampUrl']].whereType<String>().join('\n');
    if (links.isEmpty) {
      showToast(context, 'Sàn chưa cấp nhãn cho đơn này.', error: true);
      return;
    }
    await showSecret(context, title: 'Nhãn của sàn', value: links, note: 'Mở liên kết trên trình duyệt để in.');
  }

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: 'Chi tiết đơn',
      child: LoadList<Map<String, dynamic>>(
        key: _list,
        load: () async => asMap(await _api.get('/orders/${widget.orderId}')) ?? {},
        builder: (context, o, _) {
          final platform = pickString(o, ['platform']);
          final status = pickString(o, ['status']);
          final cancellable = platform == 'aurelle' &&
              o['sellerCanceled'] != true &&
              const {'unpaid', 'pending', 'packed', 'ready_to_ship', 'topack', 'toship'}.contains(status);
          final area = [o['recipientWard'], o['recipientDistrict'], o['recipientProvince'], o['recipientCity']]
              .whereType<String>()
              .where((s) => s.isNotEmpty)
              .toSet()
              .join(', ');
          return [
            RecordCard(
              title: pickString(o, ['platformOrderNumber', 'platformOrderId']),
              lines: [
                '${platformNames[platform] ?? platform} · shop ${pickString(o, ['shopId'])}',
                '${pickString(o, ['recipientName'])} · ${pickString(o, ['recipientPhone'], '—')}',
                area,
                'Tổng tiền ${formatVnd(pickDouble(o, ['totalAmount']))} · ${pickString(o, ['paymentMethod'], '—')}',
                if (pickDouble(o, ['codAmountVnd']) > 0) 'Thu hộ ${formatVnd(pickDouble(o, ['codAmountVnd']))}',
                dateTimeText(o['createdAt']),
              ],
              pills: [
                Pill(orderStatusLabel(status), AppColors.primary),
                if (o['sellerCanceled'] == true) Pill('Người bán đã hủy', AppColors.danger),
                if (o['needCancelConfirm'] == true) Pill('Chờ xác nhận hủy trên sàn', AppColors.warning),
                if (o['origin'] == 'replacement') Pill('Đơn đổi hàng', AppColors.stageReturn),
              ],
            ),
            sectionTitle('Sản phẩm'),
            for (final i in rowsOf(o['items']))
              RecordCard(
                mono: true,
                title: '${pickInt(i, ['quantity'])} × ${pickString(i, ['sku'])}',
                lines: [
                  pickString(i, ['name']),
                  pickString(i, ['variation']),
                  orderStatusLabel(pickString(i, ['status'])),
                ],
              ),
            if (platform == 'tiki')
              OutlinedButton.icon(
                  onPressed: _labels, icon: const Icon(Icons.print_outlined), label: const Text('Nhãn của sàn')),
            if (cancellable)
              OutlinedButton.icon(
                onPressed: _sellerCancel,
                icon: Icon(Icons.cancel_outlined, color: AppColors.danger),
                label: Text('Hủy đơn (người bán)', style: TextStyle(color: AppColors.danger)),
              ),
          ];
        },
      ),
    );
  }
}
