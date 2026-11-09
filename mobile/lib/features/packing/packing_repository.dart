/// Đóng gói cho Packaging Staff. **Đang là dữ liệu giả.**
/// BE đã có: `GET /order-groups?assigned_packer_id=`, `GET /order-groups/:id/packing-plan`,
/// `POST …/packing-plan/approve|reject|start`, `…/parcels/:no/scan|unscan|seal|unseal`, `…/report-issue`, `…/finish`.
/// Quét món (`scan`) có `client_event_id` nên đưa được vào hàng đợi ngoại tuyến; niêm phong/báo lỗi thì không.
/// Ảnh báo lỗi kiện: **BE chưa có API upload**.
enum PackingStage { pendingApproval, packing }

enum ParcelStatus { pending, sealed, held }

/// Lý do từ chối kế hoạch (khớp `REJECT_REASONS` của BE).
enum RejectReason {
  productMoreFragile('PRODUCT_MORE_FRAGILE_THAN_EXPECTED', 'Sản phẩm dễ vỡ hơn dự kiến'),
  boxNotInStock('RECOMMENDED_BOX_NOT_IN_STOCK', 'Thùng đề xuất không có trong kho'),
  itemDimensionWrong('ITEM_DIMENSION_WRONG', 'Số đo món hàng sai'),
  itemWeightWrong('ITEM_WEIGHT_WRONG', 'Cân nặng món hàng sai'),
  boxTooTight('BOX_TOO_TIGHT', 'Thùng quá chật'),
  boxTooLoose('BOX_TOO_LOOSE', 'Thùng quá rộng'),
  tooManyParcels('TOO_MANY_PARCELS', 'Quá nhiều kiện'),
  itemDamaged('ITEM_DAMAGED', 'Hàng bị hỏng'),
  specialPacking('SPECIAL_PACKING_NEEDED', 'Cần cách đóng đặc biệt'),
  planUnrealistic('PLAN_UNREALISTIC', 'Kế hoạch không làm được'),
  other('OTHER', 'Khác');

  const RejectReason(this.code, this.label);
  final String code;
  final String label;
}

enum PackIssue {
  damaged('damaged', 'Hỏng'),
  missing('missing', 'Thiếu'),
  wrongItem('wrong_item', 'Nhầm món');

  const PackIssue(this.code, this.label);
  final String code;
  final String label;
}

class PlacedItem {
  const PlacedItem({
    required this.sku,
    required this.x,
    required this.y,
    required this.z,
    required this.dx,
    required this.dy,
    required this.dz,
    this.folded = false,
  });

  final String sku;

  /// Toạ độ góc trong lòng thùng, đơn vị cm (BE trả mm; app đổi sang cm khi hiển thị).
  final double x, y, z, dx, dy, dz;
  final bool folded;
}

class Parcel {
  const Parcel({
    required this.no,
    required this.boxCode,
    required this.boxName,
    required this.innerL,
    required this.innerW,
    required this.innerH,
    required this.items,
    required this.expectedWeightKg,
    this.cutFromH,
    this.status = ParcelStatus.pending,
    this.scanned = const {},
    this.sealedWeightKg,
  });

  final int no;
  final String boxCode;
  final String boxName;
  final double innerL, innerW, innerH;

  /// Chiều cao lòng gốc nếu thùng được cắt hạ.
  final double? cutFromH;
  final List<PlacedItem> items;
  final double expectedWeightKg;
  final ParcelStatus status;
  final Map<String, int> scanned;
  final double? sealedWeightKg;

  Map<String, int> get needed {
    final out = <String, int>{};
    for (final i in items) {
      out[i.sku] = (out[i.sku] ?? 0) + 1;
    }
    return out;
  }

  int get totalNeeded => items.length;
  int get totalScanned => scanned.values.fold(0, (s, v) => s + v);
  bool get allScanned => totalScanned >= totalNeeded && totalNeeded > 0;

  Parcel copyWith({
    ParcelStatus? status,
    Map<String, int>? scanned,
    double? sealedWeightKg,
  }) =>
      Parcel(
        no: no,
        boxCode: boxCode,
        boxName: boxName,
        innerL: innerL,
        innerW: innerW,
        innerH: innerH,
        items: items,
        expectedWeightKg: expectedWeightKg,
        cutFromH: cutFromH,
        status: status ?? this.status,
        scanned: scanned ?? this.scanned,
        sealedWeightKg: sealedWeightKg ?? this.sealedWeightKg,
      );
}

class PackingGroup {
  const PackingGroup({
    required this.id,
    required this.shortId,
    required this.platform,
    required this.stage,
    required this.parcels,
    this.isExpress = false,
    this.deadline,
  });

  final String id;
  final String shortId;
  final String platform;
  final PackingStage stage;
  final List<Parcel> parcels;
  final bool isExpress;
  final DateTime? deadline;

  PackingGroup copyWith({PackingStage? stage, List<Parcel>? parcels}) => PackingGroup(
        id: id,
        shortId: shortId,
        platform: platform,
        stage: stage ?? this.stage,
        parcels: parcels ?? this.parcels,
        isExpress: isExpress,
        deadline: deadline,
      );
}

class PackingException implements Exception {
  const PackingException(this.message, {this.code});
  final String message;
  final String? code;
  @override
  String toString() => message;
}

enum SealOutcome { sealed, held }

/// Cân thật lệch quá [tolerance] so với cân ước tính thì kiện bị **giữ** chờ người khác xem lại
/// (BE: nhân viên niêm phong không tự duyệt kiện của mình).
SealOutcome evaluateSealWeight(double expectedKg, double actualKg, {double tolerance = 0.2}) {
  if (expectedKg <= 0) return SealOutcome.sealed;
  final deviation = (actualKg - expectedKg).abs() / expectedKg;
  return deviation > tolerance ? SealOutcome.held : SealOutcome.sealed;
}

abstract class PackingRepository {
  Future<List<PackingGroup>> queue(PackingStage stage);
  Future<PackingGroup> get(String groupId);
  Future<PackingGroup> approve(String groupId);
  Future<void> reject(String groupId, RejectReason reason, String? note);
  Future<Parcel> scan(String groupId, int parcelNo, String code);
  Future<Parcel> unscan(String groupId, int parcelNo, String sku);
  Future<({Parcel parcel, SealOutcome outcome})> seal(String groupId, int parcelNo, double weightKg);
  Future<void> reportIssue(String groupId, int parcelNo, String sku, PackIssue issue);
}

class MockPackingRepository implements PackingRepository {
  MockPackingRepository() {
    final now = DateTime.now();
    _groups = [
      PackingGroup(
        id: 'pg1',
        shortId: '6ae76ee49b',
        platform: 'aurelle',
        stage: PackingStage.pendingApproval,
        isExpress: true,
        deadline: now.add(const Duration(minutes: 42)),
        parcels: const [
          Parcel(
            no: 1,
            boxCode: 'BOX-M',
            boxName: 'Thùng M',
            innerL: 35,
            innerW: 25,
            innerH: 15,
            cutFromH: 20,
            expectedWeightKg: 1.18,
            items: [
              PlacedItem(sku: 'AOPOLO-030-BE-L', x: 0, y: 0, z: 0, dx: 25, dy: 18, dz: 3, folded: true),
              PlacedItem(sku: 'AOPOLO-030-BE-L', x: 0, y: 0, z: 3, dx: 25, dy: 18, dz: 3, folded: true),
              PlacedItem(sku: 'QJEAN-012-XA-30', x: 0, y: 0, z: 6, dx: 25, dy: 18, dz: 5, folded: true),
              PlacedItem(sku: 'GIAY-077-DEN-41', x: 26, y: 0, z: 0, dx: 9, dy: 25, dz: 12),
            ],
          ),
          Parcel(
            no: 2,
            boxCode: 'BOX-S',
            boxName: 'Thùng S',
            innerL: 25,
            innerW: 20,
            innerH: 10,
            expectedWeightKg: 0.42,
            items: [
              PlacedItem(sku: 'AOPOLO-030-BE-M', x: 0, y: 0, z: 0, dx: 22, dy: 16, dz: 3, folded: true),
              PlacedItem(sku: 'AOPOLO-030-BE-M', x: 0, y: 0, z: 3, dx: 22, dy: 16, dz: 3, folded: true),
            ],
          ),
        ],
      ),
      PackingGroup(
        id: 'pg2',
        shortId: '9c01ab33d2',
        platform: 'lazada',
        stage: PackingStage.packing,
        deadline: now.add(const Duration(hours: 5)),
        parcels: const [
          Parcel(
            no: 1,
            boxCode: 'BOX-S',
            boxName: 'Thùng S',
            innerL: 25,
            innerW: 20,
            innerH: 10,
            expectedWeightKg: 0.55,
            items: [
              PlacedItem(sku: 'AOPOLO-030-BE-M', x: 0, y: 0, z: 0, dx: 22, dy: 16, dz: 3, folded: true),
              PlacedItem(sku: 'QJEAN-012-XA-30', x: 0, y: 0, z: 3, dx: 22, dy: 16, dz: 5, folded: true),
            ],
          ),
        ],
      ),
    ];
  }

  late List<PackingGroup> _groups;

  Future<void> _latency() => Future<void>.delayed(const Duration(milliseconds: 200));

  PackingGroup _group(String id) => _groups.firstWhere(
        (g) => g.id == id,
        orElse: () => throw const PackingException('Không tìm thấy nhóm đơn.', code: 'ORD_GROUP_NOT_FOUND'),
      );

  void _replaceParcel(String groupId, Parcel parcel) {
    _groups = [
      for (final g in _groups)
        g.id == groupId
            ? g.copyWith(parcels: [for (final p in g.parcels) p.no == parcel.no ? parcel : p])
            : g,
    ];
  }

  Parcel _parcel(String groupId, int no) =>
      _group(groupId).parcels.firstWhere((p) => p.no == no);

  @override
  Future<List<PackingGroup>> queue(PackingStage stage) async {
    await _latency();
    return [for (final g in _groups) if (g.stage == stage) g];
  }

  @override
  Future<PackingGroup> get(String groupId) async {
    await _latency();
    return _group(groupId);
  }

  @override
  Future<PackingGroup> approve(String groupId) async {
    await _latency();
    final g = _group(groupId);
    if (g.stage != PackingStage.pendingApproval) {
      throw const PackingException('Kế hoạch không ở trạng thái chờ chấp nhận.', code: 'PACKING_INVALID_STATE');
    }
    final updated = g.copyWith(stage: PackingStage.packing);
    _groups = [for (final x in _groups) x.id == groupId ? updated : x];
    return updated;
  }

  @override
  Future<void> reject(String groupId, RejectReason reason, String? note) async {
    await _latency();
    final g = _group(groupId);
    if (g.stage != PackingStage.pendingApproval) {
      throw const PackingException('Kế hoạch không ở trạng thái chờ chấp nhận.', code: 'PACKING_INVALID_STATE');
    }
    _groups = [for (final x in _groups) if (x.id != groupId) x];
  }

  @override
  Future<Parcel> scan(String groupId, int parcelNo, String code) async {
    await _latency();
    final p = _parcel(groupId, parcelNo);
    if (p.status != ParcelStatus.pending) {
      throw const PackingException('Kiện đã niêm phong.', code: 'PACKING_PARCEL_NOT_PENDING');
    }
    final needle = code.trim().toLowerCase();
    final sku = p.needed.keys.firstWhere(
      (s) => s.toLowerCase() == needle,
      orElse: () => '',
    );
    if (sku.isEmpty) {
      throw const PackingException('Món này không thuộc kiện đang đóng.', code: 'PACKING_SCAN_NOT_IN_PARCEL');
    }
    final have = p.scanned[sku] ?? 0;
    if (have >= p.needed[sku]!) {
      throw const PackingException('Đã quét đủ món này.', code: 'PACKING_SCAN_EXCEEDS');
    }
    final updated = p.copyWith(scanned: {...p.scanned, sku: have + 1});
    _replaceParcel(groupId, updated);
    return updated;
  }

  @override
  Future<Parcel> unscan(String groupId, int parcelNo, String sku) async {
    await _latency();
    final p = _parcel(groupId, parcelNo);
    final have = p.scanned[sku] ?? 0;
    if (have <= 0) return p;
    final next = {...p.scanned, sku: have - 1}..removeWhere((_, v) => v <= 0);
    final updated = p.copyWith(scanned: next);
    _replaceParcel(groupId, updated);
    return updated;
  }

  @override
  Future<({Parcel parcel, SealOutcome outcome})> seal(String groupId, int parcelNo, double weightKg) async {
    await _latency();
    final p = _parcel(groupId, parcelNo);
    if (!p.allScanned) {
      throw const PackingException('Còn món chưa quét đủ.', code: 'PACKING_PARCEL_NOT_SCANNED');
    }
    if (weightKg <= 0) {
      throw const PackingException('Nhập cân nặng thật của kiện.', code: 'VALIDATION_ERROR');
    }
    final outcome = evaluateSealWeight(p.expectedWeightKg, weightKg);
    final updated = p.copyWith(
      status: outcome == SealOutcome.held ? ParcelStatus.held : ParcelStatus.sealed,
      sealedWeightKg: weightKg,
    );
    _replaceParcel(groupId, updated);
    return (parcel: updated, outcome: outcome);
  }

  @override
  Future<void> reportIssue(String groupId, int parcelNo, String sku, PackIssue issue) async {
    await _latency();
    _parcel(groupId, parcelNo);
  }
}
