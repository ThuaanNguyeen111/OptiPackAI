import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:image_picker/image_picker.dart';
import 'package:printing/printing.dart';

import '../../app/mock_providers.dart';
import '../../core/network/api_exception.dart';
import '../proof/proof_photo_field.dart';
import '../proof/proof_photo_repository.dart';
import '../warehouse/scanner_screen.dart';
import '../../core/format/deadline.dart';
import '../../shared/widgets.dart';
import 'shipping_repository.dart';
import '../../app/colors.dart';

/// Shipping Coordinator: tạo vận đơn cho kiện đã đóng, rồi ghi nhận giao thành công / thất bại / giao lại.
class ShippingScreen extends ConsumerStatefulWidget {
  const ShippingScreen({super.key});

  @override
  ConsumerState<ShippingScreen> createState() => _ShippingScreenState();
}

class _ShippingScreenState extends ConsumerState<ShippingScreen> {
  bool _showReady = true;

  void _refresh() {
    ref.invalidate(readyToShipProvider);
    ref.invalidate(shipmentsProvider);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const MockBanner(),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: true, label: Text('Cần tạo vận đơn')),
              ButtonSegment(value: false, label: Text('Đang giao')),
            ],
            selected: {_showReady},
            onSelectionChanged: (s) => setState(() => _showReady = s.first),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => _refresh(),
            child: _showReady ? _ReadyList(onChanged: _refresh) : _ShipmentList(onChanged: _refresh),
          ),
        ),
      ],
    );
  }
}

class _ReadyList extends ConsumerWidget {
  const _ReadyList({required this.onChanged});

  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(readyToShipProvider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ErrorState(error: e, onRetry: onChanged),
      data: (items) => items.isEmpty
          ? ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: const [
                SizedBox(height: 80),
                EmptyState(icon: Icons.local_shipping_outlined, text: 'Không có kiện nào chờ giao.'),
              ],
            )
          : ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (context, i) {
                final g = items[i];
                final d = g.isExpress && g.deadline != null ? deadlineLabel(g.deadline!, DateTime.now(), what: 'giao') : null;
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(g.shortId,
                                style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w800, fontSize: 16)),
                            const SizedBox(width: 8),
                            Flexible(
                              child: Text(g.platform,
                                  overflow: TextOverflow.ellipsis, style: TextStyle(color: AppColors.inkSubtle)),
                            ),
                            const Spacer(),
                            if (g.isExpress) const Pill('Hỏa tốc', Colors.deepOrange),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(g.recipientName, style: const TextStyle(fontWeight: FontWeight.w700)),
                        if (g.address.isNotEmpty) Text(g.address, style: TextStyle(color: AppColors.inkSubtle)),
                        const SizedBox(height: 4),
                        Text('${g.parcelCount} kiện${d != null ? ' · ${d.text}' : ''}',
                            style: TextStyle(color: AppColors.inkSubtle)),
                        const SizedBox(height: 12),
                        FilledButton(
                          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
                          onPressed: () async {
                            final done = await showModalBottomSheet<bool>(
                              context: context,
                              isScrollControlled: true,
                              showDragHandle: true,
                              builder: (_) => _CarrierSheet(group: g),
                            );
                            if (done == true) onChanged();
                          },
                          child: const Text('Tạo vận đơn'),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
    );
  }
}

class _CarrierSheet extends ConsumerStatefulWidget {
  const _CarrierSheet({required this.group});

  final ShipGroup group;

  @override
  ConsumerState<_CarrierSheet> createState() => _CarrierSheetState();
}

class _CarrierSheetState extends ConsumerState<_CarrierSheet> {
  late final Future<List<CarrierQuote>> _quotes = ref.read(shippingRepositoryProvider).quote(widget.group.id);
  String? _selected;
  bool _busy = false;

  Future<void> _create() async {
    final code = _selected;
    if (code == null) return;
    setState(() => _busy = true);
    try {
      final v = await ref.read(shippingRepositoryProvider).create(widget.group.id, code);
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      showToast(context, 'Đã tạo ${v.code}');
      Navigator.pop(context, true);
    } on ShippingException catch (e) {
      if (mounted) showToast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Chọn đơn vị vận chuyển',
                textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            FutureBuilder<List<CarrierQuote>>(
              future: _quotes,
              builder: (context, snap) {
                if (snap.hasError) {
                  return Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text('${snap.error}', textAlign: TextAlign.center, style: TextStyle(color: AppColors.danger)),
                  );
                }
                if (!snap.hasData) {
                  return const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));
                }
                return RadioGroup<String>(
                  groupValue: _selected,
                  onChanged: (v) => setState(() => _selected = v),
                  child: Column(
                    children: [
                      for (final q in snap.data!)
                        Card(
                          child: RadioListTile<String>(
                            value: q.code,
                            enabled: q.unavailableReason == null,
                            title: Text('${q.name} · ${q.service}', style: const TextStyle(fontWeight: FontWeight.w700)),
                            subtitle: Text(
                              q.unavailableReason ??
                                  (q.code == selfDeliveryQuoteCode ? q.eta : '${formatVnd(q.feeVnd)} · ${q.eta}'),
                              style: q.unavailableReason == null ? null : TextStyle(color: AppColors.danger),
                            ),
                          ),
                        ),
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _selected == null || _busy ? null : _create,
              child: const Text('Tạo vận đơn'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ShipmentList extends ConsumerWidget {
  const _ShipmentList({required this.onChanged});

  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(shipmentsProvider);
    final mine = ref.watch(shipmentsMineOnlyProvider);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
          child: Row(
            children: [
              ChoiceChip(
                label: const Text('Của tôi'),
                selected: mine,
                onSelected: (_) => ref.read(shipmentsMineOnlyProvider.notifier).state = true,
              ),
              const SizedBox(width: 8),
              ChoiceChip(
                label: const Text('Tất cả'),
                selected: !mine,
                onSelected: (_) => ref.read(shipmentsMineOnlyProvider.notifier).state = false,
              ),
            ],
          ),
        ),
        Expanded(child: _list(async)),
      ],
    );
  }

  Widget _list(AsyncValue<List<ShipmentView>> async) {
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ErrorState(error: e, onRetry: onChanged),
      data: (items) => items.isEmpty
          ? ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: const [SizedBox(height: 80), EmptyState(icon: Icons.local_shipping_outlined, text: 'Chưa có vận đơn.')],
            )
          : ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (context, i) => _ShipmentCard(shipment: items[i], onChanged: onChanged),
            ),
    );
  }
}

class _ShipmentCard extends ConsumerWidget {
  const _ShipmentCard({required this.shipment, required this.onChanged});

  final ShipmentView shipment;
  final VoidCallback onChanged;

  Color _color() => switch (shipment.status) {
        ShipmentStatus.awaitingPickup || ShipmentStatus.inTransit => AppColors.stageShip,
        ShipmentStatus.outForDelivery => AppColors.stagePick,
        ShipmentStatus.deliveryFailed => AppColors.warning,
        ShipmentStatus.returningToWarehouse => AppColors.danger,
        ShipmentStatus.delivered || ShipmentStatus.returnedToWarehouse => AppColors.good,
        ShipmentStatus.cancelled => AppColors.inkSubtle,
      };

  Future<void> _run(BuildContext context, Future<ShipmentView> Function() action, String ok) async {
    try {
      await action();
      HapticFeedback.mediumImpact();
      onChanged();
      if (context.mounted) showToast(context, ok);
    } on ShippingException catch (e) {
      if (context.mounted) showToast(context, e.message, error: true);
    } on ApiException catch (e) {
      // Lỗi tải ảnh (mất mạng, ảnh quá lớn, BE chưa cấu hình Cloudinary…).
      if (context.mounted) showToast(context, e.message, error: true);
    }
  }

  /// Mở PDF nhãn kiện (mỗi kiện 1 nhãn) để in bằng máy in Bluetooth / máy in hệ thống hoặc gửi sang máy tính.
  Future<void> _printLabel(BuildContext context, ShippingRepository repo) async {
    try {
      final bytes = await repo.shippingLabel(shipment.groupId);
      await Printing.layoutPdf(
        name: 'nhan-${shipment.code}',
        onLayout: (_) async => Uint8List.fromList(bytes),
      );
    } on ShippingException catch (e) {
      if (context.mounted) showToast(context, e.message, error: true);
    } on ApiException catch (e) {
      if (context.mounted) showToast(context, e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.read(shippingRepositoryProvider);
    final s = shipment;
    final overdue = s.dueAt != null && s.status == ShipmentStatus.outForDelivery && s.dueAt!.isBefore(DateTime.now());
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(s.code, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w800)),
                ),
                Pill(s.status.label, _color()),
              ],
            ),
            const SizedBox(height: 6),
            Text(recipientLine(s), style: const TextStyle(fontWeight: FontWeight.w600)),
            Text('${s.carrierName} · ${s.trackingCode}', style: TextStyle(color: AppColors.inkSubtle)),
            Text('Lần giao ${s.attempt}/$maxDeliveryAttempts', style: TextStyle(color: AppColors.inkSubtle, fontSize: 12)),
            if (s.failureReason != null)
              Text('Lý do thất bại: ${s.failureReason!.label}', style: TextStyle(color: AppColors.warningText, fontSize: 13)),
            if (overdue) Padding(padding: EdgeInsets.only(top: 6), child: Pill('Quá hạn giao', AppColors.danger)),
            if (s.status == ShipmentStatus.returningToWarehouse)
              Padding(
                padding: EdgeInsets.only(top: 6),
                child: Text('Kho sẽ quét nhận kiện hoàn về.', style: TextStyle(fontSize: 12, color: AppColors.inkSubtle)),
              ),
            if (s.managedByCarrier && !s.status.isFinal)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text('Trạng thái do ${s.carrierName} cập nhật.',
                    style: TextStyle(fontSize: 12, color: AppColors.inkSubtle)),
              ),
            if (s.groupId.isNotEmpty && s.status != ShipmentStatus.cancelled)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () => _printLabel(context, repo),
                  icon: const Icon(Icons.print_outlined),
                  label: const Text('In nhãn kiện'),
                ),
              ),
            if (s.status == ShipmentStatus.outForDelivery && !s.managedByCarrier) ...[
              if (s.selfDelivery)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text('Shop tự giao — giao thành công cần ảnh bằng chứng.',
                      style: TextStyle(fontSize: 12, color: AppColors.inkSubtle)),
                ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(minimumSize: const Size(0, 46)),
                      onPressed: () async {
                        final fail = await showModalBottomSheet<({FailureReason reason, String note, List<XFile> photos, DateTime? rescheduleAt})>(
                          context: context,
                          isScrollControlled: true,
                          showDragHandle: true,
                          builder: (_) => const _FailSheet(),
                        );
                        if (fail == null || !context.mounted) return;
                        final photos = ref.read(proofPhotoRepositoryProvider);
                        await _run(
                          context,
                          () async => repo.fail(
                            s.id,
                            fail.reason,
                            note: fail.note,
                            photoUrls: await photos.upload(fail.photos),
                            rescheduleAt: fail.rescheduleAt,
                          ),
                          'Đã ghi nhận giao thất bại.',
                        );
                      },
                      child: const Text('Thất bại'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton(
                      style: FilledButton.styleFrom(minimumSize: const Size(0, 46), backgroundColor: AppColors.good),
                      onPressed: () async {
                        final picked = await showModalBottomSheet<_DeliverResult>(
                          context: context,
                          isScrollControlled: true,
                          showDragHandle: true,
                          builder: (_) => _DeliverSheet(shipment: s),
                        );
                        if (picked == null || !context.mounted) return;
                        final photos = ref.read(proofPhotoRepositoryProvider);
                        await _run(
                          context,
                          () async => repo.deliver(
                            s.id,
                            photoUrls: await photos.upload(picked.photos),
                            scannedCode: picked.scannedCode,
                            scanSkippedReason: picked.scanSkippedReason,
                          ),
                          'Đã ghi nhận giao thành công.',
                        );
                      },
                      child: const Text('Đã giao'),
                    ),
                  ),
                ],
              ),
            ],
            if (s.canRetry && !s.managedByCarrier) ...[
              const SizedBox(height: 12),
              FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
                onPressed: () async {
                  // AOFP-336 — chưa tới giờ giao lại: hỏi lý do rồi gửi override_reason (BE bắt ≥ 3 ký tự).
                  String? reason;
                  if (s.retryTooEarly(DateTime.now())) {
                    reason = await _askEarlyReason(context);
                    if (reason == null || !context.mounted) return;
                  }
                  await _run(context, () => repo.retry(s.id, overrideReason: reason), 'Đã chuyển sang giao lại.');
                },
                child: Text(s.retryTooEarly(DateTime.now())
                    ? 'Giao lại từ ${formatClock(s.nextAttemptAt!)}'
                    : 'Giao lại'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _FailSheet extends StatefulWidget {
  const _FailSheet();

  @override
  State<_FailSheet> createState() => _FailSheetState();
}

class _FailSheetState extends State<_FailSheet> {
  FailureReason _reason = FailureReason.customerUnreachable;
  final _note = TextEditingController();
  List<XFile> _photos = const [];
  DateTime? _rescheduleAt;

  /// AOFP-336 — "Khách hẹn giờ": chọn ngày + giờ khách hẹn giao lại (gửi `reschedule_at`).
  Future<void> _pickReschedule() async {
    final now = DateTime.now();
    final day = await showDatePicker(
      context: context,
      initialDate: now,
      firstDate: now,
      lastDate: now.add(const Duration(days: 14)),
    );
    if (day == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(now.add(const Duration(hours: 2))));
    if (time == null || !mounted) return;
    setState(() => _rescheduleAt = DateTime(day.year, day.month, day.day, time.hour, time.minute));
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final needNote = _reason == FailureReason.other;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Giao thất bại — vì sao?',
                textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text(
              'Thất bại lần 2 hoặc khách từ chối nhận thì kiện tự chuyển về kho.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.inkSubtle, fontSize: 12),
            ),
            RadioGroup<FailureReason>(
              groupValue: _reason,
              onChanged: (v) => setState(() => _reason = v ?? _reason),
              child: Column(
                children: [
                  for (final r in FailureReason.values) RadioListTile<FailureReason>(value: r, title: Text(r.label)),
                ],
              ),
            ),
            if (needNote)
              TextField(
                controller: _note,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'Ghi chú (bắt buộc)'),
              ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.schedule),
              title: const Text('Khách hẹn giờ'),
              subtitle: Text(_rescheduleAt == null ? 'Không hẹn' : formatDateTime(_rescheduleAt!)),
              trailing: _rescheduleAt == null
                  ? null
                  : IconButton(icon: const Icon(Icons.close), onPressed: () => setState(() => _rescheduleAt = null)),
              onTap: _pickReschedule,
            ),
            const SizedBox(height: 12),
            ProofPhotoField(
              label: 'Ảnh hiện trường',
              photos: _photos,
              onChanged: (p) => setState(() => _photos = p),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: needNote && _note.text.trim().isEmpty
                  ? null
                  : () => Navigator.pop(
                        context,
                        (reason: _reason, note: _note.text.trim(), photos: _photos, rescheduleAt: _rescheduleAt),
                      ),
              child: const Text('Ghi nhận thất bại'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Xác nhận giao thành công kèm ảnh. Shop tự giao: phải có ít nhất 1 ảnh (BE bắt `SHP_PROOF_PHOTO_REQUIRED`).
class _DeliverSheet extends StatefulWidget {
  const _DeliverSheet({required this.shipment});

  final ShipmentView shipment;

  @override
  State<_DeliverSheet> createState() => _DeliverSheetState();
}

/// AOFP-315 — kết quả sheet giao thành công: ảnh + mã quét nhãn (hoặc lý do bỏ quét).
class _DeliverResult {
  const _DeliverResult(this.photos, {this.scannedCode, this.scanSkippedReason});
  final List<XFile> photos;
  final String? scannedCode;
  final String? scanSkippedReason;
}

class _DeliverSheetState extends State<_DeliverSheet> {
  List<XFile> _photos = const [];
  String? _scanned;
  bool _labelBroken = false;
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _scan() async {
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const ScannerScreen(title: 'Quét QR nhãn kiện')),
    );
    if (code != null && mounted) setState(() => _scanned = code);
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.shipment;
    final needPhoto = s.selfDelivery;
    // Shop tự giao: phải quét nhãn kiện, hoặc báo nhãn hỏng kèm lý do (≥ 5 ký tự).
    final scanMissing = s.selfDelivery &&
        (_labelBroken ? _reason.text.trim().length < 5 : (_scanned ?? '').isEmpty);
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Giao thành công?',
                textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text('${s.code} — ${s.recipientName}',
                textAlign: TextAlign.center, style: TextStyle(color: AppColors.inkSubtle)),
            const SizedBox(height: 16),
            if (s.selfDelivery) ...[
              if (_labelBroken)
                TextField(
                  controller: _reason,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    labelText: 'Lý do bỏ quét (bắt buộc)',
                    hintText: 'VD: Tem rách, không quét được',
                  ),
                )
              else
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
                  onPressed: _scan,
                  icon: Icon(
                    _scanned == null ? Icons.qr_code_scanner : Icons.check_circle,
                    color: _scanned == null ? null : AppColors.good,
                  ),
                  label: Text(_scanned == null ? 'Quét QR nhãn kiện' : 'Đã quét: $_scanned'),
                ),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                value: _labelBroken,
                onChanged: (v) => setState(() => _labelBroken = v ?? false),
                title: const Text('Nhãn hỏng, không quét được'),
              ),
              const SizedBox(height: 8),
            ],
            ProofPhotoField(
              label: 'Ảnh giao hàng',
              required: needPhoto,
              photos: _photos,
              onChanged: (p) => setState(() => _photos = p),
            ),
            const SizedBox(height: 16),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48), backgroundColor: AppColors.good),
              onPressed: (needPhoto && _photos.isEmpty) || scanMissing
                  ? null
                  : () => Navigator.pop(
                        context,
                        _DeliverResult(
                          _photos,
                          scannedCode: _labelBroken ? null : _scanned,
                          scanSkippedReason: _labelBroken ? _reason.text.trim() : null,
                        ),
                      ),
              child: Text(scanMissing
                  ? (_labelBroken ? 'Nhập lý do bỏ quét' : 'Quét QR nhãn kiện trước')
                  : needPhoto && _photos.isEmpty
                      ? 'Chụp ít nhất 1 ảnh'
                      : 'Xác nhận đã giao'),
            ),
          ],
        ),
      ),
    );
  }
}

/// AOFP-336 — "Nguyễn A · 0909… · 12 Lê Lợi, Q1 · Thu 350.000 đ" (bỏ phần trống).
String recipientLine(ShipmentView s) => [
      s.recipientName,
      if (s.recipientPhone != null) s.recipientPhone!,
      if (s.recipientAddress != null) s.recipientAddress!,
      s.codVnd > 0 ? 'Thu ${formatVnd(s.codVnd)}' : 'Đã trả trước',
    ].join(' · ');

/// `HH:mm` theo giờ máy.
String formatClock(DateTime t) {
  final local = t.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(local.hour)}:${two(local.minute)}';
}

/// Hỏi "Lý do giao sớm (bắt buộc)". Trả null khi huỷ.
Future<String?> _askEarlyReason(BuildContext context) {
  final ctrl = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setState) => AlertDialog(
        title: const Text('Giao lại sớm'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          maxLines: 2,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(labelText: 'Lý do giao sớm (bắt buộc)', helperText: 'Tối thiểu 3 ký tự'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Hủy')),
          FilledButton(
            onPressed: ctrl.text.trim().length < 3 ? null : () => Navigator.pop(ctx, ctrl.text.trim()),
            child: const Text('Giao lại'),
          ),
        ],
      ),
    ),
  ).whenComplete(ctrl.dispose);
}
