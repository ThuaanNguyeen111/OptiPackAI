import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/colors.dart';
import '../../app/providers.dart';
import '../../core/format/units.dart';
import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../shared/admin_kit.dart';
import '../../shared/widgets.dart';
import '../auth/auth_models.dart';
import '../history/history_screen.dart';
import 'shipping_repository.dart';
import 'shipping_tools.dart';

/// Tên mốc hành trình, giống `SHIPMENT_EVENT_LABELS` của web.
const shipmentEventLabels = <String, String>{
  'start_delivery': 'Bắt đầu giao',
  'delivered': 'Giao thành công',
  'delivery_failed': 'Giao thất bại',
  'retry': 'Giao lại',
  'auto_return': 'Tự chuyển hoàn về kho',
  'return_received': 'Kho đã nhận hàng hoàn',
  'legacy_backfill': 'Tạo bù vận đơn cũ',
  'legacy_return': 'Hoàn hàng (luồng cũ)',
  'carrier_booked': 'Đã tạo vận đơn ở hãng',
  'carrier_status': 'Hãng cập nhật trạng thái',
  'carrier_cancelled': 'Đã huỷ ở hãng',
  'carrier_incident': 'Hãng báo sự cố',
};

const returnStatusLabels = <String, String>{
  'requested': 'Chờ duyệt',
  'rejected': 'Đã từ chối',
  'awaiting_receipt': 'Chờ hàng về kho',
  'received': 'Kho đã nhận',
  'closed': 'Đã đóng',
  'canceled': 'Đã hủy phiếu',
};

/// Lỗi hãng lưu dạng "MÃ_MÁY: câu lỗi" → chỉ giữ câu cho người đọc.
String humanCarrierError(String text) => text.replaceFirst(RegExp(r'^[A-Z][A-Z0-9_]+:\s*'), '');

/// Còn kiện chưa có mã hãng hoặc đã bị hãng hủy → "Tạo lại ở hãng" mới có tác dụng.
bool hasUnbookedParcels(List<Map<String, dynamic>> parcels) => parcels.any(
    (p) => pickString(p, ['carrierOrderCode']).isEmpty || pickString(p, ['carrierStatus']) == 'cancel');

/// Tổng cân (kg) và thể tích (m³) từ kế hoạch đóng gói; ưu tiên cân thật.
({double kg, double cbm}) planTotals(Map<String, dynamic>? plan) {
  var kg = 0.0, cbm = 0.0;
  if (plan?['parcels'] case final List parcels) {
    for (final item in parcels) {
      final p = asMap(item);
      final actual = pickDouble(p, ['actualWeightKg']);
      kg += actual > 0 ? actual : pickDouble(p, ['estimatedWeightG']) / 1000;
      final outer = asMap(asMap(p?['box'])?['outerMm']);
      cbm += pickDouble(outer, ['lengthMm']) * pickDouble(outer, ['widthMm']) * pickDouble(outer, ['heightMm']) / 1e9;
    }
  }
  return (kg: kg, cbm: cbm);
}

class _Detail {
  const _Detail(this.shipment, this.events, this.returns, this.plan, this.platform);
  final Map<String, dynamic> shipment;
  final List<Map<String, dynamic>> events;
  final List<Map<String, dynamic>> returns;
  final Map<String, dynamic>? plan;
  final String platform;
}

/// Chi tiết vận đơn: tổng hợp, phiếu trả, dòng thời gian, thao tác với hãng, lịch lấy và giấy tờ.
class ShipmentDetailScreen extends ConsumerStatefulWidget {
  const ShipmentDetailScreen({super.key, required this.shipmentId});

  final String shipmentId;

  @override
  ConsumerState<ShipmentDetailScreen> createState() => _ShipmentDetailScreenState();
}

class _ShipmentDetailScreenState extends ConsumerState<ShipmentDetailScreen> {
  final _list = GlobalKey<LoadListState<_Detail>>();

  ApiClient get _api => ref.read(apiClientProvider);
  String get _path => '/shipments/${Uri.encodeComponent(widget.shipmentId)}';

  /// Phần phụ lỗi (không đủ quyền, chưa có kế hoạch…) không được làm hỏng cả màn.
  Future<T?> _optional<T>(Future<T> Function() call) async {
    try {
      return await call();
    } catch (_) {
      return null;
    }
  }

  Future<_Detail> _load() async {
    final shipment = asMap(await _api.get(_path)) ?? {};
    final groupId = pickString(shipment, ['orderGroupId']);
    final events = await _optional(() async => rowsOf(await _api.get('$_path/events'), 'events'));
    final returns = await _optional(() async => rowsOf(await _api.get('/returns', query: {'limit': 100})));
    final plan = await _optional(() async {
      final raw = asMap(await _api.get('/order-groups/$groupId/packing-plan'));
      return asMap(raw?['plan']) ?? raw;
    });
    final group = await _optional(() async => asMap(await _api.get('/order-groups/$groupId')));
    return _Detail(
      shipment,
      events ?? const [],
      [for (final r in returns ?? const <Map<String, dynamic>>[]) if (r['orderGroupId'] == groupId) r],
      plan,
      pickString(group, ['platform']),
    );
  }

  Future<void> _run(Future<Object?> Function() call, String success) async {
    await runAction(context, () async => call(), success: success);
    await _list.currentState?.reload();
  }

  Future<void> _fixAddress(Map<String, dynamic> s) async {
    final current = asMap(s['toLocation']);
    final v = await showFormSheet(context,
        title: 'Sửa địa chỉ và tạo lại',
        submitLabel: 'Gửi địa chỉ và tạo lại ở hãng',
        fields: [
          FormFieldSpec('province_name', 'Tỉnh / thành', initial: current?['provinceName']),
          FormFieldSpec('ward_name', 'Phường / xã', initial: current?['wardName']),
          FormFieldSpec('street', 'Số nhà, đường', initial: current?['street']),
          FormFieldSpec('phone', 'Số điện thoại', initial: current?['phone']),
        ]);
    if (v == null || !mounted) return;
    await _run(() => _api.patch('$_path/to-location', body: v), 'Đã gửi lại địa chỉ cho hãng.');
  }

  Future<void> _simulate() async {
    var statuses = <String, String>{};
    await runAction(context, () async {
      statuses = {
        for (final s in rowsOf(await _api.get('/shipments/carrier/statuses'), 'statuses'))
          if (pickString(s, ['status']).isNotEmpty)
            pickString(s, ['status']): pickString(s, ['label'], pickString(s, ['status'])),
      };
    });
    if (!mounted || statuses.isEmpty) return;
    final v = await showFormSheet(context, title: 'Mô phỏng trạng thái hãng', submitLabel: 'Mô phỏng', fields: [
      FormFieldSpec('status', 'Trạng thái', type: FieldType.choice, required: true, options: statuses),
    ]);
    if (v == null || !mounted) return;
    await _run(() => _api.post('$_path/carrier/simulate', body: v), 'Đã mô phỏng trạng thái trên OptiPack.');
  }

  Future<void> _carrierLabel() async {
    var url = '';
    await runAction(context, () async => url = pickString(asMap(await _api.get('$_path/carrier/label')), ['url']));
    if (url.isEmpty || !mounted) return;
    await showSecret(context,
        title: 'Nhãn của hãng', value: url, note: 'Mở liên kết trên trình duyệt để in (hết hạn sau khoảng 25 phút).');
  }

  Future<void> _cancelCarrier(Map<String, dynamic> s) async {
    final name = pickString(s, ['carrierName'], 'hãng');
    final ok = await confirmDialog(context,
        title: 'Huỷ vận đơn ở hãng?',
        message: 'Mọi kiện sẽ bị huỷ ở $name, nhóm đơn quay về "đã đóng gói" để tạo vận đơn mới.');
    if (!ok || !mounted) return;
    await _run(() => _api.post('$_path/carrier/cancel', body: {'reason_code': 'GHN-CO001'}), 'Đã huỷ vận đơn ở hãng.');
  }

  Future<void> _schedulePickup() async {
    final at = await pickPickupTime(context);
    if (at == null || !mounted) return;
    await _run(() => _api.patch('$_path/pickup', body: {'pickup_at': at.toUtc().toIso8601String()}),
        'Đã lưu lịch lấy hàng.');
  }

  List<Widget> _content(_Detail d) {
    final s = d.shipment;
    final status = ShipmentStatus.fromCode(pickString(s, ['status']));
    final groupId = pickString(s, ['orderGroupId']);
    final role = ref.read(authControllerProvider).user?.role;
    final managed = s['carrierManaged'] == true;
    final parcels = rowsOf(s['carrierParcels']);
    final totals = planTotals(d.plan);
    final trip = pickStringOrNull(s, ['tripCode']);
    final failure = pickString(s, ['lastFailureReason']);
    final dueText = dateTimeText(s['dueAt']);
    final overdue = status != null &&
        !status.isFinal &&
        (s['isOverdue'] == true || (pickDate(s, ['dueAt'])?.isBefore(DateTime.now()) ?? false));
    final incident = pickString(s, ['carrierIncidentLabel'], humanCarrierError(pickString(s, ['carrierIncident'])));
    // BE chỉ cho chủ shop, Admin, nhân viên kho và đóng gói in phiếu đóng gói.
    final canPrintSlip = const {
      UserRole.admin,
      UserRole.storeOwner,
      UserRole.warehouseStaff,
      UserRole.packagingStaff,
    }.contains(role);

    return [
      RecordCard(
        mono: true,
        title: pickString(s, ['shipmentCode']),
        pills: [
          Pill(status?.label ?? pickString(s, ['status']), AppColors.primary),
          if (overdue) Pill('Quá hạn giao', AppColors.danger),
        ],
        lines: [
          if (dueText.isNotEmpty) 'Hạn giao: $dueText',
          'Lượt giao: ${pickInt(s, ['attemptCount'])} / ${pickInt(s, ['maxAttempts'], maxDeliveryAttempts)}',
          if (failure.isNotEmpty)
            'Lý do gần nhất: ${FailureReason.values.where((r) => r.code == failure).firstOrNull?.label ?? failure}',
          if (d.plan != null)
            'Tổng cân ${formatKg(totals.kg)} · thể tích ${totals.cbm.toStringAsFixed(4).replaceAll('.', ',')} m³',
          if (pickString(s, ['shipperName']).isNotEmpty) 'Người giao: ${s['shipperName']} ${pickString(s, ['shipperPhone'])}',
          if (trip != null) 'Chuyến $trip',
          if (dateTimeText(s['pickupAt']).isNotEmpty) 'Hẹn lấy hàng: ${dateTimeText(s['pickupAt'])}',
        ],
      ),
      if (d.returns.isNotEmpty) ...[
        sectionTitle('Phiếu trả hàng'),
        for (final r in d.returns)
          RecordCard(
            title: pickString(r, ['rmaCode']),
            lines: [returnStatusLabels[r['status']] ?? pickString(r, ['status'])],
          ),
      ],
      if (managed) ...[
        sectionTitle('Hãng vận chuyển'),
        RecordCard(
          title: [
            pickString(s, ['carrierName'], 'Hãng'),
            pickString(s, ['carrierStatusLabel'], pickString(s, ['carrierStatus'])),
            if (s['estimatedCostVnd'] is num) formatVnd((s['estimatedCostVnd'] as num).toInt()),
          ].where((x) => x.isNotEmpty).join(' · '),
          lines: [
            for (final p in parcels) ...[
              [
                'Kiện ${pickInt(p, ['parcelNo'])}',
                pickString(p, ['recipientName']),
                pickString(p, ['carrierOrderCode'], 'chưa có mã'),
                pickString(p, ['sortCode']),
              ].where((x) => x.isNotEmpty).join(' · '),
              if (pickString(p, ['carrierOrderCode']).isEmpty && pickString(p, ['bookingError']).isNotEmpty)
                'Chưa tạo được vận đơn cho kiện ${pickInt(p, ['parcelNo'])}: ${humanCarrierError(pickString(p, ['bookingError']))}',
              if (pickString(p, ['carrierStatus']) == 'cancel')
                'Kiện ${pickInt(p, ['parcelNo'])} đã hủy ở hãng — bấm "Tạo lại ở hãng".',
            ],
            if (pickString(s, ['carrierBookingError']).isNotEmpty) humanCarrierError(pickString(s, ['carrierBookingError'])),
            if (incident.isNotEmpty) 'Hãng báo sự cố: $incident. Liên hệ hãng để xử lý.',
          ],
        ),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _action('Mô phỏng', Icons.science_outlined, _simulate),
            _action('Đồng bộ', Icons.sync,
                () => _run(() => _api.post('$_path/carrier/sync', body: {}), 'Đã đồng bộ trạng thái hãng.')),
            _action('Nhãn hãng', Icons.receipt_outlined, _carrierLabel),
            if (hasUnbookedParcels(parcels)) ...[
              _action('Tạo lại ở hãng', Icons.send_outlined,
                  () => _run(() => _api.post('$_path/carrier/book', body: {}), 'Đã đặt lại vận đơn ở hãng.')),
              _action('Sửa địa chỉ và tạo lại', Icons.edit_location_alt_outlined, () => _fixAddress(s)),
            ],
            if (status == ShipmentStatus.awaitingPickup)
              _action('Huỷ ở hãng', Icons.cancel_outlined, () => _cancelCarrier(s), color: AppColors.danger),
          ],
        ),
      ],
      sectionTitle('Dòng thời gian vận đơn'),
      if (d.events.isEmpty) emptyNote('Chưa có sự kiện.'),
      for (final e in d.events)
        RecordCard(
          title: shipmentEventLabels[e['eventType']] ?? 'Cập nhật vận đơn',
          lines: [
            [dateTimeText(e['occurredAt']), if (e['actorId'] == 'system') 'Hệ thống'].join(' · '),
            pickString(e, ['reasonLabel']),
            pickString(e, ['note']),
          ],
        ),
      sectionTitle('Điều phối & giấy tờ'),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          // Web: chỉ hẹn lấy khi vận đơn chưa gán người giao và không phải đơn Tiki.
          if (pickString(s, ['shipperId']).isEmpty && d.platform != 'tiki' && status != null && !status.isFinal)
            _action('Hẹn lấy hàng', Icons.schedule, _schedulePickup),
          _action('Nhãn PDF', Icons.print_outlined,
              () => printPdf(context, _api, '/documents/shipping-label/$groupId', 'nhan-kien')),
          if (canPrintSlip)
            _action('Phiếu đóng gói', Icons.description_outlined,
                () => printPdf(context, _api, '/documents/packing-slip/$groupId', 'phieu-dong-goi')),
          if (trip != null)
            _action('Bảng kê chuyến', Icons.list_alt,
                () => printPdf(context, _api, '/documents/manifest/${Uri.encodeComponent(trip)}', 'bang-ke')),
          _action('Lịch sử cả đơn', Icons.history, () => openPage(context, TimelineScreen(groupId: groupId))),
          if (role == UserRole.admin && status == ShipmentStatus.returningToWarehouse)
            _action(
                'Nhận hàng hoàn',
                Icons.assignment_return_outlined,
                () => _run(() => _api.post('$_path/receive-return', body: {'expected_version': pickInt(s, ['version'])}),
                    'Kho đã nhận hàng hoàn.')),
        ],
      ),
    ];
  }

  Widget _action(String label, IconData icon, VoidCallback onPressed, {Color? color}) => OutlinedButton.icon(
        style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44), foregroundColor: color),
        onPressed: onPressed,
        icon: Icon(icon),
        label: Text(label),
      );

  @override
  Widget build(BuildContext context) {
    return SubPage(
      title: 'Chi tiết vận đơn',
      child: LoadList<_Detail>(key: _list, load: _load, builder: (_, d, _) => _content(d)),
    );
  }
}
