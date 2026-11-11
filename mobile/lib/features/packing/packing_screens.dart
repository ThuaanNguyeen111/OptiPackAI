import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/mock_providers.dart';
import '../../core/format/deadline.dart';
import '../../core/format/units.dart';
import '../../shared/widgets.dart';
import '../warehouse/scanner_screen.dart';
import 'packing_repository.dart';
import 'parcel_layer_view.dart';
import '../../app/colors.dart';

/// Hàng đợi của Packaging Staff: chờ chấp nhận kế hoạch / đang đóng.
class PackingQueueScreen extends ConsumerStatefulWidget {
  const PackingQueueScreen({super.key});

  @override
  ConsumerState<PackingQueueScreen> createState() => _PackingQueueScreenState();
}

class _PackingQueueScreenState extends ConsumerState<PackingQueueScreen> {
  PackingStage _stage = PackingStage.pendingApproval;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(packingQueueProvider(_stage));
    return Column(
      children: [
        const MockBanner(),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: SegmentedButton<PackingStage>(
            segments: const [
              ButtonSegment(value: PackingStage.pendingApproval, label: Text('Chờ chấp nhận')),
              ButtonSegment(value: PackingStage.packing, label: Text('Đang đóng')),
            ],
            selected: {_stage},
            onSelectionChanged: (s) => setState(() => _stage = s.first),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => ref.invalidate(packingQueueProvider(_stage)),
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => EmptyState(icon: Icons.error_outline, text: '$e'),
              data: (items) => items.isEmpty
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: const [
                        SizedBox(height: 80),
                        EmptyState(icon: Icons.inventory_2_outlined, text: 'Không có nhóm nào.'),
                      ],
                    )
                  : ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(16),
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 12),
                      itemBuilder: (context, i) => _QueueCard(
                        group: items[i],
                        onTap: () async {
                          await Navigator.of(context).push<void>(
                            MaterialPageRoute(builder: (_) => PackingGroupScreen(groupId: items[i].id)),
                          );
                          ref.invalidate(packingQueueProvider(PackingStage.pendingApproval));
                          ref.invalidate(packingQueueProvider(PackingStage.packing));
                        },
                      ),
                    ),
            ),
          ),
        ),
      ],
    );
  }
}

class _QueueCard extends StatelessWidget {
  const _QueueCard({required this.group, required this.onTap});

  final PackingGroup group;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final d = group.isExpress && group.deadline != null ? deadlineLabel(group.deadline!, DateTime.now()) : null;
    final done = group.parcels.where((p) => p.status != ParcelStatus.pending).length;
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(group.shortId,
                      style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(width: 8),
                  Text(group.platform, style: TextStyle(color: AppColors.inkSubtle)),
                  const Spacer(),
                  const Icon(Icons.chevron_right),
                ],
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  if (group.isExpress) const Pill('Hỏa tốc', Colors.deepOrange),
                  if (d != null)
                    Pill(
                      d.text,
                      switch (d.tone) {
                        DeadlineTone.late => AppColors.danger,
                        DeadlineTone.soon => AppColors.warning,
                        DeadlineTone.ok => Colors.deepOrange,
                      },
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                group.stage == PackingStage.packing
                    ? '${group.parcels.length} kiện · đã niêm phong $done/${group.parcels.length}'
                    : '${group.parcels.length} kiện · chờ bạn chấp nhận kế hoạch',
                style: TextStyle(color: AppColors.inkSubtle),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Một nhóm đơn: xem kế hoạch rồi chấp nhận / từ chối; sau khi chấp nhận thì quét món và niêm phong từng kiện.
class PackingGroupScreen extends ConsumerStatefulWidget {
  const PackingGroupScreen({super.key, required this.groupId});

  final String groupId;

  @override
  ConsumerState<PackingGroupScreen> createState() => _PackingGroupScreenState();
}

class _PackingGroupScreenState extends ConsumerState<PackingGroupScreen> {
  int _parcelIndex = 0;
  final _code = TextEditingController();
  final _weight = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    _weight.dispose();
    super.dispose();
  }

  void _refresh() => ref.invalidate(packingGroupProvider(widget.groupId));

  Future<void> _approve() async {
    final ok = await confirmDialog(
      context,
      title: 'Chấp nhận kế hoạch?',
      message: 'Bắt đầu đóng gói theo kế hoạch này.',
      confirmLabel: 'Chấp nhận',
    );
    if (!ok || !mounted) return;
    await _run(() => ref.read(packingRepositoryProvider).approve(widget.groupId));
  }

  Future<void> _reject() async {
    final result = await showModalBottomSheet<({RejectReason reason, String note})>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _RejectSheet(),
    );
    if (result == null || !mounted) return;
    final ok = await _run(
      () => ref.read(packingRepositoryProvider).reject(widget.groupId, result.reason, result.note),
    );
    if (ok && mounted) {
      showToast(context, 'Đã từ chối kế hoạch.');
      Navigator.pop(context);
    }
  }

  Future<bool> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
      _refresh();
      return true;
    } on PackingException catch (e) {
      if (mounted) showToast(context, e.message, error: true);
      return false;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _scan(Parcel parcel, String code) async {
    if (code.trim().isEmpty) return;
    try {
      await ref.read(packingRepositoryProvider).scan(widget.groupId, parcel.no, code);
      HapticFeedback.mediumImpact();
      _refresh();
    } on PackingException catch (e) {
      HapticFeedback.heavyImpact();
      if (mounted) showToast(context, e.message, error: true);
    }
  }

  Future<void> _scanCamera(Parcel parcel) async {
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const ScannerScreen()),
    );
    if (code != null && mounted) await _scan(parcel, code);
  }

  Future<void> _seal(Parcel parcel) async {
    final kg = double.tryParse(_weight.text.trim().replaceAll(',', '.'));
    if (kg == null || kg <= 0) {
      showToast(context, 'Nhập cân nặng thật của kiện (kg).', error: true);
      return;
    }
    final ok = await confirmDialog(
      context,
      title: 'Niêm phong kiện ${parcel.no}?',
      message: 'Cân thật ${formatKg(kg)} (ước tính ${formatKg(parcel.expectedWeightKg)}).',
      confirmLabel: 'Niêm phong',
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      final res = await ref.read(packingRepositoryProvider).seal(widget.groupId, parcel.no, kg);
      _weight.clear();
      _refresh();
      if (!mounted) return;
      if (res.outcome == SealOutcome.held) {
        HapticFeedback.heavyImpact();
        showToast(context, 'Cân lệch quá 20% — kiện bị giữ, cần người khác xem lại.', error: true);
      } else {
        HapticFeedback.mediumImpact();
        showToast(context, 'Đã niêm phong kiện ${parcel.no}.');
      }
    } on PackingException catch (e) {
      if (mounted) showToast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reportIssue(Parcel parcel) async {
    final result = await showModalBottomSheet<({String sku, PackIssue issue})>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _IssueSheet(parcel: parcel),
    );
    if (result == null || !mounted) return;
    await _run(() => ref.read(packingRepositoryProvider).reportIssue(widget.groupId, parcel.no, result.sku, result.issue));
    if (mounted) showToast(context, 'Đã báo ${result.issue.label.toLowerCase()} món ${result.sku}.');
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(packingGroupProvider(widget.groupId));
    final group = async.valueOrNull;
    return Scaffold(
      appBar: AppBar(title: Text(group != null ? 'Nhóm ${group.shortId}' : 'Đóng gói')),
      body: Column(
        children: [
          const MockBanner(),
          Expanded(
            child: async.when(
              skipLoadingOnRefresh: true,
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => EmptyState(icon: Icons.error_outline, text: '$e'),
              data: (g) => g.stage == PackingStage.pendingApproval ? _planView(g) : _sessionView(g),
            ),
          ),
        ],
      ),
      bottomNavigationBar: group != null && group.stage == PackingStage.pendingApproval
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(onPressed: _busy ? null : _reject, child: const Text('Từ chối')),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton(onPressed: _busy ? null : _approve, child: const Text('Chấp nhận')),
                    ),
                  ],
                ),
              ),
            )
          : null,
    );
  }

  Widget _planView(PackingGroup g) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('${g.parcels.length} kiện — xem kế hoạch rồi chấp nhận hoặc từ chối.',
            style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 12),
        for (final p in g.parcels) ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Kiện ${p.no} · ${p.boxName} (${p.boxCode})',
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  Text(
                    'Lòng thùng ${formatDimsCm(p.innerL, p.innerW, p.innerH)} · ước tính ${formatKg(p.expectedWeightKg)}',
                    style: TextStyle(color: AppColors.inkSubtle, fontSize: 13),
                  ),
                  if (p.cutFromH != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        'Cắt hạ thùng còn ${formatCm(p.innerH)} cm (gốc ${formatCm(p.cutFromH!)} cm) trước khi xếp.',
                        style: TextStyle(color: AppColors.warningText, fontWeight: FontWeight.w700, fontSize: 13),
                      ),
                    ),
                  const SizedBox(height: 12),
                  ParcelLayerView(parcel: p),
                  const SizedBox(height: 8),
                  for (final e in p.needed.entries)
                    Text('• ${e.value} × ${e.key}', style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],
      ],
    );
  }

  Widget _sessionView(PackingGroup g) {
    final index = _parcelIndex.clamp(0, g.parcels.length - 1);
    final parcel = g.parcels[index];
    final pending = parcel.status == ParcelStatus.pending;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (var i = 0; i < g.parcels.length; i++) ...[
                ChoiceChip(
                  label: Text('Kiện ${g.parcels[i].no}${g.parcels[i].status == ParcelStatus.pending ? '' : ' ✓'}'),
                  selected: i == index,
                  onSelected: (_) => setState(() => _parcelIndex = i),
                ),
                const SizedBox(width: 8),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        Text('${parcel.boxName} (${parcel.boxCode})',
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        if (parcel.cutFromH != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text('Cắt hạ thùng còn ${formatCm(parcel.innerH)} cm trước khi xếp.',
                style: TextStyle(color: AppColors.warningText, fontWeight: FontWeight.w700)),
          ),
        if (parcel.status != ParcelStatus.pending)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Pill(
              parcel.status == ParcelStatus.held
                  ? 'Đang bị giữ — cân thật ${formatKg(parcel.sealedWeightKg ?? 0)} lệch so với ước tính'
                  : 'Đã niêm phong · ${formatKg(parcel.sealedWeightKg ?? 0)}',
              parcel.status == ParcelStatus.held ? AppColors.danger : AppColors.good,
            ),
          ),
        const SizedBox(height: 12),
        Text('Đã quét ${parcel.totalScanned}/${parcel.totalNeeded} món',
            style: const TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        LinearProgressIndicator(
          minHeight: 8,
          value: parcel.totalNeeded == 0 ? 0 : parcel.totalScanned / parcel.totalNeeded,
          color: AppColors.good,
          backgroundColor: AppColors.hairline,
        ),
        const SizedBox(height: 12),
        for (final e in parcel.needed.entries)
          Card(
            child: ListTile(
              leading: Icon(
                (parcel.scanned[e.key] ?? 0) >= e.value ? Icons.check_circle : Icons.radio_button_unchecked,
                color: (parcel.scanned[e.key] ?? 0) >= e.value ? AppColors.good : null,
              ),
              title: Text(e.key, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700)),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('${parcel.scanned[e.key] ?? 0}/${e.value}',
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                  if (pending && (parcel.scanned[e.key] ?? 0) > 0)
                    IconButton(
                      tooltip: 'Gỡ một lần quét nhầm',
                      icon: const Icon(Icons.undo),
                      onPressed: () async {
                        await ref.read(packingRepositoryProvider).unscan(widget.groupId, parcel.no, e.key);
                        _refresh();
                      },
                    ),
                ],
              ),
            ),
          ),
        const SizedBox(height: 12),
        ExpansionTile(
          title: const Text('Xem cách xếp'),
          children: [ParcelLayerView(parcel: parcel)],
        ),
        if (pending) ...[
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _code,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (v) {
                    _scan(parcel, v);
                    _code.clear();
                  },
                  decoration: const InputDecoration(
                    labelText: 'Quét / nhập SKU món',
                    hintText: 'Máy quét Bluetooth gõ vào đây',
                  ),
                ),
              ),
              const SizedBox(width: 10),
              IconButton.filled(
                style: IconButton.styleFrom(minimumSize: const Size(56, 56)),
                onPressed: () => _scanCamera(parcel),
                icon: const Icon(Icons.qr_code_scanner),
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _weight,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: 'Cân thật của kiện (kg)',
              helperText: 'Ước tính ${formatKg(parcel.expectedWeightKg)}. Lệch quá 20% thì kiện bị giữ.',
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: parcel.allScanned && !_busy ? () => _seal(parcel) : null,
            icon: const Icon(Icons.inventory_2),
            label: Text(parcel.allScanned ? 'Niêm phong kiện ${parcel.no}' : 'Quét đủ món để niêm phong'),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: _busy ? null : () => _reportIssue(parcel),
            icon: const Icon(Icons.report_gmailerrorred_outlined),
            label: const Text('Báo lỗi kiện (hỏng / thiếu / nhầm)'),
          ),
          const SizedBox(height: 10),
          const WaitingBackendButton(label: 'Chụp ảnh lỗi'),
        ],
      ],
    );
  }
}

class _RejectSheet extends StatefulWidget {
  const _RejectSheet();

  @override
  State<_RejectSheet> createState() => _RejectSheetState();
}

class _RejectSheetState extends State<_RejectSheet> {
  RejectReason? _reason;
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Vì sao từ chối kế hoạch?',
                textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            DropdownButtonFormField<RejectReason>(
              initialValue: _reason,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Lý do (bắt buộc)'),
              items: [for (final r in RejectReason.values) DropdownMenuItem(value: r, child: Text(r.label))],
              onChanged: (v) => setState(() => _reason = v),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _note,
              maxLines: 2,
              decoration: const InputDecoration(labelText: 'Ghi chú (không bắt buộc)'),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _reason == null ? null : () => Navigator.pop(context, (reason: _reason!, note: _note.text.trim())),
              child: const Text('Từ chối kế hoạch'),
            ),
          ],
        ),
      ),
    );
  }
}

class _IssueSheet extends StatefulWidget {
  const _IssueSheet({required this.parcel});

  final Parcel parcel;

  @override
  State<_IssueSheet> createState() => _IssueSheetState();
}

class _IssueSheetState extends State<_IssueSheet> {
  String? _sku;
  PackIssue _issue = PackIssue.damaged;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Báo lỗi kiện',
                textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _sku,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Món bị lỗi'),
              items: [for (final s in widget.parcel.needed.keys) DropdownMenuItem(value: s, child: Text(s))],
              onChanged: (v) => setState(() => _sku = v),
            ),
            const SizedBox(height: 12),
            SegmentedButton<PackIssue>(
              segments: [for (final i in PackIssue.values) ButtonSegment(value: i, label: Text(i.label))],
              selected: {_issue},
              onSelectionChanged: (s) => setState(() => _issue = s.first),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _sku == null ? null : () => Navigator.pop(context, (sku: _sku!, issue: _issue)),
              child: const Text('Gửi báo cáo'),
            ),
          ],
        ),
      ),
    );
  }
}
