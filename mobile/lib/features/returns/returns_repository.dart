/// Hàng hoàn. **Đang là dữ liệu giả.** BE đã có: `GET /returns`, `POST /returns/:id/receive`,
/// `POST /returns/:id/inspect`, `POST /returns/:id/approve|reject`, `POST /shipments/:id/receive-return`.
/// Ảnh tình trạng hàng: **BE chưa có API upload** (chờ BE).
enum ReturnStatus { requested, awaitingReceipt, received, closed, rejected }

enum InspectResult {
  restock('restock', 'Nhập lại kho'),
  quarantine('quarantine', 'Cách ly'),
  discard('discard', 'Hủy');

  const InspectResult(this.code, this.label);
  final String code;
  final String label;
}

/// Hạng bao bì thu hồi: A giao lại được, B dùng nội bộ, C bỏ.
enum PackagingGrade {
  a('A', 'Giao lại được'),
  b('B', 'Dùng nội bộ'),
  c('C', 'Bỏ');

  const PackagingGrade(this.code, this.label);
  final String code;
  final String label;
}

class ReturnItem {
  const ReturnItem({required this.sku, required this.quantity});
  final String sku;
  final int quantity;
}

class ReturnRequest {
  const ReturnRequest({
    required this.id,
    required this.code,
    required this.status,
    required this.orderCode,
    required this.reason,
    required this.items,
    required this.createdAt,
    this.type = 'return_refund',
    this.source = 'marketplace',
  });

  final String id;
  final String code;
  final ReturnStatus status;
  final String orderCode;
  final String reason;
  final List<ReturnItem> items;
  final DateTime createdAt;
  final String type;
  final String source;

  bool get isFailedDelivery => source == 'failed_delivery';

  ReturnRequest withStatus(ReturnStatus s) => ReturnRequest(
        id: id,
        code: code,
        status: s,
        orderCode: orderCode,
        reason: reason,
        items: items,
        createdAt: createdAt,
        type: type,
        source: source,
      );
}

/// Kết quả kiểm một dòng hàng hoàn.
class InspectLine {
  const InspectLine({required this.sku, required this.quantity, required this.result});
  final String sku;
  final int quantity;
  final InspectResult result;
}

class PackagingCheck {
  const PackagingCheck({required this.grade, required this.oldLabelRemoved});
  final PackagingGrade grade;

  /// Bắt buộc `true` khi hạng A: nhãn cũ có tên/SĐT khách (dữ liệu cá nhân).
  final bool oldLabelRemoved;
}

class ReturnsException implements Exception {
  const ReturnsException(this.message, {this.code});
  final String message;
  final String? code;
  @override
  String toString() => message;
}

abstract class ReturnsRepository {
  Future<List<ReturnRequest>> list(ReturnStatus status);
  Future<void> receive(String id);
  Future<void> inspect(String id, List<InspectLine> lines, PackagingCheck? packaging);
  Future<void> approve(String id);
  Future<void> reject(String id, String reason);
}

class MockReturnsRepository implements ReturnsRepository {
  MockReturnsRepository() {
    final now = DateTime.now();
    _items = [
      ReturnRequest(
        id: 'rma-1',
        code: 'RMA-261108-0001',
        status: ReturnStatus.requested,
        orderCode: '720000118',
        reason: 'Sai size, khách muốn trả',
        items: const [ReturnItem(sku: 'AOPOLO-030-BE-L', quantity: 1)],
        createdAt: now.subtract(const Duration(hours: 6)),
      ),
      ReturnRequest(
        id: 'rma-2',
        code: 'RMA-261108-0002',
        status: ReturnStatus.requested,
        orderCode: '720000121',
        reason: 'Hàng lỗi đường chỉ',
        items: const [ReturnItem(sku: 'QJEAN-012-XA-30', quantity: 2)],
        createdAt: now.subtract(const Duration(hours: 20)),
      ),
      ReturnRequest(
        id: 'rma-3',
        code: 'RMA-261107-0009',
        status: ReturnStatus.awaitingReceipt,
        orderCode: '720000098',
        reason: 'Khách đổi ý',
        items: const [
          ReturnItem(sku: 'AOPOLO-030-BE-M', quantity: 1),
          ReturnItem(sku: 'QJEAN-012-XA-30', quantity: 1),
        ],
        createdAt: now.subtract(const Duration(days: 1)),
      ),
      ReturnRequest(
        id: 'rma-4',
        code: 'RMA-261109-0003',
        status: ReturnStatus.awaitingReceipt,
        orderCode: '720000130',
        reason: 'Giao thất bại 2 lần — kiện hoàn về kho',
        items: const [ReturnItem(sku: 'AOPOLO-030-BE-L', quantity: 2)],
        createdAt: now.subtract(const Duration(hours: 3)),
        type: 'failed_delivery',
        source: 'failed_delivery',
      ),
      ReturnRequest(
        id: 'rma-5',
        code: 'RMA-261107-0004',
        status: ReturnStatus.received,
        orderCode: '720000090',
        reason: 'Khách đổi ý',
        items: const [ReturnItem(sku: 'AOPOLO-030-BE-M', quantity: 1)],
        createdAt: now.subtract(const Duration(days: 2)),
      ),
    ];
  }

  late List<ReturnRequest> _items;

  Future<void> _latency() => Future<void>.delayed(const Duration(milliseconds: 200));

  ReturnRequest _get(String id) => _items.firstWhere(
        (r) => r.id == id,
        orElse: () => throw const ReturnsException('Không tìm thấy phiếu.', code: 'RMA_NOT_FOUND'),
      );

  void _set(String id, ReturnStatus s) {
    _items = [for (final r in _items) r.id == id ? r.withStatus(s) : r];
  }

  @override
  Future<List<ReturnRequest>> list(ReturnStatus status) async {
    await _latency();
    return [for (final r in _items) if (r.status == status) r];
  }

  @override
  Future<void> receive(String id) async {
    await _latency();
    final r = _get(id);
    if (r.status != ReturnStatus.awaitingReceipt) {
      throw const ReturnsException('Phiếu không ở trạng thái chờ nhận.', code: 'RMA_INVALID_TRANSITION');
    }
    _set(id, ReturnStatus.received);
  }

  @override
  Future<void> inspect(String id, List<InspectLine> lines, PackagingCheck? packaging) async {
    await _latency();
    final r = _get(id);
    if (r.status != ReturnStatus.received) {
      throw const ReturnsException('Phải nhận kiện trước khi kiểm hàng.', code: 'RMA_INVALID_TRANSITION');
    }
    // BE: tổng mỗi SKU phải khớp số trả.
    for (final item in r.items) {
      final total = lines.where((l) => l.sku == item.sku).fold<int>(0, (s, l) => s + l.quantity);
      if (total != item.quantity) {
        throw ReturnsException('SKU ${item.sku}: kiểm $total, cần ${item.quantity}.', code: 'RMA_INSPECT_MISMATCH');
      }
    }
    if (packaging != null && packaging.grade == PackagingGrade.a && !packaging.oldLabelRemoved) {
      throw const ReturnsException('Gỡ nhãn cũ trước khi nhập thùng hạng A.', code: 'PKG_OLD_LABEL_NOT_REMOVED');
    }
    _set(id, ReturnStatus.closed);
  }

  @override
  Future<void> approve(String id) async {
    await _latency();
    final r = _get(id);
    if (r.status != ReturnStatus.requested) {
      throw const ReturnsException('Phiếu không ở trạng thái chờ duyệt.', code: 'RMA_INVALID_TRANSITION');
    }
    _set(id, ReturnStatus.awaitingReceipt);
  }

  @override
  Future<void> reject(String id, String reason) async {
    await _latency();
    if (reason.trim().isEmpty) {
      throw const ReturnsException('Cần nhập lý do từ chối.', code: 'RMA_REJECT_REASON_REQUIRED');
    }
    final r = _get(id);
    if (r.status != ReturnStatus.requested) {
      throw const ReturnsException('Phiếu không ở trạng thái chờ duyệt.', code: 'RMA_INVALID_TRANSITION');
    }
    _set(id, ReturnStatus.rejected);
  }
}
