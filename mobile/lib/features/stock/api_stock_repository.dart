import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import 'stock_repository.dart';

/// Dòng tồn của BE (`SkuBinAssignmentResponse`) → [StockItem].
StockItem parseStockItem(Map<String, dynamic> m, {int? capacity}) => StockItem(
      assignmentId: pickString(m, ['id', '_id']),
      sku: pickString(m, ['sellerSku', 'seller_sku']),
      masterSku: pickStringOrNull(m, ['masterSku', 'master_sku']),
      quantityOnHand: pickInt(m, ['quantityOnHand', 'quantity_on_hand']),
      capacity: capacity,
    );

/// `GET …/bins/by-code/:code` → [BinStock].
BinStock? parseBinStock(Object? raw) {
  final m = asMap(raw);
  final bin = asMap(m?['bin']);
  if (m == null || bin == null) return null;
  final capacity = bin['capacity'] is num ? (bin['capacity'] as num).toInt() : null;
  final rows = m['assignments'];
  return BinStock(
    binCode: pickString(bin, ['binCode', 'bin_code']),
    zoneCode: pickString(m, ['zoneCode'], '—'),
    binId: pickStringOrNull(bin, ['id', '_id']),
    isActive: bin['isActive'] != false,
    items: [
      if (rows is List)
        for (final r in rows)
          if (asMap(r) case final a?) parseStockItem(a, capacity: capacity),
    ],
  );
}

/// Nhập thêm / kiểm kê / chuyển ô gọi BE thật. Mọi lần gửi kèm `client_event_id`
/// ([eventId]) nên bấm lại sau khi mất mạng không bị cộng hai lần.
class ApiStockRepository implements StockRepository {
  ApiStockRepository({required this.api, required this.warehouseId});

  final ApiClient api;

  /// Kho đang làm việc (kho đầu tiên đang hoạt động, giống màn lấy hàng).
  final Future<String?> Function() warehouseId;

  /// Sức chứa của ô vừa tra, để giữ lại cho kết quả trả về sau thao tác.
  final Map<String, int?> _capacity = {};

  Future<String> _wid() async {
    final id = await warehouseId();
    if (id == null || id.isEmpty) {
      throw const StockException('Chưa có kho nào đang hoạt động.', code: 'WH_WAREHOUSE_NOT_FOUND');
    }
    return id;
  }

  String _base(String wid, String assignmentId) =>
      '/warehouse/warehouses/${Uri.encodeComponent(wid)}/sku-bin-assignments/${Uri.encodeComponent(assignmentId)}';

  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on ApiException catch (e) {
      throw StockException(e.message, code: e.errorCode);
    }
  }

  StockItem _item(Object? raw, String assignmentId) {
    final m = asMap(raw);
    if (m == null) throw const StockException('Máy chủ trả dữ liệu không đọc được.');
    return parseStockItem(m, capacity: _capacity[assignmentId]);
  }

  @override
  Future<BinStock?> findBin(String binCode) async {
    final code = binCode.trim();
    if (code.isEmpty) return null;
    final wid = await _wid();
    try {
      final bin = parseBinStock(await api.get(
        '/warehouse/warehouses/${Uri.encodeComponent(wid)}/bins/by-code/${Uri.encodeComponent(code)}',
      ));
      if (bin != null) {
        for (final i in bin.items) {
          _capacity[i.assignmentId] = i.capacity;
        }
      }
      return bin;
    } on ApiException catch (e) {
      if (e.statusCode == 404) return null;
      throw StockException(e.message, code: e.errorCode);
    }
  }

  @override
  Future<StockItem> restock(String assignmentId, int quantity, {required String eventId, String? lotCode}) =>
      _guard(() async {
        final wid = await _wid();
        final raw = await api.post('${_base(wid, assignmentId)}/restock', body: {
          'quantity': quantity,
          if (lotCode != null && lotCode.trim().isNotEmpty) 'lot_code': lotCode.trim(),
          'client_event_id': eventId,
        });
        return _item(raw, assignmentId);
      });

  @override
  Future<StockItem> adjust(
    String assignmentId,
    int countedQuantity, {
    required StockAdjustReason reason,
    required String eventId,
    String? note,
  }) =>
      _guard(() async {
        final wid = await _wid();
        final raw = await api.post('${_base(wid, assignmentId)}/adjust', body: {
          'counted_quantity': countedQuantity,
          'reason_code': reason.code,
          if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
          'client_event_id': eventId,
        });
        return _item(raw, assignmentId);
      });

  @override
  Future<StockItem> transfer(
    String assignmentId,
    String toBinCode,
    int quantity, {
    required String eventId,
  }) =>
      _guard(() async {
        final target = await findBin(toBinCode);
        final targetId = target?.binId;
        if (target == null || targetId == null) {
          throw StockException('Không tìm thấy ô đích ${toBinCode.trim()}.', code: 'WH_BIN_NOT_FOUND');
        }
        final wid = await _wid();
        final raw = await api.post('${_base(wid, assignmentId)}/transfer', body: {
          'to_bin_location_id': targetId,
          'quantity': quantity,
          'client_event_id': eventId,
        });
        return _item(asMap(raw)?['from'], assignmentId);
      });
}
