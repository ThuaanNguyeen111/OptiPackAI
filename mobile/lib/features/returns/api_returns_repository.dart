import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import 'returns_repository.dart';

/// Một dòng của `GET /returns` (`toReturnResponse` của BE) → [ReturnRequest].
ReturnRequest? parseReturn(Object? raw) {
  final m = asMap(raw);
  final id = pickString(m, ['id', '_id']);
  if (m == null || id.isEmpty) return null;
  final items = m['items'] is List ? m['items'] as List : const [];
  final reasons = <String>{
    for (final i in items)
      if (pickString(asMap(i), ['reasonLabel']).isNotEmpty) pickString(asMap(i), ['reasonLabel']),
  };
  final note = pickString(m, ['customerNote']);
  final source = pickString(m, ['source'], 'marketplace');
  final group = pickString(m, ['orderGroupId']);
  return ReturnRequest(
    id: id,
    code: pickString(m, ['rmaCode'], id),
    status: ReturnStatus.fromCode(pickString(m, ['status'])) ?? ReturnStatus.requested,
    // Phiếu không mang mã đơn sàn: hiện mã đơn bên sàn nếu có, không thì đuôi mã nhóm đơn.
    orderCode: pickString(m, ['externalRef'], group.length > 10 ? group.substring(group.length - 10) : group),
    reason: [
      if (source == 'failed_delivery') 'Giao thất bại — kiện hoàn về kho',
      ...reasons,
      if (note.isNotEmpty) note,
    ].join(' · '),
    items: [
      for (final i in items)
        if (asMap(i) case final r?)
          ReturnItem(sku: pickString(r, ['sellerSku', 'seller_sku']), quantity: pickInt(r, ['quantity'])),
    ],
    createdAt: pickDate(m, ['createdAt', 'created_at']) ?? DateTime.now(),
    type: pickString(m, ['type'], 'return_refund'),
    source: source,
    version: pickInt(m, ['version', '__v']),
  );
}

/// Kho + id ô từ mã ô (để nhập lại hàng hoàn vào đúng ô).
typedef BinResolver = Future<({String warehouseId, String binId})?> Function(String binCode);

/// Hàng hoàn gọi BE thật. Mọi thao tác gửi `expected_version` của phiếu (lệch → 409, tải lại).
class ApiReturnsRepository implements ReturnsRepository {
  ApiReturnsRepository({required this.api, required this.resolveBin});

  final ApiClient api;
  final BinResolver resolveBin;

  /// Phiếu đọc gần nhất, để lấy `version` khi bấm thao tác.
  final Map<String, ReturnRequest> _known = {};

  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on ApiException catch (e) {
      throw ReturnsException(e.message, code: e.errorCode);
    }
  }

  Future<int> _version(String id) async {
    final known = _known[id];
    if (known != null) return known.version;
    final r = parseReturn(await api.get('/returns/${Uri.encodeComponent(id)}'));
    return r?.version ?? 0;
  }

  Future<void> _action(String id, String action, [Map<String, dynamic> extra = const {}]) => _guard(() async {
        await api.post('/returns/${Uri.encodeComponent(id)}/$action', body: {
          'expected_version': await _version(id),
          ...extra,
        });
        _known.remove(id);
      });

  @override
  Future<List<ReturnRequest>> list(ReturnStatus status) => _guard(() async {
        final raw = await api.get('/returns', query: {'status': status.code, 'limit': 100});
        final rows = asMap(raw)?['items'];
        final list = [
          if (rows is List)
            for (final r in rows) ?parseReturn(r),
        ];
        for (final r in list) {
          _known[r.id] = r;
        }
        return list;
      });

  @override
  Future<void> receive(String id) => _action(id, 'receive');

  @override
  Future<void> approve(String id) => _action(id, 'approve');

  @override
  Future<void> reject(String id, String reason) => _action(id, 'reject', {'note': reason});

  @override
  Future<void> inspect(
    String id,
    List<InspectLine> lines,
    PackagingCheck? packaging, {
    List<String> photoUrls = const [],
  }) async {
    final body = <Map<String, dynamic>>[];
    for (final l in lines) {
      final line = <String, dynamic>{'seller_sku': l.sku, 'quantity': l.quantity, 'result': l.result.code};
      if (l.result == InspectResult.restock) {
        final code = l.binCode?.trim() ?? '';
        if (code.isEmpty) {
          throw ReturnsException('Nhập ô để nhập lại ${l.sku}.', code: 'RMA_RESTOCK_BIN_REQUIRED');
        }
        final bin = await _guard(() => resolveBin(code));
        if (bin == null) throw ReturnsException('Không tìm thấy ô $code.', code: 'WH_BIN_NOT_FOUND');
        line['warehouse_id'] = bin.warehouseId;
        line['bin_location_id'] = bin.binId;
      }
      body.add(line);
    }
    final material = packaging?.materialCode.trim() ?? '';
    if (packaging != null && material.isEmpty) {
      throw const ReturnsException('Nhập mã thùng thu hồi (VD BOX-M).', code: 'RMA_PACKAGING_CODE_REQUIRED');
    }
    await _action(id, 'inspect', {
      'lines': body,
      if (packaging != null)
        'packaging': [
          {
            'material_code': material.toUpperCase(),
            'quantity': 1,
            'grade': packaging.grade.code,
            'old_label_removed': packaging.oldLabelRemoved,
          },
        ],
      if (photoUrls.isNotEmpty) 'photo_urls': photoUrls,
    });
  }
}
