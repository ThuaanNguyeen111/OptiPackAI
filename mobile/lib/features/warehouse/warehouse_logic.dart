import 'warehouse_models.dart';

/// Các mục của màn lấy hàng, giống web (hàng hoàn có tab riêng).
enum WorkTab {
  toPick('Cần lấy'),
  review('Thiếu hàng'),
  picked('Đã lấy'),
  packed('Đã đóng'),
  shipped('Đã giao vận'),
  canceled('Đã hủy');

  const WorkTab(this.label);
  final String label;
}

enum WorkFilter {
  all('Tất cả'),
  mine('Của tôi'),
  express('Hỏa tốc');

  const WorkFilter(this.label);
  final String label;
}

/// Đã lấy xong, đang ở khâu đóng gói.
const _handoffStatuses = {'picked', 'pending_approval', 'approved_for_packing'};

/// Cùng quy tắc với `matchesTab` của web.
bool inWorkTab(OrderGroupSummary g, WorkTab tab) {
  final status = g.fulfillmentStatus;
  return switch (tab) {
    WorkTab.toPick => g.isPickable && !g.isFullyInactive,
    WorkTab.review => status == 'partial_needs_review',
    WorkTab.picked => status == 'picked' || (_handoffStatuses.contains(status) && !g.isFullyInactive),
    WorkTab.packed => status == 'packed',
    WorkTab.shipped => status == 'shipped' || status == 'delivered',
    WorkTab.canceled => g.isFullyInactive &&
        (g.isPickable || status == 'pending_approval' || status == 'approved_for_packing'),
  };
}

/// Mục chứa một nhóm đơn; null = không thuộc mục nào của màn lấy hàng.
WorkTab? workTabOf(OrderGroupSummary g) {
  for (final tab in WorkTab.values) {
    if (inWorkTab(g, tab)) return tab;
  }
  return null;
}

/// Nhóm đơn của một mục, đã lọc và tìm kiếm.
/// Hỏa Tốc lên đầu, rồi quá hạn, rồi hạn gần nhất, rồi nhóm mới hơn.
List<OrderGroupSummary> queueGroups(
  Iterable<OrderGroupSummary> groups, {
  required WorkTab tab,
  WorkFilter filter = WorkFilter.all,
  String? userId,
  String search = '',
}) {
  final needle = _norm(search);
  final result = groups.where((g) {
    if (!inWorkTab(g, tab)) return false;
    if (filter == WorkFilter.mine && (userId == null || g.assignedStaffId != userId)) return false;
    if (filter == WorkFilter.express && !g.isExpress) return false;
    if (needle.isEmpty) return true;
    return '${g.id} ${g.platform}'.toLowerCase().contains(needle);
  }).toList();
  result.sort(compareWork);
  return result;
}

/// Việc đang chờ của riêng một nhân viên.
List<OrderGroupSummary> myPickingWork(Iterable<OrderGroupSummary> groups, String userId) =>
    queueGroups(groups, tab: WorkTab.toPick, filter: WorkFilter.mine, userId: userId);

int compareWork(OrderGroupSummary a, OrderGroupSummary b) {
  if (a.isExpress != b.isExpress) return a.isExpress ? -1 : 1;
  if (a.isOverdue != b.isOverdue) return a.isOverdue ? -1 : 1;
  final da = a.packagingDeadline;
  final db = b.packagingDeadline;
  if (da != null && db != null) {
    final c = da.compareTo(db);
    if (c != 0) return c;
  } else if (da != null) {
    return -1;
  } else if (db != null) {
    return 1;
  }
  final ca = a.createdAt;
  final cb = b.createdAt;
  if (ca != null && cb != null) return cb.compareTo(ca);
  return 0;
}

/// Kho dùng để lấy hàng cho một nhóm.
class PickWarehouse {
  const PickWarehouse({required this.id, this.groupWarehouseInactive = false, this.canChoose = false});
  final String id;

  /// Nhóm còn gắn kho đã ngừng hoạt động, app đang dùng kho khác.
  final bool groupWarehouseInactive;

  /// Nhóm không gắn kho nào còn hoạt động → nhân viên được chọn kho.
  final bool canChoose;
}

/// Kho của nhóm còn hoạt động thì bắt buộc dùng kho đó (quét kho khác sẽ bị BE từ chối).
/// Không thì dùng kho nhân viên đã chọn, rồi kho đang hoạt động đầu tiên. Không còn kho nào → null.
PickWarehouse? resolvePickWarehouse(
  String? groupWarehouseId,
  List<WarehouseOption> active, {
  String? chosenId,
}) {
  final hasGroupWarehouse = groupWarehouseId != null && groupWarehouseId.isNotEmpty;
  if (hasGroupWarehouse && active.any((w) => w.id == groupWarehouseId)) {
    return PickWarehouse(id: groupWarehouseId);
  }
  if (active.isEmpty) return null;
  final id = active.any((w) => w.id == chosenId) ? chosenId! : active.first.id;
  return PickWarehouse(id: id, groupWarehouseInactive: hasGroupWarehouse, canChoose: true);
}

/// Vì sao nhóm ở trạng thái này chưa/không còn quét được. `null` = quét được.
String? pickBlockedReason(String status) => switch (status) {
      'picking' => null,
      'awaiting_packaging' =>
        'Nhóm đang chờ bắt đầu lấy nên chưa quét được. Hệ thống tự chuyển sang "Đang lấy hàng", tải lại sau ít phút.',
      'partial_needs_review' => 'Đã báo thiếu, đang chờ quyết định — chưa lấy tiếp được.',
      'canceled' => 'Nhóm đã hủy, không còn hàng cần lấy.',
      _ => 'Nhóm đã qua bước lấy hàng (${fulfillmentLabel(status)}).',
    };

/// Tên người lấy hàng để hiển thị.
String assigneeLabel(String? staffId, String? userId, Map<String, String> names) {
  if (staffId == null || staffId.isEmpty) return 'Chưa phân công';
  if (staffId == userId) return 'Bạn';
  return names[staffId] ?? 'Nhân viên khác';
}

/// Chữ cái khay của từng đơn, theo thứ tự đơn trong nhóm (giống web). Chỉ đơn còn hàng cần lấy mới có khay.
Map<String, String> trayLetters(List<String> orderIds, List<PickLine> lines) {
  final used = {for (final l in lines) for (final a in l.allocations) a.orderId};
  final ordered = [
    ...orderIds.where(used.contains),
    ...used.where((id) => !orderIds.contains(id)),
  ];
  return {
    for (var i = 0; i < ordered.length; i++) ordered[i]: i < 26 ? String.fromCharCode(65 + i) : 'K${i + 1}',
  };
}

String _norm(String value) => value.trim().toLowerCase();

/// Mã quét khớp dòng lấy hàng khi trùng SKU, SKU nội bộ, mã ô chính, mã ô khác,
/// hoặc "mã ô SKU" (BE/web đều cho phép). Sàn không có mã vạch sản phẩm nên mã quét chủ yếu là mã ô.
bool lineMatchesScan(PickLine line, String scanned) {
  final needle = _norm(scanned);
  if (needle.isEmpty) return false;
  if (_norm(line.sku) == needle) return true;
  final master = line.masterSku;
  if (master != null && _norm(master) == needle) return true;
  if (line.binCode.isNotEmpty && _norm(line.binCode) == needle) return true;
  if (line.otherBins.any((b) => _norm(b.binCode) == needle)) return true;
  return '${_norm(line.binCode)} ${_norm(line.sku)}' == needle;
}

/// AOFP-327 — mã quét là mã 1 ô phụ (không trùng SKU / ô chính) → ô phụ đó; còn lại null (lấy ở ô chính).
OtherBin? otherBinForScan(PickLine line, String scanned) {
  final needle = _norm(scanned);
  if (needle.isEmpty || _norm(line.sku) == needle) return null;
  final master = line.masterSku;
  if (master != null && _norm(master) == needle) return null;
  if (line.binCode.isNotEmpty && _norm(line.binCode) == needle) return null;
  for (final b in line.otherBins) {
    if (_norm(b.binCode) == needle && b.binLocationId != null) return b;
  }
  return null;
}

/// Dòng còn phải lấy khớp với mã quét. Ưu tiên dòng đã đủ hàng xếp sau cùng.
PickLine? findLineForScan(List<PickLine> lines, String scanned) {
  PickLine? done;
  for (final line in lines) {
    if (!lineMatchesScan(line, scanned)) continue;
    if (line.pickedQuantity < line.quantity) return line;
    done ??= line;
  }
  return done;
}

int remaining(PickLine line) {
  final r = line.quantity - line.pickedQuantity;
  return r < 0 ? 0 : r;
}

/// Cộng số lượng của các thao tác `pick-item` **đang chờ gửi** vào số BE đã ghi nhận,
/// để màn hình hiện đúng tiến độ ngay cả khi đang ngoại tuyến.
///
/// [pendingBySku]: tổng số đã quét nhưng chưa gửi, theo SKU.
List<PickLine> withPendingProgress(
  List<PickLine> lines,
  Map<String, int> pendingBySku,
) {
  return [
    for (final line in lines)
      line.copyWith(
        pickedQuantity: (line.pickedQuantity + (pendingBySku[line.sku] ?? 0))
            .clamp(0, line.quantity),
      ),
  ];
}

/// 409 `ORD_GROUP_PICK_INCOMPLETE` trả `details: { groupId, missing: [{ sku, orderedQuantity, pickedQuantity }] }`.
/// Trả các dòng "SKU: còn N" để hiện cho nhân viên biết món nào chưa lấy đủ.
List<String> missingLines(Object? details) {
  if (details is! Map) return const [];
  final missing = details['missing'];
  if (missing is! List) return const [];
  final out = <String>[];
  for (final row in missing) {
    if (row is! Map) continue;
    final sku = row['sku'];
    final ordered = row['orderedQuantity'];
    final picked = row['pickedQuantity'];
    if (sku is! String) continue;
    if (ordered is num && picked is num) {
      out.add('$sku: còn ${(ordered - picked).toInt()}');
    } else {
      out.add(sku);
    }
  }
  return out;
}

bool allPicked(List<PickLine> lines) =>
    lines.isNotEmpty && lines.every((l) => l.pickedQuantity >= l.quantity);
