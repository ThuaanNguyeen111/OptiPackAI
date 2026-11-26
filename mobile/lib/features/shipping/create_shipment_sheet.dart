import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/colors.dart';
import '../../app/mock_providers.dart';
import '../../app/providers.dart';
import '../../shared/widgets.dart';
import 'shipping_repository.dart';
import 'shipping_tools.dart';

/// Tạo vận đơn cho một nhóm đã đóng gói, giống web:
/// đơn Tiki do sàn tự lấy; đơn hỏa tốc chọn người giao; còn lại chọn hãng và sửa được địa chỉ gửi hãng.
class CreateShipmentSheet extends ConsumerStatefulWidget {
  const CreateShipmentSheet({super.key, required this.group});

  final ShipGroup group;

  @override
  ConsumerState<CreateShipmentSheet> createState() => _CreateShipmentSheetState();
}

class _CreateShipmentSheetState extends ConsumerState<CreateShipmentSheet> {
  final _note = TextEditingController();
  final _street = TextEditingController();
  final _ward = TextEditingController();
  final _province = TextEditingController();
  final _phone = TextEditingController();

  List<CarrierQuote>? _quotes;
  List<ShipperOption>? _shippers;
  RecipientDraft _draft = const RecipientDraft();
  String? _selected;
  String? _shipperId;
  String? _error;
  bool _quoting = false;
  bool _busy = false;

  bool get _isMarketplacePickup => widget.group.platform.toLowerCase() == 'tiki';
  bool get _isExpress => widget.group.requiresSelfDelivery;

  ShippingRepository get _repo => ref.read(shippingRepositoryProvider);

  ShipLocation get _location => ShipLocation(
        street: _street.text,
        wardName: _ward.text,
        provinceName: _province.text,
        phone: _phone.text,
      );

  /// Đang chọn một hãng (không phải giao của shop).
  bool get _viaCarrier => _selected != null && _selected != selfDeliveryQuoteCode;

  @override
  void initState() {
    super.initState();
    if (_isMarketplacePickup) return;
    _isExpress ? _loadShippers() : _loadAddressThenQuote();
  }

  @override
  void dispose() {
    for (final c in [_note, _street, _ward, _province, _phone]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _loadShippers() async {
    try {
      final list = await _repo.shippers();
      if (!mounted) return;
      final me = ref.read(authControllerProvider).user?.id;
      setState(() {
        _shippers = list;
        _shipperId = list.any((s) => s.id == me) ? me : null;
      });
    } on ShippingException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _loadAddressThenQuote() async {
    try {
      final draft = await _repo.recipient(widget.group.id);
      if (!mounted) return;
      _draft = draft;
      _street.text = draft.location.street;
      _ward.text = draft.location.wardName;
      _province.text = draft.location.provinceName;
      _phone.text = draft.location.phone;
    } on ShippingException catch (e) {
      // Không điền sẵn được vẫn báo giá và tạo vận đơn được.
      _draft = RecipientDraft(error: e.message);
    }
    await _quote();
  }

  Future<void> _quote() async {
    if (!mounted) return;
    setState(() {
      _quoting = true;
      _error = null;
    });
    try {
      final quotes = await _repo.quote(widget.group.id, location: _location);
      if (!mounted) return;
      setState(() {
        _quotes = quotes;
        if (!quotes.any((q) => q.code == _selected && q.unavailableReason == null)) _selected = null;
        _quoting = false;
      });
    } on ShippingException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _quoting = false;
      });
    }
  }

  bool get _canCreate {
    if (_busy) return false;
    if (_isMarketplacePickup) return true;
    if (_isExpress) return _shipperId != null;
    return _selected != null;
  }

  Future<void> _create() async {
    setState(() => _busy = true);
    try {
      final created = await _repo.create(
        widget.group.id,
        _isMarketplacePickup || _isExpress ? '' : _selected!,
        note: _note.text,
        shipperId: _isExpress ? _shipperId : null,
        location: _viaCarrier ? _location : null,
      );
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      showToast(context, 'Đã tạo ${created.code}');
      Navigator.pop(context, true);
    } on ShippingException catch (e) {
      if (mounted) showToast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _field(TextEditingController controller, String label, {TextInputType? keyboard}) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: TextField(
          controller: controller,
          keyboardType: keyboard,
          decoration: InputDecoration(labelText: label, isDense: true),
        ),
      );

  List<Widget> _carrierSection() {
    final quotes = _quotes;
    return [
      if (_draft.isDemo) _hint('Đơn bị sàn che địa chỉ — đang dùng địa chỉ mô phỏng.'),
      if (_draft.error != null) _hint('${_draft.error} Hãy nhập địa chỉ.', color: AppColors.warning),
      ExpansionTile(
        tilePadding: EdgeInsets.zero,
        childrenPadding: const EdgeInsets.only(top: 6),
        initiallyExpanded: _draft.error != null,
        title: const Text('Địa chỉ gửi hãng'),
        subtitle: Text('Chỉ dùng khi đi qua hãng vận chuyển',
            style: TextStyle(fontSize: 12, color: AppColors.inkSubtle)),
        children: [
          _field(_province, 'Tỉnh / thành'),
          _field(_ward, 'Phường / xã'),
          _field(_street, 'Số nhà, đường'),
          _field(_phone, 'SĐT 10–11 số, bắt đầu bằng 0', keyboard: TextInputType.phone),
          OutlinedButton.icon(
            onPressed: _quoting ? null : _quote,
            icon: const Icon(Icons.refresh),
            label: const Text('Cập nhật báo giá'),
          ),
        ],
      ),
      const SizedBox(height: 8),
      if (quotes == null && _error == null || _quoting)
        const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()))
      else if (quotes != null)
        RadioGroup<String>(
          groupValue: _selected,
          onChanged: (v) => setState(() => _selected = v),
          child: Column(
            children: [
              for (final q in quotes)
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
        ),
      if (_viaCarrier && !ref.watch(useMockDataProvider))
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () {
              final parts = _selected!.split('|');
              showBoxComparison(context, ref.read(apiClientProvider), widget.group.id, parts[0], parts[1], _location);
            },
            icon: const Icon(Icons.savings_outlined),
            label: const Text('So chi phí thùng'),
          ),
        ),
    ];
  }

  List<Widget> _expressSection() {
    final shippers = _shippers;
    return [
      _hint('Đơn hỏa tốc do shop tự giao — không chọn hãng, không gộp chuyến.'),
      if (shippers == null && _error == null)
        const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()))
      else if (shippers != null && shippers.isEmpty)
        _hint('Chưa có Điều phối giao hàng nào đang làm.', color: AppColors.warning)
      else if (shippers != null)
        DropdownButtonFormField<String>(
          initialValue: _shipperId,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Người giao (bắt buộc)'),
          items: [
            for (final s in shippers)
              DropdownMenuItem(
                value: s.id,
                child: Text([s.name, if (s.phone != null) s.phone!].join(' · '), overflow: TextOverflow.ellipsis),
              ),
          ],
          onChanged: (v) => setState(() => _shipperId = v),
        ),
    ];
  }

  Widget _hint(String text, {Color? color}) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text, style: TextStyle(fontSize: 13, color: color ?? AppColors.inkSubtle)),
      );

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Tạo vận đơn',
                textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            Text('${widget.group.shortId} · ${widget.group.recipientName}',
                textAlign: TextAlign.center, style: TextStyle(color: AppColors.inkSubtle)),
            const SizedBox(height: 12),
            if (_isMarketplacePickup)
              _hint('Đơn Tiki dropship — shipper Tiki tự tới lấy: không chọn hãng, không báo giá, không hẹn lấy hàng.')
            else if (_isExpress)
              ..._expressSection()
            else
              ..._carrierSection(),
            if (_error != null) _hint(_error!, color: AppColors.danger),
            const SizedBox(height: 8),
            TextField(
              controller: _note,
              decoration: const InputDecoration(labelText: 'Ghi chú (tùy chọn)', isDense: true),
            ),
            const SizedBox(height: 14),
            FilledButton(onPressed: _canCreate ? _create : null, child: const Text('Tạo vận đơn')),
          ],
        ),
      ),
    );
  }
}
