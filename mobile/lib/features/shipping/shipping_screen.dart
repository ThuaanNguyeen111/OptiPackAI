import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:image_picker/image_picker.dart';
import 'package:printing/printing.dart';

import '../../app/mock_providers.dart';
import '../../app/providers.dart';
import '../../core/json.dart';
import '../../shared/admin_kit.dart';
import '../auth/auth_models.dart';
import 'create_shipment_sheet.dart';
import 'shipment_detail_screen.dart';
import 'shipping_tools.dart';
import '../../core/network/api_exception.dart';
import '../proof/proof_photo_field.dart';
import '../proof/proof_photo_repository.dart';
import '../warehouse/scanner_screen.dart';
import '../../core/format/deadline.dart';
import '../admin/shipping_admin_screen.dart';
import 'handover_slip.dart';
import '../../shared/widgets.dart';
import 'shipping_repository.dart';
import '../../app/colors.dart';

/// Mã tab nhóm đã đóng gói, chưa có vận đơn.
const readyTab = 'packed';

/// 9 tab giống `TABS` của web.
final shippingTabs = <(String, String)>[
  (readyTab, 'Chờ giao'),
  ('awaiting_pickup', 'Chờ hãng lấy'),
  ('in_transit', 'Trung chuyển'),
  ('out_for_delivery', 'Đang giao'),
  ('delivery_failed', 'Giao thất bại'),
  ('returning_to_warehouse', 'Đang hoàn về'),
  ('delivered', 'Đã giao'),
  ('returned_to_warehouse', 'Đã về kho'),
  ('cancelled', 'Đã huỷ'),
];

String tabLabel(String code) => shippingTabs.where((t) => t.$1 == code).firstOrNull?.$2 ?? code;

bool _has(String needle, List<String?> values) => values.any((v) => (v ?? '').toLowerCase().contains(needle));

bool matchesShipGroup(ShipGroup g, String needle) => _has(needle, [g.id, g.recipientName, g.address, g.platform]);

bool matchesShipment(ShipmentView v, String needle) =>
    _has(needle, [v.code, v.trackingCode, v.groupId, v.groupShortId, v.recipientName, v.recipientPhone]) ||
    // QR trên nhãn có thể ghép nhiều mã bằng dấu "|".
    needle.split('|').any((part) => part.trim() == v.code.toLowerCase() || part.trim() == v.trackingCode.toLowerCase());

/// Shipping Coordinator: tạo vận đơn cho kiện đã đóng, theo dõi và ghi nhận giao hàng.
class ShippingScreen extends ConsumerStatefulWidget {
  const ShippingScreen({super.key});

  @override
  ConsumerState<ShippingScreen> createState() => _ShippingScreenState();
}

class _ShippingScreenState extends ConsumerState<ShippingScreen> {
  String _tab = readyTab;
  String _search = '';
  final _searchField = TextEditingController();

  /// Nhóm chọn để giao chung chuyến.
  final Set<String> _batch = {};

  @override
  void dispose() {
    _searchField.dispose();
    super.dispose();
  }

  void _refresh() {
    ref.invalidate(readyToShipProvider);
    ref.invalidate(shipmentsProvider);
  }

  void _setSearch(String value) => setState(() => _search = value.trim().toLowerCase());

  Future<void> _scan() async {
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const ScannerScreen(title: 'Quét mã vận đơn / nhãn kiện')),
    );
    if (code == null || !mounted) return;
    _searchField.text = code;
    _setSearch(code);
  }

  Future<void> _create(ShipGroup group) async {
    final done = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (_) => CreateShipmentSheet(group: group),
    );
    if (done == true) {
      _batch.remove(group.id);
      _refresh();
    }
  }

  Future<void> _createBatch(List<String> ids) async {
    if (await createShipmentBatch(context, ref.read(apiClientProvider), ids)) {
      setState(_batch.clear);
      _refresh();
    }
  }

  /// Web: "Vận đơn của nhóm" (gồm cả vận đơn đã huỷ ở hãng).
  Future<void> _openGroupShipment(String groupId) async {
    Map<String, dynamic>? found;
    final ok = await runAction(context, () async {
      found = asMap(await ref.read(apiClientProvider).get('/shipments/group/${Uri.encodeComponent(groupId)}'));
    });
    if (!ok || !mounted) return;
    final id = pickString(found, ['id', '_id']);
    if (id.isEmpty) {
      showToast(context, 'Nhóm chưa có vận đơn.');
      return;
    }
    await openPage(context, ShipmentDetailScreen(shipmentId: id));
    _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final ready = ref.watch(readyToShipProvider);
    final shipments = ref.watch(shipmentsProvider);
    final mine = ref.watch(shipmentsMineOnlyProvider);
    final mock = ref.watch(useMockDataProvider);
    final groups = ready.valueOrNull ?? const <ShipGroup>[];
    final all = shipments.valueOrNull ?? const <ShipmentView>[];
    final searching = _search.isNotEmpty;

    // Đang tìm thì tìm ở mọi tab; không thì chỉ tab đang chọn.
    final shownGroups = searching
        ? [for (final g in groups) if (matchesShipGroup(g, _search)) g]
        : (_tab == readyTab ? groups : const <ShipGroup>[]);
    final shownShipments = searching
        ? [for (final v in all) if (matchesShipment(v, _search)) v]
        : [for (final v in all) if (v.status.code == _tab) v];

    final AsyncValue<Object?> current = searching || _tab != readyTab ? shipments : ready;
    final batchIds = [
      for (final g in groups)
        if (_batch.contains(g.id)) g.id,
    ];

    int countOf(String tab) => tab == readyTab ? groups.length : all.where((v) => v.status.code == tab).length;

    return Column(
      children: [
        const MockBanner(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => _refresh(),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              children: [
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final (code, label) in shippingTabs)
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text('$label ${countOf(code)}'),
                            selected: !searching && _tab == code,
                            onSelected: (_) {
                              _searchField.clear();
                              setState(() {
                                _tab = code;
                                _search = '';
                              });
                            },
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _searchField,
                        onChanged: _setSearch,
                        decoration: const InputDecoration(
                            hintText: 'Mã vận đơn, mã nhóm, người nhận', prefixIcon: Icon(Icons.search), isDense: true),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      tooltip: 'Quét mã',
                      style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
                      onPressed: _scan,
                      icon: const Icon(Icons.qr_code_scanner),
                    ),
                  ],
                ),
                Wrap(
                  spacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    FilterChip(
                      label: const Text('Của tôi'),
                      selected: mine,
                      onSelected: (v) => ref.read(shipmentsMineOnlyProvider.notifier).state = v,
                    ),
                    TextButton.icon(
                      onPressed: () => saveCsvFile(context, 'shipping-queue-${searching ? 'tim-kiem' : _tab}.csv',
                          shipmentQueueCsv(shownGroups, shownShipments)),
                      icon: const Icon(Icons.save_alt),
                      label: const Text('Lưu CSV'),
                    ),
                    TextButton.icon(
                      onPressed: () => printHandoverSlip(
                        context,
                        rows: handoverRows(shownGroups, shownShipments, tabLabel),
                        queueLabel: searching ? 'Kết quả tìm kiếm' : tabLabel(_tab),
                        preparedBy: ref.read(authControllerProvider).user?.name ?? '—',
                      ),
                      icon: const Icon(Icons.print_outlined),
                      label: const Text('In phiếu bàn giao'),
                    ),
                    if (!mock)
                      TextButton.icon(
                        onPressed: () => showShippingSettings(
                          context,
                          ref.read(apiClientProvider),
                          // Như web: chỉ Admin sửa hãng và chiến lược.
                          onManage: ref.read(authControllerProvider).user?.role == UserRole.admin
                              ? () async {
                                  await openPage(context, const ShippingAdminScreen(openCarriers: true));
                                  _refresh();
                                }
                              : null,
                        ),
                        icon: const Icon(Icons.local_shipping_outlined),
                        label: const Text('Hãng & người gửi'),
                      ),
                  ],
                ),
                if (mine)
                  Text('Chỉ đếm vận đơn giao cho bạn.', style: TextStyle(fontSize: 12, color: AppColors.inkSubtle)),
                if (!mock && batchIds.isNotEmpty && (_tab == readyTab || searching)) ...[
                  const SizedBox(height: 8),
                  FilledButton.icon(
                    onPressed: () => _createBatch(batchIds),
                    icon: const Icon(Icons.alt_route),
                    label: Text('Giao chung chuyến (${batchIds.length})'),
                  ),
                ],
                const SizedBox(height: 8),
                if (current.hasError && !current.isLoading)
                  ErrorState(error: current.error!, onRetry: _refresh)
                else if (current.isLoading && !current.hasValue)
                  const Padding(padding: EdgeInsets.all(48), child: Center(child: CircularProgressIndicator()))
                else if (shownGroups.isEmpty && shownShipments.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 48),
                    child: EmptyState(
                      icon: Icons.local_shipping_outlined,
                      text: searching
                          ? 'Không thấy mã này trong hàng đợi đã tải.'
                          : _tab == readyTab
                              ? 'Chưa có nhóm đã đóng gói nào chờ giao.'
                              : 'Không có vận đơn ở trạng thái này.',
                    ),
                  )
                else ...[
                  for (final g in shownGroups) ...[
                    _ReadyCard(
                      group: g,
                      selected: _batch.contains(g.id),
                      // Đơn hỏa tốc và đơn Tiki không gộp chuyến.
                      onSelect: mock || g.requiresSelfDelivery || g.platform.toLowerCase() == 'tiki'
                          ? null
                          : (v) => setState(() => v ? _batch.add(g.id) : _batch.remove(g.id)),
                      onCreate: () => _create(g),
                      onLabel: mock
                          ? null
                          : () => printPdf(context, ref.read(apiClientProvider),
                              '/documents/shipping-label/${g.id}', 'nhan-kien'),
                      onShipment: mock ? null : () => _openGroupShipment(g.id),
                    ),
                    const SizedBox(height: 12),
                  ],
                  for (final v in shownShipments) ...[
                    _ShipmentCard(
                      key: ValueKey(v.id),
                      shipment: v,
                      onChanged: _refresh,
                      onDetail: mock
                          ? null
                          : () async {
                              await openPage(context, ShipmentDetailScreen(shipmentId: v.id));
                              _refresh();
                            },
                    ),
                    const SizedBox(height: 12),
                  ],
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ReadyCard extends StatelessWidget {
  const _ReadyCard({
    required this.group,
    required this.selected,
    required this.onSelect,
    required this.onCreate,
    required this.onLabel,
    required this.onShipment,
  });

  final ShipGroup group;
  final bool selected;
  final ValueChanged<bool>? onSelect;
  final VoidCallback onCreate;
  final VoidCallback? onLabel;
  final VoidCallback? onShipment;

  @override
  Widget build(BuildContext context) {
    final g = group;
    final d = g.isExpress && g.deadline != null ? deadlineLabel(g.deadline!, DateTime.now(), what: 'giao') : null;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(g.shortId, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(g.platform, overflow: TextOverflow.ellipsis, style: TextStyle(color: AppColors.inkSubtle)),
                ),
                const Spacer(),
                if (g.isExpress) const Pill('Hỏa tốc', Colors.deepOrange),
              ],
            ),
            const SizedBox(height: 8),
            Text(g.recipientName, style: const TextStyle(fontWeight: FontWeight.w700)),
            if (g.address.isNotEmpty) Text(g.address, style: TextStyle(color: AppColors.inkSubtle)),
            const SizedBox(height: 4),
            Text('${g.parcelCount} kiện${d != null ? ' · ${d.text}' : ''}', style: TextStyle(color: AppColors.inkSubtle)),
            if (onSelect case final select?)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                dense: true,
                value: selected,
                onChanged: (v) => select(v ?? false),
                title: const Text('Chọn giao chung chuyến'),
              ),
            if (onLabel != null || onShipment != null)
              Wrap(
                spacing: 4,
                children: [
                  if (onLabel != null)
                    TextButton.icon(onPressed: onLabel, icon: const Icon(Icons.print_outlined), label: const Text('Nhãn PDF')),
                  if (onShipment != null)
                    TextButton.icon(
                        onPressed: onShipment, icon: const Icon(Icons.folder_outlined), label: const Text('Vận đơn của nhóm')),
                ],
              ),
            const SizedBox(height: 8),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
              onPressed: onCreate,
              child: const Text('Tạo vận đơn'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ShipmentCard extends ConsumerWidget {
  const _ShipmentCard({super.key, required this.shipment, required this.onChanged, this.onDetail});

  final ShipmentView shipment;
  final VoidCallback onChanged;
  final VoidCallback? onDetail;

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
    final overdue = s.isOverdueAt(DateTime.now());
    final user = ref.watch(authControllerProvider.select((a) => a.user));
    // Vận đơn đã giao đích danh người khác thì chỉ Admin ghi nhận được (giống web).
    final allowed = s.actionsAllowedFor(user?.id, isAdmin: user?.role == UserRole.admin);
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
            if (s.dueAt != null && !s.status.isFinal)
              Text('Hạn giao: ${formatDateTime(s.dueAt!)}', style: TextStyle(color: AppColors.inkSubtle, fontSize: 12)),
            if (s.shipperName != null)
              Text('Người giao: ${s.shipperName}', style: TextStyle(color: AppColors.inkSubtle, fontSize: 12)),
            if (!allowed && !s.status.isFinal && !s.managedByCarrier)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text('Vận đơn giao cho người khác — chỉ người đó hoặc Admin ghi nhận được.',
                    style: TextStyle(fontSize: 12, color: AppColors.warningText)),
              ),
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
            Wrap(
              spacing: 4,
              children: [
                if (onDetail != null)
                  TextButton.icon(
                    onPressed: onDetail,
                    icon: const Icon(Icons.info_outline),
                    label: Text(s.managedByCarrier ? 'Chi tiết & thao tác hãng' : 'Chi tiết'),
                  ),
                if (s.groupId.isNotEmpty && s.status != ShipmentStatus.cancelled)
                  TextButton.icon(
                    onPressed: () => _printLabel(context, repo),
                    icon: const Icon(Icons.print_outlined),
                    label: const Text('In nhãn kiện'),
                  ),
              ],
            ),
            if (s.status == ShipmentStatus.outForDelivery && !s.managedByCarrier && allowed) ...[
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
            if (s.canRetry && !s.managedByCarrier && allowed) ...[
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
