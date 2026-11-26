import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/colors.dart';
import '../../app/providers.dart';
import '../../core/format/units.dart';
import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';
import '../history/history_screen.dart';
import '../warehouse/warehouse_models.dart';

const adjustmentReasonLabels = {
  'PRODUCT_MORE_FRAGILE_THAN_EXPECTED': 'Hàng dễ vỡ hơn dự kiến',
  'RECOMMENDED_BOX_NOT_IN_STOCK': 'Thùng gợi ý không có sẵn',
  'ITEM_DIMENSION_WRONG': 'Sai kích thước sản phẩm',
  'ITEM_WEIGHT_WRONG': 'Sai khối lượng sản phẩm',
  'BOX_TOO_TIGHT': 'Thùng quá chật',
  'BOX_TOO_LOOSE': 'Thùng quá rộng',
  'BOX_SPEC_WRONG': 'Sai số đo thùng',
  'TOO_MANY_PARCELS': 'Quá nhiều kiện',
  'ITEM_DAMAGED': 'Hàng hư hỏng',
  'OTHER': 'Lý do khác',
};

const _rejectReasons = {
  ...adjustmentReasonLabels,
  'SPECIAL_PACKING_NEEDED': 'Cần đóng gói đặc biệt',
  'PLAN_UNREALISTIC': 'Phương án không làm được',
};

const _reviewReasons = {
  'SCALE_ERROR': 'Cân lỗi hoặc đặt lệch',
  'MATERIALS_HEAVIER': 'Vật tư nặng hơn ước tính',
  'PRODUCT_WEIGHT_WRONG': 'Sai khối lượng sản phẩm',
  'WRONG_ITEM_INSIDE': 'Bỏ nhầm hàng',
  'OTHER': 'Lý do khác',
};

const _planStatusLabels = {
  'computing': 'Đang tính',
  'ready': 'Chờ chấp nhận',
  'approved': 'Chờ đóng',
  'packing': 'Đang đóng',
  'packed': 'Đã đóng',
  'rejected': 'Bị từ chối',
  'failed': 'Tính lỗi',
};

const _parcelStatusLabels = {
  'pending': 'Chưa niêm phong',
  'sealed': 'Đã niêm phong',
  'held': 'Bị giữ do lệch cân',
  'to_unpack': 'Phải tháo',
  'voided': 'Đã tháo',
};

const _queueStatuses = ['picked', 'pending_approval', 'approved_for_packing', 'packed'];

/// Đóng gói (quản lý): mọi thao tác trên kế hoạch ngoài việc quét và niêm phong ở màn Đóng gói.
class PackingAdminScreen extends ConsumerStatefulWidget {
  const PackingAdminScreen({super.key});

  @override
  ConsumerState<PackingAdminScreen> createState() => _PackingAdminScreenState();
}

class _PackingAdminScreenState extends ConsumerState<PackingAdminScreen> {
  String _status = 'pending_approval';

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: 'Quản lý đóng gói',
      child: LoadList<List<Map<String, dynamic>>>(
        resetKey: _status,
        load: () async => rowsOf(await ref
            .read(apiClientProvider)
            .get('/order-groups', query: {'fulfillment_status': _status, 'limit': 100})),
        header: [
          chipRow<String>([for (final s in _queueStatuses) (s, fulfillmentLabel(s))], _status,
              (s) => setState(() => _status = s)),
          const SizedBox(height: 8),
        ],
        builder: (context, groups, reload) => [
          if (groups.isEmpty) emptyNote('Không có nhóm nào ở bước này.'),
          for (final g in groups)
            RecordCard(
              mono: true,
              title: shortId(pickString(g, ['id'])),
              lines: [
                '${g['platform']} · ${pickInt(g, ['activeOrderCount'])} đơn',
                if (g['assignedPackerName'] != null) 'Người đóng: ${g['assignedPackerName']}',
              ],
              pills: [
                if (g['orderPriority'] == 'express') Pill('Hỏa tốc', Colors.deepOrange),
                if (g['packingBlocked'] != null) Pill('Thiếu số đo SKU', AppColors.warning),
              ],
              onTap: () async {
                await openPage(context, PlanManageScreen(groupId: pickString(g, ['id'])));
                await reload();
              },
            ),
        ],
      ),
    );
  }
}

class PlanManageScreen extends ConsumerStatefulWidget {
  const PlanManageScreen({super.key, required this.groupId});

  final String groupId;

  @override
  ConsumerState<PlanManageScreen> createState() => _PlanManageScreenState();
}

class _PlanManageScreenState extends ConsumerState<PlanManageScreen> {
  final _list = GlobalKey<LoadListState<Map<String, dynamic>>>();

  ApiClient get _api => ref.read(apiClientProvider);
  String get _base => '/order-groups/${widget.groupId}/packing-plan';

  /// BE bọc kế hoạch trong `{ plan }` ở một số route.
  static Map<String, dynamic> _planOf(Object? raw) {
    final m = asMap(raw) ?? {};
    return asMap(m['plan']) ?? m;
  }

  Future<void> _post(String path, Map<String, dynamic> body, String success) async {
    await runAction(context, () async => _api.post('$_base$path', body: body), success: success);
    await _list.currentState?.reload();
  }

  Future<Map<String, String>> _boxOptions() async {
    var out = <String, String>{};
    await runAction(context, () async {
      out = {
        for (final b in rowsOf(await _api.get('/packaging/boxes')))
          '${b['code']}': '${b['code']} · còn ${b['available'] ?? b['quantityOnHand']}',
      };
    });
    return out;
  }

  Future<void> _recompute(int version) async {
    final boxes = await _boxOptions();
    if (!mounted) return;
    final v = await showFormSheet(context, title: 'Tính lại kế hoạch', submitLabel: 'Tính lại', fields: [
      const FormFieldSpec('prefer', 'Ưu tiên',
          type: FieldType.choice, options: {'fewest_parcels': 'Ít kiện nhất', 'cheapest': 'Rẻ nhất'}),
      FormFieldSpec('exclude_box_codes', 'Không dùng các thùng', type: FieldType.multi, options: boxes),
    ]);
    if (v == null || !mounted) return;
    await _post('/recompute', {...v, if (version > 0) 'expected_version': version}, 'Đã tính lại.');
  }

  Future<void> _approve(int version) async {
    final v = await showFormSheet(context, title: 'Chấp nhận kế hoạch', submitLabel: 'Chấp nhận', fields: const [
      FormFieldSpec('override_reason', 'Lý do (bắt buộc khi vượt số kiện tối đa)'),
    ]);
    if (v == null || !mounted) return;
    await _post('/approve', {...v, 'expected_version': version}, 'Đã chấp nhận.');
  }

  Future<void> _reject(int version) async {
    var staff = <String, String>{};
    try {
      staff = {
        for (final s in rowsOf(await _api.get('/packing/staff')))
          pickString(s, ['staffId', 'id']): pickString(s, ['fullName', 'name']),
      };
    } catch (_) {}
    if (!mounted) return;
    final v = await showFormSheet(context, title: 'Từ chối kế hoạch', submitLabel: 'Từ chối', fields: [
      const FormFieldSpec('reason', 'Lý do', type: FieldType.choice, required: true, options: _rejectReasons),
      const FormFieldSpec('note', 'Ghi chú', type: FieldType.multiline),
      if (staff.isNotEmpty) FormFieldSpec('owner_id', 'Người xử lý', type: FieldType.choice, options: staff),
    ]);
    if (v == null || !mounted) return;
    await _post('/reject', {...v, 'expected_version': version}, 'Đã từ chối.');
  }

  Future<void> _backToPicking(int version) async {
    final v = await showFormSheet(context, title: 'Trả về bước lấy hàng', submitLabel: 'Trả về', fields: const [
      FormFieldSpec('sku', 'SKU cần lấy lại', required: true),
      FormFieldSpec('quantity', 'Số lượng', type: FieldType.integer, required: true, initial: 1),
      FormFieldSpec('restock', 'Hàng còn tốt, nhập lại kệ', type: FieldType.toggle),
      FormFieldSpec('note', 'Ghi chú'),
    ]);
    if (v == null || !mounted) return;
    await _post('/back-to-picking', {
      'expected_version': version,
      if (v['note'] != null) 'note': v['note'],
      'items': [
        {'sku': v['sku'], 'quantity': v['quantity'], 'restock': v['restock']},
      ],
    }, 'Đã trả nhóm về bước lấy hàng.');
  }

  Future<void> _manual(Map<String, dynamic> plan, int version) async {
    final boxes = await _boxOptions();
    if (!mounted) return;
    // Giữ cách chia món hiện tại theo từng đơn, người dùng chỉ chọn lại thùng cho từng kiện.
    final parcels = rowsOf(plan['parcels']);
    if (parcels.isEmpty) {
      showToast(context, 'Kế hoạch chưa có kiện nào để đóng thủ công trên điện thoại. Dùng web.', error: true);
      return;
    }
    final v = await showFormSheet(context, title: 'Đóng gói thủ công', submitLabel: 'Tạo kế hoạch', fields: [
      for (final p in parcels)
        FormFieldSpec('box_${p['parcelNo']}', 'Thùng cho kiện ${p['parcelNo']}',
            type: FieldType.choice, required: true, options: boxes, initial: asMap(p['box'])?['code']),
      const FormFieldSpec('note', 'Lý do đóng thủ công', required: true),
    ]);
    if (v == null || !mounted) return;
    await _post('/manual', {
      'expected_version': version,
      'note': v['note'],
      'parcels': [
        for (final p in parcels)
          {
            'order_id': p['orderId'],
            'box_code': v['box_${p['parcelNo']}'],
            'item_keys': [for (final i in rowsOf(p['placements'])) i['itemKey']],
          },
      ],
    }, 'Đã tạo kế hoạch thủ công. Người khác phải chấp nhận.');
  }

  Future<void> _assignPacker() async {
    var staff = <String, String>{};
    await runAction(context, () async {
      staff = {
        for (final s in rowsOf(await _api.get('/packing/staff')))
          pickString(s, ['staffId', 'id']):
              '${pickString(s, ['fullName', 'name'])} (${pickInt(s, ['openPlans', 'activeWorkload'])} việc)',
      };
    });
    if (!mounted) return;
    final v = await showFormSheet(context, title: 'Giao người đóng gói', submitLabel: 'Giao', fields: [
      FormFieldSpec('staff_id', 'Nhân viên (để trống = tự động)', type: FieldType.choice, options: staff),
    ]);
    if (v == null || !mounted) return;
    await _post('/assign', {'mode': v['staff_id'] == null ? 'auto' : 'manual', ...v}, 'Đã giao người đóng.');
  }

  Future<void> _quickPack(Map<String, dynamic> plan, int version) async {
    final open = [for (final p in rowsOf(plan['parcels'])) if (p['status'] == null || p['status'] == 'pending') p];
    final v = await showFormSheet(context,
        title: 'Đóng nhanh (không quét)',
        note: 'Nhập cân thật từng kiện. Nhóm nhiều đơn hoặc cài đặt bắt quét sẽ bị từ chối.',
        submitLabel: 'Đóng gói',
        fields: [
          for (final p in open)
            FormFieldSpec('w_${p['parcelNo']}', 'Cân kiện ${p['parcelNo']} (kg)', type: FieldType.decimal, required: true),
        ]);
    if (v == null || !mounted) return;
    await _post('/pack', {
      'expected_version': version,
      'parcels': [
        for (final p in open) {'parcel_no': p['parcelNo'], 'weight_kg': v['w_${p['parcelNo']}']},
      ],
    }, 'Đã đóng gói.');
  }

  // ---- Theo kiện ----

  Future<void> _changeBox(int no, int version, bool inSession) async {
    final boxes = await _boxOptions();
    if (!mounted) return;
    final v = await showFormSheet(context, title: 'Đổi thùng kiện $no', submitLabel: 'Đổi thùng', fields: [
      FormFieldSpec('box_code', 'Thùng mới', type: FieldType.choice, required: true, options: boxes),
      const FormFieldSpec('reason', 'Lý do',
          type: FieldType.choice, required: true, options: adjustmentReasonLabels),
      if (inSession)
        const FormFieldSpec('old_box_outcome', 'Thùng cũ',
            type: FieldType.choice, required: true, options: {'unused': 'Chưa dùng, cất lại', 'damaged': 'Đã hỏng'}),
      const FormFieldSpec('note', 'Ghi chú'),
    ]);
    if (v == null || !mounted) return;
    await _post('/parcels/$no/${inSession ? 'change-box-in-session' : 'change-box'}',
        {...v, 'expected_version': version}, 'Đã đổi thùng.');
  }

  Future<void> _moveItem(Map<String, dynamic> plan, Map<String, dynamic> parcel, int version) async {
    final no = pickInt(parcel, ['parcelNo']);
    final v = await showFormSheet(context, title: 'Chuyển món khỏi kiện $no', submitLabel: 'Chuyển', fields: [
      FormFieldSpec('item_key', 'Món', type: FieldType.choice, required: true, options: {
        for (final i in rowsOf(parcel['placements'])) '${i['itemKey']}': '${i['sku']} (${i['itemKey']})',
      }),
      FormFieldSpec('to', 'Sang kiện (để trống = tách kiện mới)', type: FieldType.choice, options: {
        for (final p in rowsOf(plan['parcels']))
          if (p['parcelNo'] != no && p['orderId'] == parcel['orderId']) '${p['parcelNo']}': 'Kiện ${p['parcelNo']}',
      }),
      const FormFieldSpec('reason', 'Lý do', type: FieldType.choice, required: true, options: adjustmentReasonLabels),
      const FormFieldSpec('note', 'Ghi chú'),
    ]);
    if (v == null || !mounted) return;
    final to = v.remove('to');
    await _post('/parcels/$no/move-item',
        {...v, 'to_parcel_no': to == null ? null : int.parse(to as String), 'expected_version': version},
        'Đã chuyển món.');
  }

  Future<void> _review(int no, int version) async {
    final v = await showFormSheet(context,
        title: 'Duyệt kiện $no lệch cân',
        note: 'Người niêm phong không được tự chấp nhận kiện của mình.',
        submitLabel: 'Ghi quyết định',
        fields: const [
          FormFieldSpec('action', 'Quyết định',
              type: FieldType.choice,
              required: true,
              options: {'accept': 'Chấp nhận', 'reweigh': 'Cân lại', 'reopen': 'Mở lại kiện'}),
          FormFieldSpec('reason', 'Lý do', type: FieldType.choice, required: true, options: _reviewReasons),
          FormFieldSpec('weight_kg', 'Cân mới (kg, khi cân lại)', type: FieldType.decimal),
          FormFieldSpec('rescan', 'Quét lại từ đầu (khi mở lại)', type: FieldType.toggle),
          FormFieldSpec('note', 'Ghi chú'),
        ]);
    if (v == null || !mounted) return;
    await _post('/parcels/$no/review', {...v, 'expected_version': version}, 'Đã ghi quyết định.');
  }

  Future<void> _unseal(int no, int version) async {
    final v = await showFormSheet(context, title: 'Mở niêm phong kiện $no', submitLabel: 'Mở niêm phong', fields: const [
      FormFieldSpec('reason', 'Lý do', type: FieldType.choice, required: true, options: adjustmentReasonLabels),
      FormFieldSpec('box_condition', 'Thùng',
          type: FieldType.choice, required: true, options: {'reusable': 'Dùng lại được', 'damaged': 'Đã hỏng'}),
      FormFieldSpec('rescan', 'Quét lại từ đầu', type: FieldType.toggle),
      FormFieldSpec('note', 'Ghi chú'),
    ]);
    if (v == null || !mounted) return;
    await _post('/parcels/$no/unseal', {...v, 'expected_version': version}, 'Đã mở niêm phong.');
  }

  Future<void> _unpack(int no, int version) async {
    final v = await showFormSheet(context, title: 'Tháo kiện $no', submitLabel: 'Xác nhận đã tháo', fields: const [
      FormFieldSpec('box_condition', 'Thùng',
          type: FieldType.choice, required: true, options: {'reusable': 'Dùng lại được', 'damaged': 'Đã hỏng'}),
      FormFieldSpec('note', 'Ghi chú'),
    ]);
    if (v == null || !mounted) return;
    await _post('/parcels/$no/unpack', {...v, 'expected_version': version}, 'Đã tháo kiện.');
  }

  Widget _parcel(Map<String, dynamic> plan, Map<String, dynamic> p, int version) {
    final planStatus = pickString(plan, ['status']);
    final status = pickString(p, ['status'], 'pending');
    final no = pickInt(p, ['parcelNo']);
    final box = asMap(p['box']);
    final items = <String, int>{};
    for (final i in rowsOf(p['placements'])) {
      items.update('${i['sku']}', (n) => n + 1, ifAbsent: () => 1);
    }
    final inSession = planStatus == 'approved' || planStatus == 'packing';
    return RecordCard(
      title: 'Kiện $no · ${pickString(box, ['code'])}',
      lines: [
        pickString(p, ['recipientName']),
        for (final e in items.entries) '${e.value} × ${e.key}',
        'Ước tính ${formatGAsKg(pickInt(p, ['estimatedWeightG']))}'
            '${p['actualWeightKg'] == null ? '' : ' · cân thật ${formatKg(pickDouble(p, ['actualWeightKg']))}'}',
      ],
      pills: [
        Pill(_parcelStatusLabels[status] ?? status,
            status == 'held' ? AppColors.danger : status == 'sealed' ? AppColors.good : AppColors.primary),
      ],
      actions: [
        if (planStatus == 'ready') ...[
          CardAction('Đổi thùng', () => _changeBox(no, version, false), icon: Icons.inventory_2_outlined),
          CardAction('Chuyển món', () => _moveItem(plan, p, version), icon: Icons.drive_file_move_outline),
        ],
        if (inSession && status == 'pending')
          CardAction('Đổi thùng khi đang đóng', () => _changeBox(no, version, true), icon: Icons.inventory_2_outlined),
        if (status == 'held') CardAction('Duyệt kiện lệch cân', () => _review(no, version), icon: Icons.scale),
        if ((status == 'sealed' || status == 'held') && (planStatus == 'packing' || planStatus == 'packed'))
          CardAction('Mở niêm phong', () => _unseal(no, version), icon: Icons.lock_open),
        if (status == 'to_unpack') CardAction('Tháo kiện', () => _unpack(no, version), icon: Icons.unarchive_outlined),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: 'Kế hoạch ${shortId(widget.groupId)}',
      actions: [
        IconButton(
          tooltip: 'Lịch sử nhóm',
          icon: const Icon(Icons.history),
          onPressed: () => openPage(context, TimelineScreen(groupId: widget.groupId)),
        ),
      ],
      child: LoadList<Map<String, dynamic>>(
        key: _list,
        load: () async => _planOf(await _api.get(_base)),
        builder: (context, plan, _) {
          if (plan.isEmpty || plan['status'] == null) {
            return [
              emptyNote('Nhóm này chưa có kế hoạch đóng gói.'),
              FilledButton(onPressed: () => _recompute(0), child: const Text('Tính kế hoạch')),
            ];
          }
          final version = pickInt(plan, ['version']);
          final status = pickString(plan, ['status']);
          final session = asMap(plan['session']);
          final totals = asMap(plan['totals']);
          final editable = const {'ready', 'failed', 'rejected'}.contains(status);
          return [
            RecordCard(
              title: _planStatusLabels[status] ?? status,
              lines: [
                pickString(plan, ['failureReason']),
                if (totals != null)
                  '${pickInt(totals, ['parcels'])} kiện · bao bì ${formatVnd(pickDouble(totals, ['packagingCostVnd']))}',
                'Người đóng: ${pickString(session, ['assignedPackerName'], 'chưa giao')}',
                for (final o in rowsOf(plan['orders']))
                  for (final e in (o['explanation'] is List ? o['explanation'] as List : const [])) '$e',
              ],
              pills: [if (plan['catalogStale'] == true) Pill('Danh mục đã đổi — nên tính lại', AppColors.warning)],
            ),
            Wrap(
              spacing: 8,
              children: [
                if (status == 'ready') FilledButton(onPressed: () => _approve(version), child: const Text('Chấp nhận')),
                if (status == 'ready') OutlinedButton(onPressed: () => _reject(version), child: const Text('Từ chối')),
                if (editable) OutlinedButton(onPressed: () => _recompute(version), child: const Text('Tính lại')),
                if (status == 'rejected')
                  OutlinedButton(onPressed: () => _manual(plan, version), child: const Text('Đóng thủ công')),
                if (status == 'rejected')
                  OutlinedButton(onPressed: () => _backToPicking(version), child: const Text('Trả về lấy hàng')),
                if (status == 'approved')
                  OutlinedButton(
                      onPressed: () => _post('/undo-approve', {'expected_version': version}, 'Đã hoàn tác.'),
                      child: const Text('Hoàn tác chấp nhận')),
                if (status == 'approved')
                  OutlinedButton(
                      onPressed: () => _post('/start', {'expected_version': version}, 'Đã bắt đầu đóng.'),
                      child: const Text('Bắt đầu đóng')),
                if (status == 'approved' || status == 'packing')
                  OutlinedButton(onPressed: () => _quickPack(plan, version), child: const Text('Đóng nhanh')),
                if (status == 'packing')
                  OutlinedButton(
                      onPressed: () => _post('/finish', {'expected_version': version}, 'Đã kết thúc phiên đóng.'),
                      child: const Text('Kết thúc phiên')),
                if (const {'ready', 'approved', 'packing'}.contains(status))
                  OutlinedButton(onPressed: _assignPacker, child: const Text('Giao người đóng')),
              ],
            ),
            sectionTitle('Các kiện'),
            for (final p in rowsOf(plan['parcels'])) _parcel(plan, p, version),
          ];
        },
      ),
    );
  }
}
