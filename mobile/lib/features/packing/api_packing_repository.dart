import 'package:uuid/uuid.dart';

import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import 'packing_repository.dart';

double _cm(Object? mm) => mm is num ? mm / 10 : 0;

List<Map<String, dynamic>> _rows(Object? raw) => [
      if (raw is List)
        for (final r in raw) ?asMap(r),
    ];

/// Một kiện của `PackingPlanResponse.parcels` → [Parcel]. Kiện đang chờ tháo / đã huỷ trả null.
Parcel? parseParcel(Map<String, dynamic> m) {
  final status = switch (pickString(m, ['status'], 'pending')) {
    'pending' => ParcelStatus.pending,
    'sealed' => ParcelStatus.sealed,
    'held' => ParcelStatus.held,
    _ => null,
  };
  if (status == null) return null;
  final box = asMap(m['box']);
  final inner = asMap(box?['innerMm']);
  final cutFrom = box?['cutFromInnerHeightMm'];
  final scanned = <String, int>{};
  for (final s in _rows(m['scans'])) {
    final sku = pickString(s, ['sku']);
    if (sku.isNotEmpty) scanned[sku] = (scanned[sku] ?? 0) + 1;
  }
  final actual = m['actualWeightKg'];
  return Parcel(
    no: pickInt(m, ['parcelNo']),
    boxCode: pickString(box, ['code']),
    boxName: pickString(box, ['name']),
    innerL: _cm(inner?['lengthMm']),
    innerW: _cm(inner?['widthMm']),
    innerH: _cm(inner?['heightMm']),
    cutFromH: cutFrom is num ? cutFrom / 10 : null,
    items: [
      for (final p in _rows(m['placements']))
        PlacedItem(
          sku: pickString(p, ['sku']),
          x: _cm(p['x']),
          y: _cm(p['y']),
          z: _cm(p['z']),
          dx: _cm(p['dx']),
          dy: _cm(p['dy']),
          dz: _cm(p['dz']),
          folded: pickBool(p, ['folded']),
        ),
    ],
    expectedWeightKg: pickDouble(m, ['estimatedWeightG']) / 1000,
    status: status,
    scanned: scanned,
    sealedWeightKg: actual is num ? actual.toDouble() : null,
  );
}

/// Kế hoạch đóng gói kèm nhóm đơn (`GET /order-groups/:id`) → [PackingGroup].
PackingGroup parsePackingGroup(Map<String, dynamic> plan, Map<String, dynamic>? group) {
  final id = pickString(plan, ['orderGroupId'], pickString(group, ['id']));
  final status = pickString(plan, ['status']);
  return PackingGroup(
    id: id,
    shortId: id.length > 10 ? id.substring(id.length - 10) : id,
    platform: pickString(group, ['platform']),
    stage: status == 'ready' ? PackingStage.pendingApproval : PackingStage.packing,
    parcels: [
      for (final p in _rows(plan['parcels'])) ?parseParcel(p),
    ],
    isExpress: pickString(group, ['orderPriority']) == 'express',
    deadline: pickDate(group, ['packagingDeadline']),
  );
}

/// Đóng gói gọi BE thật (`/order-groups/:groupId/packing-plan/*`). Mọi thao tác gửi `version`
/// của kế hoạch; quét món gửi kèm `client_event_id` nên bấm lại không bị đếm hai lần.
class ApiPackingRepository implements PackingRepository {
  ApiPackingRepository({
    required this.api,
    required this.currentUserId,
    required this.isAdmin,
    required this.warehouseId,
    Uuid? uuid,
  }) : _uuid = uuid ?? const Uuid();

  final ApiClient api;
  final String? Function() currentUserId;
  final bool Function() isAdmin;
  final Future<String?> Function() warehouseId;
  final Uuid _uuid;

  /// Kế hoạch đọc gần nhất theo nhóm (lấy `version`, `itemKey` khi thao tác).
  final Map<String, Map<String, dynamic>> _plans = {};

  String _path(String groupId, [String tail = '']) =>
      '/order-groups/${Uri.encodeComponent(groupId)}/packing-plan$tail';

  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on ApiException catch (e) {
      throw PackingException(e.message, code: e.errorCode);
    }
  }

  Future<Map<String, dynamic>> _plan(String groupId) async {
    final known = _plans[groupId];
    if (known != null) return known;
    final res = asMap(await api.get(_path(groupId)));
    final plan = asMap(res?['plan']) ?? res;
    if (plan == null || plan['id'] == null) {
      throw const PackingException('Nhóm này chưa có kế hoạch đóng gói.', code: 'PACKING_PLAN_NOT_FOUND');
    }
    return _plans[groupId] = plan;
  }

  /// Lưu kế hoạch BE trả về sau thao tác (`{ plan, ... }`).
  Map<String, dynamic> _keep(String groupId, Object? res) {
    final plan = asMap(asMap(res)?['plan']);
    if (plan != null) _plans[groupId] = plan;
    return plan ?? const {};
  }

  int _version(Map<String, dynamic> plan) => pickInt(plan, ['version']);

  Parcel _parcelOf(Map<String, dynamic> plan, int parcelNo) {
    for (final p in _rows(plan['parcels'])) {
      if (pickInt(p, ['parcelNo']) == parcelNo) {
        final parsed = parseParcel(p);
        if (parsed != null) return parsed;
      }
    }
    throw PackingException('Không tìm thấy kiện $parcelNo.', code: 'PACKING_PARCEL_NOT_FOUND');
  }

  Map<String, dynamic>? _rawParcel(Map<String, dynamic> plan, int parcelNo) {
    for (final p in _rows(plan['parcels'])) {
      if (pickInt(p, ['parcelNo']) == parcelNo) return p;
    }
    return null;
  }

  @override
  Future<List<PackingGroup>> queue(PackingStage stage) => _guard(() async {
        final me = currentUserId();
        final raw = await api.get('/order-groups', query: {
          'fulfillment_status': stage == PackingStage.pendingApproval ? 'pending_approval' : 'approved_for_packing',
          if (!isAdmin() && me != null) 'assigned_packer_id': me,
          'limit': 50,
        });
        final groups = _rows(raw is List ? raw : asMap(raw)?['items']);
        final out = await Future.wait(groups.map((g) async {
          final id = pickString(g, ['id', '_id']);
          try {
            _plans.remove(id);
            return parsePackingGroup(await _plan(id), g);
          } on PackingException {
            return null; // nhóm chưa tính xong kế hoạch: bỏ qua, lần làm mới sau sẽ có
          }
        }));
        return [for (final g in out) ?g];
      });

  @override
  Future<PackingGroup> get(String groupId) => _guard(() async {
        _plans.remove(groupId);
        final results = await Future.wait([
          _plan(groupId),
          api.get('/order-groups/${Uri.encodeComponent(groupId)}'),
        ]);
        return parsePackingGroup(results[0] as Map<String, dynamic>, asMap(results[1]));
      });

  @override
  Future<PackingGroup> approve(String groupId) => _guard(() async {
        final plan = await _plan(groupId);
        _keep(groupId, await api.post(_path(groupId, '/approve'), body: {'expected_version': _version(plan)}));
        return get(groupId);
      });

  @override
  Future<void> reject(String groupId, RejectReason reason, String? note) => _guard(() async {
        final plan = await _plan(groupId);
        await api.post(_path(groupId, '/reject'), body: {
          'expected_version': _version(plan),
          'reason': reason.code,
          if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
        });
        _plans.remove(groupId);
      });

  @override
  Future<Parcel> scan(String groupId, int parcelNo, String code) => _guard(() async {
        final plan = _keep(
          groupId,
          await api.post(_path(groupId, '/parcels/$parcelNo/scan'), body: {
            'code': code.trim(),
            'scan_method': 'barcode',
            'client_event_id': _uuid.v4(),
          }),
        );
        return _parcelOf(plan, parcelNo);
      });

  @override
  Future<Parcel> unscan(String groupId, int parcelNo, String sku) => _guard(() async {
        final plan = await _plan(groupId);
        final scans = _rows(_rawParcel(plan, parcelNo)?['scans']);
        final last = scans.lastWhere(
          (s) => pickString(s, ['sku']).toUpperCase() == sku.toUpperCase(),
          orElse: () => throw PackingException('Món $sku chưa được quét trong kiện $parcelNo.'),
        );
        final next = _keep(
          groupId,
          await api.post(_path(groupId, '/parcels/$parcelNo/unscan'), body: {
            'expected_version': _version(plan),
            'item_key': pickString(last, ['itemKey']),
            'reason': 'Quét nhầm món (gỡ trên app)',
          }),
        );
        return _parcelOf(next, parcelNo);
      });

  @override
  Future<({Parcel parcel, SealOutcome outcome})> seal(String groupId, int parcelNo, double weightKg) =>
      _guard(() async {
        final plan = await _plan(groupId);
        final next = _keep(
          groupId,
          await api.post(_path(groupId, '/parcels/$parcelNo/seal'), body: {
            'expected_version': _version(plan),
            'weight_kg': weightKg,
          }),
        );
        final parcel = _parcelOf(next, parcelNo);
        return (parcel: parcel, outcome: parcel.status == ParcelStatus.held ? SealOutcome.held : SealOutcome.sealed);
      });

  @override
  Future<void> reportIssue(
    String groupId,
    int parcelNo,
    String sku,
    PackIssue issue, {
    List<String> photoUrls = const [],
  }) =>
      _guard(() async {
        final plan = await _plan(groupId);
        final placements = _rows(_rawParcel(plan, parcelNo)?['placements']);
        final item = placements.firstWhere(
          (p) => pickString(p, ['sku']).toUpperCase() == sku.toUpperCase(),
          orElse: () => throw PackingException('Kiện $parcelNo không có món $sku.'),
        );
        final wid = await warehouseId();
        _keep(
          groupId,
          await api.post(_path(groupId, '/report-issue'), body: {
            'expected_version': _version(plan),
            'parcel_no': parcelNo,
            'item_key': pickString(item, ['itemKey']),
            'issue': issue.code,
            // Lấy ngay món thay trên kệ; BE tự chọn ô còn hàng.
            'resolution': 'replace',
            'warehouse_id': ?wid,
            if (photoUrls.isNotEmpty) 'photo_urls': photoUrls,
          }),
        );
      });
}
