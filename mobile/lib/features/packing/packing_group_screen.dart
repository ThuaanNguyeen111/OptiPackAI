/// Chi tiết một nhóm đơn — cột giữa và cột hướng dẫn của trang Đóng gói trên web (`PackagingWorkbench.tsx`),
/// xếp dọc theo đúng thứ tự khối của web ở màn hẹp.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/colors.dart';
import '../../app/providers.dart';
import '../../core/format/units.dart';
import '../../core/json.dart';
import '../../core/network/api_exception.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';
import '../admin/catalog_screen.dart';
import '../auth/auth_models.dart';
import '../proof/proof_photo_field.dart';
import '../proof/proof_photo_repository.dart';
import '../warehouse/warehouse_models.dart';
import 'packing_api.dart';
import 'packing_logic.dart';
import 'packing_screens.dart' show clockColor;
import 'packing_session_panel.dart';
import 'parcel_3d_screen.dart';
import 'plan_widgets.dart';
import 'rejected_plan_panel.dart';

class PackingGroupScreen extends ConsumerStatefulWidget {
  const PackingGroupScreen({super.key, required this.groupId, this.fromTab});

  final String groupId;

  /// Tab đang đứng ở hàng đợi (chỉ cần để phân biệt tab "Kẹt").
  final QueueTab? fromTab;

  @override
  ConsumerState<PackingGroupScreen> createState() => _PackingGroupScreenState();
}

class _PackingGroupScreenState extends ConsumerState<PackingGroupScreen> {
  Map<String, dynamic>? _group;
  Map<String, dynamic>? _plan;
  bool _loading = true;
  String? _loadError;
  String? _actionError;
  bool _busy = false;
  List<Map<String, dynamic>> _boxes = const [];
  String? _boxError;
  List<Map<String, dynamic>> _staff = const [];
  bool _requireScan = false;
  bool _requireSealPhoto = false;
  Map<String, dynamic>? _boxSources;
  int? _parcelNo;
  bool _compare = false;

  // Đóng nhanh: cân, nguồn thùng, ảnh theo từng kiện.
  Map<int, String> _weights = {};
  final Map<int, BoxSourceInput> _quickSources = {};
  final Map<int, List<XFile>> _quickPhotos = {};

  final Set<String> _guideRequested = {};
  Timer? _poll;
  late final Timer _clock;

  PackingApi get _api => ref.read(packingApiProvider);
  CurrentUser? get _user => ref.read(authControllerProvider).user;
  bool get _isStaff => _user?.role == UserRole.packagingStaff;
  bool get _canAssign => _isStaff || _user?.role == UserRole.admin;
  int get _planVersion => pickInt(_plan, ['version']);
  String get _status => pickString(_group, ['fulfillmentStatus']);

  QueueTab? get _tab {
    if (widget.fromTab == QueueTab.blocked && asMap(_group?['packingBlocked']) != null && _status == 'picked') {
      return QueueTab.blocked;
    }
    return QueueTab.ofStatus(_status);
  }

  @override
  void initState() {
    super.initState();
    _clock = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() {});
    });
    _reload();
    _loadStatic();
  }

  @override
  void dispose() {
    _clock.cancel();
    _poll?.cancel();
    super.dispose();
  }

  /// Cài đặt và danh sách người đóng không đổi theo thao tác trên nhóm.
  Future<void> _loadStatic() async {
    try {
      final settings = await _api.settings();
      if (mounted) {
        setState(() {
          _requireScan = settings['requireScan'] == true;
          _requireSealPhoto = settings['requireSealPhoto'] == true;
        });
      }
    } on ApiException {
      // Không đọc được cài đặt thì không chặn phía máy, BE vẫn kiểm.
    }
    await _loadBoxes();
    if (_canAssign) await _loadStaff();
  }

  Future<void> _loadBoxes() async {
    try {
      final rows = await _api.materials();
      if (mounted) {
        setState(() {
          _boxes = [for (final r in rows) if (r['kind'] == 'box' && r['isActive'] != false) r];
          _boxError = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _boxError = e.message);
    }
  }

  Future<void> _loadStaff() async {
    try {
      final rows = await _api.staff();
      if (mounted) setState(() => _staff = rows);
    } on ApiException {
      if (mounted) setState(() => _staff = const []);
    }
  }

  Future<void> _reload() async {
    try {
      final group = await _api.group(widget.groupId);
      if (!mounted) return;
      _group = group;
      final tab = _tab;
      // Thiếu hàng / kho đang lấy / kẹt: không cần kế hoạch để thao tác.
      final needsPlan = tab != QueueTab.partial && tab != QueueTab.awaiting && tab != QueueTab.blocked;
      Map<String, dynamic>? plan;
      if (needsPlan) {
        try {
          plan = await _api.plan(widget.groupId);
        } on ApiException catch (e) {
          if (e.statusCode != 404) rethrow;
        }
      }
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = null;
        _applyPlan(plan, resetWeights: true);
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _loadError = errorText(e);
      });
    }
  }

  /// Gán kế hoạch mới (gọi trong setState) rồi chạy các việc kéo theo.
  void _applyPlan(Map<String, dynamic>? plan, {bool resetWeights = false}) {
    final versionChanged = plan?['version'] != _plan?['version'] || plan?['id'] != _plan?['id'];
    _plan = plan;
    final parcels = parcelsOf(plan);
    if (!parcels.any((p) => parcelNoOf(p) == _parcelNo)) {
      _parcelNo = parcels.isEmpty ? null : parcelNoOf(parcels.first);
    }
    if (resetWeights) _weights = {for (final p in parcels) parcelNoOf(p): weightPrefill(p)};
    if (versionChanged) {
      _quickSources.clear();
      _loadBoxSources();
    }
    _watchComputing();
    _autoGuide();
  }

  void _keepPlan(Map<String, dynamic> next, {bool resetWeights = false}) {
    if (mounted) setState(() => _applyPlan(retainProfileStale(_plan, next), resetWeights: resetWeights));
  }

  Future<void> _loadBoxSources() async {
    if (_plan == null) {
      _boxSources = null;
      return;
    }
    try {
      final data = await _api.boxSources(widget.groupId);
      if (mounted) setState(() => _boxSources = data);
    } on ApiException {
      if (mounted) setState(() => _boxSources = null);
    }
  }

  /// Kế hoạch đang tính: hỏi lại mỗi 3 giây tới khi có kết quả.
  void _watchComputing() {
    if (_plan?['status'] != 'computing') {
      _poll?.cancel();
      _poll = null;
      return;
    }
    _poll ??= Timer.periodic(const Duration(seconds: 3), (_) async {
      try {
        final next = await _api.plan(widget.groupId);
        if (next != null && next['status'] != 'computing' && mounted) await _reload();
      } on ApiException {
        // Lần sau thử lại.
      }
    });
  }

  /// Mở kiện chưa có câu hướng dẫn thì xin một lần. Kiện xếp tay thì không gọi (BE trả 409).
  Future<void> _autoGuide() async {
    final plan = _plan;
    final parcel = selectParcel(plan, _parcelNo);
    if (plan == null ||
        parcel == null ||
        parcel['guide'] != null ||
        parcel['manualLayout'] == true ||
        rowsOf(parcel['placements']).isEmpty ||
        !const {'ready', 'approved', 'packing'}.contains(plan['status'])) {
      return;
    }
    final no = parcelNoOf(parcel);
    if (!_guideRequested.add('${plan['id']}:$no')) return;
    try {
      final next = await _api.write(widget.groupId, '/parcels/$no/guide');
      if (mounted && next['id'] == _plan?['id']) _keepPlan(next);
    } on ApiException {
      // Không viết được thì người dùng bấm "Viết hướng dẫn".
    }
  }

  /// Mất mạng sau khi bấm (không biết đã lưu chưa) hoặc 409: báo rồi tải lại.
  void _fail(Object error) {
    if (!mounted) return;
    final uncertain = error is ApiException && error.isNetwork;
    final message = uncertain ? 'Chưa chắc đã lưu, đang tải lại…' : errorText(error);
    setState(() => _actionError = message);
    showToast(context, message, error: true);
    if (uncertain || (error is ApiException && error.isConflict)) _reload();
  }

  Future<bool> _act(Future<void> Function() action, {String? success, bool reload = true}) async {
    setState(() {
      _busy = true;
      _actionError = null;
    });
    try {
      await action();
      if (mounted && success != null) showToast(context, success);
      if (reload) await _reload();
      return true;
    } catch (e) {
      _fail(e);
      return false;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<Map<String, dynamic>> _writePlan(String suffix, [Map<String, dynamic> body = const {}]) =>
      _api.write(widget.groupId, suffix, {'expected_version': _planVersion, ...body});

  // ---- Chờ chấp nhận ----

  Future<void> _approve() async {
    final plan = _plan;
    if (plan == null) return;
    String? override;
    if (overParcelLimit(plan)) {
      final form = await showFormSheet(
        context,
        title: 'Chấp nhận kế hoạch',
        note: 'Kế hoạch vượt số kiện cho phép.',
        submitLabel: 'Chấp nhận thực hiện',
        fields: const [FormFieldSpec('reason', 'Lý do chấp nhận khi vượt số kiện', required: true)],
      );
      if (form == null || !mounted) return;
      override = '${form['reason']}';
      if (override.length < 3) {
        showToast(context, 'Lý do cần ít nhất 3 ký tự.', error: true);
        return;
      }
    }
    final first = parcelsOf(plan).firstOrNull;
    if (first != null) {
      final ok = await confirmDialog(
        context,
        title: 'Xác nhận thùng',
        message: 'Chấp nhận kế hoạch với thùng ${pickString(boxOf(first), ['name', 'code'])} '
            '(${pickString(boxOf(first), ['code'])})?',
        confirmLabel: 'Xác nhận',
      );
      if (!ok || !mounted) return;
    }
    await _act(
      () => _writePlan('/approve', {'override_reason': ?override}),
      success: 'Đã chấp nhận — xem hướng dẫn 3D, rồi bấm «Xác nhận đã đóng gói» khi gói xong.',
    );
  }

  Future<void> _reject() async {
    final form = await showFormSheet(
      context,
      title: 'Từ chối & gửi Admin',
      note: 'Chọn lý do. Nhóm quay về đã lấy hàng và Admin nhận thông báo.',
      submitLabel: 'Gửi từ chối',
      fields: const [
        FormFieldSpec('reason', 'Lý do từ chối',
            type: FieldType.choice, required: true, initial: 'BOX_TOO_LOOSE', options: rejectReasons),
        FormFieldSpec('note', 'Ghi chú', type: FieldType.multiline, hint: 'Bắt buộc khi chọn lý do Khác'),
      ],
    );
    if (form == null || !mounted) return;
    if (form['reason'] == 'OTHER' && '${form['note'] ?? ''}'.length < 3) {
      showToast(context, 'Nhập ghi chú (ít nhất 3 ký tự) khi lý do là Khác.', error: true);
      return;
    }
    final ok = await confirmDialog(
      context,
      title: 'Từ chối kế hoạch này?',
      message: 'Lý do sẽ gửi Admin — nhóm quay về đã lấy hàng.',
      confirmLabel: 'Từ chối',
      danger: true,
    );
    if (!ok || !mounted) return;
    await _act(() => _writePlan('/reject', form), success: 'Đã từ chối — Admin đã được thông báo.');
  }

  Future<void> _changeBox() async {
    final form = await showFormSheet(
      context,
      title: 'Điều chỉnh thùng',
      submitLabel: 'Đổi thùng',
      fields: [
        FormFieldSpec('parcel', 'Kiện',
            type: FieldType.choice,
            required: true,
            initial: '$_parcelNo',
            options: {
              for (final p in parcelsOf(_plan))
                '${parcelNoOf(p)}': '#${parcelNoOf(p)} ${pickString(boxOf(p), ['code'])}',
            }),
        FormFieldSpec('box_code', 'Thùng trong danh mục', type: FieldType.choice, required: true, options: {
          for (final b in _boxes) pickString(b, ['code']): '${pickString(b, ['name'])} (${pickString(b, ['code'])})',
        }),
        const FormFieldSpec('reason', 'Lý do điều chỉnh',
            type: FieldType.choice,
            required: true,
            initial: 'RECOMMENDED_BOX_NOT_IN_STOCK',
            options: adjustmentReasons),
        const FormFieldSpec('note', 'Ghi chú', hint: 'Bắt buộc khi chọn lý do Khác'),
      ],
    );
    if (form == null || !mounted) return;
    if (form['reason'] == 'OTHER' && form['note'] == null) {
      showToast(context, 'Nhập ghi chú khi chọn lý do Khác.', error: true);
      return;
    }
    final no = form.remove('parcel');
    final code = '${form['box_code']}';
    final name = pickString(_boxes.where((b) => b['code'] == code).firstOrNull, ['name'], code);
    final ok = await confirmDialog(
      context,
      title: 'Xác nhận thùng',
      message: 'Đổi sang thùng $name ($code)?',
      confirmLabel: 'Xác nhận',
    );
    if (!ok || !mounted) return;
    if (form['reason'] != 'OTHER') form.remove('note');
    await _act(() => _writePlan('/parcels/$no/change-box', form), success: 'Đã đổi thùng.');
  }

  Future<void> _recompute() =>
      _act(() => _writePlan('/recompute'), success: 'Đã gửi tính lại kế hoạch.');

  // ---- Người đóng gói ----

  Future<void> _assign(Map<String, dynamic> body, String success) async {
    if (await _act(() => _api.write(widget.groupId, '/assign', body), success: success)) await _loadStaff();
  }

  Future<void> _pickPacker(String? currentId) async {
    final picked = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheet) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            ListTile(
              leading: Icon(Icons.shuffle, color: AppColors.primary),
              title: const Text('Tự gán'),
              subtitle: const Text('Giao cho người ít việc nhất'),
              onTap: () => Navigator.pop(sheet, <String, dynamic>{'mode': 'auto'}),
            ),
            const Divider(height: 1),
            Padding(padding: const EdgeInsets.fromLTRB(16, 10, 16, 4), child: Text('Nhân viên đóng gói', style: subtle())),
            if (_staff.isEmpty) const ListTile(title: Text('Chưa có nhân viên đóng gói.')),
            for (final person in _staff)
              ListTile(
                enabled: person['onLeave'] != true && person['staffId'] != currentId,
                title: Text(pickString(person, ['fullName'])),
                trailing: person['staffId'] == currentId
                    ? Icon(Icons.check, color: AppColors.primary)
                    : Text(person['onLeave'] == true ? 'nghỉ phép' : '${pickInt(person, ['activeWorkload'])} việc',
                        style: subtle()),
                onTap: () => Navigator.pop(
                    sheet, <String, dynamic>{'mode': 'manual', 'staff_id': person['staffId']}),
              ),
          ],
        ),
      ),
    );
    if (picked != null && mounted) await _assign(picked, 'Đã gán người đóng gói.');
  }

  Future<void> _writeGuide() async {
    final parcel = selectParcel(_plan, _parcelNo);
    if (parcel == null) return;
    await _act(() async {
      final next = await _api.write(widget.groupId, '/parcels/${parcelNoOf(parcel)}/guide', {'regenerate': true});
      _keepPlan(next);
    }, success: 'Đã lấy hướng dẫn.', reload: false);
  }

  // ---- Đang đóng / thiếu hàng ----

  Future<void> _undoApprove() => _act(
        () => _writePlan('/undo-approve'),
        success: 'Đã quay lại chờ chấp nhận. Có thể chấp nhận hoặc từ chối lại.',
      );

  Future<void> _decidePartial(bool approve) => _act(
        () => _api.decidePartial(widget.groupId, approve, pickInt(_group, ['version'])),
        success: approve ? 'Đã giao phần có sẵn.' : 'Đã hủy — nhóm về awaiting_packaging.',
      );

  Future<void> _quickPack() async {
    final pending = [for (final p in parcelsOf(_plan)) if (parcelStatusOf(p) == 'pending') p];
    final rows = <({int no, double weight})>[];
    for (final p in pending) {
      final weight = parseWeight(_weights[parcelNoOf(p)] ?? '');
      if (weight == null) {
        setState(() => _actionError = 'Nhập cân từng kiện từ 0,001 đến 100 kg.');
        return;
      }
      rows.add((no: parcelNoOf(p), weight: weight));
    }
    final infos = rowsOf(_boxSources?['parcels']);
    for (final row in rows) {
      final info = infos.where((p) => pickInt(p, ['parcelNo']) == row.no).firstOrNull;
      final problem = (_quickSources[row.no] ?? const BoxSourceInput()).errorFor(info);
      if (problem != null) {
        setState(() => _actionError = '#${row.no}: $problem');
        return;
      }
    }
    if (_requireSealPhoto) {
      final missing = [for (final r in rows) if ((_quickPhotos[r.no] ?? const []).isEmpty) '#${r.no}'];
      if (missing.isNotEmpty) {
        setState(() => _actionError = 'Chụp ít nhất 1 ảnh cho kiện ${missing.join(', ')}.');
        return;
      }
    }
    final ok = await confirmDialog(
      context,
      title: 'Xác nhận đã đóng gói?',
      message: [for (final r in rows) 'Kiện #${r.no}: ${formatKg(r.weight)}'].join('\n'),
      confirmLabel: 'Đã đóng gói',
    );
    if (!ok || !mounted) return;
    final upload = ref.read(proofPhotoRepositoryProvider);
    bool completed = false;
    final done = await _act(() async {
      final parcels = <Map<String, dynamic>>[];
      for (final row in rows) {
        final urls = await upload.upload(_quickPhotos[row.no] ?? const []);
        parcels.add({
          'parcel_no': row.no,
          'weight_kg': row.weight,
          if (urls.isNotEmpty) 'photo_urls': urls,
          ...(_quickSources[row.no] ?? const BoxSourceInput()).toBody(),
        });
      }
      completed = await _api.pack(widget.groupId, _planVersion, parcels);
    });
    if (done && mounted) {
      showToast(
          context,
          completed
              ? 'Đã xác nhận đóng gói xong — nhóm chuyển sang packed.'
              : 'Đã gửi cân. Còn kiện lệch cân, nhóm chưa packed.');
      await _loadBoxes();
    }
  }

  // ---- Giao diện ----

  @override
  Widget build(BuildContext context) {
    final group = _group;
    final tab = _tab;
    final canApprove = tab == QueueTab.pendingApproval && _plan != null;
    return Scaffold(
      appBar: AppBar(
        title: Text(group == null ? 'Đóng gói' : '${pickString(group, ['platform'])} #${tail(widget.groupId)}'),
        actions: [IconButton(tooltip: 'Tải lại', onPressed: _reload, icon: const Icon(Icons.refresh))],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : group == null
              ? ErrorState(error: ApiException(message: _loadError ?? 'Không tải được nhóm.'), onRetry: _reload)
              : RefreshIndicator(
                  onRefresh: _reload,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                    children: [
                      if (_busy) const LinearProgressIndicator(),
                      if (_loadError != null) Text(_loadError!, style: TextStyle(color: AppColors.danger)),
                      ..._header(group, tab),
                      ..._assignRow(group),
                      ..._tabPanels(group, tab),
                      if (tab == QueueTab.picked) ..._pickedPanel(),
                      if (tab != QueueTab.partial && tab != QueueTab.awaiting) ..._planSection(group, canApprove),
                      ..._items(group),
                      if (_actionError != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Text(_actionError!, style: TextStyle(color: AppColors.danger)),
                        ),
                      ..._viewerSection(tab),
                    ],
                  ),
                ),
      bottomNavigationBar: canApprove
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _busy ? null : _reject,
                        style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.danger, padding: const EdgeInsets.symmetric(horizontal: 6)),
                        child: const Text('Từ chối & gửi Admin', textAlign: TextAlign.center),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton(
                        onPressed: _busy ? null : _approve,
                        style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 6)),
                        child: const Text('Chấp nhận thực hiện', textAlign: TextAlign.center),
                      ),
                    ),
                  ],
                ),
              ),
            )
          : null,
    );
  }

  List<Widget> _header(Map<String, dynamic> group, QueueTab? tab) {
    final clock = expressClock(group, DateTime.now());
    final packBy = dateTimeText(group['packagingDeadline']);
    final deliverBy = dateTimeText(group['deliveryDeadline']);
    return [
      Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            if (group['orderPriority'] == 'express') Pill('Hỏa tốc', AppColors.warning),
            if (clock != null)
              Pill(clock.text, clockColor(clock.tone))
            else if (group['isOverdue'] == true)
              Pill('Quá hạn', AppColors.danger),
            // Trạng thái trùng tên tab thì bỏ; chỉ hiện khi khác.
            if (tab == null || (tab != QueueTab.blocked && tab.status != _status))
              Pill(fulfillmentLabel(_status), AppColors.stagePack),
            if (tab != null) Pill(tab.label, AppColors.primary),
          ],
        ),
      ),
      if (packBy.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Hạn đóng gói: $packBy')),
      if (deliverBy.isNotEmpty) Text('Hạn giao khách: $deliverBy'),
      if (group['requiresSelfDelivery'] == true)
        Text('Shop tự giao — không tạo vận đơn hãng ở bước đóng gói.', style: subtle()),
    ];
  }

  List<Widget> _assignRow(Map<String, dynamic> group) {
    final plan = _plan;
    if (!_canAssign ||
        plan == null ||
        !const {'ready', 'approved', 'packing'}.contains(plan['status']) ||
        (_status != 'pending_approval' && _status != 'approved_for_packing')) {
      return const [];
    }
    final session = asMap(plan['session']);
    final id = pickStringOrNull(session, ['assignedPackerId']);
    final name = pickString(session, ['assignedPackerName'], id == null ? 'Chưa giao' : tail(id, 6));
    final me = _user?.id;
    return [
      const SizedBox(height: 10),
      Card(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 6, 4, 6),
          child: Row(
            children: [
              CircleAvatar(
                radius: 15,
                backgroundColor: AppColors.primary.withValues(alpha: 0.14),
                child: Icon(Icons.person_outline, size: 18, color: AppColors.primary),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Người đóng gói', style: subtle(11.5)),
                    Text('$name${id != null && id == me ? ' (bạn)' : ''}',
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: boldText),
                  ],
                ),
              ),
              if (_isStaff && me != null && id != me)
                TextButton(
                  onPressed: _busy
                      ? null
                      : () => _assign({'mode': 'manual', 'staff_id': me}, 'Đã nhận việc đóng gói nhóm này.'),
                  child: const Text('Giao cho tôi'),
                ),
              TextButton(onPressed: _busy ? null : () => _pickPacker(id), child: const Text('Đổi')),
            ],
          ),
        ),
      ),
    ];
  }

  List<Widget> _tabPanels(Map<String, dynamic> group, QueueTab? tab) {
    const gap = SizedBox(height: 12);
    if (tab == QueueTab.awaiting) {
      return [
        gap,
        Panel(color: AppColors.warning, children: const [
          Text('Kho đang lấy đơn này. Packaging Staff chỉ xem — không thao tác.', style: boldText),
        ]),
      ];
    }
    if (tab == QueueTab.blocked) {
      final blocked = asMap(group['packingBlocked']);
      final skus = blockedSkus(group);
      return [
        gap,
        Panel(color: AppColors.danger, children: [
          Text(
            blocked?['reason'] == 'missing_product_master'
                ? 'Không tính được kế hoạch vì SKU chưa có trên Product Master.'
                : 'Không tính được kế hoạch vì SKU chưa đo hồ sơ đóng gói.',
            style: boldText,
          ),
          if (skus.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(skus.join(', '), style: monoText)),
          const SizedBox(height: 8),
          if (_user?.role == UserRole.admin)
            OutlinedButton(
              onPressed: () async {
                await openPage<void>(context, const CatalogScreen());
                if (mounted) await _reload();
              },
              child: const Text('Mở hồ sơ kho / SKU'),
            )
          else
            Text('Nhờ Admin hoặc kho đo hồ sơ SKU rồi tính lại kế hoạch.', style: subtle()),
        ]),
      ];
    }
    if (tab == QueueTab.packing) return [gap, _approvedPanel(group)];
    if (tab == QueueTab.partial) {
      final report = asMap(group['missingReport']);
      final at = dateTimeText(report?['at']);
      return [
        gap,
        Panel(color: AppColors.warning, children: [
          const Text('Kho đã báo thiếu hàng. Chọn giao phần có sẵn hoặc lấy lại.', style: boldText),
          if (report != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text([
                'Thiếu: ${pickString(report, ['sku'])} ${pickInt(report, ['quantity'])}/${pickInt(report, ['ordered'])}',
                'báo bởi ${pickString(report, ['reporterName'], '—')}${at.isEmpty ? '' : ' $at'}',
                if (pickString(report, ['note']).isNotEmpty) pickString(report, ['note']),
              ].join(' · ')),
            ),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: _busy ? null : () => _decidePartial(true),
            icon: const Icon(Icons.check_circle_outline),
            label: const Text('Giao phần có sẵn'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _busy ? null : () => _decidePartial(false),
            icon: const Icon(Icons.cancel_outlined),
            label: const Text('Lấy lại (trả hàng đã lấy về kệ)'),
          ),
          const SizedBox(height: 6),
          Text('Đơn AURELLE thiếu hàng sẽ được báo giao thiếu (short_shipped) về website.', style: subtle()),
        ]),
      ];
    }
    return const [];
  }

  Widget _approvedPanel(Map<String, dynamic> group) {
    final plan = _plan;
    final canSession = plan != null && (plan['status'] == 'approved' || plan['status'] == 'packing');
    final scanLocked = _requireScan || group['packScanRequired'] == true;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Panel(color: AppColors.good, children: [
          const Text('Đã chấp nhận kế hoạch. Xem hướng dẫn 3D bên dưới, đóng gói xong rồi bấm xác nhận.', style: boldText),
          if (_canAssign && canSession)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: OutlinedButton(
                onPressed: _busy ? null : _undoApprove,
                child: const Text('Quay lại chờ chấp nhận'),
              ),
            ),
        ]),
        if (canSession) ...[
          const SizedBox(height: 10),
          PackingSessionPanel(
            groupId: widget.groupId,
            plan: plan,
            boxes: _boxes,
            requireSealPhoto: _requireSealPhoto,
            onPlan: (next) {
              _keepPlan(next, resetWeights: true);
              // Niêm phong kiện cuối thì BE tự chuyển nhóm sang packed.
              if (next['status'] == 'packed') {
                showToast(context, 'Đã đóng gói xong — nhóm chuyển sang packed.');
                _reload().then((_) => _loadBoxes());
              }
            },
            onError: _fail,
          ),
        ],
        if (quickPackStarted(plan))
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text('Đã quét hoặc niêm phong kiện trong phiên — đóng tiếp bằng phiên đóng gói phía trên.',
                style: subtle()),
          )
        else if (scanLocked)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              group['packScanRequired'] == true
                  ? quickPackBlockedCopy(group)
                  : 'Cài đặt đang bắt buộc quét từng món. Dùng phiên đóng gói phía trên, không bấm đóng nhanh.',
              style: subtle(),
            ),
          )
        else if (plan != null)
          ..._quickPackFields(plan),
      ],
    );
  }

  List<Widget> _quickPackFields(Map<String, dynamic> plan) {
    final layout = groupParcelsByOrder(parcelsOf(plan));
    return [
      sectionTitle('Cân từng kiện (kg)'),
      for (final bucket in layout.groups) ...[
        if (layout.multi) Text(bucket.heading, style: boldText),
        for (final parcel in bucket.parcels)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  key: ValueKey('quick-${plan['id']}-${plan['version']}-${parcelNoOf(parcel)}'),
                  initialValue: _weights[parcelNoOf(parcel)],
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText: '#${parcelNoOf(parcel)} ${pickString(boxOf(parcel), ['code'])} — cân thật (kg)',
                    helperText: pickDouble(parcel, ['estimatedWeightG']) > 0
                        ? 'Ước tính ${formatGAsKg(pickDouble(parcel, ['estimatedWeightG']))}'
                        : null,
                    isDense: true,
                  ),
                  onChanged: (v) => _weights[parcelNoOf(parcel)] = v,
                ),
                if (parcelOrderCaption(parcel) case final caption?) Text(caption, style: subtle()),
                ...sharedOrderWidgets(parcel, plan),
                BoxSourceFields(
                  info: rowsOf(_boxSources?['parcels'])
                      .where((p) => pickInt(p, ['parcelNo']) == parcelNoOf(parcel))
                      .firstOrNull,
                  value: _quickSources[parcelNoOf(parcel)] ?? const BoxSourceInput(),
                  onChanged: (v) => setState(() => _quickSources[parcelNoOf(parcel)] = v),
                ),
                const SizedBox(height: 8),
                ProofPhotoField(
                  label: 'Ảnh kiện #${parcelNoOf(parcel)}',
                  required: _requireSealPhoto,
                  enabled: !_busy,
                  photos: _quickPhotos[parcelNoOf(parcel)] ?? const [],
                  onChanged: (v) => setState(() => _quickPhotos[parcelNoOf(parcel)] = v),
                ),
              ],
            ),
          ),
      ],
      const SizedBox(height: 10),
      FilledButton.icon(
        onPressed: _busy ? null : _quickPack,
        icon: const Icon(Icons.inventory_2_outlined),
        label: const Text('Xác nhận đã đóng gói'),
      ),
    ];
  }

  List<Widget> _items(Map<String, dynamic> group) {
    final orders = [for (final o in rowsOf(group['orders'])) if (o['status'] != 'canceled') o];
    return orders.isEmpty ? const [] : [PackItemsList(orders: orders)];
  }

  List<Widget> _planSection(Map<String, dynamic> group, bool canApprove) {
    final plan = _plan;
    final stale = plan?['profileStale'] == true;
    final catalogStale = plan?['catalogStale'] == true;
    final changes = [if (plan?['catalogChanges'] is List) for (final c in plan!['catalogChanges'] as List) '$c'];
    Widget recomputeButton() => OutlinedButton(
          style: compactOutlined(),
          onPressed: _busy ? null : _recompute,
          child: const Text('Tính lại kế hoạch'),
        );
    return [
      sectionTitle('Kế hoạch đóng gói'),
      if (plan == null)
        Text('Chưa có kế hoạch. Hệ thống tự tính sau khi lấy hàng xong, có kế hoạch mới chấp nhận được.',
            style: subtle(13))
      else ...[
        Text(
          '${planStatusLabels[plan['status']] ?? plan['status']} · '
          '${pickInt(asMap(plan['totals']), ['parcels'], parcelsOf(plan).length)} kiện',
          style: subtle(13),
        ),
        if (plan['status'] == 'computing')
          const Padding(padding: EdgeInsets.only(top: 6), child: LinearProgressIndicator()),
        PlanParcelList(plan: plan),
        if (canApprove)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                if (!stale && !catalogStale)
                  OutlinedButton.icon(
                    style: compactOutlined(),
                    onPressed: _busy ? null : _recompute,
                    icon: const Icon(Icons.refresh, size: 16),
                    label: const Text('Tính lại'),
                  ),
                OutlinedButton(
                  style: compactOutlined(),
                  onPressed: _busy || _boxes.isEmpty ? null : _changeBox,
                  child: const Text('Đổi thùng'),
                ),
              ],
            ),
          ),
        if (pickString(plan, ['failureReason']).isNotEmpty)
          Text(pickString(plan, ['failureReason']), style: TextStyle(color: AppColors.danger, fontSize: 12.5)),
        if (stale)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Panel(color: AppColors.warning, children: [
              const Text('Hồ sơ SKU đã được đo lại sau khi tính kế hoạch. Số đo trên kế hoạch này có thể cũ.'),
              Align(alignment: Alignment.centerLeft, child: recomputeButton()),
            ]),
          ),
        if (catalogStale)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Panel(color: AppColors.warning, children: [
              const Text('Danh mục thùng/vật tư đã đổi sau khi tính kế hoạch.', style: boldText),
              if (changes.isNotEmpty)
                ExpansionTile(
                  dense: true,
                  shape: const Border(),
                  tilePadding: EdgeInsets.zero,
                  expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
                  title: Text('Xem ${changes.length} thay đổi'),
                  children: [for (final c in changes) Text('• $c', style: const TextStyle(fontSize: 12.5))],
                ),
              Align(alignment: Alignment.centerLeft, child: recomputeButton()),
            ]),
          ),
      ],
      BoxStockTable(boxes: _boxes, plan: plan, error: _boxError),
    ];
  }

  List<Widget> _pickedPanel() {
    final plan = _plan;
    if (_status != 'picked') return const [];
    if (plan != null && plan['status'] == 'rejected') {
      return [
        const SizedBox(height: 10),
        RejectedPlanPanel(
          key: ValueKey('rejected-${plan['id']}-${plan['version']}'),
          groupId: widget.groupId,
          plan: plan,
          canAct: _canAssign,
          onPlan: _keepPlan,
          onDone: (message) {
            showToast(context, message);
            _reload();
          },
        ),
      ];
    }
    return [
      const SizedBox(height: 10),
      Panel(color: AppColors.primary, children: const [
        Text('Kho đã lấy xong — hệ thống đang tính kế hoạch đóng gói. Có kế hoạch nhóm sẽ sang «Chờ chấp nhận kế hoạch».'),
      ]),
    ];
  }

  /// Khung 3D, hướng dẫn và so sánh thùng (cột phải trên web).
  List<Widget> _viewerSection(QueueTab? tab) {
    final plan = _plan;
    final parcel = selectParcel(plan, _parcelNo);
    if (plan == null || parcel == null) return const [];
    final parcels = parcelsOf(plan);
    final guide = asMap(parcel['guide']);
    final comparison = asMap(parcel['boxComparison']);
    final no = parcelNoOf(parcel);
    return [
      const Divider(height: 28),
      Text(tab == QueueTab.packing ? 'Hướng dẫn 3D' : 'Xem trước 3D',
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
      if (parcels.length > 1)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: chipRow<int>(
            [for (final p in parcels) (parcelNoOf(p), 'Kiện ${parcelNoOf(p)}')],
            no,
            (v) {
              setState(() => _parcelNo = v);
              _autoGuide();
            },
          ),
        ),
      const SizedBox(height: 8),
      if (parcel['manualLayout'] != true) ParcelLayoutCard(groupId: widget.groupId, parcelNo: no),
      const SizedBox(height: 12),
      SegmentedButton<bool>(
        segments: const [
          ButtonSegment(value: false, label: Text('Hướng dẫn')),
          ButtonSegment(value: true, label: Text('So sánh thùng')),
        ],
        selected: {_compare},
        onSelectionChanged: (s) => setState(() => _compare = s.first),
      ),
      if (_compare)
        if (comparison != null)
          Padding(padding: const EdgeInsets.only(top: 10), child: BoxComparisonList(comparison: comparison))
        else
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text(
                'Kiện này chưa có bảng so sánh (kiện nhập tay hoặc tính trước 05/11). Chỉnh tay hoặc tính lại để có bảng.',
                style: subtle()),
          )
      else ...[
        Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
            onPressed: _busy ? null : _writeGuide,
            icon: const Icon(Icons.refresh, size: 16),
            label: Text(guide == null ? 'Viết hướng dẫn' : 'Viết lại'),
          ),
        ),
        GuideText(guide: guide),
        if (guide != null)
          GuideRating(
            key: ValueKey('rating-$no-${guide['source']}'),
            groupId: widget.groupId,
            parcelNo: no,
            guide: guide,
            onPlan: _keepPlan,
          ),
        if (guide != null && _user?.role == UserRole.admin)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: OutlinedButton(
              onPressed: () => openPage<void>(context, GuideTraceScreen(groupId: widget.groupId, parcelNo: no)),
              child: const Text('Xem dữ liệu gửi AI'),
            ),
          ),
      ],
    ];
  }
}
