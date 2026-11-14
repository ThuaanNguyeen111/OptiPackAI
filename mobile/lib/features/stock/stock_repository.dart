/// Nhập thêm / kiểm kê / chuyển ô. **Đang là dữ liệu giả.**
/// BE đã có: `POST /warehouse/warehouses/:wid/sku-bin-assignments/:aid/restock|adjust|transfer`,
/// cả ba nhận `client_event_id` (gửi lại cùng mã → BE trả kết quả lần trước, không ghi hai lần).
/// Khi nối thật, 3 thao tác này được đưa vào hàng đợi ngoại tuyến (`PendingAction`).
enum StockAdjustReason {
  countCorrection('count_correction', 'Đếm lại'),
  damaged('damaged', 'Hư hỏng'),
  lost('lost', 'Thất lạc'),
  found('found', 'Tìm thấy thêm'),
  other('other', 'Khác');

  const StockAdjustReason(this.code, this.label);
  final String code;
  final String label;
}

class StockItem {
  const StockItem({
    required this.assignmentId,
    required this.sku,
    required this.quantityOnHand,
    this.masterSku,
    this.capacity,
  });

  final String assignmentId;
  final String sku;
  final String? masterSku;
  final int quantityOnHand;

  /// Sức chứa của ô; vượt thì BE trả 409 `WH_BIN_OVER_CAPACITY` (bỏ qua bằng `force`).
  final int? capacity;

  StockItem withQuantity(int q) => StockItem(
        assignmentId: assignmentId,
        sku: sku,
        masterSku: masterSku,
        quantityOnHand: q,
        capacity: capacity,
      );
}

class BinStock {
  const BinStock({
    required this.binCode,
    required this.zoneCode,
    required this.items,
    this.binId,
    this.isActive = true,
  });

  final String binCode;
  final String zoneCode;
  final List<StockItem> items;

  /// Id ô trên BE (cần khi chuyển hàng sang ô này).
  final String? binId;

  /// Ô đã ngừng dùng thì không nhập / chuyển vào được.
  final bool isActive;
}

class StockException implements Exception {
  const StockException(this.message, {this.code});
  final String message;
  final String? code;
  @override
  String toString() => message;
}

abstract class StockRepository {
  Future<BinStock?> findBin(String binCode);
  Future<StockItem> restock(String assignmentId, int quantity, {required String eventId, String? lotCode});
  Future<StockItem> adjust(
    String assignmentId,
    int countedQuantity, {
    required StockAdjustReason reason,
    required String eventId,
    String? note,
  });
  Future<StockItem> transfer(
    String assignmentId,
    String toBinCode,
    int quantity, {
    required String eventId,
  });
}

class MockStockRepository implements StockRepository {
  final Map<String, ({String zone, int? capacity})> _bins = {
    'KA-D1-P01-T01-1': (zone: 'KA', capacity: 40),
    'KA-D1-P01-T01-2': (zone: 'KA', capacity: 40),
    'KA-D2-P02-T01-1': (zone: 'KA', capacity: 60),
  };

  final List<({String bin, StockItem item})> _rows = [
    (bin: 'KA-D1-P01-T01-1', item: const StockItem(assignmentId: 'a1', sku: 'AOPOLO-030-BE-L', quantityOnHand: 6, capacity: 40)),
    (bin: 'KA-D1-P01-T01-1', item: const StockItem(assignmentId: 'a2', sku: 'AOPOLO-030-BE-M', masterSku: 'ATHUN-005-BE-M', quantityOnHand: 14, capacity: 40)),
    (bin: 'KA-D1-P01-T01-2', item: const StockItem(assignmentId: 'a3', sku: 'QJEAN-012-XA-30', quantityOnHand: 22, capacity: 40)),
    (bin: 'KA-D2-P02-T01-1', item: const StockItem(assignmentId: 'a4', sku: 'AOPOLO-030-BE-L', quantityOnHand: 16, capacity: 60)),
  ];

  /// Mô phỏng chống ghi trùng của BE: cùng `client_event_id` thì trả kết quả cũ, không áp dụng lần 2.
  final Map<String, StockItem> _seen = {};

  Future<void> _latency() => Future<void>.delayed(const Duration(milliseconds: 200));

  int _indexOf(String assignmentId) {
    final i = _rows.indexWhere((r) => r.item.assignmentId == assignmentId);
    if (i < 0) throw const StockException('Không tìm thấy dòng tồn.', code: 'WH_ASSIGNMENT_NOT_FOUND');
    return i;
  }

  @override
  Future<BinStock?> findBin(String binCode) async {
    await _latency();
    final code = binCode.trim().toUpperCase();
    final bin = _bins[code];
    if (bin == null) return null;
    return BinStock(
      binCode: code,
      zoneCode: bin.zone,
      items: [for (final r in _rows) if (r.bin == code) r.item],
    );
  }

  @override
  Future<StockItem> restock(String assignmentId, int quantity, {required String eventId, String? lotCode}) async {
    await _latency();
    final seen = _seen[eventId];
    if (seen != null) return seen;
    if (quantity < 1) throw const StockException('Số lượng phải từ 1 trở lên.');
    final i = _indexOf(assignmentId);
    final row = _rows[i];
    final cap = row.item.capacity;
    if (cap != null && row.item.quantityOnHand + quantity > cap) {
      throw StockException('Vượt sức chứa ô ($cap).', code: 'WH_BIN_OVER_CAPACITY');
    }
    final updated = row.item.withQuantity(row.item.quantityOnHand + quantity);
    _rows[i] = (bin: row.bin, item: updated);
    return _seen[eventId] = updated;
  }

  @override
  Future<StockItem> adjust(
    String assignmentId,
    int countedQuantity, {
    required StockAdjustReason reason,
    required String eventId,
    String? note,
  }) async {
    await _latency();
    final seen = _seen[eventId];
    if (seen != null) return seen;
    if (countedQuantity < 0) throw const StockException('Số đếm không được âm.');
    final i = _indexOf(assignmentId);
    final row = _rows[i];
    final updated = row.item.withQuantity(countedQuantity);
    _rows[i] = (bin: row.bin, item: updated);
    return _seen[eventId] = updated;
  }

  @override
  Future<StockItem> transfer(
    String assignmentId,
    String toBinCode,
    int quantity, {
    required String eventId,
  }) async {
    await _latency();
    final seen = _seen[eventId];
    if (seen != null) return seen;
    final target = toBinCode.trim().toUpperCase();
    if (!_bins.containsKey(target)) {
      throw const StockException('Không tìm thấy ô đích.', code: 'WH_BIN_NOT_FOUND');
    }
    final i = _indexOf(assignmentId);
    final row = _rows[i];
    if (row.bin == target) throw const StockException('Ô đích trùng ô nguồn.');
    if (quantity < 1 || quantity > row.item.quantityOnHand) {
      throw StockException('Chỉ chuyển được tối đa ${row.item.quantityOnHand}.', code: 'WH_INSUFFICIENT_STOCK');
    }
    final from = row.item.withQuantity(row.item.quantityOnHand - quantity);
    _rows[i] = (bin: row.bin, item: from);
    final j = _rows.indexWhere((r) => r.bin == target && r.item.sku == row.item.sku);
    if (j >= 0) {
      _rows[j] = (bin: target, item: _rows[j].item.withQuantity(_rows[j].item.quantityOnHand + quantity));
    } else {
      _rows.add((
        bin: target,
        item: StockItem(
          assignmentId: 'a${_rows.length + 1}',
          sku: row.item.sku,
          masterSku: row.item.masterSku,
          quantityOnHand: quantity,
          capacity: _bins[target]!.capacity,
        ),
      ));
    }
    return _seen[eventId] = from;
  }
}
