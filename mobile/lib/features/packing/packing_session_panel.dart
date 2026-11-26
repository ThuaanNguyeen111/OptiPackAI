/// Phiên đóng gói (`fe/src/components/packing/PackingSessionPanel.tsx`): quét từng món, cân, niêm phong,
/// kiện lệch cân, mở niêm phong, tháo kiện đơn hủy, báo sự cố, đổi thùng lúc đóng.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:uuid/uuid.dart';

import '../../app/colors.dart';
import '../../app/providers.dart';
import '../../core/json.dart';
import '../../core/network/api_exception.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';
import '../proof/proof_photo_field.dart';
import '../proof/proof_photo_repository.dart';
import '../warehouse/scanner_screen.dart';
import 'packing_api.dart';
import 'packing_logic.dart';
import 'plan_widgets.dart';

class PackingSessionPanel extends ConsumerStatefulWidget {
  const PackingSessionPanel({
    super.key,
    required this.groupId,
    required this.plan,
    required this.boxes,
    required this.onPlan,
    required this.onError,
    this.requireSealPhoto = false,
  });

  final String groupId;
  final Map<String, dynamic> plan;
  final List<Map<String, dynamic>> boxes;
  final bool requireSealPhoto;
  final ValueChanged<Map<String, dynamic>> onPlan;
  final ValueChanged<Object> onError;

  @override
  ConsumerState<PackingSessionPanel> createState() => _PackingSessionPanelState();
}

class _PackingSessionPanelState extends ConsumerState<PackingSessionPanel> {
  bool _busy = false;
  final _code = TextEditingController();
  final _codeFocus = FocusNode();

  /// Kết quả lần quét gần nhất, hiện ngay dưới ô quét.
  ({String text, bool warn})? _scanNote;

  // Cân / ảnh / nguồn thùng theo TỪNG kiện (khoá `planId:parcelNo`), để kiện 1 không dính sang kiện 2.
  final Map<String, String> _sealWeights = {};
  final Map<String, String> _reviewWeights = {};
  final Map<String, List<XFile>> _sealPhotos = {};
  final Map<String, BoxSourceInput> _boxChoice = {};
  String _reviewReason = 'SCALE_ERROR';

  /// Kiện người dùng chọn làm; null / không còn chờ → kiện chờ có số nhỏ nhất.
  int? _chosenNo;

  Map<String, dynamic>? _sources;
  List<Map<String, dynamic>> _warehouses = const [];
  String _loadedSources = '';

  String get _status => pickString(widget.plan, ['status']);
  int get _version => pickInt(widget.plan, ['version']);
  String _keyOf(int parcelNo) => '${pickString(widget.plan, ['id'])}:$parcelNo';
  PackingApi get _api => ref.read(packingApiProvider);

  @override
  void initState() {
    super.initState();
    _loadExtras();
  }

  @override
  void didUpdateWidget(PackingSessionPanel old) {
    super.didUpdateWidget(old);
    _loadExtras();
  }

  @override
  void dispose() {
    _code.dispose();
    _codeFocus.dispose();
    super.dispose();
  }

  /// Nguồn thùng đổi theo phiên bản kế hoạch; kho lấy món thay chỉ cần tải một lần.
  Future<void> _loadExtras() async {
    final key = '${widget.groupId}|$_status|$_version';
    if (_status != 'packing' || key == _loadedSources) return;
    final first = _loadedSources.isEmpty;
    _loadedSources = key;
    try {
      final data = await _api.boxSources(widget.groupId);
      if (mounted) setState(() => _sources = data);
    } on ApiException {
      if (mounted) setState(() => _sources = null);
    }
    if (!first) return;
    try {
      final rows = await _api.replacementWarehouses(widget.groupId);
      if (mounted) setState(() => _warehouses = rows);
    } on ApiException {
      if (mounted) setState(() => _warehouses = const []);
    }
  }

  Future<bool> _run(Future<Map<String, dynamic>> Function() task) async {
    setState(() => _busy = true);
    try {
      final next = await task();
      if (mounted) widget.onPlan(next);
      return true;
    } catch (e) {
      if (mounted) widget.onError(e);
      return false;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<bool> _write(String suffix, Map<String, dynamic> body) =>
      _run(() => _api.write(widget.groupId, suffix, {'expected_version': _version, ...body}));

  Future<void> _scan(int parcelNo, String raw, String method) async {
    final code = raw.trim();
    if (code.isEmpty || _busy) return;
    final body = {'code': code, 'quantity': 1, 'scan_method': method, 'client_event_id': const Uuid().v4()};
    setState(() => _busy = true);
    try {
      final res = await _api.scan(widget.groupId, parcelNo, body);
      HapticFeedback.mediumImpact();
      if (!mounted) return;
      _code.clear();
      final sku = pickString(res.scan, ['sku']);
      setState(() => _scanNote = (
            text: res.scan['duplicate'] == true
                ? 'Đã ghi nhận $sku trước đó (bỏ qua lần gửi lại)'
                : 'Đã quét $sku · kiện ${pickInt(res.scan, ['parcelNo'])} còn ${pickInt(res.scan, ['remainingInParcel'])} món',
            warn: false,
          ));
      widget.onPlan(res.plan);
    } on ApiException catch (e) {
      HapticFeedback.heavyImpact();
      if (!mounted) return;
      final details = asMap(e.details);
      final belongs = details?['belongsToParcels'];
      if (e.errorCode == 'PACKING_SCAN_WRONG_PARCEL' && belongs is List && belongs.isNotEmpty) {
        _code.clear();
        setState(() => _scanNote = (text: 'Món này thuộc kiện ${belongs.join(', ')}', warn: true));
      } else if (e.isRetryable) {
        // Mất mạng: lưu lần quét trên máy, có mạng tự gửi (cùng mã thao tác nên BE không ghi trùng).
        final action = _api.scanAction(widget.groupId, parcelNo, body);
        await ref.read(syncControllerProvider.notifier).enqueue(action);
        if (!mounted) return;
        _code.clear();
        setState(() => _scanNote = (text: 'Đang ngoại tuyến: đã lưu "${action.label}", sẽ gửi khi có mạng.', warn: true));
      } else {
        setState(() => _scanNote = null);
        widget.onError(e);
        // Giữ mã để sửa tay, lần quét kế tiếp ghi đè thay vì nối vào.
        _code.selection = TextSelection(baseOffset: 0, extentOffset: _code.text.length);
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        _codeFocus.requestFocus();
      }
    }
  }

  Future<void> _scanCamera(int parcelNo) async {
    final code = await openPage<String>(context, const ScannerScreen());
    if (code != null && mounted) await _scan(parcelNo, code, 'barcode');
  }

  Future<void> _unscan(int parcelNo, Map<String, dynamic> scan) async {
    final form = await showFormSheet(
      context,
      title: 'Bỏ quét ${pickString(scan, ['sku'])}',
      note: pickString(scan, ['itemKey']),
      submitLabel: 'Bỏ quét',
      fields: const [FormFieldSpec('reason', 'Lý do gỡ (tối thiểu 3 ký tự)', required: true)],
    );
    if (form == null || !mounted) return;
    final reason = '${form['reason']}';
    if (reason.length < 3) {
      showToast(context, 'Lý do cần ít nhất 3 ký tự.', error: true);
      return;
    }
    await _write('/parcels/$parcelNo/unscan', {'item_key': scan['itemKey'], 'reason': reason});
  }

  Future<void> _seal(Map<String, dynamic> parcel) async {
    final no = parcelNoOf(parcel);
    final key = _keyOf(no);
    final weight = parseWeight(_sealWeights[key] ?? '');
    if (weight == null) return;
    final info = rowsOf(_sources?['parcels']).where((p) => pickInt(p, ['parcelNo']) == no).firstOrNull;
    final choice = _boxChoice[key] ?? const BoxSourceInput();
    final problem = choice.errorFor(info);
    if (problem != null) {
      showToast(context, problem, error: true);
      return;
    }
    final photos = _sealPhotos[key] ?? const <XFile>[];
    final upload = ref.read(proofPhotoRepositoryProvider);
    final ok = await _run(() async {
      final urls = await upload.upload(photos);
      return _api.write(widget.groupId, '/parcels/$no/seal', {
        'expected_version': _version,
        'weight_kg': weight,
        if (info != null) ...choice.toBody(),
        if (urls.isNotEmpty) 'photo_urls': urls,
      });
    });
    if (ok && mounted) {
      // Niêm phong xong: xoá cân + ảnh của kiện này; kiện chờ kế tiếp tự mở.
      setState(() {
        _sealWeights.remove(key);
        _sealPhotos.remove(key);
        _scanNote = null;
      });
    }
  }

  Future<void> _changeBox(int parcelNo) async {
    final form = await showFormSheet(
      context,
      title: 'Đổi thùng lúc đóng — kiện $parcelNo',
      submitLabel: 'Đổi thùng',
      fields: [
        FormFieldSpec('box_code', 'Thùng mới', type: FieldType.choice, required: true, options: {
          for (final b in widget.boxes) pickString(b, ['code']): '${pickString(b, ['code'])} · ${pickString(b, ['name'])}',
        }),
        const FormFieldSpec('reason', 'Lý do',
            type: FieldType.choice, required: true, initial: 'BOX_TOO_TIGHT', options: adjustmentReasons),
        const FormFieldSpec('old_box_outcome', 'Thùng cũ',
            type: FieldType.choice,
            required: true,
            initial: 'unused',
            options: {'unused': 'Thùng cũ chưa dùng', 'damaged': 'Thùng cũ hỏng'}),
      ],
    );
    if (form == null || !mounted) return;
    await _write('/parcels/$parcelNo/change-box-in-session', form);
  }

  Future<void> _unseal(int parcelNo) async {
    final form = await showFormSheet(
      context,
      title: 'Mở niêm phong kiện #$parcelNo',
      note: 'Kiện quay về chưa niêm phong để đóng lại. Thùng hỏng thì ghi hao hụt, niêm phong lại sẽ lấy thùng mới.',
      submitLabel: 'Mở niêm phong',
      fields: const [
        FormFieldSpec('reason', 'Lý do', type: FieldType.choice, required: true, options: adjustmentReasons),
        FormFieldSpec('box_condition', 'Thùng',
            type: FieldType.choice,
            required: true,
            initial: 'reusable',
            options: {'reusable': 'Thùng còn dùng được', 'damaged': 'Thùng hỏng'}),
        FormFieldSpec('note', 'Ghi chú', hint: 'Bắt buộc khi chọn lý do Khác'),
      ],
    );
    if (form == null || !mounted) return;
    if (form['reason'] == 'OTHER' && form['note'] == null) {
      showToast(context, 'Lý do "Khác" cần ghi chú.', error: true);
      return;
    }
    await _write('/parcels/$parcelNo/unseal', form);
  }

  Future<void> _unpack(Map<String, dynamic> parcel) async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _UnpackSheet(parcel: parcel),
    );
    if (result == null || !mounted) return;
    await _write('/parcels/${parcelNoOf(parcel)}/unpack', result);
  }

  Future<void> _reportIssue(Map<String, dynamic> parcel) async {
    final result = await showModalBottomSheet<({Map<String, dynamic> body, List<XFile> photos})>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _IssueSheet(parcel: parcel, warehouses: _warehouses),
    );
    if (result == null || !mounted) return;
    final upload = ref.read(proofPhotoRepositoryProvider);
    await _run(() async {
      final urls = await upload.upload(result.photos);
      return _api.write(widget.groupId, '/report-issue', {
        'expected_version': _version,
        'parcel_no': parcelNoOf(parcel),
        ...result.body,
        if (urls.isNotEmpty) 'photo_urls': urls,
      });
    });
  }

  Future<void> _review(int parcelNo, String action, [double? weight]) => _write('/parcels/$parcelNo/review', {
        'action': action,
        'reason': _reviewReason,
        'weight_kg': ?weight,
      });

  @override
  Widget build(BuildContext context) {
    final parcels = parcelsOf(widget.plan);
    final live = [for (final p in parcels) if (isLiveParcel(p)) p];
    final canFinish =
        _status == 'packing' && live.isNotEmpty && live.every((p) => parcelStatusOf(p) == 'sealed');
    final pendingNos = [for (final p in parcels) if (parcelStatusOf(p) == 'pending') parcelNoOf(p)]..sort();
    final activeNo = _status != 'packing'
        ? null
        : pendingNos.contains(_chosenNo)
            ? _chosenNo
            : pendingNos.firstOrNull;
    final active = parcels.where((p) => parcelNoOf(p) == activeNo).firstOrNull;
    final layout = groupParcelsByOrder(parcels);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Expanded(child: Text('Phiên đóng gói', style: boldText)),
                Text(sessionPlanStatusLabels[_status] ?? _status, style: subtle()),
              ],
            ),
            if (active != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Pill(
                  'Kiện ${live.indexWhere((p) => parcelNoOf(p) == activeNo) + 1}/${live.length} · '
                  'đã quét ${scannedCountOf(active)}/${itemCountOf(active) ?? '—'} món',
                  AppColors.stagePick,
                ),
              ),
            if (_status == 'approved')
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: FilledButton(
                  onPressed: _busy ? null : () => _write('/start', const {}),
                  child: const Text('Bắt đầu đóng'),
                ),
              ),
            for (final bucket in layout.groups) ...[
              if (layout.multi)
                Padding(padding: const EdgeInsets.only(top: 10), child: Text(bucket.heading, style: boldText)),
              for (final parcel in bucket.parcels) _parcelCard(parcel, activeNo),
            ],
            if (canFinish)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: FilledButton(
                  onPressed: _busy ? null : () => _write('/finish', const {}),
                  child: const Text('Hoàn tất đóng gói'),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _parcelCard(Map<String, dynamic> parcel, int? activeNo) {
    final no = parcelNoOf(parcel);
    final key = _keyOf(no);
    final status = parcelStatusOf(parcel);
    final pending = status == 'pending';
    final held = status == 'held';
    // Người niêm phong không tự chấp nhận / cân lại kiện lệch cân (BE trả 403).
    final me = ref.watch(authControllerProvider).user?.id;
    final sealedByMe = held && me != null && parcel['sealedBy'] == me;
    final sealed = status == 'sealed' || held;
    final working = pending && no == activeNo;
    final collapsed = pending && _status == 'packing' && !working;
    final scanned = scannedCountOf(parcel);
    final total = itemCountOf(parcel);
    final fullyScanned = total == null || scanned >= total;
    final photos = _sealPhotos[key] ?? const <XFile>[];
    final missingPhoto = widget.requireSealPhoto && photos.isEmpty;
    final info = rowsOf(_sources?['parcels']).where((p) => pickInt(p, ['parcelNo']) == no).firstOrNull;
    final caption = parcelOrderCaption(parcel);
    final photoUrls = [
      if (parcel['sealPhotoUrls'] is List) for (final u in parcel['sealPhotoUrls'] as List) '$u',
    ];

    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: working ? AppColors.primary : AppColors.hairline, width: working ? 1.5 : 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '#$no ${pickString(boxOf(parcel), ['code'])}${showMailerBadge(parcel) ? ' · Túi niêm phong' : ''}',
            style: boldText,
          ),
          if (caption != null) Text(caption, style: subtle()),
          Text('${parcelStatusLabels[status] ?? status} · $scanned/${total ?? '—'}',
              style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: held || status == 'to_unpack'
                      ? AppColors.danger
                      : status == 'sealed'
                          ? AppColors.good
                          : AppColors.inkSubtle)),
          if (collapsed)
            Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: const EdgeInsets.only(top: 6),
                child: OutlinedButton(
                  style: compactOutlined(),
                  onPressed: _busy
                      ? null
                      : () => setState(() {
                            _chosenNo = no;
                            _scanNote = null;
                          }),
                  child: Text('Làm kiện $no'),
                ),
              ),
            )
          else ...[
            ...sharedOrderWidgets(parcel, widget.plan),
            if (pending && boxOf(parcel)['cutFromInnerHeightMm'] != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Panel(color: AppColors.warning, children: [
                  Text('Cắt hạ thùng trước khi xếp hàng${boxCutNote(boxOf(parcel))}',
                      style: TextStyle(color: AppColors.warningText, fontWeight: FontWeight.w700, fontSize: 12.5)),
                ]),
              ),
            if (working) ..._scanFields(no),
            for (final scan in rowsOf(parcel['scans']))
              Row(
                children: [
                  Icon(Icons.check_circle, size: 16, color: AppColors.good),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text.rich(TextSpan(children: [
                      TextSpan(text: '${pickString(scan, ['sku'])} ', style: monoText),
                      TextSpan(text: pickString(scan, ['itemKey']), style: subtle(11.5)),
                    ])),
                  ),
                  if (pending)
                    IconButton(
                      tooltip: 'Bỏ quét',
                      visualDensity: VisualDensity.compact,
                      onPressed: _busy ? null : () => _unscan(no, scan),
                      icon: const Icon(Icons.undo, size: 20),
                    ),
                ],
              ),
            if (working && info != null)
              BoxSourceFields(
                info: info,
                value: _boxChoice[key] ?? const BoxSourceInput(),
                onChanged: (v) => setState(() => _boxChoice[key] = v),
              ),
            if (sealed && photoUrls.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Wrap(
                  spacing: 8,
                  children: [
                    for (final url in photoUrls)
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.network(url,
                            width: 60,
                            height: 60,
                            fit: BoxFit.cover,
                            errorBuilder: (_, _, _) => const Icon(Icons.broken_image_outlined)),
                      ),
                  ],
                ),
              ),
            if (working) ...[
              if (!fullyScanned)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text('Quét đủ $total món rồi mới cân và niêm phong.', style: subtle()),
                )
              else ...[
                const SizedBox(height: 10),
                ProofPhotoField(
                  label: 'Ảnh kiện',
                  required: widget.requireSealPhoto,
                  enabled: !_busy,
                  photos: photos,
                  onChanged: (v) => setState(() => _sealPhotos[key] = v),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  key: ValueKey('seal-weight-$key'),
                  initialValue: _sealWeights[key],
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(labelText: 'Cân kiện $no (kg)', isDense: true),
                  onChanged: (v) => setState(() => _sealWeights[key] = v),
                ),
                const SizedBox(height: 8),
                FilledButton(
                  onPressed: _busy || parseWeight(_sealWeights[key] ?? '') == null || missingPhoto
                      ? null
                      : () => _seal(parcel),
                  child: Text('Niêm phong kiện $no'),
                ),
                if (missingPhoto)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('Chụp ít nhất 1 ảnh kiện trước', style: subtle()),
                  ),
              ],
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: [
                    OutlinedButton(
                      style: compactOutlined(),
                      onPressed: _busy || widget.boxes.isEmpty ? null : () => _changeBox(no),
                      child: const Text('Đổi thùng lúc đóng'),
                    ),
                    if (parcelItems(parcel).isNotEmpty)
                      OutlinedButton(
                        style: compactOutlined(foreground: AppColors.danger),
                        onPressed: _busy ? null : () => _reportIssue(parcel),
                        child: const Text('Báo sự cố'),
                      ),
                  ],
                ),
              ),
            ],
            if (held) ..._heldFields(parcel, sealedByMe),
            if (sealed && _status == 'packing')
              Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton(
                  style: compactOutlined(),
                  onPressed: _busy ? null : () => _unseal(no),
                  child: const Text('Mở niêm phong'),
                ),
              ),
            if (status == 'to_unpack')
              Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton(
                  style: compactOutlined(),
                  onPressed: _busy ? null : () => _unpack(parcel),
                  child: const Text('Tháo kiện đơn hủy'),
                ),
              ),
          ],
        ],
      ),
    );
  }

  List<Widget> _scanFields(int no) => [
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _code,
                focusNode: _codeFocus,
                textInputAction: TextInputAction.done,
                onSubmitted: (v) => _scan(no, v, 'manual'),
                decoration: InputDecoration(
                    labelText: 'Quét món kiện $no', hintText: 'SKU sàn hoặc SKU nội bộ', isDense: true),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              tooltip: 'Quét bằng camera',
              style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
              onPressed: _busy ? null : () => _scanCamera(no),
              icon: const Icon(Icons.qr_code_scanner),
            ),
          ],
        ),
        if (_scanNote case final note?)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(note.text,
                style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: note.warn ? AppColors.warningText : AppColors.good)),
          ),
        const SizedBox(height: 6),
      ];

  List<Widget> _heldFields(Map<String, dynamic> parcel, bool sealedByMe) {
    final no = parcelNoOf(parcel);
    final key = _keyOf(no);
    final newWeight = parseWeight(_reviewWeights[key] ?? '');
    return [
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Text('${weightOffCopy(parcel)}${sealedByMe ? ' Cần người khác xem lại kiện này.' : ''}',
            style: TextStyle(color: AppColors.warningText, fontWeight: FontWeight.w700, fontSize: 12.5)),
      ),
      Choice<String>(
        label: 'Lý do xem lại',
        value: _reviewReason,
        options: parcelReviewReasons,
        onChanged: (v) => setState(() => _reviewReason = v ?? 'SCALE_ERROR'),
      ),
      if (!sealedByMe) ...[
        const SizedBox(height: 8),
        TextFormField(
          key: ValueKey('review-weight-$key'),
          initialValue: _reviewWeights[key],
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(labelText: 'Cân mới (kg)', isDense: true),
          onChanged: (v) => setState(() => _reviewWeights[key] = v),
        ),
      ],
      const SizedBox(height: 8),
      Wrap(
        spacing: 8,
        runSpacing: 4,
        children: [
          if (!sealedByMe) ...[
            FilledButton(
              style: compactButton(),
              onPressed: _busy ? null : () => _review(no, 'accept'),
              child: const Text('Chấp nhận'),
            ),
            OutlinedButton(
              style: compactOutlined(),
              onPressed: _busy || newWeight == null ? null : () => _review(no, 'reweigh', newWeight),
              child: const Text('Cân lại'),
            ),
          ],
          OutlinedButton(
            style: compactOutlined(),
            onPressed: _busy ? null : () => _review(no, 'reopen'),
            child: const Text('Mở ra đóng lại'),
          ),
        ],
      ),
    ];
  }
}

/// Khung chung của hai tờ trượt dưới.
class _Sheet extends StatelessWidget {
  const _Sheet({required this.title, required this.children, this.note});

  final String title;
  final String? note;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => SafeArea(
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.viewInsetsOf(context).bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              if (note != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(note!, style: subtle(13))),
              const SizedBox(height: 12),
              ...children,
            ],
          ),
        ),
      );
}

class _UnpackSheet extends StatefulWidget {
  const _UnpackSheet({required this.parcel});

  final Map<String, dynamic> parcel;

  @override
  State<_UnpackSheet> createState() => _UnpackSheetState();
}

class _UnpackSheetState extends State<_UnpackSheet> {
  String? _condition;
  final Map<String, int> _recovered = {};

  @override
  Widget build(BuildContext context) {
    final cut = boxOf(widget.parcel)['cutFromInnerHeightMm'] != null;
    final condition = cut ? 'damaged' : _condition;
    final materials = [for (final m in rowsOf(widget.parcel['materials'])) if (pickString(m, ['code']).isNotEmpty) m];
    return _Sheet(
      title: 'Tháo kiện #${parcelNoOf(widget.parcel)}',
      note: 'Hàng trong kiện trả về kệ. Chọn tình trạng thùng và số vật tư chèn còn dùng lại được.',
      children: [
        if (cut)
          Text('Thùng đã cắt hạ — không dùng lại như thùng nguyên cỡ, tính là thùng hỏng.',
              style: TextStyle(color: AppColors.warningText, fontSize: 12.5)),
        Wrap(
          spacing: 8,
          children: [
            for (final (value, label) in const [('reusable', 'Thùng còn dùng được'), ('damaged', 'Thùng hỏng')])
              ChoiceChip(
                label: Text(label),
                selected: condition == value,
                onSelected: cut ? null : (_) => setState(() => _condition = value),
              ),
          ],
        ),
        if (materials.isNotEmpty) sectionTitle('Vật tư chèn thu hồi'),
        for (final m in materials)
          Row(
            children: [
              Expanded(child: Text('${pickString(m, ['name'])} (tối đa ${pickInt(m, ['quantity'])})')),
              IconButton(
                onPressed: (_recovered[m['code']] ?? 0) > 0
                    ? () => setState(() => _recovered['${m['code']}'] = _recovered[m['code']]! - 1)
                    : null,
                icon: const Icon(Icons.remove_circle_outline),
              ),
              Text('${_recovered[m['code']] ?? 0}', style: boldText),
              IconButton(
                onPressed: (_recovered[m['code']] ?? 0) < pickInt(m, ['quantity'])
                    ? () => setState(() => _recovered['${m['code']}'] = (_recovered[m['code']] ?? 0) + 1)
                    : null,
                icon: const Icon(Icons.add_circle_outline),
              ),
            ],
          ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: condition == null
              ? null
              : () {
                  final recovered = [
                    for (final e in _recovered.entries)
                      if (e.value > 0) {'code': e.key, 'quantity': e.value},
                  ];
                  Navigator.pop(context, {
                    'box_condition': condition,
                    if (recovered.isNotEmpty) 'recovered_materials': recovered,
                  });
                },
          child: const Text('Tháo kiện'),
        ),
      ],
    );
  }
}

class _IssueSheet extends StatefulWidget {
  const _IssueSheet({required this.parcel, required this.warehouses});

  final Map<String, dynamic> parcel;
  final List<Map<String, dynamic>> warehouses;

  @override
  State<_IssueSheet> createState() => _IssueSheetState();
}

class _IssueSheetState extends State<_IssueSheet> {
  late String _itemKey = parcelItems(widget.parcel).first.itemKey;
  String _issue = 'damaged';
  String _resolution = 'back_to_picking';
  late String? _warehouseId =
      widget.warehouses.isEmpty ? null : pickString(widget.warehouses.first, ['id']);
  List<XFile> _photos = const [];

  @override
  Widget build(BuildContext context) {
    final replace = _resolution == 'replace';
    return _Sheet(
      title: 'Báo sự cố — kiện ${parcelNoOf(widget.parcel)}',
      children: [
        Choice<String>(
          label: 'Món bị sự cố',
          value: _itemKey,
          options: {
            for (final i in parcelItems(widget.parcel))
              i.itemKey: '${i.sku} · ${i.itemKey}${i.scanned ? ' (đã quét)' : ''}',
          },
          onChanged: (v) => setState(() => _itemKey = v ?? _itemKey),
        ),
        const SizedBox(height: 10),
        Choice<String>(label: 'Sự cố', value: _issue, options: issueKinds, onChanged: (v) => setState(() => _issue = v!)),
        const SizedBox(height: 10),
        Choice<String>(
          label: 'Cách xử lý',
          value: _resolution,
          options: const {'back_to_picking': 'Trả về lấy hàng', 'replace': 'Lấy món thay'},
          onChanged: (v) => setState(() => _resolution = v!),
        ),
        if (replace) ...[
          const SizedBox(height: 10),
          if (widget.warehouses.isEmpty)
            Text('Chưa có kho', style: TextStyle(color: AppColors.danger))
          else
            Choice<String>(
              label: 'Kho lấy món thay',
              value: _warehouseId,
              options: {
                for (final w in widget.warehouses)
                  pickString(w, ['id']): '${pickString(w, ['code'])} · ${pickString(w, ['name'])}',
              },
              onChanged: (v) => setState(() => _warehouseId = v),
            ),
        ],
        const SizedBox(height: 12),
        ProofPhotoField(label: 'Ảnh món lỗi', photos: _photos, onChanged: (v) => setState(() => _photos = v)),
        const SizedBox(height: 14),
        FilledButton(
          onPressed: replace && _warehouseId == null
              ? null
              : () => Navigator.pop(context, (
                    body: <String, dynamic>{
                      'item_key': _itemKey,
                      'issue': _issue,
                      'resolution': _resolution,
                      if (replace) 'warehouse_id': _warehouseId,
                    },
                    photos: _photos,
                  )),
          child: const Text('Báo sự cố'),
        ),
      ],
    );
  }
}
