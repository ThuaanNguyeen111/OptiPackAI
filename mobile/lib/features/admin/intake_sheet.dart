import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/colors.dart';
import '../../shared/admin_kit.dart';
import '../proof/proof_photo_field.dart';
import '../proof/proof_photo_repository.dart';

/// Nhập hàng từ nhà cung cấp: số lượng + ảnh phiếu (tải lên `purpose=receipt`).
/// Trả body gửi BE (`quantity`, `document_photo_urls`, …) hoặc `null` khi đóng.
/// [allowNoPhoto]: nhập tồn kho cho phép Admin bỏ ảnh nếu ghi lý do; vật liệu thì bắt buộc có ảnh.
Future<Map<String, dynamic>?> showIntakeSheet(
  BuildContext context, {
  required String title,
  bool allowNoPhoto = false,
}) =>
    showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _IntakeSheet(title: title, allowNoPhoto: allowNoPhoto),
    );

class _IntakeSheet extends ConsumerStatefulWidget {
  const _IntakeSheet({required this.title, required this.allowNoPhoto});

  final String title;
  final bool allowNoPhoto;

  @override
  ConsumerState<_IntakeSheet> createState() => _IntakeSheetState();
}

class _IntakeSheetState extends ConsumerState<_IntakeSheet> {
  final _qty = TextEditingController();
  final _note = TextEditingController();
  final _reason = TextEditingController();
  List<XFile> _photos = const [];

  /// Ảnh đã tải lên; giữ lại để bấm lại sau lỗi không tải lần hai.
  List<String>? _urls;
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _qty.dispose();
    _note.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final qty = int.tryParse(_qty.text.trim());
    if (qty == null || qty < 1) {
      setState(() => _error = 'Nhập số lượng lớn hơn 0.');
      return;
    }
    final reason = _reason.text.trim();
    if (_photos.isEmpty && !(widget.allowNoPhoto && reason.isNotEmpty)) {
      setState(() => _error = widget.allowNoPhoto
          ? 'Chụp ảnh phiếu nhà cung cấp, hoặc ghi lý do không có ảnh.'
          : 'Chụp ảnh phiếu giao hàng / phiếu nhập của nhà cung cấp.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_photos.isNotEmpty) {
        _urls ??= await ref.read(proofPhotoRepositoryProvider).upload(_photos, purpose: 'receipt');
      }
      if (!mounted) return;
      Navigator.pop<Map<String, dynamic>>(context, {
        'quantity': qty,
        if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
        if (_photos.isNotEmpty) 'document_photo_urls': _urls,
        if (_photos.isEmpty) 'no_photo_reason': reason,
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Chưa tải được ảnh: ${errorText(e)}';
      });
    }
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
            Text(widget.title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
            const SizedBox(height: 14),
            TextField(
              controller: _qty,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Số lượng nhập *'),
            ),
            const SizedBox(height: 12),
            TextField(controller: _note, decoration: const InputDecoration(labelText: 'Ghi chú')),
            const SizedBox(height: 12),
            ProofPhotoField(
              label: 'Ảnh phiếu NCC',
              required: !widget.allowNoPhoto,
              enabled: !_busy,
              photos: _photos,
              onChanged: (p) => setState(() {
                _photos = p;
                _urls = null;
              }),
            ),
            if (widget.allowNoPhoto && _photos.isEmpty) ...[
              const SizedBox(height: 12),
              TextField(controller: _reason, decoration: const InputDecoration(labelText: 'Lý do không có ảnh')),
            ],
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
            ],
            const SizedBox(height: 16),
            FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'Đang gửi…' : 'Nhập kho')),
          ],
        ),
      ),
    );
  }
}
