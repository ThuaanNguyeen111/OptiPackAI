import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../app/mock_providers.dart';
import '../../shared/widgets.dart';
import '../warehouse/scanner_screen.dart';
import 'stock_repository.dart';
import '../../app/colors.dart';

/// Nhập thêm / kiểm kê / chuyển ô: quét mã ô → chọn SKU trong ô → thao tác.
/// Mỗi thao tác sinh **một `client_event_id` lúc mở form**, giữ nguyên khi bấm lại (chống ghi trùng).
class StockScreen extends ConsumerStatefulWidget {
  const StockScreen({super.key});

  @override
  ConsumerState<StockScreen> createState() => _StockScreenState();
}

class _StockScreenState extends ConsumerState<StockScreen> {
  final _code = TextEditingController();
  BinStock? _bin;
  bool _loading = false;
  String? _notFound;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _load(String code) async {
    final value = code.trim();
    if (value.isEmpty) return;
    setState(() {
      _loading = true;
      _notFound = null;
    });
    final bin = await ref.read(stockRepositoryProvider).findBin(value);
    if (!mounted) return;
    setState(() {
      _loading = false;
      _bin = bin;
      _notFound = bin == null ? 'Không tìm thấy ô "$value".' : null;
    });
    if (bin == null) HapticFeedback.heavyImpact();
  }

  Future<void> _scan() async {
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const ScannerScreen()),
    );
    if (code == null || !mounted) return;
    _code.text = code;
    await _load(code);
  }

  Future<void> _reload() async {
    final bin = _bin;
    if (bin != null) await _load(bin.binCode);
  }

  @override
  Widget build(BuildContext context) {
    final bin = _bin;
    return Column(
      children: [
        const MockBanner(),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _code,
                      textInputAction: TextInputAction.search,
                      textCapitalization: TextCapitalization.characters,
                      onSubmitted: _load,
                      decoration: InputDecoration(
                        labelText: 'Mã ô kệ',
                        hintText: 'VD KA-D1-P01-T01-1',
                        suffixIcon: IconButton(
                          icon: const Icon(Icons.search),
                          onPressed: () => _load(_code.text),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  IconButton.filled(
                    tooltip: 'Quét ô bằng camera',
                    iconSize: 28,
                    style: IconButton.styleFrom(minimumSize: const Size(56, 56)),
                    onPressed: _scan,
                    icon: const Icon(Icons.qr_code_scanner),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              if (_loading) const Center(child: CircularProgressIndicator()),
              if (_notFound != null)
                Text(_notFound!, style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
              if (bin == null && !_loading && _notFound == null)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 48),
                  child: EmptyState(
                    icon: Icons.inventory_2_outlined,
                    text: 'Quét hoặc nhập mã ô để xem tồn.\nThử: KA-D1-P01-T01-1',
                  ),
                ),
              if (bin != null) ...[
                Text(bin.binCode,
                    style: const TextStyle(fontFamily: 'monospace', fontSize: 22, fontWeight: FontWeight.w800)),
                Text('Khu ${bin.zoneCode}', style: TextStyle(color: AppColors.inkSubtle)),
                const SizedBox(height: 12),
                if (bin.items.isEmpty) const Text('Ô này chưa có hàng.'),
                for (final item in bin.items) ...[
                  Card(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(14),
                      onTap: () async {
                        final changed = await showModalBottomSheet<bool>(
                          context: context,
                          isScrollControlled: true,
                          showDragHandle: true,
                          builder: (_) => _StockActionSheet(item: item, binCode: bin.binCode),
                        );
                        if (changed == true) await _reload();
                      },
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(item.sku,
                                      style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700)),
                                  if (item.masterSku != null)
                                    Text('Tồn chung ${item.masterSku}',
                                        style: TextStyle(fontSize: 12, color: AppColors.inkSubtle)),
                                ],
                              ),
                            ),
                            Text('${item.quantityOnHand}',
                                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                            const Icon(Icons.chevron_right),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                ],
              ],
            ],
          ),
        ),
      ],
    );
  }
}

enum _StockAction { restock, adjust, transfer }

class _StockActionSheet extends ConsumerStatefulWidget {
  const _StockActionSheet({required this.item, required this.binCode});

  final StockItem item;
  final String binCode;

  @override
  ConsumerState<_StockActionSheet> createState() => _StockActionSheetState();
}

class _StockActionSheetState extends ConsumerState<_StockActionSheet> {
  _StockAction _action = _StockAction.restock;
  final _qty = TextEditingController(text: '1');
  final _target = TextEditingController();
  StockAdjustReason _reason = StockAdjustReason.countCorrection;
  bool _busy = false;
  String? _error;

  /// Một mã cho mỗi lần mở form + loại thao tác; gửi lại sau lỗi mạng vẫn dùng đúng mã này.
  final Map<_StockAction, String> _eventIds = {};
  String _eventId(_StockAction a) => _eventIds.putIfAbsent(a, () => const Uuid().v4());

  @override
  void dispose() {
    _qty.dispose();
    _target.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final qty = int.tryParse(_qty.text.trim());
    if (qty == null || (_action != _StockAction.adjust && qty < 1) || qty < 0) {
      setState(() => _error = 'Nhập số lượng hợp lệ.');
      return;
    }
    final item = widget.item;
    final repo = ref.read(stockRepositoryProvider);

    final message = switch (_action) {
      _StockAction.restock => 'Nhập thêm $qty cái ${item.sku} vào ô ${widget.binCode}?',
      _StockAction.adjust =>
        'Đổi tồn ${item.sku} từ ${item.quantityOnHand} thành $qty (${_reason.label})?',
      _StockAction.transfer => 'Chuyển $qty cái ${item.sku} sang ô ${_target.text.trim().toUpperCase()}?',
    };
    final ok = await confirmDialog(context, title: 'Xác nhận', message: message);
    if (!ok || !mounted) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      switch (_action) {
        case _StockAction.restock:
          await repo.restock(item.assignmentId, qty, eventId: _eventId(_action));
        case _StockAction.adjust:
          await repo.adjust(item.assignmentId, qty, reason: _reason, eventId: _eventId(_action));
        case _StockAction.transfer:
          if (_target.text.trim().isEmpty) {
            throw const StockException('Nhập hoặc quét ô đích.');
          }
          await repo.transfer(item.assignmentId, _target.text, qty, eventId: _eventId(_action));
      }
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      Navigator.pop(context, true);
    } on StockException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _scanTarget() async {
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const ScannerScreen()),
    );
    if (code != null && mounted) setState(() => _target.text = code);
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(item.sku,
                textAlign: TextAlign.center,
                style: const TextStyle(fontFamily: 'monospace', fontSize: 18, fontWeight: FontWeight.w800)),
            Text('Ô ${widget.binCode} · tồn ${item.quantityOnHand}',
                textAlign: TextAlign.center, style: TextStyle(color: AppColors.inkSubtle)),
            const SizedBox(height: 14),
            SegmentedButton<_StockAction>(
              segments: const [
                ButtonSegment(value: _StockAction.restock, label: Text('Nhập thêm')),
                ButtonSegment(value: _StockAction.adjust, label: Text('Kiểm kê')),
                ButtonSegment(value: _StockAction.transfer, label: Text('Chuyển ô')),
              ],
              selected: {_action},
              onSelectionChanged: (s) => setState(() {
                _action = s.first;
                _error = null;
              }),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _qty,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: InputDecoration(
                labelText: switch (_action) {
                  _StockAction.restock => 'Số lượng nhập thêm',
                  _StockAction.adjust => 'Số đếm thực tế',
                  _StockAction.transfer => 'Số lượng chuyển',
                },
              ),
            ),
            if (_action == _StockAction.adjust) ...[
              const SizedBox(height: 12),
              DropdownButtonFormField<StockAdjustReason>(
                initialValue: _reason,
                decoration: const InputDecoration(labelText: 'Lý do (bắt buộc)'),
                items: [
                  for (final r in StockAdjustReason.values) DropdownMenuItem(value: r, child: Text(r.label)),
                ],
                onChanged: (v) => setState(() => _reason = v ?? _reason),
              ),
            ],
            if (_action == _StockAction.transfer) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _target,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(labelText: 'Ô đích', hintText: 'KA-D1-P01-T01-2'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  IconButton.filled(
                    style: IconButton.styleFrom(minimumSize: const Size(56, 56)),
                    onPressed: _scanTarget,
                    icon: const Icon(Icons.qr_code_scanner),
                  ),
                ],
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
            ],
            const SizedBox(height: 18),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                    )
                  : const Text('Xác nhận'),
            ),
          ],
        ),
      ),
    );
  }
}
