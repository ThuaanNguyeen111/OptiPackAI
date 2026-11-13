import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:image_picker/image_picker.dart';

import '../../app/mock_providers.dart';
import '../../core/network/api_exception.dart';
import '../proof/proof_photo_field.dart';
import '../proof/proof_photo_repository.dart';
import '../warehouse/scanner_screen.dart';
import '../../shared/widgets.dart';
import 'returns_repository.dart';
import '../../app/colors.dart';

/// Warehouse Staff: nhận kiện hoàn → kiểm hàng (nhập lại kho / cách ly / hủy) + kiểm bao bì.
class WarehouseReturnsScreen extends ConsumerStatefulWidget {
  const WarehouseReturnsScreen({super.key});

  @override
  ConsumerState<WarehouseReturnsScreen> createState() => _WarehouseReturnsScreenState();
}

class _WarehouseReturnsScreenState extends ConsumerState<WarehouseReturnsScreen> {
  ReturnStatus _tab = ReturnStatus.awaitingReceipt;

  void _refresh() {
    ref.invalidate(returnsByStatusProvider(ReturnStatus.awaitingReceipt));
    ref.invalidate(returnsByStatusProvider(ReturnStatus.received));
  }

  Future<void> _receive(ReturnRequest r) async {
    final ok = await confirmDialog(
      context,
      title: 'Nhận kiện hoàn?',
      message: '${r.code}\nĐơn ${r.orderCode}: xác nhận đã nhận kiện về kho.',
      confirmLabel: 'Đã nhận',
    );
    if (!ok || !mounted) return;
    try {
      await ref.read(returnsRepositoryProvider).receive(r.id);
      HapticFeedback.mediumImpact();
      _refresh();
      if (mounted) showToast(context, 'Đã nhận ${r.code}. Chuyển sang kiểm hàng.');
    } on ReturnsException catch (e) {
      if (mounted) showToast(context, e.message, error: true);
    }
  }

  Future<void> _inspect(ReturnRequest r) async {
    final done = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => InspectReturnScreen(request: r)),
    );
    if (done == true) {
      _refresh();
      if (mounted) showToast(context, 'Đã kiểm xong ${r.code}.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(returnsByStatusProvider(_tab));
    return Column(
      children: [
        const MockBanner(),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: SegmentedButton<ReturnStatus>(
            segments: const [
              ButtonSegment(value: ReturnStatus.awaitingReceipt, label: Text('Chờ nhận kiện')),
              ButtonSegment(value: ReturnStatus.received, label: Text('Chờ kiểm hàng')),
            ],
            selected: {_tab},
            onSelectionChanged: (s) => setState(() => _tab = s.first),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => _refresh(),
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ErrorState(error: e, onRetry: _refresh),
              data: (items) => items.isEmpty
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: const [
                        SizedBox(height: 80),
                        EmptyState(icon: Icons.assignment_return_outlined, text: 'Không có phiếu nào.'),
                      ],
                    )
                  : ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(16),
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 12),
                      itemBuilder: (context, i) => _ReturnCard(
                        request: items[i],
                        actionLabel: _tab == ReturnStatus.awaitingReceipt ? 'Nhận kiện' : 'Kiểm hàng',
                        onAction: () => _tab == ReturnStatus.awaitingReceipt ? _receive(items[i]) : _inspect(items[i]),
                      ),
                    ),
            ),
          ),
        ),
      ],
    );
  }
}

class _ReturnCard extends StatelessWidget {
  const _ReturnCard({required this.request, this.actionLabel, this.onAction, this.secondary});

  final ReturnRequest request;
  final String? actionLabel;
  final VoidCallback? onAction;
  final Widget? secondary;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(request.code,
                      style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w800)),
                ),
                if (request.isFailedDelivery) const Pill('Giao thất bại', Colors.deepOrange),
              ],
            ),
            const SizedBox(height: 4),
            Text('Đơn ${request.orderCode} · ${formatDateTime(request.createdAt)}',
                style: TextStyle(color: AppColors.inkSubtle)),
            const SizedBox(height: 8),
            Text(request.reason),
            const SizedBox(height: 8),
            for (final i in request.items)
              Text('• ${i.quantity} × ${i.sku}', style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
            if (actionLabel != null || secondary != null) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  if (secondary != null) Expanded(child: secondary!),
                  if (secondary != null && actionLabel != null) const SizedBox(width: 10),
                  if (actionLabel != null)
                    Expanded(
                      child: FilledButton(
                        style: FilledButton.styleFrom(minimumSize: const Size(0, 46)),
                        onPressed: onAction,
                        child: Text(actionLabel!),
                      ),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Kiểm hàng hoàn: kết quả từng dòng + kiểm bao bì. Ảnh tình trạng hàng chờ BE.
class InspectReturnScreen extends ConsumerStatefulWidget {
  const InspectReturnScreen({super.key, required this.request});

  final ReturnRequest request;

  @override
  ConsumerState<InspectReturnScreen> createState() => _InspectReturnScreenState();
}

class _InspectReturnScreenState extends ConsumerState<InspectReturnScreen> {
  late final Map<String, InspectResult> _results = {
    for (final i in widget.request.items) i.sku: InspectResult.restock,
  };
  late final Map<String, TextEditingController> _bins = {
    for (final i in widget.request.items) i.sku: TextEditingController(),
  };
  final _material = TextEditingController();
  PackagingGrade? _grade;
  bool _labelRemoved = false;
  List<XFile> _photos = const [];
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in _bins.values) {
      c.dispose();
    }
    _material.dispose();
    super.dispose();
  }

  Future<void> _scanBin(String sku) async {
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const ScannerScreen()),
    );
    if (code != null && mounted) setState(() => _bins[sku]!.text = code.trim());
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final photoUrls = await ref.read(proofPhotoRepositoryProvider).upload(_photos);
      await ref.read(returnsRepositoryProvider).inspect(
            widget.request.id,
            [
              for (final i in widget.request.items)
                InspectLine(
                  sku: i.sku,
                  quantity: i.quantity,
                  result: _results[i.sku]!,
                  binCode: _bins[i.sku]!.text,
                ),
            ],
            _grade == null
                ? null
                : PackagingCheck(grade: _grade!, oldLabelRemoved: _labelRemoved, materialCode: _material.text),
            photoUrls: photoUrls,
          );
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      Navigator.pop(context, true);
    } on ReturnsException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.request;
    return Scaffold(
      appBar: AppBar(title: Text('Kiểm ${r.code}')),
      body: Column(
        children: [
          const MockBanner(),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text('Đơn ${r.orderCode}', style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 14),
                const Text('Tình trạng hàng', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 8),
                for (final i in r.items) ...[
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${i.quantity} × ${i.sku}',
                              style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700)),
                          const SizedBox(height: 8),
                          SegmentedButton<InspectResult>(
                            segments: [
                              for (final res in InspectResult.values)
                                ButtonSegment(value: res, label: Text(res.label, style: const TextStyle(fontSize: 12))),
                            ],
                            selected: {_results[i.sku]!},
                            onSelectionChanged: (s) => setState(() => _results[i.sku] = s.first),
                          ),
                          if (_results[i.sku] == InspectResult.restock) ...[
                            const SizedBox(height: 10),
                            TextField(
                              controller: _bins[i.sku],
                              textCapitalization: TextCapitalization.characters,
                              decoration: InputDecoration(
                                labelText: 'Ô nhập lại',
                                hintText: 'VD KA-D1-P01-T01-1',
                                suffixIcon: IconButton(
                                  tooltip: 'Quét mã ô',
                                  icon: const Icon(Icons.qr_code_scanner),
                                  onPressed: () => _scanBin(i.sku),
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                ],
                const SizedBox(height: 8),
                const Text('Bao bì (thùng) thu hồi', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    ChoiceChip(
                      label: const Text('Không thu hồi'),
                      selected: _grade == null,
                      onSelected: (_) => setState(() => _grade = null),
                    ),
                    for (final g in PackagingGrade.values)
                      ChoiceChip(
                        label: Text('${g.code} · ${g.label}'),
                        selected: _grade == g,
                        onSelected: (_) => setState(() => _grade = g),
                      ),
                  ],
                ),
                if (_grade != null) ...[
                  const SizedBox(height: 8),
                  TextField(
                    controller: _material,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(labelText: 'Mã thùng thu hồi', hintText: 'VD BOX-M'),
                  ),
                ],
                if (_grade == PackagingGrade.a)
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _labelRemoved,
                    onChanged: (v) => setState(() => _labelRemoved = v ?? false),
                    title: const Text('Đã gỡ / che nhãn cũ'),
                    subtitle: const Text('Nhãn cũ có tên, SĐT khách. Bắt buộc với thùng hạng A.'),
                  ),
                const SizedBox(height: 12),
                ProofPhotoField(
                  label: 'Ảnh tình trạng hàng',
                  enabled: !_busy,
                  photos: _photos,
                  onChanged: (p) => setState(() => _photos = p),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
                ],
              ],
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: FilledButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox(
                        height: 22,
                        width: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                      )
                    : const Text('Hoàn tất kiểm hàng'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Store Owner: duyệt hoặc từ chối yêu cầu trả hàng của khách (từ chối bắt buộc lý do).
class ReturnsApprovalScreen extends ConsumerWidget {
  const ReturnsApprovalScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(returnsByStatusProvider(ReturnStatus.requested));
    void refresh() => ref.invalidate(returnsByStatusProvider(ReturnStatus.requested));

    return Column(
      children: [
        const MockBanner(),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => refresh(),
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ErrorState(error: e, onRetry: refresh),
              data: (items) => items.isEmpty
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: const [
                        SizedBox(height: 80),
                        EmptyState(icon: Icons.task_alt, text: 'Không có yêu cầu trả hàng chờ duyệt.'),
                      ],
                    )
                  : ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(16),
                      itemCount: items.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 12),
                      itemBuilder: (context, i) {
                        final r = items[i];
                        return _ReturnCard(
                          request: r,
                          actionLabel: 'Duyệt',
                          onAction: () async {
                            final ok = await confirmDialog(
                              context,
                              title: 'Duyệt trả hàng?',
                              message: '${r.code}\nHệ thống sẽ chờ nhận kiện hoàn về kho.',
                              confirmLabel: 'Duyệt',
                            );
                            if (!ok || !context.mounted) return;
                            try {
                              await ref.read(returnsRepositoryProvider).approve(r.id);
                              refresh();
                            } on ReturnsException catch (e) {
                              if (context.mounted) showToast(context, e.message, error: true);
                            }
                          },
                          secondary: OutlinedButton(
                            style: OutlinedButton.styleFrom(minimumSize: const Size(0, 46)),
                            onPressed: () async {
                              final reason = await showDialog<String>(
                                context: context,
                                builder: (_) => const _RejectReasonDialog(),
                              );
                              if (reason == null || !context.mounted) return;
                              try {
                                await ref.read(returnsRepositoryProvider).reject(r.id, reason);
                                refresh();
                              } on ReturnsException catch (e) {
                                if (context.mounted) showToast(context, e.message, error: true);
                              }
                            },
                            child: const Text('Từ chối'),
                          ),
                        );
                      },
                    ),
            ),
          ),
        ),
      ],
    );
  }
}

class _RejectReasonDialog extends StatefulWidget {
  const _RejectReasonDialog();

  @override
  State<_RejectReasonDialog> createState() => _RejectReasonDialogState();
}

class _RejectReasonDialogState extends State<_RejectReasonDialog> {
  final _reason = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Từ chối trả hàng'),
      content: TextField(
        controller: _reason,
        maxLines: 3,
        decoration: InputDecoration(labelText: 'Lý do (bắt buộc)', errorText: _error),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Hủy')),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
          onPressed: () {
            if (_reason.text.trim().isEmpty) {
              setState(() => _error = 'Cần nhập lý do.');
              return;
            }
            Navigator.pop(context, _reason.text.trim());
          },
          child: const Text('Từ chối'),
        ),
      ],
    );
  }
}
