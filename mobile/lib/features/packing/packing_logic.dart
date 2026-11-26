/// Quy tắc và nhãn của trang Đóng gói, chép từ web:
/// `fe/src/components/packing/PackagingWorkbench.tsx`, `PackingSessionPanel.tsx`, `BoxSourceFields.tsx`,
/// `manual-pack-draft.ts`, `lib/parcel-order-display.ts`, `types/packing-plan.ts`. Sửa ở web thì sửa cả ở đây.
library;

import '../../core/format/deadline.dart';
import '../../core/format/units.dart';
import '../../core/json.dart';
import '../../shared/admin_kit.dart';

// ---- Hàng đợi ----

enum QueueTab {
  picked('picked', 'Đã lấy hàng'),
  pendingApproval('pending_approval', 'Chờ chấp nhận kế hoạch'),
  blocked('blocked', 'Kẹt — SKU chưa đo', viewOnly: true),
  partial('partial_needs_review', 'Thiếu hàng'),
  packing('approved_for_packing', 'Đang đóng gói'),
  awaiting('awaiting_packaging', 'Kho đang lấy', viewOnly: true);

  const QueueTab(this.status, this.label, {this.viewOnly = false});

  /// Trạng thái nhóm đơn tương ứng; `blocked` không phải trạng thái BE.
  final String status;
  final String label;
  final bool viewOnly;

  static QueueTab? ofStatus(String status) {
    for (final t in values) {
      if (t != blocked && t.status == status) return t;
    }
    return null;
  }
}

/// Các bước chưa có người đóng gói được giao — vẫn hiện ở phạm vi "Việc của tôi".
const unassignedQueueStatuses = ['awaiting_packaging', 'picked', 'partial_needs_review'];

int activeOrders(Map<String, dynamic> g) => pickInt(g, ['activeOrderCount'], pickInt(g, ['orderCount']));

bool hasPackableOrders(Map<String, dynamic> g) => activeOrders(g) > 0;

bool isPartiallyCanceled(Map<String, dynamic> g) => pickInt(g, ['canceledOrderCount']) > 0 && hasPackableOrders(g);

List<Map<String, dynamic>> groupsForTab(
  QueueTab tab,
  List<Map<String, dynamic>> all,
  List<Map<String, dynamic>> blocked,
) =>
    tab == QueueTab.blocked
        ? blocked
        : [
            for (final g in all)
              if (g['fulfillmentStatus'] == tab.status && hasPackableOrders(g)) g,
          ];

/// Tab mở đầu tiên: ưu tiên việc thao tác được.
QueueTab initialTab(List<Map<String, dynamic>> all) {
  bool has(QueueTab t) => groupsForTab(t, all, const []).isNotEmpty;
  if (has(QueueTab.pendingApproval)) return QueueTab.pendingApproval;
  if (has(QueueTab.partial)) return QueueTab.partial;
  if (has(QueueTab.packing)) return QueueTab.packing;
  return QueueTab.pendingApproval;
}

({String title, String body}) emptyCopy(QueueTab tab, {required int awaiting, required int picked}) {
  switch (tab) {
    case QueueTab.pendingApproval:
      if (awaiting > 0 || picked > 0) {
        return (
          title: 'Chưa có kế hoạch chờ chấp nhận',
          body: picked > 0
              ? 'Có $picked nhóm đã lấy xong, hệ thống đang tính kế hoạch. Có kế hoạch là nhóm hiện tại đây để bạn chấp nhận.'
              : 'Kho đang lấy $awaiting nhóm. Lấy xong, hệ thống tự tính kế hoạch rồi nhóm sẽ hiện tại đây để chấp nhận.',
        );
      }
      return (
        title: 'Chưa có kế hoạch chờ chấp nhận',
        body: 'Đây là việc chính của bạn: chấp nhận / điều chỉnh / từ chối kế hoạch đóng gói. Hiện chưa có nhóm nào chờ chấp nhận.',
      );
    case QueueTab.partial:
      return (
        title: 'Không có đơn thiếu hàng',
        body: 'Kho đã báo thiếu hàng — quyết định tiếp tục với phần còn lại hoặc hủy làm lại.',
      );
    case QueueTab.packing:
      return (
        title: 'Không có nhóm đang đóng gói',
        body: 'Sau khi bạn chấp nhận kế hoạch, nhóm hiện ở đây — bấm «Xác nhận đã đóng gói» khi gói xong.',
      );
    case QueueTab.blocked:
      return (
        title: 'Không có nhóm kẹt',
        body: 'Nhóm đã lấy xong nhưng SKU chưa có hồ sơ đóng gói sẽ hiện ở đây. Đo SKU xong, hệ thống tự tính lại kế hoạch.',
      );
    case QueueTab.picked:
    case QueueTab.awaiting:
      return (
        title: 'Không có đơn đang lấy',
        body: 'Tab chỉ xem: nhóm awaiting_packaging thuộc việc Warehouse. Packaging không thao tác tại đây.',
      );
  }
}

/// Chi tiết nhóm trả người nhận trong `recipient.fullName` (`GroupOrderView` của BE).
String recipientNameOf(Map<String, dynamic> order) => pickString(asMap(order['recipient']), ['fullName']);

List<String> blockedSkus(Map<String, dynamic> g) {
  final skus = asMap(g['packingBlocked'])?['skus'];
  return [if (skus is List) for (final s in skus) '$s'];
}

String tail(String id, [int n = 8]) => id.length > n ? id.substring(id.length - n) : id;

bool matchesSearch(Map<String, dynamic> g, String query) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return true;
  final id = pickString(g, ['id']);
  final names = g['recipientNames'];
  final parts = <String>[
    id,
    tail(id),
    pickString(g, ['platform']),
    if (names is List) for (final n in names) '$n',
    for (final o in rowsOf(g['orders'])) ...[
      pickString(o, ['id']),
      pickString(o, ['platformOrderId']),
      recipientNameOf(o),
      pickString(asMap(o['recipient']), ['phone']),
      for (final i in rowsOf(o['items'])) ...[pickString(i, ['sku']), pickString(i, ['name'])],
    ],
  ];
  return parts.any((p) => p.toLowerCase().contains(q));
}

const _afterPackStatuses = {'packed', 'shipped', 'delivered', 'returning', 'returned'};

/// Đơn hỏa tốc: trước khi đóng xong đếm tới hạn đóng; sau đó đếm tới hạn giao khách.
DeadlineLabel? expressClock(Map<String, dynamic> g, DateTime now) {
  final status = pickString(g, ['fulfillmentStatus']);
  if (g['orderPriority'] != 'express' || status == 'canceled') return null;
  final after = _afterPackStatuses.contains(status);
  final deadline = pickDate(g, [after ? 'deliveryDeadline' : 'packagingDeadline']);
  if (deadline == null) return null;
  return deadlineLabel(deadline, now, what: after ? 'giao khách' : 'đóng gói');
}

String quickPackBlockedCopy(Map<String, dynamic> g) {
  if (g['recipientNamesDiffer'] == true) {
    return 'Nhóm gộp nhiều người nhận — phải quét từng món, không đóng nhanh.';
  }
  final count = pickInt(g, ['activeOrderCount']) > 0 ? pickInt(g, ['activeOrderCount']) : 2;
  return 'Nhóm gộp $count đơn — mỗi đơn 1 vận đơn, quét từng món vào đúng kiện rồi niêm phong.';
}

// ---- Kế hoạch ----

const planStatusLabels = {
  'computing': 'Đang tính',
  'ready': 'Chờ chấp nhận',
  'approved': 'Đã chấp nhận',
  'packing': 'Đang đóng',
  'packed': 'Đã đóng',
  'rejected': 'Bị từ chối',
  'failed': 'Tính lỗi',
  'superseded': 'Đã thay',
};

const sessionPlanStatusLabels = {
  'approved': 'Đã duyệt – chờ đóng',
  'packing': 'Đang đóng',
  'packed': 'Đã đóng xong',
};

const parcelStatusLabels = {
  'pending': 'Chờ niêm phong',
  'sealed': 'Đã niêm phong',
  'held': 'Lệch cân – chờ xem lại',
  'to_unpack': 'Cần tháo',
  'voided': 'Đã tháo',
};

/// Lý do đổi thùng / mở niêm phong (khớp `ADJUSTMENT_REASONS`).
const adjustmentReasons = {
  'PRODUCT_MORE_FRAGILE_THAN_EXPECTED': 'Sản phẩm dễ vỡ hơn dự kiến',
  'RECOMMENDED_BOX_NOT_IN_STOCK': 'Thùng đề xuất không có trong kho',
  'ITEM_DIMENSION_WRONG': 'Số đo món hàng sai',
  'ITEM_WEIGHT_WRONG': 'Cân nặng món hàng sai',
  'BOX_TOO_TIGHT': 'Thùng quá chật',
  'BOX_TOO_LOOSE': 'Thùng quá rộng',
  'BOX_SPEC_WRONG': 'Quy cách thùng sai',
  'TOO_MANY_PARCELS': 'Quá nhiều kiện',
  'ITEM_DAMAGED': 'Hàng bị hỏng',
  'OTHER': 'Khác',
};

const rejectReasons = {
  ...adjustmentReasons,
  'SPECIAL_PACKING_NEEDED': 'Cần cách đóng đặc biệt',
  'PLAN_UNREALISTIC': 'Kế hoạch không làm được',
};

const parcelReviewReasons = {
  'SCALE_ERROR': 'Cân lỗi hoặc đặt lệch',
  'MATERIALS_HEAVIER': 'Vật tư nặng hơn ước tính',
  'PRODUCT_WEIGHT_WRONG': 'Cân nặng hồ sơ sai',
  'WRONG_ITEM_INSIDE': 'Nghi có món sai trong kiện',
  'OTHER': 'Khác',
};

const issueKinds = {'damaged': 'Hỏng', 'missing': 'Thiếu', 'wrong_item': 'Nhầm món'};

List<Map<String, dynamic>> parcelsOf(Map<String, dynamic>? plan) => rowsOf(plan?['parcels']);

int parcelNoOf(Map<String, dynamic> parcel) => pickInt(parcel, ['parcelNo']);

String parcelStatusOf(Map<String, dynamic> parcel) => pickString(parcel, ['status'], 'pending');

Map<String, dynamic> boxOf(Map<String, dynamic> parcel) => asMap(parcel['box']) ?? const {};

Map<String, dynamic>? selectParcel(Map<String, dynamic>? plan, int? parcelNo) {
  final parcels = parcelsOf(plan);
  if (parcels.isEmpty) return null;
  return parcels.firstWhere((p) => parcelNoOf(p) == parcelNo, orElse: () => parcels.first);
}

bool overParcelLimit(Map<String, dynamic>? plan) => rowsOf(plan?['orders']).any((o) => o['overParcelLimit'] == true);

int scannedCountOf(Map<String, dynamic> parcel) =>
    parcel['scannedCount'] is num ? pickInt(parcel, ['scannedCount']) : rowsOf(parcel['scans']).length;

int? itemCountOf(Map<String, dynamic> parcel) => parcel['itemCount'] is num ? pickInt(parcel, ['itemCount']) : null;

bool isLiveParcel(Map<String, dynamic> parcel) => !const {'to_unpack', 'voided'}.contains(parcelStatusOf(parcel));

/// Đã quét món hoặc đã niêm phong / tháo kiện nào → phiên đã bắt đầu, không đóng nhanh nữa.
bool quickPackStarted(Map<String, dynamic>? plan) =>
    parcelsOf(plan).any((p) => parcelStatusOf(p) != 'pending' || scannedCountOf(p) > 0);

/// Route ghi trả profileStale=false: giữ cờ từ lần GET khi kế hoạch vẫn chờ chấp nhận hoặc đã chấp nhận.
Map<String, dynamic> retainProfileStale(Map<String, dynamic>? previous, Map<String, dynamic> next) {
  if (next['status'] != 'ready' && next['status'] != 'approved') return next;
  if (next['profileStale'] == true) return next;
  if (previous?['profileStale'] == true && previous?['id'] == next['id']) {
    return {...next, 'profileStale': true};
  }
  return next;
}

String _dimsFromMm(Map<String, dynamic>? mm) =>
    formatDimsCm(pickDouble(mm, ['lengthMm']) / 10, pickDouble(mm, ['widthMm']) / 10, pickDouble(mm, ['heightMm']) / 10);

String outerDims(Map<String, dynamic> box) => _dimsFromMm(asMap(box['outerMm']));

/// " · cắt hạ còn 25 cm (gốc 35 cm)" khi thùng được cắt hạ; rỗng nếu không.
String boxCutNote(Map<String, dynamic> box) {
  final from = box['cutFromInnerHeightMm'];
  final inner = asMap(box['innerMm']);
  if (from is! num || inner == null) return '';
  return ' · cắt hạ còn ${formatCm(pickDouble(inner, ['heightMm']) / 10)} cm (gốc ${formatCm(from / 10)} cm)';
}

String weightOffCopy(Map<String, dynamic> parcel) {
  final no = parcelNoOf(parcel);
  final actual = parcel['actualWeightKg'];
  final estimated = pickDouble(parcel, ['estimatedWeightG']) / 1000;
  if (actual is! num || estimated <= 0) return 'Kiện $no lệch cân.';
  final pct = ((actual - estimated).abs() / estimated * 100).round();
  return 'Kiện $no lệch cân: cân ${formatKg(actual.toDouble())}, ước tính ${formatKg(estimated)} (lệch $pct%).';
}

/// Cân hợp lệ: 0,001 – 100 kg, nhận cả dấu phẩy.
double? parseWeight(String text) {
  final value = double.tryParse(text.trim().replaceAll(',', '.'));
  if (value == null || !value.isFinite || value < 0.001 || value > 100) return null;
  return value;
}

/// Chỉ điền cân THẬT đã có (kiện đã cân). Không điền ước tính, nếu không kiện không bao giờ bị giữ vì lệch cân.
String weightPrefill(Map<String, dynamic> parcel) {
  final kg = pickDouble(parcel, ['actualWeightKg']);
  return kg > 0 ? ((kg * 1000).round() / 1000).toString().replaceFirst(RegExp(r'\.0$'), '').replaceAll('.', ',') : '';
}

/// Mọi món của kiện (cả chưa quét) để báo sự cố; kiện không có toạ độ thì dùng món đã quét.
List<({String itemKey, String sku, bool scanned})> parcelItems(Map<String, dynamic> parcel) {
  final scans = rowsOf(parcel['scans']);
  final scanned = {for (final s in scans) pickString(s, ['itemKey'])};
  final placements = rowsOf(parcel['placements']);
  return [
    for (final p in placements.isNotEmpty ? placements : scans)
      (itemKey: pickString(p, ['itemKey']), sku: pickString(p, ['sku']), scanned: scanned.contains(pickString(p, ['itemKey']))),
  ];
}

// ---- Kiện theo đơn ----

List<String> _strings(Object? raw) => [if (raw is List) for (final v in raw) if (v != null && '$v'.isNotEmpty) '$v'];

bool _isShared(Map<String, dynamic> parcel) => _strings(parcel['orderIds']).length >= 2;

List<String> sharedOrderCodes(Map<String, dynamic> parcel) =>
    _isShared(parcel) ? _strings(parcel['platformOrderIds']) : const [];

String? parcelOrderCaption(Map<String, dynamic> parcel) {
  final shared = sharedOrderCodes(parcel);
  if (shared.isNotEmpty) return 'Kiện chung đơn ${shared.join(' + ')}';
  final name = pickString(parcel, ['recipientName']).trim();
  final code = pickString(parcel, ['platformOrderId']).trim();
  if (name.isEmpty && code.isEmpty) return null;
  if (code.isEmpty) return name;
  return name.isEmpty ? 'Đơn $code' : 'Đơn $code · $name';
}

class ParcelBucket {
  ParcelBucket(this.parcels);
  final List<Map<String, dynamic>> parcels;

  String get heading {
    final first = parcels.first;
    final count = '${parcels.length} kiện';
    final shared = sharedOrderCodes(first);
    if (shared.isNotEmpty) return 'Kiện chung đơn ${shared.join(' + ')} ($count)';
    final name = pickString(first, ['recipientName']).trim();
    final code = pickString(first, ['platformOrderId']).trim();
    if (code.isEmpty) return name.isEmpty ? count : '$name ($count)';
    return 'Đơn $code — ${name.isEmpty ? '—' : name} ($count)';
  }
}

/// `multi`: có từ 2 người nhận (không tính tên bị che) hoặc có kiện gộp → mới hiện tiêu đề nhóm.
({bool multi, List<ParcelBucket> groups}) groupParcelsByOrder(List<Map<String, dynamic>> parcels) {
  final buckets = <String, ParcelBucket>{};
  for (final p in parcels) {
    final key = _isShared(p)
        ? 'shared-${([..._strings(p['orderIds'])]..sort()).join('+')}'
        : pickString(p, ['orderId', 'platformOrderId'], 'parcel-${parcelNoOf(p)}');
    (buckets[key] ??= ParcelBucket([])).parcels.add(p);
  }
  final groups = buckets.values.toList();
  final names = {
    for (final g in groups) pickString(g.parcels.first, ['recipientName']).trim(),
  }..removeWhere((n) => n.isEmpty || n.contains('*'));
  final anyShared = groups.any((g) => sharedOrderCodes(g.parcels.first).isNotEmpty);
  return (multi: names.length >= 2 || anyShared, groups: groups);
}

/// Kiện gộp: món của từng đơn. Kiện 1 đơn trả rỗng.
List<String> sharedOrderLines(Map<String, dynamic> parcel, List<Map<String, dynamic>> orders) {
  if (!_isShared(parcel)) return const [];
  final ids = _strings(parcel['orderIds']);
  final codes = parcel['platformOrderIds'];
  return [
    for (final (index, orderId) in ids.indexed)
      () {
        final order = orders.where((o) => o['orderId'] == orderId).firstOrNull;
        final counts = <String, int>{};
        for (final p in rowsOf(parcel['placements'])) {
          if (pickString(p, ['orderId'], pickString(parcel, ['orderId'])) != orderId) continue;
          final sku = pickString(p, ['sku']);
          counts[sku] = (counts[sku] ?? 0) + 1;
        }
        final fallback = codes is List && index < codes.length && codes[index] != null ? '${codes[index]}' : tail(orderId);
        final code = pickString(order, ['platformOrderId'], fallback);
        final name = pickString(order, ['recipientName']);
        final items = counts.entries.map((e) => '${e.key} ×${e.value}').join(', ');
        return 'Đơn $code${name.isEmpty ? '' : ' · $name'} — ${items.isEmpty ? '—' : items}';
      }(),
  ];
}

/// Túi niêm phong; tên vật tư đã nói là túi thì không gắn nhãn lặp lại.
bool showMailerBadge(Map<String, dynamic> parcel) {
  final box = boxOf(parcel);
  return box['kind'] == 'mailer' && !RegExp('túi|mailer', caseSensitive: false).hasMatch(pickString(box, ['name']));
}

String materialLabel(Map<String, dynamic> m) {
  final quantity = pickInt(m, ['quantity']);
  return '${pickString(m, ['name'])}${quantity > 1 ? ' ×$quantity' : ''}';
}

// ---- Nguồn thùng ----

const boxSourceReasons = {
  'REUSED_BOX_WORN': 'Thùng tái sử dụng đã sờn',
  'REUSED_BOX_DIRTY': 'Thùng tái sử dụng bẩn',
  'OLD_LABEL_NOT_CLEAN': 'Nhãn cũ chưa gỡ sạch',
  'REUSED_NOT_ON_SHELF': 'Không thấy thùng tái sử dụng trên kệ',
  'HIGH_VALUE_ORDER': 'Đơn giá trị cao',
  'OTHER': 'Khác',
};

const forcedNewLabels = {
  'FRAGILE': 'hàng dễ vỡ chỉ dùng thùng mới',
  'NOT_REUSABLE': 'loại thùng này không tái sử dụng',
  'NO_REUSED_STOCK': 'hết thùng tái sử dụng',
};

String boxSourceName(Object? source) => switch (source) {
      'new' => 'thùng mới',
      'reused' => 'thùng tái sử dụng',
      _ => '—',
    };

class BoxSourceInput {
  const BoxSourceInput({this.source = 'auto', this.reason, this.note = ''});
  final String source;
  final String? reason;
  final String note;

  /// Lựa chọn khác gợi ý (`planned`) thì cần lý do; `auto` luôn theo gợi ý.
  bool needsReason(Object? planned) => source != 'auto' && planned != null && source != planned;

  String? errorFor(Map<String, dynamic>? info) {
    if (!needsReason(info?['planned'])) return null;
    if (reason == null) return 'Chọn lý do vì sao dùng thùng khác gợi ý.';
    if (reason == 'OTHER' && note.trim().isEmpty) return 'Lý do "Khác" cần ghi chú.';
    return null;
  }

  Map<String, dynamic> toBody() {
    if (source == 'auto') return const {};
    final trimmed = note.trim();
    return {
      'box_source': source,
      'box_source_reason': ?reason,
      if (reason == 'OTHER' && trimmed.isNotEmpty)
        'box_source_note': trimmed.length > 300 ? trimmed.substring(0, 300) : trimmed,
    };
  }
}

// ---- Đóng gói thủ công sau khi từ chối ----

class ManualUnit {
  const ManualUnit(this.itemKey, this.sku, this.orderId);
  final String itemKey, sku, orderId;
}

class ManualParcel {
  ManualParcel(this.id, this.orderId, this.boxCode);
  final int id;
  final String orderId;
  String boxCode;
}

List<ManualUnit> unitsOfPlan(Map<String, dynamic> plan) {
  final fallback = pickString(rowsOf(plan['orders']).firstOrNull, ['orderId']);
  return [
    for (final parcel in parcelsOf(plan))
      for (final p in rowsOf(parcel['placements']))
        ManualUnit(pickString(p, ['itemKey']), pickString(p, ['sku']),
            pickString(p, ['orderId'], pickString(parcel, ['orderId'], fallback))),
  ];
}

/// Mặc định giữ đúng các kiện của kế hoạch cũ — người đóng chỉ sửa chỗ khác.
({List<ManualParcel> parcels, Map<String, int> assign}) initialManualDraft(
    Map<String, dynamic> plan, List<ManualUnit> units) {
  final parcels = <ManualParcel>[];
  final assign = <String, int>{};
  for (final parcel in parcelsOf(plan)) {
    final keys = [for (final p in rowsOf(parcel['placements'])) pickString(p, ['itemKey'])];
    if (keys.isEmpty) continue;
    final orderId = units.where((u) => u.itemKey == keys.first).firstOrNull?.orderId ?? '';
    parcels.add(ManualParcel(parcelNoOf(parcel), orderId, pickString(boxOf(parcel), ['code'])));
    for (final key in keys) {
      assign[key] = parcelNoOf(parcel);
    }
  }
  return (parcels: parcels, assign: assign);
}

/// Lỗi nhập trước khi gửi (BE vẫn kiểm lại).
String? manualDraftProblem(List<ManualUnit> units, List<ManualParcel> parcels, Map<String, int> assign, String note) {
  if (units.isEmpty) return 'Kế hoạch không có món nào để đóng.';
  final missing =
      units.where((u) => !parcels.any((p) => p.id == assign[u.itemKey] && p.orderId == u.orderId)).length;
  if (missing > 0) return 'Còn $missing món chưa nằm trong kiện nào của đúng đơn.';
  for (final p in parcels) {
    if (!units.any((u) => assign[u.itemKey] == p.id)) {
      return 'Kiện #${p.id} chưa có món nào — xoá kiện hoặc thêm món.';
    }
    if (p.boxCode.isEmpty) return 'Kiện #${p.id} chưa chọn thùng.';
  }
  if (note.trim().length < 3) return 'Ghi lý do đóng thủ công (ít nhất 3 ký tự).';
  return null;
}
