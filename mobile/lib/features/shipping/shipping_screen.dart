import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/mock_providers.dart';
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
      error: (e, _) => EmptyState(icon: Icons.error_outline, text: '$e'),
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
                        Text(g.address, style: TextStyle(color: AppColors.inkSubtle)),
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
      child: Padding(
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
                            title: Text('${q.name} · ${q.service}', style: const TextStyle(fontWeight: FontWeight.w700)),
                            subtitle: Text('${formatVnd(q.feeVnd)} · ${q.eta}'),
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
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => EmptyState(icon: Icons.error_outline, text: '$e'),
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
        ShipmentStatus.outForDelivery => AppColors.stagePick,
        ShipmentStatus.deliveryFailed => AppColors.warning,
        ShipmentStatus.returningToWarehouse => AppColors.danger,
        ShipmentStatus.delivered => AppColors.good,
      };

  Future<void> _run(BuildContext context, Future<ShipmentView> Function() action, String ok) async {
    try {
      await action();
      HapticFeedback.mediumImpact();
      onChanged();
      if (context.mounted) showToast(context, ok);
    } on ShippingException catch (e) {
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
            Text('${s.recipientName} · ${s.carrierName} · ${s.trackingCode}', style: TextStyle(color: AppColors.inkSubtle)),
            Text('Lần giao ${s.attempt}/$maxDeliveryAttempts', style: TextStyle(color: AppColors.inkSubtle, fontSize: 12)),
            if (s.failureReason != null)
              Text('Lý do thất bại: ${s.failureReason!.label}', style: TextStyle(color: AppColors.warningText, fontSize: 13)),
            if (overdue) Padding(padding: EdgeInsets.only(top: 6), child: Pill('Quá hạn giao', AppColors.danger)),
            if (s.status == ShipmentStatus.returningToWarehouse)
              Padding(
                padding: EdgeInsets.only(top: 6),
                child: Text('Kho sẽ quét nhận kiện hoàn về.', style: TextStyle(fontSize: 12, color: AppColors.inkSubtle)),
              ),
            if (s.status == ShipmentStatus.outForDelivery) ...[
              const SizedBox(height: 12),
              const WaitingBackendButton(label: 'Chụp ảnh giao hàng'),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(minimumSize: const Size(0, 46)),
                      onPressed: () async {
                        final fail = await showModalBottomSheet<({FailureReason reason, String note})>(
                          context: context,
                          isScrollControlled: true,
                          showDragHandle: true,
                          builder: (_) => const _FailSheet(),
                        );
                        if (fail == null || !context.mounted) return;
                        await _run(context, () => repo.fail(s.id, fail.reason, note: fail.note), 'Đã ghi nhận giao thất bại.');
                      },
                      child: const Text('Thất bại'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton(
                      style: FilledButton.styleFrom(minimumSize: const Size(0, 46), backgroundColor: AppColors.good),
                      onPressed: () async {
                        final ok = await confirmDialog(
                          context,
                          title: 'Giao thành công?',
                          message: '${s.code} — ${s.recipientName}',
                          confirmLabel: 'Đã giao',
                        );
                        if (!ok || !context.mounted) return;
                        await _run(context, () => repo.deliver(s.id), 'Đã ghi nhận giao thành công.');
                      },
                      child: const Text('Đã giao'),
                    ),
                  ),
                ],
              ),
            ],
            if (s.canRetry) ...[
              const SizedBox(height: 12),
              FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
                onPressed: () => _run(context, () => repo.retry(s.id), 'Đã chuyển sang giao lại.'),
                child: const Text('Giao lại'),
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
            const SizedBox(height: 16),
            FilledButton(
              onPressed: needNote && _note.text.trim().isEmpty
                  ? null
                  : () => Navigator.pop(context, (reason: _reason, note: _note.text.trim())),
              child: const Text('Ghi nhận thất bại'),
            ),
          ],
        ),
      ),
    );
  }
}
