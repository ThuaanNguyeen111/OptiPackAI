import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../core/format/units.dart';
import '../../core/network/api_exception.dart';
import '../offline/sync_status_bar.dart';
import 'scanner_screen.dart';
import 'warehouse_logic.dart';
import 'warehouse_models.dart';
import 'warehouse_repository.dart';
import '../../app/colors.dart';

/// Lấy hàng một nhóm đơn: danh sách theo lộ trình kệ, quét ô/SKU, xác nhận số lượng.
///
/// Mỗi lần xác nhận lưu **trên máy trước** rồi tự gửi (xem [SyncController]), nên mất mạng ở cuối kho
/// vẫn quét tiếp được. Hoàn tất lấy hàng và báo thiếu dùng `expected_version` nên chỉ gửi khi có mạng.
class PickScreen extends ConsumerStatefulWidget {
  const PickScreen({super.key, required this.groupId});

  final String groupId;

  @override
  ConsumerState<PickScreen> createState() => _PickScreenState();
}

class _PickScreenState extends ConsumerState<PickScreen> {
  final _code = TextEditingController();
  final _codeFocus = FocusNode();
  bool _manual = false;
  bool _completing = false;

  @override
  void dispose() {
    _code.dispose();
    _codeFocus.dispose();
    super.dispose();
  }

  void _toast(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: error ? AppColors.danger : null,
        ),
      );
  }

  Future<void> _scanWithCamera(PickData data) async {
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const ScannerScreen()),
    );
    if (code == null || !mounted) {
      _codeFocus.requestFocus();
      return;
    }
    await _handleCode(data, code, ScanMethod.barcode);
  }

  /// Máy quét Bluetooth gõ mã như bàn phím rồi bấm Enter vào ô nhập luôn được focus.
  Future<void> _submitTyped(PickData data) async {
    final code = _code.text;
    _code.clear();
    await _handleCode(
      data,
      code,
      _manual ? ScanMethod.manual : ScanMethod.barcode,
    );
    _codeFocus.requestFocus();
  }

  Future<void> _handleCode(PickData data, String code, ScanMethod method) async {
    if (code.trim().isEmpty) return;
    final line = findLineForScan(data.lines, code);
    if (line == null) {
      HapticFeedback.heavyImpact();
      _toast('Mã "${code.trim()}" không thuộc nhóm này. Kiểm tra đúng ô và SKU.', error: true);
      return;
    }
    await _openConfirm(data, line, method);
  }

  Future<void> _openConfirm(PickData data, PickLine line, ScanMethod method) async {
    if (!line.hasBin) {
      HapticFeedback.heavyImpact();
      _toast('SKU ${line.sku} chưa được gán ô. Báo Admin gán ô trước khi lấy.', error: true);
      return;
    }
    if (remaining(line) <= 0) {
      HapticFeedback.mediumImpact();
      _toast('SKU ${line.sku} đã lấy đủ số lượng.');
      return;
    }
    final result = await showModalBottomSheet<_ConfirmResult>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _ConfirmPickSheet(line: line, canReport: !data.fromCache),
    );
    if (result == null || !mounted) return;

    if (result.reportMissing) {
      await _reportMissing(data, line, result.quantity);
      return;
    }

    final repo = ref.read(warehouseRepositoryProvider);
    final action = repo.buildPickItemAction(
      groupId: data.group.id,
      line: line,
      quantity: result.quantity,
      method: method,
      warehouseId: data.warehouseId,
    );
    await ref.read(syncControllerProvider.notifier).enqueue(action);
    HapticFeedback.mediumImpact();
    _toast('Đã ghi nhận ${action.label}');
  }

  Future<void> _reportMissing(PickData data, PickLine line, int missing) async {
    final note = await showDialog<String>(
      context: context,
      builder: (_) => _MissingDialog(sku: line.sku, quantity: missing),
    );
    if (note == null || !mounted) return;
    try {
      await ref.read(warehouseRepositoryProvider).reportMissing(
            groupId: data.group.id,
            sku: line.sku,
            missingQuantity: missing,
            warehouseId: data.warehouseId,
            expectedVersion: data.group.version,
            note: note,
          );
      ref.invalidate(pickDataProvider(widget.groupId));
      ref.invalidate(myWorkProvider);
      _toast('Đã báo thiếu ${line.sku}. Chủ shop sẽ được thông báo.');
    } on ApiException catch (e) {
      _toast(_friendly(e), error: true);
      if (e.isStateConflict) ref.invalidate(pickDataProvider(widget.groupId));
    }
  }

  Future<void> _complete(PickData data) async {
    setState(() => _completing = true);
    try {
      final repo = ref.read(warehouseRepositoryProvider);
      // Lấy version mới nhất ngay trước khi gửi nút đổi trạng thái.
      final fresh = await repo.groupDetail(data.group.id);
      await repo.completePick(data.group.id, fresh.version);
      ref.invalidate(myWorkProvider);
      if (!mounted) return;
      _toast('Đã hoàn tất lấy hàng. Chuyển khay sang bàn đóng gói.');
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      _toast(_friendly(e), error: true);
      ref.invalidate(pickDataProvider(widget.groupId));
    } finally {
      if (mounted) setState(() => _completing = false);
    }
  }

  /// 409 `ORD_GROUP_PICK_INCOMPLETE` kèm danh sách món thiếu: hiện danh sách đó.
  String _friendly(ApiException e) {
    if (e.errorCode == 'ORD_GROUP_PICK_INCOMPLETE') {
      final lines = missingLines(e.details);
      if (lines.isNotEmpty) return '${e.message}\n${lines.join('\n')}';
    }
    if (e.isStateConflict) return 'Nhóm này vừa được người khác cập nhật. Đã tải lại.';
    if (e.errorCode == 'ORD_GROUP_WRONG_WAREHOUSE') {
      return 'Sai kho: nhóm này đã giữ hàng ở kho khác.';
    }
    return e.message;
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(pickDataProvider(widget.groupId));
    final syncPending = ref.watch(syncControllerProvider.select((s) => s.pending));
    final data = async.valueOrNull;

    return Scaffold(
      appBar: AppBar(
        title: Text(data != null ? 'Nhóm ${data.group.shortId}' : 'Lấy hàng'),
        actions: [
          IconButton(
            tooltip: 'Tải lại',
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(pickDataProvider(widget.groupId)),
          ),
        ],
      ),
      body: Column(
        children: [
          const SyncStatusBar(),
          Expanded(
            child: async.when(
              skipLoadingOnRefresh: true,
              data: (d) => _buildBody(d),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        e is ApiException ? e.message : 'Không tải được nhóm đơn.',
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      OutlinedButton(
                        onPressed: () => ref.invalidate(pickDataProvider(widget.groupId)),
                        child: const Text('Thử lại'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: data == null ? null : _bottomBar(data, syncPending),
    );
  }

  Widget _buildBody(PickData data) {
    final lines = data.lines;
    final doneCount = lines.where((l) => l.pickedQuantity >= l.quantity).length;
    final totalUnits = lines.fold<int>(0, (s, l) => s + l.quantity);
    final doneUnits = lines.fold<int>(0, (s, l) => s + l.pickedQuantity);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        if (data.fromCache)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              'Số trên máy có thể cũ. Báo thiếu và hoàn tất cần có mạng.',
              style: TextStyle(color: AppColors.warning, fontWeight: FontWeight.w600),
            ),
          ),
        if (data.group.recipientNamesDiffer)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              'Nhóm có nhiều người nhận khác tên — không trộn hàng của các đơn.',
              style: TextStyle(color: AppColors.stagePack, fontWeight: FontWeight.w600),
            ),
          ),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _code,
                focusNode: _codeFocus,
                autofocus: true,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _submitTyped(data),
                decoration: InputDecoration(
                  labelText: _manual ? 'Nhập tay mã ô / SKU' : 'Quét mã ô / SKU',
                  hintText: 'Máy quét Bluetooth gõ vào đây',
                  suffixIcon: IconButton(
                    tooltip: 'Xác nhận mã',
                    icon: const Icon(Icons.keyboard_return),
                    onPressed: () => _submitTyped(data),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            IconButton.filled(
              tooltip: 'Quét bằng camera',
              iconSize: 28,
              style: IconButton.styleFrom(minimumSize: const Size(56, 56)),
              icon: const Icon(Icons.qr_code_scanner),
              onPressed: () => _scanWithCamera(data),
            ),
          ],
        ),
        const SizedBox(height: 4),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          dense: true,
          title: const Text('Nhập tay (tem rách, camera lỗi)'),
          value: _manual,
          onChanged: (v) => setState(() => _manual = v),
        ),
        const SizedBox(height: 8),
        Text(
          '$doneCount/${lines.length} SKU · $doneUnits/$totalUnits sản phẩm',
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(
            minHeight: 8,
            value: totalUnits == 0 ? 0 : doneUnits / totalUnits,
            color: AppColors.good,
            backgroundColor: AppColors.hairline,
          ),
        ),
        const SizedBox(height: 16),
        if (lines.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 32),
            child: Text(
              'Nhóm này không còn SKU cần lấy.',
              textAlign: TextAlign.center,
            ),
          ),
        for (final line in lines) ...[
          _LineTile(
            line: line,
            onTap: () => _openConfirm(data, line, ScanMethod.manual),
          ),
          const SizedBox(height: 10),
        ],
      ],
    );
  }

  Widget _bottomBar(PickData data, int syncPending) {
    final all = allPicked(data.lines);
    final canComplete = all && syncPending == 0 && !data.fromCache && !_completing;
    final hint = !all
        ? 'Quét đủ ${data.lines.length} SKU rồi hoàn tất.'
        : syncPending > 0
            ? 'Đang chờ gửi $syncPending thao tác — gửi xong mới hoàn tất được.'
            : data.fromCache
                ? 'Cần có mạng để hoàn tất.'
                : 'Đã quét đủ. Bấm để chuyển nhóm sang bàn đóng gói.';
    return SafeArea(
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: AppColors.hairline)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(hint, style: TextStyle(fontSize: 12, color: AppColors.inkSubtle)),
            const SizedBox(height: 8),
            FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: AppColors.good),
              onPressed: canComplete ? () => _complete(data) : null,
              icon: _completing
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                    )
                  : const Icon(Icons.check_circle_outline),
              label: const Text('Hoàn tất lấy hàng'),
            ),
          ],
        ),
      ),
    );
  }
}

class _LineTile extends StatelessWidget {
  const _LineTile({required this.line, required this.onTap});

  final PickLine line;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final done = line.pickedQuantity >= line.quantity;
    final color = done ? AppColors.good : Theme.of(context).colorScheme.primary;
    return Card(
      color: done ? AppColors.goodBg : null,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Icon(done ? Icons.check_circle : Icons.radio_button_unchecked, color: color, size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Mã ô là thứ nhân viên tìm trước nên đặt to nhất.
                    Text(
                      line.hasBin ? line.binCode : unassignedBin,
                      style: TextStyle(
                        fontFamily: 'monospace',
                        fontWeight: FontWeight.w800,
                        fontSize: 18,
                        color: line.hasBin ? AppColors.ink : AppColors.warning,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(line.sku, style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
                    if (line.oldestLotCode != null)
                      Text(
                        'Lô cũ nhất: ${line.oldestLotCode}',
                        style: TextStyle(fontSize: 12, color: AppColors.inkSubtle),
                      ),
                    if (line.otherBins.isNotEmpty)
                      Text(
                        'Ô khác: ${line.otherBins.map((b) => '${b.binCode} (${b.quantityOnHand})').join(', ')}',
                        style: TextStyle(fontSize: 12, color: AppColors.inkSubtle),
                      ),
                    if (line.lengthCm > 0)
                      Text(
                        '${formatDimsCm(line.lengthCm, line.widthCm, line.heightCm)} · ${formatKg(line.weightKg)}',
                        style: TextStyle(fontSize: 12, color: AppColors.inkSubtle),
                      ),
                    if (line.isFragile)
                      Text(
                        'Hàng dễ vỡ',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.danger,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                  ],
                ),
              ),
              Text(
                '${line.pickedQuantity}/${line.quantity}',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20, color: color),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ConfirmResult {
  const _ConfirmResult(this.quantity, {this.reportMissing = false});
  final int quantity;
  final bool reportMissing;
}

class _ConfirmPickSheet extends StatefulWidget {
  const _ConfirmPickSheet({required this.line, required this.canReport});

  final PickLine line;
  final bool canReport;

  @override
  State<_ConfirmPickSheet> createState() => _ConfirmPickSheetState();
}

class _ConfirmPickSheetState extends State<_ConfirmPickSheet> {
  late int _qty = remaining(widget.line);

  @override
  Widget build(BuildContext context) {
    final line = widget.line;
    final max = remaining(line);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              line.binCode,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 26,
                fontWeight: FontWeight.w800,
              ),
            ),
            Text(
              line.sku,
              textAlign: TextAlign.center,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 15),
            ),
            const SizedBox(height: 4),
            Text(
              'Còn cần lấy $max (đặt ${line.quantity}, đã lấy ${line.pickedQuantity})',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.inkSubtle),
            ),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton.outlined(
                  iconSize: 28,
                  style: IconButton.styleFrom(minimumSize: const Size(56, 56)),
                  onPressed: _qty > 1 ? () => setState(() => _qty--) : null,
                  icon: const Icon(Icons.remove),
                ),
                SizedBox(
                  width: 110,
                  child: Text(
                    '$_qty',
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 36, fontWeight: FontWeight.w800),
                  ),
                ),
                IconButton.outlined(
                  iconSize: 28,
                  style: IconButton.styleFrom(minimumSize: const Size(56, 56)),
                  onPressed: _qty < max ? () => setState(() => _qty++) : null,
                  icon: const Icon(Icons.add),
                ),
              ],
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: () => Navigator.pop(context, _ConfirmResult(_qty)),
              icon: const Icon(Icons.check),
              label: Text('Xác nhận lấy $_qty'),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: widget.canReport
                  ? () => Navigator.pop(context, _ConfirmResult(_qty, reportMissing: true))
                  : null,
              icon: const Icon(Icons.report_gmailerrorred_outlined),
              label: Text(widget.canReport ? 'Báo thiếu $_qty' : 'Báo thiếu (cần có mạng)'),
            ),
          ],
        ),
      ),
    );
  }
}

class _MissingDialog extends StatefulWidget {
  const _MissingDialog({required this.sku, required this.quantity});

  final String sku;
  final int quantity;

  @override
  State<_MissingDialog> createState() => _MissingDialogState();
}

class _MissingDialogState extends State<_MissingDialog> {
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Báo thiếu hàng'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${widget.sku} — thiếu ${widget.quantity}'),
          const SizedBox(height: 8),
          Text(
            'Nhóm sẽ chuyển sang "Thiếu hàng — cần duyệt". Bạn không tự quyết định giao thiếu.',
            style: TextStyle(fontSize: 12, color: AppColors.inkSubtle),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _note,
            maxLines: 2,
            decoration: const InputDecoration(labelText: 'Ghi chú (không bắt buộc)'),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Hủy')),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
          onPressed: () => Navigator.pop(context, _note.text),
          child: const Text('Gửi báo cáo'),
        ),
      ],
    );
  }
}
