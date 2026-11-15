import 'warehouse_models.dart';

/// Việc của một Warehouse Staff: lọc nhóm đã gán cho mình, còn phải lấy, còn đơn hợp lệ.
/// Hỏa Tốc lên đầu, rồi quá hạn, rồi hạn gần nhất, rồi nhóm mới hơn.
List<OrderGroupSummary> myPickingWork(
  Iterable<OrderGroupSummary> groups,
  String userId,
) {
  final mine = groups
      .where((g) =>
          g.assignedStaffId == userId && g.isPickable && !g.isFullyInactive)
      .toList();
  mine.sort(compareWork);
  return mine;
}

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
