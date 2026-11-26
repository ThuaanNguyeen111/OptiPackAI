import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/colors.dart';
import '../../app/providers.dart';
import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';

const returnStatusLabels = {
  'requested': 'Chờ duyệt',
  'awaiting_receipt': 'Chờ nhận hàng',
  'received': 'Chờ kiểm',
  'closed': 'Đã đóng',
  'rejected': 'Từ chối',
  'canceled': 'Đã hủy',
};

const _returnTypeLabels = {
  'return_refund': 'Trả hàng hoàn tiền',
  'refund_only': 'Chỉ hoàn tiền',
  'exchange': 'Đổi hàng',
  'failed_delivery': 'Giao thất bại',
};

/// Trả hàng: mọi trạng thái, duyệt / từ chối / hủy / tạo lại đơn đổi và xử lý hàng cách ly.
class ReturnsManageScreen extends ConsumerStatefulWidget {
  const ReturnsManageScreen({super.key});

  @override
  ConsumerState<ReturnsManageScreen> createState() => _ReturnsManageScreenState();
}

class _ReturnsManageScreenState extends ConsumerState<ReturnsManageScreen> {
  final _list = GlobalKey<LoadListState<List<Map<String, dynamic>>>>();

  /// `quarantine` = danh sách hàng cách ly, còn lại là trạng thái phiếu.
  String _tab = 'requested';

  ApiClient get _api => ref.read(apiClientProvider);
  Future<void> _reload() async => _list.currentState?.reload();

  Future<List<Map<String, dynamic>>> _load() async => _tab == 'quarantine'
      ? rowsOf(await _api.get('/returns/quarantine'))
      : rowsOf(await _api.get('/returns', query: {'status': _tab, 'limit': 100}));

  Future<void> _act(String id, String action, Map<String, dynamic> body, String success) async {
    await runAction(context, () async => _api.post('/returns/$id/$action', body: body), success: success);
    await _reload();
  }

  Future<void> _decide(Map<String, dynamic> r, String action) async {
    final reject = action == 'reject';
    final title = switch (action) {
      'approve' => 'Duyệt trả hàng?',
      'reject' => 'Từ chối trả hàng',
      _ => 'Hủy phiếu trả',
    };
    final v = await showFormSheet(context, title: title, submitLabel: 'Xác nhận', fields: [
      FormFieldSpec('note', action == 'approve' ? 'Ghi chú' : 'Lý do',
          type: FieldType.multiline, required: reject || action == 'cancel'),
    ]);
    if (v == null || !mounted) return;
    await _act(pickString(r, ['id']), action, {'expected_version': pickInt(r, ['version']), ...v}, 'Đã cập nhật phiếu.');
  }

  Future<void> _resolve(String returnId, int line, bool restock) async {
    var body = <String, dynamic>{'action': restock ? 'restock' : 'discard'};
    if (restock) {
      final v = await _pickBin();
      if (v == null || !mounted) return;
      body = {...body, ...v};
    } else {
      final ok = await confirmDialog(context, title: 'Loại bỏ hàng?', message: 'Hàng cách ly sẽ không nhập lại kho.');
      if (!ok || !mounted) return;
    }
    final path = '/returns/$returnId/quarantine/$line/resolve';
    try {
      await _api.post(path, body: body);
      if (mounted) showToast(context, 'Đã xử lý hàng cách ly.');
    } catch (e) {
      if (!mounted) return;
      // SKU đang nằm ở ô khác cùng kho: BE đòi xác nhận.
      if (e is ApiException && e.errorCode == 'WH_SKU_IN_OTHER_BIN') {
        final ok = await confirmDialog(context, title: 'SKU đang ở ô khác', message: '${errorText(e)}\nVẫn nhập vào ô này?');
        if (ok && mounted) {
          await runAction(context, () async => _api.post(path, body: {...body, 'confirm_other_bin': true}),
              success: 'Đã xử lý hàng cách ly.');
        }
      } else {
        showToast(context, errorText(e), error: true);
      }
    }
    await _reload();
  }

  /// Chọn kho rồi nhập mã ô; trả `{warehouse_id, bin_location_id}`.
  Future<Map<String, dynamic>?> _pickBin() async {
    var warehouses = <String, String>{};
    await runAction(context, () async {
      warehouses = {
        for (final w in rowsOf(await _api.get('/warehouse/warehouses')))
          pickString(w, ['id', '_id']): pickString(w, ['warehouseCode', 'warehouse_code']),
      };
    });
    if (!mounted || warehouses.isEmpty) return null;
    final v = await showFormSheet(context, title: 'Nhập lại ô bán', submitLabel: 'Nhập lại', fields: [
      FormFieldSpec('warehouse_id', 'Kho',
          type: FieldType.choice, required: true, options: warehouses, initial: warehouses.keys.first),
      const FormFieldSpec('bin_code', 'Mã ô', required: true, hint: 'VD KA-D1-P01-T01-1'),
    ]);
    if (v == null || !mounted) return null;
    String? binId;
    await runAction(context, () async {
      final res = asMap(await _api.get(
          '/warehouse/warehouses/${v['warehouse_id']}/bins/by-code/${Uri.encodeComponent(v['bin_code'] as String)}'));
      binId = pickStringOrNull(asMap(res?['bin']), ['id', '_id']);
    });
    if (binId == null) return null;
    return {'warehouse_id': v['warehouse_id'], 'bin_location_id': binId};
  }

  Widget _card(Map<String, dynamic> r) {
    final status = pickString(r, ['status']);
    return RecordCard(
      title: pickString(r, ['rmaCode', 'id']),
      lines: [
        _returnTypeLabels[r['type']] ?? pickString(r, ['type']),
        for (final i in rowsOf(r['items'])) '${pickInt(i, ['quantity'])} × ${pickString(i, ['sku', 'sellerSku'])}',
        pickString(r, ['customerNote']),
        pickString(r, ['decisionNote']),
        pickString(r, ['replacementError']),
        dateTimeText(r['createdAt']),
      ],
      pills: [
        Pill(returnStatusLabels[status] ?? status, AppColors.stageReturn),
        if (r['source'] == 'marketplace') Pill('Từ AURELLE', AppColors.primary),
        if (r['replacementStatus'] == 'failed') Pill('Tạo đơn đổi lỗi', AppColors.danger),
      ],
      actions: [
        if (status == 'requested') ...[
          CardAction('Duyệt', () => _decide(r, 'approve'), icon: Icons.check),
          CardAction('Từ chối', () => _decide(r, 'reject'), icon: Icons.close, danger: true),
        ],
        if (status == 'awaiting_receipt')
          CardAction('Hủy phiếu', () => _decide(r, 'cancel'), icon: Icons.cancel_outlined, danger: true),
        if (r['replacementStatus'] == 'failed')
          CardAction('Tạo lại đơn đổi hàng',
              () => _act(pickString(r, ['id']), 'create-replacement', const {}, 'Đã tạo đơn đổi hàng.'),
              icon: Icons.replay),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: 'Trả hàng',
      child: LoadList<List<Map<String, dynamic>>>(
        key: _list,
        resetKey: _tab,
        load: _load,
        header: [
          chipRow<String>(
            [for (final e in returnStatusLabels.entries) (e.key, e.value), ('quarantine', 'Cách ly')],
            _tab,
            (v) => setState(() => _tab = v),
          ),
          const SizedBox(height: 8),
        ],
        builder: (context, rows, _) {
          if (rows.isEmpty) return [emptyNote('Không có mục nào.')];
          if (_tab != 'quarantine') return [for (final r in rows) _card(r)];
          return [
            for (final q in rows)
              RecordCard(
                mono: true,
                title: '${pickInt(q, ['quantity'])} × ${pickString(q, ['sku', 'sellerSku'])}',
                lines: ['Phiếu ${pickString(q, ['rmaCode'])}', pickString(q, ['note'])],
                actions: [
                  CardAction('Nhập lại ô bán',
                      () => _resolve(pickString(q, ['returnId', 'id']), pickInt(q, ['lineIndex', 'line_index']), true),
                      icon: Icons.move_to_inbox),
                  CardAction('Loại bỏ',
                      () => _resolve(pickString(q, ['returnId', 'id']), pickInt(q, ['lineIndex', 'line_index']), false),
                      icon: Icons.delete_outline, danger: true),
                ],
              ),
          ];
        },
      ),
    );
  }
}
