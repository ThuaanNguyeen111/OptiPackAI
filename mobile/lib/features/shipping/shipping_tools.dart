import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:printing/printing.dart';

import '../../app/colors.dart';
import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';
import 'api_shipping_repository.dart';
import 'shipping_repository.dart';

/// Tải một PDF của BE rồi mở hộp in / chia sẻ của máy.
Future<void> printPdf(BuildContext context, ApiClient api, String path, String name) => runAction(context, () async {
      final bytes = await api.getBytes(path);
      await Printing.layoutPdf(name: name, onLayout: (_) async => Uint8List.fromList(bytes));
    }).then((_) {});

/// Chọn ngày giờ trong 30 ngày tới. Trả null khi huỷ ở bước nào cũng vậy.
Future<DateTime?> pickPickupTime(BuildContext context) async {
  final now = DateTime.now();
  final day = await showDatePicker(
      context: context, firstDate: now, lastDate: now.add(const Duration(days: 30)), initialDate: now);
  if (day == null || !context.mounted) return null;
  final time = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 14, minute: 0));
  if (time == null) return null;
  return DateTime(day.year, day.month, day.day, time.hour, time.minute);
}

/// Các dòng so chi phí thùng, giống `quotePackagingOptions` của web.
List<String> boxComparisonLines(Object? raw) {
  final m = asMap(raw);
  return [
    if (m?['parcels'] case final List parcels)
      for (final item in parcels)
        if (asMap(item) case final p?)
          () {
            final current = pickString(asMap(p['current']), ['boxCode'], '—');
            final best = pickString(asMap(p['best']), ['boxCode']);
            final saving = pickInt(p, ['savingVnd']);
            return 'Kiện ${pickInt(p, ['parcelNo'])}: đang $current'
                '${best.isEmpty ? '' : ', rẻ nhất $best'}'
                '${saving > 0 ? ' (−${formatVnd(saving)})' : ''}';
          }(),
    'Tổng đang dùng ${formatVnd(pickInt(m, ['totalCurrentVnd']))} · tốt nhất '
        '${formatVnd(pickInt(m, ['totalBestVnd']))} · chênh ${formatVnd(pickInt(m, ['totalSavingVnd']))}',
  ];
}

Future<void> showBoxComparison(BuildContext context, ApiClient api, String groupId, String carrierCode,
    String serviceCode, ShipLocation location) async {
  List<String>? lines;
  await runAction(context, () async {
    lines = boxComparisonLines(await api.get(
      '/shipping/packaging-options/${Uri.encodeComponent(groupId)}',
      query: {'carrier_code': carrierCode, 'service_code': serviceCode, ...locationQuery(location)},
    ));
  });
  if (lines == null || !context.mounted) return;
  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('So chi phí thùng'),
      content: SingleChildScrollView(child: Text(lines!.join('\n\n'))),
      actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Đóng'))],
    ),
  );
}

/// Dịch vụ của các hãng đang bật, khóa dạng `HÃNG|DỊCH_VỤ`.
Map<String, String> carrierServices(Object? raw) => {
      for (final c in rowsOf(raw, 'carriers'))
        if (c['isActive'] != false)
          for (final s in rowsOf(c['services']))
            '${c['code']}|${s['code']}': '${c['name']} · ${pickString(s, ['name'], '${s['code']}')}',
    };

/// Giao chung chuyến (`POST /shipments/batch`). Trả true khi đã tạo.
Future<bool> createShipmentBatch(BuildContext context, ApiClient api, List<String> groupIds) async {
  var services = <String, String>{};
  if (!await runAction(context, () async => services = carrierServices(await api.get('/shipping/carriers')))) {
    return false;
  }
  if (!context.mounted) return false;
  // Điền sẵn địa chỉ của nhóm đầu tiên như web; đọc lỗi thì để trống, máy chủ tự lấy theo đơn.
  var draft = const RecipientDraft();
  try {
    draft = parseRecipientDraft(await api.get('/shipping/recipients/${Uri.encodeComponent(groupIds.first)}'));
  } on Exception {
    // Không chặn việc tạo chuyến.
  }
  if (!context.mounted) return false;
  final prefill = draft.location;
  final v = await showFormSheet(
    context,
    title: 'Giao chung chuyến (${groupIds.length} nhóm)',
    note: 'Các nhóm phải cùng người nhận hoặc đã liên kết với nhau. '
        'Địa chỉ dưới đây áp dụng cho mọi kiện; để trống thì máy chủ lấy theo đơn.',
    submitLabel: 'Tạo chuyến',
    fields: [
      FormFieldSpec('choice', 'Hãng & dịch vụ', type: FieldType.choice, required: true, options: services),
      FormFieldSpec('province_name', 'Tỉnh / thành', initial: prefill.provinceName),
      FormFieldSpec('ward_name', 'Phường / xã', initial: prefill.wardName),
      FormFieldSpec('street', 'Số nhà, đường', initial: prefill.street),
      FormFieldSpec('phone', 'SĐT người nhận', initial: prefill.phone),
      const FormFieldSpec('note', 'Ghi chú'),
      const FormFieldSpec('schedule', 'Hẹn giờ lấy hàng', type: FieldType.toggle),
    ],
  );
  if (v == null || !context.mounted) return false;
  final parts = (v.remove('choice') as String).split('|');
  DateTime? pickupAt;
  if (v.remove('schedule') == true) {
    pickupAt = await pickPickupTime(context);
    if (pickupAt == null || !context.mounted) return false;
  }
  final location = <String, String>{
    for (final key in const ['province_name', 'ward_name', 'street', 'phone'])
      if (v.remove(key) case final String value when value.trim().isNotEmpty) key: value.trim(),
  };
  var trip = '';
  final ok = await runAction(context, () async {
    final res = asMap(await api.post('/shipments/batch', body: {
      ...v,
      'order_group_ids': groupIds,
      'carrier_code': parts[0],
      'service_code': parts[1],
      if (location.isNotEmpty) 'to_location': location,
      if (pickupAt != null) 'pickup_at': pickupAt.toUtc().toIso8601String(),
    }));
    trip = pickString(res, ['tripCode']);
  });
  if (ok && context.mounted) showToast(context, 'Đã tạo chuyến $trip');
  return ok;
}

const _strategyLabels = {'cheapest': 'Rẻ nhất', 'fastest': 'Nhanh nhất', 'fixed': 'Cố định một hãng'};

/// Chiến lược chọn hãng và người gửi trên nhãn. [onManage] khác null (Admin) thì có lối sang màn sửa.
Future<void> showShippingSettings(BuildContext context, ApiClient api, {Future<void> Function()? onManage}) async {
  Map<String, dynamic>? settings;
  await runAction(context, () async => settings = asMap(await api.get('/shipping/settings')));
  final s = settings;
  if (s == null || !context.mounted) return;
  final sender = asMap(s['sender']);
  Widget line(String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text('$label: ${value.isEmpty ? '—' : value}'),
      );
  final manage = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Hãng và người gửi'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            line('Chiến lược', _strategyLabels[s['strategy']] ?? pickString(s, ['strategy'])),
            line('Người gửi', pickString(sender, ['name'])),
            line('SĐT', pickString(sender, ['phone'])),
            line('Địa chỉ', pickString(sender, ['address'])),
            if (onManage == null)
              Text('Chỉ Admin sửa được hãng và chiến lược.',
                  style: TextStyle(fontSize: 12, color: AppColors.inkSubtle)),
          ],
        ),
      ),
      actions: [
        if (onManage != null)
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Sửa hãng & chiến lược')),
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Đóng')),
      ],
    ),
  );
  if (manage == true) await onManage?.call();
}
