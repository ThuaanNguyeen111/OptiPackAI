import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/colors.dart';
import '../../app/providers.dart';
import '../../core/format/units.dart';
import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';
import '../history/history_screen.dart';
import '../shipping/shipping_tools.dart';

const _statusLabels = {
  'awaiting_pickup': 'Chờ hãng lấy',
  'in_transit': 'Đang trung chuyển',
  'out_for_delivery': 'Đang giao',
  'delivery_failed': 'Giao thất bại',
  'returning_to_warehouse': 'Đang hoàn về kho',
  'delivered': 'Đã giao',
  'returned_to_warehouse': 'Đã về kho',
  'cancelled': 'Đã hủy ở hãng',
};

enum _Tab { shipments, ready, carriers }

/// Vận chuyển (quản lý): chọn shipper, chuyến gộp, thao tác với GHN, địa chỉ, hãng và người gửi.
class ShippingAdminScreen extends ConsumerStatefulWidget {
  const ShippingAdminScreen({super.key, this.openCarriers = false});

  /// Mở thẳng tab "Hãng & người gửi".
  final bool openCarriers;

  @override
  ConsumerState<ShippingAdminScreen> createState() => _ShippingAdminScreenState();
}

class _ShippingAdminScreenState extends ConsumerState<ShippingAdminScreen> {
  final _list = GlobalKey<LoadListState<Map<String, dynamic>>>();
  late _Tab _tab = widget.openCarriers ? _Tab.carriers : _Tab.shipments;
  String _status = '';
  final Set<String> _selected = {};

  ApiClient get _api => ref.read(apiClientProvider);
  Future<void> _reload() async => _list.currentState?.reload();

  Future<void> _run(Future<Object?> Function() call, String success) async {
    await runAction(context, () async => call(), success: success);
    await _reload();
  }

  Future<Map<String, dynamic>> _load() async {
    switch (_tab) {
      case _Tab.shipments:
        return {'rows': rowsOf(await _api.get('/shipments', query: {'status': _status, 'limit': 100}))};
      case _Tab.ready:
        return {
          'rows': rowsOf(await _api.get('/order-groups', query: {'fulfillment_status': 'packed', 'limit': 100})),
        };
      case _Tab.carriers:
        return {
          'rows': rowsOf(await _api.get('/shipping/carriers'), 'carriers'),
          'settings': asMap(await _api.get('/shipping/settings')),
        };
    }
  }

  /// Dịch vụ của các hãng đang bật, khóa dạng `HÃNG|DỊCHVỤ`.
  Future<Map<String, String>> _services() async {
    var out = <String, String>{};
    await runAction(context, () async {
      out = {
        for (final c in rowsOf(await _api.get('/shipping/carriers'), 'carriers'))
          if (c['isActive'] != false && c['is_active'] != false)
            for (final s in rowsOf(c['services'])) '${c['code']}|${s['code']}': '${c['name']} · ${s['name']}',
      };
    });
    return out;
  }

  // ---- Tạo vận đơn ----

  Future<void> _create(Map<String, dynamic> group) async {
    final self = group['requiresSelfDelivery'] == true;
    var options = <String, String>{};
    if (self) {
      await runAction(context, () async {
        options = {
          for (final s in rowsOf(await _api.get('/shipments/shippers')))
            pickString(s, ['id', 'staffId', 'userId']): pickString(s, ['name', 'fullName']),
        };
      });
    } else {
      options = await _services();
    }
    if (!mounted) return;
    final v = await showFormSheet(context, title: 'Tạo vận đơn', submitLabel: 'Tạo', fields: [
      FormFieldSpec('choice', self ? 'Người giao (shipper)' : 'Hãng & dịch vụ',
          type: FieldType.choice, required: self, options: options),
      if (!self) ...const [
        FormFieldSpec('street', 'Sửa số nhà / đường (nếu cần)'),
        FormFieldSpec('ward_name', 'Sửa phường'),
        FormFieldSpec('province_name', 'Sửa tỉnh / thành'),
        FormFieldSpec('phone', 'Sửa số điện thoại'),
      ],
      const FormFieldSpec('note', 'Ghi chú'),
    ]);
    if (v == null || !mounted) return;
    final choice = v.remove('choice') as String?;
    final note = v.remove('note');
    final parts = choice?.split('|') ?? const <String>[];
    await _run(
        () => _api.post('/shipments', body: {
              'order_group_id': group['id'],
              'note': ?note,
              if (self) 'shipper_id': choice,
              if (!self && parts.length == 2) ...{'carrier_code': parts[0], 'service_code': parts[1]},
              if (!self && v.isNotEmpty) 'to_location': v,
            }),
        'Đã tạo vận đơn.');
  }

  Future<void> _createBatch() async {
    final options = await _services();
    if (!mounted) return;
    final v = await showFormSheet(context,
        title: 'Tạo chuyến ${_selected.length} nhóm',
        note: 'Các nhóm phải cùng người nhận (hoặc đã liên kết).',
        submitLabel: 'Tạo chuyến',
        fields: [
          FormFieldSpec('choice', 'Hãng & dịch vụ', type: FieldType.choice, required: true, options: options),
          const FormFieldSpec('note', 'Ghi chú'),
        ]);
    if (v == null || !mounted) return;
    final parts = (v.remove('choice') as String).split('|');
    await _run(
        () => _api.post('/shipments/batch',
            body: {...v, 'order_group_ids': _selected.toList(), 'carrier_code': parts[0], 'service_code': parts[1]}),
        'Đã tạo chuyến.');
    if (mounted) setState(_selected.clear);
  }

  // ---- Một vận đơn ----

  Future<void> _address(String id) async {
    final v = await showFormSheet(context, title: 'Sửa địa chỉ gửi hãng', fields: const [
      FormFieldSpec('street', 'Số nhà / đường'),
      FormFieldSpec('ward_name', 'Phường / xã'),
      FormFieldSpec('province_name', 'Tỉnh / thành'),
      FormFieldSpec('phone', 'Số điện thoại'),
    ]);
    if (v == null || !mounted) return;
    await _run(() => _api.patch('/shipments/$id/to-location', body: v), 'Đã sửa địa chỉ.');
  }

  Future<void> _pickup(String id) async {
    final now = DateTime.now();
    final day = await showDatePicker(
        context: context, firstDate: now, lastDate: now.add(const Duration(days: 30)), initialDate: now);
    if (day == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 14, minute: 0));
    if (time == null || !mounted) return;
    final at = DateTime(day.year, day.month, day.day, time.hour, time.minute).toUtc().toIso8601String();
    await _run(() => _api.patch('/shipments/$id/pickup', body: {'pickup_at': at}), 'Đã hẹn lấy hàng.');
  }

  Future<void> _simulate(String id) async {
    var statuses = <String, String>{};
    await runAction(context, () async {
      for (final s in rowsOf(await _api.get('/shipments/carrier/statuses'), 'statuses')) {
        final code = pickString(s, ['status', 'code', 'value']);
        if (code.isNotEmpty) statuses[code] = pickString(s, ['label'], code);
      }
    });
    if (!mounted || statuses.isEmpty) return;
    final v = await showFormSheet(context, title: 'Mô phỏng trạng thái hãng', submitLabel: 'Gửi', fields: [
      FormFieldSpec('status', 'Trạng thái', type: FieldType.choice, required: true, options: statuses),
    ]);
    if (v == null || !mounted) return;
    await _run(() => _api.post('/shipments/$id/carrier/simulate', body: v), 'Đã cập nhật trạng thái.');
  }

  Future<void> _carrierLabel(String id) async {
    Map<String, dynamic>? res;
    await runAction(context, () async => res = asMap(await _api.get('/shipments/$id/carrier/label')));
    if (res == null || !mounted) return;
    final text = res!.values.whereType<String>().where((s) => s.startsWith('http')).join('\n');
    await showSecret(context,
        title: 'Nhãn của hãng',
        value: text.isEmpty ? '$res' : text,
        note: 'Mở liên kết trên trình duyệt để in (hết hạn sau khoảng 25 phút).');
  }

  Future<void> _events(String id) => openPage(
        context,
        SubPage(
          title: 'Hành trình vận đơn',
          child: LoadList<List<Map<String, dynamic>>>(
            load: () async => rowsOf(await _api.get('/shipments/$id/events'), 'events'),
            builder: (_, rows, _) => [
              if (rows.isEmpty) emptyNote('Chưa có mốc nào.'),
              for (final e in rows)
                RecordCard(
                  title: _statusLabels[e['statusTo']] ?? pickString(e, ['eventType']),
                  lines: [pickString(e, ['reasonLabel']), pickString(e, ['note']), dateTimeText(e['occurredAt'])],
                ),
            ],
          ),
        ),
      );

  Widget _shipment(Map<String, dynamic> s) {
    final id = pickString(s, ['id', '_id']);
    final status = pickString(s, ['status']);
    final managed = s['carrierManaged'] == true;
    final trip = pickStringOrNull(s, ['tripCode']);
    return RecordCard(
      title: pickString(s, ['shipmentCode']),
      lines: [
        [pickString(s, ['carrierName']), pickString(s, ['trackingCode']), pickString(s, ['shipperName'])]
            .where((x) => x.isNotEmpty)
            .join(' · '),
        pickString(s, ['carrierStatusLabel']),
        pickString(s, ['carrierBookingError']),
        if (trip != null) 'Chuyến $trip',
        if (dateTimeText(s['pickupAt']).isNotEmpty) 'Hẹn lấy ${dateTimeText(s['pickupAt'])}',
      ],
      pills: [
        Pill(_statusLabels[status] ?? status, AppColors.primary),
        if (s['isOverdue'] == true) Pill('Quá hạn', AppColors.danger),
        if (s['carrierIncidentLabel'] != null) Pill('${s['carrierIncidentLabel']}', AppColors.danger),
      ],
      actions: [
        CardAction('Hành trình', () => _events(id), icon: Icons.timeline),
        CardAction('Lịch sử nhóm', () => openPage(context, TimelineScreen(groupId: pickString(s, ['orderGroupId']))),
            icon: Icons.history),
        CardAction('Hẹn lấy hàng', () => _pickup(id), icon: Icons.schedule),
        CardAction('In nhãn kiện',
            () => printPdf(context, _api, '/documents/shipping-label/${s['orderGroupId']}', 'nhan-kien'),
            icon: Icons.print_outlined),
        CardAction('In phiếu đóng gói',
            () => printPdf(context, _api, '/documents/packing-slip/${s['orderGroupId']}', 'phieu-dong-goi'),
            icon: Icons.description_outlined),
        if (trip != null)
          CardAction('In bảng kê chuyến',
              () => printPdf(context, _api, '/documents/manifest/${Uri.encodeComponent(trip)}', 'bang-ke'),
              icon: Icons.list_alt),
        if (managed) ...[
          CardAction('Gửi / gửi lại sang hãng', () => _run(() => _api.post('/shipments/$id/carrier/book', body: {}), 'Đã gửi sang hãng.'),
              icon: Icons.send_outlined),
          CardAction('Đồng bộ trạng thái hãng',
              () => _run(() => _api.post('/shipments/$id/carrier/sync', body: {}), 'Đã đồng bộ.'),
              icon: Icons.sync),
          CardAction('Sửa địa chỉ', () => _address(id), icon: Icons.edit_location_alt_outlined),
          CardAction('Nhãn của hãng', () => _carrierLabel(id), icon: Icons.receipt_outlined),
          CardAction('Mô phỏng trạng thái', () => _simulate(id), icon: Icons.science_outlined),
          CardAction('Hủy ở hãng', () async {
            if (await confirmDialog(context, title: 'Hủy vận đơn ở hãng?', message: '${s['shipmentCode']}') && mounted) {
              await _run(() => _api.post('/shipments/$id/carrier/cancel', body: {'reason_code': 'GHN-CO001'}),
                  'Đã hủy ở hãng.');
            }
          }, icon: Icons.cancel_outlined, danger: true),
        ],
      ],
    );
  }

  // ---- Hãng & người gửi ----

  Future<void> _sender(Map<String, dynamic> settings) async {
    final sender = asMap(settings['sender']) ?? {};
    final v = await showFormSheet(context, title: 'Cài đặt gửi hàng', fields: [
      FormFieldSpec('strategy', 'Cách chọn hãng gợi ý',
          type: FieldType.choice,
          required: true,
          options: const {'cheapest': 'Rẻ nhất', 'fastest': 'Nhanh nhất', 'fixed': 'Cố định một hãng'},
          initial: settings['strategy'] ?? 'cheapest'),
      FormFieldSpec('default_carrier_code', 'Mã hãng cố định', initial: settings['defaultCarrierCode']),
      FormFieldSpec('default_service_code', 'Mã dịch vụ cố định', initial: settings['defaultServiceCode']),
      FormFieldSpec('sender_name', 'Tên người gửi', initial: sender['name'], sendEmpty: true),
      FormFieldSpec('sender_phone', 'SĐT người gửi', initial: sender['phone'], sendEmpty: true),
      FormFieldSpec('sender_address', 'Địa chỉ người gửi', initial: sender['address'], sendEmpty: true),
    ]);
    if (v == null || !mounted) return;
    await _run(() => _api.put('/shipping/settings', body: v), 'Đã lưu.');
  }

  /// Như "Thêm hãng mẫu" của web: một dịch vụ STANDARD, một bậc cước.
  Future<void> _addSampleCarrier() async {
    final v = await showFormSheet(context,
        title: 'Thêm hãng mẫu',
        note: 'Tạo kèm dịch vụ Standard 2–4 ngày, 20.000 đ đến 1 kg.',
        submitLabel: 'Thêm',
        fields: const [
          FormFieldSpec('code', 'Mã hãng (VD SAMPLE-CODE)', required: true),
          FormFieldSpec('name', 'Tên hãng', required: true),
        ]);
    if (v == null || !mounted) return;
    await _run(
        () => _api.post('/shipping/carriers', body: {
              'code': '${v['code']}'.trim().toUpperCase(),
              'name': '${v['name']}'.trim(),
              'is_sample': true,
              'services': [
                {
                  'code': 'STANDARD',
                  'name': 'Standard',
                  'eta_min_days': 2,
                  'eta_max_days': 4,
                  'bands': [
                    {'up_to_g': 1000, 'price_vnd': 20000},
                  ],
                },
              ],
            }),
        'Đã thêm hãng mẫu.');
  }

  List<Widget> _content(Map<String, dynamic> data) {
    final rows = rowsOf(data['rows']);
    switch (_tab) {
      case _Tab.shipments:
        return [if (rows.isEmpty) emptyNote('Không có vận đơn nào.'), for (final s in rows) _shipment(s)];
      case _Tab.ready:
        return [
          if (rows.isEmpty) emptyNote('Không có nhóm nào đã đóng gói đang chờ giao.'),
          if (_selected.length >= 2)
            FilledButton(onPressed: _createBatch, child: Text('Tạo chuyến cho ${_selected.length} nhóm')),
          for (final g in rows)
            RecordCard(
              mono: true,
              title: shortId(pickString(g, ['id'])),
              lines: ['${g['platform']} · ${pickInt(g, ['activeOrderCount'])} đơn'],
              pills: [if (g['requiresSelfDelivery'] == true) Pill('Shop tự giao (hỏa tốc)', Colors.deepOrange)],
              onTap: () => _create(g),
              trailing: g['requiresSelfDelivery'] == true
                  ? null
                  : Checkbox(
                      value: _selected.contains(g['id']),
                      onChanged: (v) => setState(
                          () => v == true ? _selected.add('${g['id']}') : _selected.remove('${g['id']}')),
                    ),
            ),
        ];
      case _Tab.carriers:
        final settings = asMap(data['settings']) ?? {};
        final sender = asMap(settings['sender']) ?? {};
        return [
          RecordCard(
            title: 'Cài đặt gửi hàng',
            lines: [
              'Cách chọn hãng: ${pickString(settings, ['strategy'], '—')}',
              'Người gửi: ${pickString(sender, ['name'], 'chưa cấu hình')} ${pickString(sender, ['phone'])}',
              pickString(sender, ['address']),
            ],
            onTap: () => _sender(settings),
            actions: [CardAction('Sửa', () => _sender(settings), icon: Icons.edit_outlined)],
          ),
          OutlinedButton.icon(
            onPressed: _addSampleCarrier,
            icon: const Icon(Icons.add),
            label: const Text('Thêm hãng mẫu'),
          ),
          for (final c in rows)
            RecordCard(
              title: '${c['code']} · ${c['name']}',
              lines: [
                for (final s in rowsOf(c['services']))
                  '${s['name']}'
                      '${rowsOf(s['bands']).isEmpty ? '' : ' — từ ${formatVnd(pickDouble(rowsOf(s['bands']).first, ['priceVnd', 'price_vnd']))}'
                          ' (đến ${formatGAsKg(pickInt(rowsOf(s['bands']).first, ['upToG', 'up_to_g']))})'}',
              ],
              pills: [
                Pill(c['isActive'] == false ? 'Đã tắt' : 'Đang bật',
                    c['isActive'] == false ? AppColors.inkSubtle : AppColors.good),
                if (c['isSample'] == true) Pill('Cước mẫu', AppColors.warning),
              ],
              actions: [
                CardAction(
                  c['isActive'] == false ? 'Bật' : 'Tắt',
                  () => _run(() => _api.patch('/shipping/carriers/${c['id'] ?? c['_id']}',
                      body: {'is_active': c['isActive'] == false}), 'Đã cập nhật.'),
                  icon: Icons.power_settings_new,
                ),
              ],
            ),
        ];
    }
  }

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: 'Quản lý vận chuyển',
      actions: [
        IconButton(
          tooltip: 'Quét vận đơn quá hạn',
          icon: const Icon(Icons.alarm),
          onPressed: () => _run(() => _api.post('/shipments/overdue-scan', body: {}), 'Đã quét quá hạn.'),
        ),
      ],
      child: LoadList<Map<String, dynamic>>(
        key: _list,
        resetKey: '$_tab $_status',
        load: _load,
        header: [
          chipRow<_Tab>(
              const [(_Tab.shipments, 'Vận đơn'), (_Tab.ready, 'Chờ tạo vận đơn'), (_Tab.carriers, 'Hãng & người gửi')],
              _tab,
              (t) => setState(() => _tab = t)),
          if (_tab == _Tab.shipments)
            chipRow<String>([('', 'Tất cả'), for (final e in _statusLabels.entries) (e.key, e.value)], _status,
                (s) => setState(() => _status = s)),
          const SizedBox(height: 8),
        ],
        builder: (context, data, _) => _content(data),
      ),
    );
  }
}
