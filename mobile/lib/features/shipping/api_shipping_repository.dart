import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import 'shipping_repository.dart';

String _short(String id) => id.length > 10 ? id.substring(id.length - 10) : id;

/// Một vận đơn của BE (`ShipmentResponse`) → [ShipmentView].
ShipmentView? parseShipment(Object? raw) {
  final m = asMap(raw);
  final id = pickString(m, ['id', '_id']);
  final status = ShipmentStatus.fromCode(pickString(m, ['status']));
  if (m == null || id.isEmpty || status == null) return null;
  final carrierCode = pickStringOrNull(m, ['carrierCode']);
  final failure = pickString(m, ['lastFailureReason']);
  final shipper = pickStringOrNull(m, ['shipperName']);
  return ShipmentView(
    id: id,
    code: pickString(m, ['shipmentCode'], id),
    groupShortId: _short(pickString(m, ['orderGroupId'])),
    recipientName: shipper != null ? 'Shipper: $shipper' : 'Nhóm ${_short(pickString(m, ['orderGroupId']))}',
    status: status,
    carrierName: carrierCode == null ? 'Shop tự giao' : pickString(m, ['carrierName'], carrierCode),
    trackingCode: pickString(m, ['trackingCode'], pickString(m, ['shipmentCode'])),
    attempt: pickInt(m, ['attemptCount'], 1).clamp(1, 99),
    dueAt: pickDate(m, ['dueAt']),
    failureReason: FailureReason.values.where((r) => r.code == failure).firstOrNull,
    selfDelivery: carrierCode == null,
    managedByCarrier: pickBool(m, ['carrierManaged']),
    version: pickInt(m, ['version']),
  );
}

/// Một dịch vụ của `GET /shipping/quote/:groupId` → [CarrierQuote]. Mã = `HÃNG|DỊCH_VỤ`.
CarrierQuote? parseQuote(Object? raw) {
  final m = asMap(raw);
  final carrier = pickString(m, ['carrierCode']);
  final service = pickString(m, ['serviceCode']);
  if (carrier.isEmpty || service.isEmpty) return null;
  final min = pickInt(m, ['etaMinDays']);
  final max = pickInt(m, ['etaMaxDays']);
  final reason = pickStringOrNull(m, ['unavailableReason']);
  return CarrierQuote(
    code: '$carrier|$service',
    name: pickString(m, ['carrierName'], carrier) + (m!['isSample'] == true ? ' (cước mẫu)' : ''),
    service: pickString(m, ['serviceName'], service),
    feeVnd: pickInt(m, ['totalCostVnd']),
    eta: max <= 0 ? 'Trong ngày' : (min == max ? '$max ngày' : '$min–$max ngày'),
    unavailableReason: reason == null || reason.isEmpty ? null : reason,
  );
}

/// Giao hàng gọi BE thật (`/shipping/quote`, `/shipments*`). Vận đơn gửi `expected_version`.
class ApiShippingRepository implements ShippingRepository {
  ApiShippingRepository({required this.api, required this.currentUserId});

  final ApiClient api;
  final String? Function() currentUserId;

  final Map<String, ShipmentView> _known = {};
  final Map<String, ShipGroup> _groups = {};

  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on ApiException catch (e) {
      throw ShippingException(e.message, code: e.errorCode);
    }
  }

  ShipmentView _keep(Object? raw) {
    final v = parseShipment(raw);
    if (v == null) throw const ShippingException('Máy chủ trả vận đơn không đọc được.');
    return _known[v.id] = v;
  }

  Future<int> _version(String id) async =>
      _known[id]?.version ?? _keep(await api.get('/shipments/${Uri.encodeComponent(id)}')).version;

  @override
  Future<List<ShipGroup>> readyToShip() => _guard(() async {
        final raw = await api.get('/order-groups', query: {'fulfillment_status': 'packed', 'limit': 50});
        final rows = [
          if (raw is List)
            for (final r in raw) ?asMap(r),
        ];
        if (rows.isEmpty) return const <ShipGroup>[];
        final ids = [for (final r in rows) pickString(r, ['id', '_id'])];
        final summary = asMap(await api.get('/packing-plans/summary', query: {'group_ids': ids.join(',')}));
        final parcels = <String, int>{
          for (final s in (summary?['summaries'] as List? ?? const []))
            pickString(asMap(s), ['orderGroupId']): pickInt(asMap(s), ['parcels']),
        };
        final info = <String, Map<String, dynamic>>{
          for (final m in [for (final g in (summary?['groups'] as List? ?? const [])) ?asMap(g)])
            pickString(m, ['orderGroupId']): m,
        };
        return [
          for (final r in rows)
            _groups[pickString(r, ['id', '_id'])] = () {
              final id = pickString(r, ['id', '_id']);
              final names = r['recipientNames'] is List ? (r['recipientNames'] as List).join(', ') : '';
              final orders = (info[id]?['orderNumbers'] as List? ?? const []).join(', ');
              return ShipGroup(
                id: id,
                shortId: _short(id),
                platform: pickString(r, ['platform']),
                recipientName: pickString(info[id], ['recipientName'], names.isEmpty ? 'Người nhận' : names),
                address: orders.isEmpty ? '' : 'Đơn $orders',
                parcelCount: parcels[id] ?? 0,
                isExpress: pickString(r, ['orderPriority']) == 'express',
                deadline: pickDate(r, ['deliveryDeadline', 'packagingDeadline']),
                requiresSelfDelivery: pickBool(r, ['requiresSelfDelivery']),
              );
            }(),
        ];
      });

  @override
  Future<List<CarrierQuote>> quote(String groupId) => _guard(() async {
        const self = CarrierQuote(
          code: selfDeliveryQuoteCode,
          name: 'Shop tự giao',
          service: 'Bạn đi giao',
          feeVnd: 0,
          eta: 'Theo hẹn với khách',
        );
        // Đơn Hỏa Tốc: BE chặn chọn hãng, chỉ shop tự giao.
        if (_groups[groupId]?.requiresSelfDelivery ?? false) return const [self];
        final raw = asMap(await api.get('/shipping/quote/${Uri.encodeComponent(groupId)}'));
        final quotes = [
          for (final q in (raw?['quotes'] as List? ?? const [])) ?parseQuote(q),
        ];
        return [...quotes, self];
      });

  @override
  Future<ShipmentView> create(String groupId, String carrierCode) => _guard(() async {
        final parts = carrierCode.split('|');
        final self = carrierCode == selfDeliveryQuoteCode;
        final me = currentUserId();
        return _keep(await api.post('/shipments', body: {
          'order_group_id': groupId,
          if (!self && parts.length == 2) ...{'carrier_code': parts[0], 'service_code': parts[1]},
          if (self && me != null) 'shipper_id': me,
        }));
      });

  @override
  Future<List<ShipmentView>> shipments() => _guard(() async {
        final raw = asMap(await api.get('/shipments', query: {'limit': 100}));
        final list = [
          for (final r in (raw?['items'] as List? ?? const [])) ?parseShipment(r),
        ];
        for (final v in list) {
          _known[v.id] = v;
        }
        // Việc còn mở lên trước; đã xong thì để cuối.
        return [...list.where((v) => !v.status.isFinal), ...list.where((v) => v.status.isFinal)];
      });

  Future<ShipmentView> _act(String id, String action, Map<String, dynamic> extra) => _guard(() async {
        try {
          return _keep(await api.post('/shipments/${Uri.encodeComponent(id)}/$action', body: {
            'expected_version': await _version(id),
            ...extra,
          }));
        } on ApiException catch (e) {
          if (e.isConflict) _known.remove(id);
          rethrow;
        }
      });

  @override
  Future<ShipmentView> deliver(String id, {List<String> photoUrls = const []}) =>
      _act(id, 'deliver', {if (photoUrls.isNotEmpty) 'photo_urls': photoUrls});

  @override
  Future<ShipmentView> fail(String id, FailureReason reason, {String? note, List<String> photoUrls = const []}) =>
      _act(id, 'fail', {
        'reason_code': reason.code,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
        if (photoUrls.isNotEmpty) 'photo_urls': photoUrls,
      });

  @override
  Future<ShipmentView> retry(String id) => _act(id, 'retry', const {});
}
