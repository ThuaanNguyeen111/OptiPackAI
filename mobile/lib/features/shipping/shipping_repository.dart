/// Giao hàng cho Shipping Coordinator. **Đang là dữ liệu giả.**
/// BE đã có: `GET /order-groups?fulfillment_status=packed`, `GET /shipping/quote/:groupId`, `POST /shipments`,
/// `POST /shipments/:id/deliver|fail|retry`, `GET /shipments/reason-codes`.
/// Ảnh bằng chứng: tải lên `POST /proof-photos` rồi gửi `photo_urls` kèm deliver / fail.
/// BE bắt ảnh khi giao thành công vận đơn **shop tự giao** (không qua hãng): thiếu → 400 `SHP_PROOF_PHOTO_REQUIRED`.
enum ShipmentStatus {
  awaitingPickup('awaiting_pickup', 'Chờ hãng lấy hàng'),
  inTransit('in_transit', 'Đang trung chuyển'),
  outForDelivery('out_for_delivery', 'Đang giao'),
  deliveryFailed('delivery_failed', 'Giao thất bại'),
  returningToWarehouse('returning_to_warehouse', 'Đang hoàn về kho'),
  delivered('delivered', 'Đã giao'),
  returnedToWarehouse('returned_to_warehouse', 'Đã về kho'),
  cancelled('cancelled', 'Đã huỷ ở hãng');

  const ShipmentStatus(this.code, this.label);

  /// Giá trị `status` của BE.
  final String code;
  final String label;

  static ShipmentStatus? fromCode(String code) =>
      ShipmentStatus.values.where((s) => s.code == code).firstOrNull;

  bool get isFinal => this == delivered || this == returnedToWarehouse || this == cancelled;
}

/// Khớp `DELIVERY_FAILURE_REASONS` của BE.
enum FailureReason {
  customerUnreachable('customer_unreachable', 'Không liên lạc được khách'),
  customerRescheduled('customer_rescheduled', 'Khách hẹn lại'),
  wrongAddress('wrong_address', 'Sai địa chỉ'),
  areaInaccessible('area_inaccessible', 'Không vào được khu vực'),
  customerRefused('customer_refused', 'Khách từ chối nhận'),
  other('other', 'Khác (bắt buộc ghi chú)');

  const FailureReason(this.code, this.label);
  final String code;
  final String label;
}

const maxDeliveryAttempts = 2;

/// Luật của BE: thất bại lần thứ 2, hoặc khách từ chối nhận, thì **tự chuyển hoàn về kho**
/// (shipper không có nút hoàn sớm). Còn lại ở trạng thái "giao thất bại" để giao lại.
ShipmentStatus statusAfterFailure({required int attempt, required FailureReason reason}) {
  if (reason == FailureReason.customerRefused || attempt >= maxDeliveryAttempts) {
    return ShipmentStatus.returningToWarehouse;
  }
  return ShipmentStatus.deliveryFailed;
}

class ShipGroup {
  const ShipGroup({
    required this.id,
    required this.shortId,
    required this.platform,
    required this.recipientName,
    required this.address,
    required this.parcelCount,
    this.isExpress = false,
    this.deadline,
    this.requiresSelfDelivery = false,
  });

  final String id;
  final String shortId;
  final String platform;
  final String recipientName;
  final String address;
  final int parcelCount;
  final bool isExpress;
  final DateTime? deadline;

  /// Đơn Hỏa Tốc AURELLE: shop tự giao, không qua hãng (BE chặn chọn hãng).
  final bool requiresSelfDelivery;
}

/// Mã lựa chọn "shop tự giao" trong danh sách báo giá (không phải hãng thật).
const selfDeliveryQuoteCode = 'SELF';

class CarrierQuote {
  const CarrierQuote({
    required this.code,
    required this.name,
    required this.service,
    required this.feeVnd,
    required this.eta,
    this.unavailableReason,
  });

  final String code;
  final String name;
  final String service;
  final int feeVnd;
  final String eta;

  /// Hãng không báo giá được (VD địa chỉ không hợp lệ) → không chọn được.
  final String? unavailableReason;
}

class ShipmentView {
  const ShipmentView({
    required this.id,
    required this.code,
    required this.groupShortId,
    required this.recipientName,
    required this.status,
    required this.carrierName,
    required this.trackingCode,
    this.attempt = 1,
    this.dueAt,
    this.failureReason,
    this.selfDelivery = false,
    this.managedByCarrier = false,
    this.version = 0,
  });

  final String id;
  final String code;
  final String groupShortId;
  final String recipientName;
  final ShipmentStatus status;
  final String carrierName;
  final String trackingCode;
  final int attempt;
  final DateTime? dueAt;
  final FailureReason? failureReason;

  /// Shop tự giao (đơn Hỏa Tốc, không có hãng): giao thành công bắt buộc có ảnh.
  final bool selfDelivery;

  /// Vận đơn hãng API (GHN): trạng thái do hãng báo, không bấm giao / thất bại tay được.
  final bool managedByCarrier;

  /// `version` của vận đơn: gửi làm `expected_version`.
  final int version;

  bool get canRetry => status == ShipmentStatus.deliveryFailed && attempt < maxDeliveryAttempts;

  ShipmentView copyWith({ShipmentStatus? status, int? attempt, FailureReason? failureReason}) => ShipmentView(
        id: id,
        code: code,
        groupShortId: groupShortId,
        recipientName: recipientName,
        status: status ?? this.status,
        carrierName: carrierName,
        trackingCode: trackingCode,
        attempt: attempt ?? this.attempt,
        dueAt: dueAt,
        failureReason: failureReason ?? this.failureReason,
        selfDelivery: selfDelivery,
        managedByCarrier: managedByCarrier,
        version: version,
      );
}

class ShippingException implements Exception {
  const ShippingException(this.message, {this.code});
  final String message;
  final String? code;
  @override
  String toString() => message;
}

abstract class ShippingRepository {
  Future<List<ShipGroup>> readyToShip();
  Future<List<CarrierQuote>> quote(String groupId);
  Future<ShipmentView> create(String groupId, String carrierCode);
  Future<List<ShipmentView>> shipments();
  Future<ShipmentView> deliver(String id, {List<String> photoUrls = const []});
  Future<ShipmentView> fail(String id, FailureReason reason, {String? note, List<String> photoUrls = const []});
  Future<ShipmentView> retry(String id);
}

class MockShippingRepository implements ShippingRepository {
  MockShippingRepository() {
    final now = DateTime.now();
    _ready = [
      ShipGroup(
        id: 'sg1',
        shortId: '6ae76ee49b',
        platform: 'aurelle',
        recipientName: 'Nguyễn Văn An',
        address: '47/10 Nguyễn Văn Đậu, Phường Gia Định, TP Hồ Chí Minh',
        parcelCount: 2,
        isExpress: true,
        deadline: now.add(const Duration(hours: 2)),
      ),
      const ShipGroup(
        id: 'sg2',
        shortId: '9c01ab33d2',
        platform: 'lazada',
        recipientName: 'T**h',
        address: 'Phường Long Bình, TP Hồ Chí Minh',
        parcelCount: 1,
      ),
    ];
    _shipments = [
      ShipmentView(
        id: 'ship40',
        code: 'SHP-261109-000040',
        groupShortId: '5d2e8b1f07',
        recipientName: 'Phạm Minh Đức',
        status: ShipmentStatus.outForDelivery,
        carrierName: 'Shop tự giao (Hỏa Tốc)',
        trackingCode: 'SHP-261109-000040',
        dueAt: now.add(const Duration(minutes: 50)),
        selfDelivery: true,
      ),
      ShipmentView(
        id: 'ship41',
        code: 'SHP-261109-000041',
        groupShortId: '7f3a1c9e00',
        recipientName: 'Lê Thị Bích',
        status: ShipmentStatus.outForDelivery,
        carrierName: 'GHN',
        trackingCode: 'GHNL88K7P',
        dueAt: now.subtract(const Duration(minutes: 18)),
      ),
      const ShipmentView(
        id: 'ship42',
        code: 'SHP-261109-000042',
        groupShortId: '2b9d4e7a11',
        recipientName: 'Trần Quốc Cường',
        status: ShipmentStatus.deliveryFailed,
        carrierName: 'GHN',
        trackingCode: 'GHNL88K9Q',
        failureReason: FailureReason.customerUnreachable,
      ),
    ];
  }

  late List<ShipGroup> _ready;
  late List<ShipmentView> _shipments;
  var _seq = 43;

  Future<void> _latency() => Future<void>.delayed(const Duration(milliseconds: 200));

  ShipmentView _get(String id) => _shipments.firstWhere(
        (s) => s.id == id,
        orElse: () => throw const ShippingException('Không tìm thấy vận đơn.', code: 'SHP_NOT_FOUND'),
      );

  void _set(ShipmentView v) {
    _shipments = [for (final s in _shipments) s.id == v.id ? v : s];
  }

  @override
  Future<List<ShipGroup>> readyToShip() async {
    await _latency();
    return List.unmodifiable(_ready);
  }

  @override
  Future<List<CarrierQuote>> quote(String groupId) async {
    await _latency();
    return const [
      CarrierQuote(code: 'GHN', name: 'GHN', service: 'Hàng nhẹ', feeVnd: 20900, eta: 'Giao trong ngày'),
      CarrierQuote(code: 'SAMPLE-EXPRESS', name: 'Nhanh (mẫu)', service: 'Nhanh', feeVnd: 28000, eta: '2–4 giờ'),
      CarrierQuote(code: 'SAMPLE-ECONOMY', name: 'Tiết kiệm (mẫu)', service: 'Tiết kiệm', feeVnd: 15500, eta: '1–2 ngày'),
    ];
  }

  @override
  Future<ShipmentView> create(String groupId, String carrierCode) async {
    await _latency();
    final group = _ready.firstWhere(
      (g) => g.id == groupId,
      orElse: () => throw const ShippingException('Nhóm đơn không còn ở bước chờ giao.', code: 'SHP_GROUP_NOT_PACKED'),
    );
    final n = _seq++;
    final v = ShipmentView(
      id: 'ship$n',
      code: 'SHP-261109-${n.toString().padLeft(6, '0')}',
      groupShortId: group.shortId,
      recipientName: group.recipientName,
      status: ShipmentStatus.outForDelivery,
      carrierName: carrierCode,
      trackingCode: 'OPK-${n.toString().padLeft(10, '0')}',
    );
    _ready = [for (final g in _ready) if (g.id != groupId) g];
    _shipments = [v, ..._shipments];
    return v;
  }

  @override
  Future<List<ShipmentView>> shipments() async {
    await _latency();
    return List.unmodifiable(_shipments);
  }

  @override
  Future<ShipmentView> deliver(String id, {List<String> photoUrls = const []}) async {
    await _latency();
    final s = _get(id);
    if (s.status != ShipmentStatus.outForDelivery) {
      throw const ShippingException('Vận đơn không ở trạng thái đang giao.', code: 'SHP_INVALID_TRANSITION');
    }
    if (s.selfDelivery && photoUrls.isEmpty) {
      throw const ShippingException('Vận đơn shop tự giao cần ít nhất 1 ảnh bằng chứng.', code: 'SHP_PROOF_PHOTO_REQUIRED');
    }
    final v = s.copyWith(status: ShipmentStatus.delivered);
    _set(v);
    return v;
  }

  @override
  Future<ShipmentView> fail(String id, FailureReason reason, {String? note, List<String> photoUrls = const []}) async {
    await _latency();
    final s = _get(id);
    if (s.status != ShipmentStatus.outForDelivery) {
      throw const ShippingException('Vận đơn không ở trạng thái đang giao.', code: 'SHP_INVALID_TRANSITION');
    }
    if (reason == FailureReason.other && (note == null || note.trim().isEmpty)) {
      throw const ShippingException('Lý do "Khác" bắt buộc ghi chú.', code: 'SHP_FAIL_NOTE_REQUIRED');
    }
    final v = s.copyWith(
      status: statusAfterFailure(attempt: s.attempt, reason: reason),
      failureReason: reason,
    );
    _set(v);
    return v;
  }

  @override
  Future<ShipmentView> retry(String id) async {
    await _latency();
    final s = _get(id);
    if (!s.canRetry) {
      throw const ShippingException('Không giao lại được (đã đủ lần giao hoặc đang hoàn về).', code: 'SHP_RETRY_NOT_ALLOWED');
    }
    final v = s.copyWith(status: ShipmentStatus.outForDelivery, attempt: s.attempt + 1);
    _set(v);
    return v;
  }
}
