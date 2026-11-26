/// Kế hoạch bị từ chối (`fe/src/components/packing/RejectedPlanPanel.tsx`): ba lối ra —
/// tính lại, đóng gói thủ công, trả về lấy hàng.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/colors.dart';
import '../../core/json.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';
import 'packing_api.dart';
import 'packing_logic.dart';
import 'plan_widgets.dart';

class RejectedPlanPanel extends ConsumerStatefulWidget {
  const RejectedPlanPanel({
    super.key,
    required this.groupId,
    required this.plan,
    required this.canAct,
    required this.onPlan,
    required this.onDone,
  });

  final String groupId;
  final Map<String, dynamic> plan;

  /// Packaging Staff / Admin — BE chỉ cho 2 vai trò này.
  final bool canAct;
  final ValueChanged<Map<String, dynamic>> onPlan;

  /// Xử lý xong: tải lại (nhóm rời tab Đã lấy hàng).
  final ValueChanged<String> onDone;

  @override
  ConsumerState<RejectedPlanPanel> createState() => _RejectedPlanPanelState();
}

class _RejectedPlanPanelState extends ConsumerState<RejectedPlanPanel> {
  bool _busy = false;
  String? _error;

  int get _version => pickInt(widget.plan, ['version']);

  String get _reason {
    final raw = pickString(widget.plan, ['rejectionReason']);
    final colon = raw.indexOf(':');
    final code = pickString(asMap(widget.plan['rejection']), ['reasonCode'], colon < 0 ? raw : raw.substring(0, colon));
    final note = colon < 0 ? '' : raw.substring(colon + 1).trim();
    final head = rejectReasons[code] ?? raw;
    if (note.isNotEmpty) return '$head — $note';
    return head.isEmpty ? 'Không ghi lý do' : head;
  }

  Future<void> _send(String suffix, Map<String, dynamic> body, String done) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final next = await ref
          .read(packingApiProvider)
          .write(widget.groupId, suffix, {'expected_version': _version, ...body});
      if (!mounted) return;
      widget.onPlan(next);
      if (next['status'] == 'failed') {
        setState(() => _error =
            'Không tính được: ${pickString(next, ['failureReason'], 'lỗi không rõ')}. Nhờ kho đo SKU rồi tính lại.');
        return;
      }
      widget.onDone(done);
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _backToPicking() async {
    final skus = {for (final u in unitsOfPlan(widget.plan)) u.sku};
    final form = await showFormSheet(
      context,
      title: 'Món phải lấy lại',
      submitLabel: 'Xác nhận trả về lấy hàng',
      fields: [
        FormFieldSpec('sku', 'SKU',
            type: FieldType.choice, required: true, initial: skus.firstOrNull, options: {for (final s in skus) s: s}),
        const FormFieldSpec('quantity', 'Số lượng', type: FieldType.integer, required: true, initial: '1'),
        const FormFieldSpec('restock', 'Hàng còn tốt (lấy nhầm), nhập lại kệ',
            type: FieldType.toggle, hint: 'Để tắt nếu hàng hỏng'),
        const FormFieldSpec('note', 'Ghi chú (tuỳ chọn)'),
      ],
    );
    if (form == null || !mounted) return;
    final quantity = form['quantity'] as num;
    if (quantity < 1) {
      showToast(context, 'Chọn SKU và nhập số lượng ≥ 1.', error: true);
      return;
    }
    await _send(
      '/back-to-picking',
      {
        'items': [
          {'sku': form['sku'], 'quantity': quantity, if (form['restock'] == true) 'restock': true},
        ],
        'note': ?form['note'],
      },
      'Đã trả về lấy hàng — kho quét bù số món đã khai.',
    );
  }

  Future<void> _manual() async {
    final result = await openPage<({List<Map<String, dynamic>> parcels, String note})>(
      context,
      ManualPackScreen(plan: widget.plan),
    );
    if (result == null || !mounted) return;
    await _send('/manual', {'parcels': result.parcels, 'note': result.note},
        'Đã lưu kế hoạch đóng tay — cần NGƯỜI KHÁC chấp nhận.');
  }

  @override
  Widget build(BuildContext context) {
    final rejection = asMap(widget.plan['rejection']);
    final at = dateTimeText(widget.plan['rejectedAt']);
    final locked = _busy || !widget.canAct;
    return Panel(
      color: AppColors.danger,
      children: [
        Text('Kế hoạch đã bị từ chối: $_reason', style: boldText),
        const SizedBox(height: 4),
        Text(
          'Bởi ${pickString(rejection, ['rejectedByName'], '—')}${at.isEmpty ? '' : ' · $at'}'
          '${rejection?['overdue'] == true ? ' · Quá hạn xử lý' : ''}',
          style: subtle(),
        ),
        if (_busy) const Padding(padding: EdgeInsets.only(top: 8), child: LinearProgressIndicator()),
        const SizedBox(height: 10),
        FilledButton.icon(
          onPressed: locked
              ? null
              : () => _send('/recompute', const {}, 'Đã tính kế hoạch mới — nhóm chuyển sang «Chờ chấp nhận kế hoạch».'),
          icon: const Icon(Icons.refresh),
          label: const Text('Tính lại kế hoạch'),
        ),
        const SizedBox(height: 8),
        OutlinedButton(onPressed: locked ? null : _manual, child: const Text('Đóng gói thủ công')),
        const SizedBox(height: 8),
        OutlinedButton(onPressed: locked ? null : _backToPicking, child: const Text('Trả về lấy hàng')),
        if (!widget.canAct)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('Chỉ Nhân viên đóng gói hoặc Admin xử lý được kế hoạch bị từ chối.', style: subtle()),
          ),
        if (_error != null)
          Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: AppColors.danger))),
      ],
    );
  }
}

/// Đóng gói thủ công: nhập kiện thật đã đóng, mỗi món nằm đúng một kiện của đơn mình.
class ManualPackScreen extends ConsumerStatefulWidget {
  const ManualPackScreen({super.key, required this.plan});

  final Map<String, dynamic> plan;

  @override
  ConsumerState<ManualPackScreen> createState() => _ManualPackScreenState();
}

class _ManualPackScreenState extends ConsumerState<ManualPackScreen> {
  late final List<ManualUnit> _units = unitsOfPlan(widget.plan);
  late final ({List<ManualParcel> parcels, Map<String, int> assign}) _draft =
      initialManualDraft(widget.plan, _units);
  final _note = TextEditingController();
  List<Map<String, dynamic>> _boxes = const [];
  String? _problem;

  @override
  void initState() {
    super.initState();
    ref.read(packingApiProvider).materials().then((rows) {
      if (mounted) {
        setState(() => _boxes = [
              for (final r in rows)
                if (r['isActive'] != false && (r['kind'] == 'box' || r['kind'] == 'mailer')) r,
            ]);
      }
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  void _save() {
    final problem = manualDraftProblem(_units, _draft.parcels, _draft.assign, _note.text);
    setState(() => _problem = problem);
    if (problem != null) return;
    Navigator.pop(context, (
      parcels: [
        for (final p in _draft.parcels)
          <String, dynamic>{
            'order_id': p.orderId,
            'box_code': p.boxCode,
            'item_keys': [for (final u in _units) if (_draft.assign[u.itemKey] == p.id) u.itemKey],
          },
      ],
      note: _note.text.trim(),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final orders = [for (final o in rowsOf(widget.plan['orders'])) if (pickString(o, ['orderId']).isNotEmpty) o];
    return SubPage(
      title: 'Đóng gói thủ công',
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Nhập kiện thật đã đóng: mỗi món nằm đúng 1 kiện của đơn mình. Kế hoạch đóng tay cần NGƯỜI KHÁC chấp nhận.',
            style: subtle(13),
          ),
          for (final order in orders) _orderBlock(order),
          const SizedBox(height: 12),
          TextField(
            controller: _note,
            decoration: const InputDecoration(labelText: 'Vì sao đóng thủ công (bắt buộc)'),
          ),
          if (_problem != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_problem!, style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
            ),
          const SizedBox(height: 12),
          FilledButton(onPressed: _save, child: const Text('Lưu kế hoạch đóng tay')),
        ],
      ),
    );
  }

  Widget _orderBlock(Map<String, dynamic> order) {
    final orderId = pickString(order, ['orderId']);
    final mine = [for (final p in _draft.parcels) if (p.orderId == orderId) p];
    final name = pickString(order, ['recipientName']);
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Đơn ${pickString(order, ['platformOrderId'], tail(orderId, 6))}${name.isEmpty ? '' : ' · $name'}',
                  style: boldText),
              for (final p in mine)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Choice<String>(
                          label: 'Thùng kiện ${p.id}',
                          value: p.boxCode.isEmpty ? null : p.boxCode,
                          options: {
                            // Giữ mã thùng cũ dù danh mục chưa tải xong / đã hết.
                            if (p.boxCode.isNotEmpty) p.boxCode: p.boxCode,
                            for (final b in _boxes)
                              pickString(b, ['code']):
                                  '${pickString(b, ['code'])} · ${pickString(b, ['name'])} (còn ${pickInt(b, ['qtyNew', 'quantityNew']) + pickInt(b, ['qtyReused', 'quantityReused'])})',
                          },
                          onChanged: (v) => setState(() => p.boxCode = v ?? ''),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Xoá kiện',
                        onPressed: () => setState(() {
                          _draft.parcels.remove(p);
                          _draft.assign.removeWhere((_, id) => id == p.id);
                        }),
                        icon: Icon(Icons.delete_outline, color: AppColors.danger),
                      ),
                    ],
                  ),
                ),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: () => setState(() {
                    final next = _draft.parcels.fold<int>(0, (m, p) => p.id > m ? p.id : m) + 1;
                    _draft.parcels.add(ManualParcel(next, orderId, ''));
                  }),
                  child: const Text('+ Thêm kiện cho đơn này'),
                ),
              ),
              for (final u in _units.where((u) => u.orderId == orderId))
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Row(
                    children: [
                      Expanded(child: Text(u.itemKey, style: monoText)),
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 110,
                        child: Choice<int>(
                          label: 'Kiện',
                          value: _draft.assign[u.itemKey],
                          options: {for (final p in mine) p.id: '#${p.id}'},
                          onChanged: (v) => setState(() {
                            if (v != null) _draft.assign[u.itemKey] = v;
                          }),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
