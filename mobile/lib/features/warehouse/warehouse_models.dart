import '../../core/json.dart';

/// Trạng thái nhóm đơn còn ở bước lấy hàng. Khớp `WAREHOUSE_PICKABLE_STATUSES` của web:
/// BE chỉ lọc được **một** `fulfillment_status` mỗi lần gọi nên app lọc lại phía máy.
/// BE chỉ cho quét / hoàn tất khi `picking`; báo thiếu được ở cả hai trạng thái này.
const pickableStatuses = <String>{
  'awaiting_packaging',
  'picking',
};

/// Tên trạng thái nhóm đơn, giống web.
String fulfillmentLabel(String status) => switch (status) {
      'awaiting_packaging' => 'Chờ bắt đầu lấy',
      'picking' => 'Đang lấy hàng',
      'picked' => 'Đã lấy xong',
      'partial_needs_review' => 'Thiếu hàng — chờ quyết định',
      'pending_approval' => 'Chờ chấp nhận kế hoạch',
      'approved_for_packing' => 'Đang đóng gói',
      'packed' => 'Đã đóng gói',
      'shipped' => 'Đã giao vận',
      'delivered' => 'Đã giao',
      'returning' => 'Đang chờ duyệt trả hàng',
      'returned' => 'Hoàn hàng',
      'canceled' => 'Đã hủy',
      _ => status,
    };

/// Một kho đang hoạt động (`GET /warehouse/warehouses`).
class WarehouseOption {
  const WarehouseOption({required this.id, this.code = '', this.name = ''});
  final String id;
  final String code;
  final String name;

  String get label {
    final text = [code, name].where((s) => s.isNotEmpty).join(' · ');
    return text.isEmpty ? id : text;
  }
}

class OrderGroupSummary {
  const OrderGroupSummary({
    required this.id,
    required this.platform,
    required this.fulfillmentStatus,
    required this.version,
    required this.orderCount,
    required this.activeOrderCount,
    this.assignedStaffId,
    this.isExpress = false,
    this.packagingDeadline,
    this.isOverdue = false,
    this.stockShortage = false,
    this.warehouseId,
    this.recipientNamesDiffer = false,
    this.createdAt,
    this.orderIds = const [],
    this.linkedGroupCount = 0,
  });

  final String id;
  final String platform;
  final String fulfillmentStatus;

  /// Dùng cho `expected_version` ở các nút đổi trạng thái.
  final int version;
  final int orderCount;
  final int activeOrderCount;
  final String? assignedStaffId;
  final bool isExpress;
  final DateTime? packagingDeadline;
  final bool isOverdue;
  final bool stockShortage;

  /// Kho BE chọn khi giữ chỗ lần đầu. Quét sai kho → 409 `ORD_GROUP_WRONG_WAREHOUSE`.
  final String? warehouseId;
  final bool recipientNamesDiffer;
  final DateTime? createdAt;

  /// Thứ tự đơn trong nhóm (chỉ có ở `GET /order-groups/:id`) — dùng đặt chữ cái khay.
  final List<String> orderIds;
  final int linkedGroupCount;

  String get shortId => id.length > 10 ? id.substring(id.length - 10) : id;

  bool get isPickable => pickableStatuses.contains(fulfillmentStatus);

  /// Quét và hoàn tất lấy hàng (BE: chỉ `picking`).
  bool get canScan => fulfillmentStatus == 'picking';

  bool get canReportMissing => isPickable;

  /// Không còn đơn nào để lấy (đã hủy hết).
  bool get isFullyInactive => orderCount > 0 && activeOrderCount == 0;

  factory OrderGroupSummary.fromJson(Map<String, dynamic> json) {
    final count = pickInt(json, ['orderCount', 'order_count']);
    return OrderGroupSummary(
      id: pickString(json, ['id', '_id']),
      platform: pickString(json, ['platform']),
      fulfillmentStatus: pickString(json, ['fulfillmentStatus', 'fulfillment_status']),
      version: pickInt(json, ['version', '__v']),
      orderCount: count,
      // BE cũ không có field này: coi toàn bộ là còn xử lý.
      activeOrderCount: json.containsKey('activeOrderCount') ||
              json.containsKey('active_order_count')
          ? pickInt(json, ['activeOrderCount', 'active_order_count'])
          : count,
      assignedStaffId: pickStringOrNull(json, ['assignedStaffId', 'assigned_staff_id']),
      isExpress: pickString(json, ['orderPriority', 'order_priority']) == 'express',
      packagingDeadline: pickDate(json, ['packagingDeadline', 'packaging_deadline']),
      isOverdue: pickBool(json, ['isOverdue', 'is_overdue']),
      stockShortage: pickBool(json, ['stockShortage', 'stock_shortage']),
      warehouseId: pickStringOrNull(json, ['warehouseId', 'warehouse_id']),
      recipientNamesDiffer:
          pickBool(json, ['recipientNamesDiffer', 'recipient_names_differ']),
      createdAt: pickDate(json, ['createdAt', 'created_at']),
      orderIds: [
        if (json['orders'] case final List list)
          for (final o in list)
            ?pickStringOrNull(asMap(o), ['id', '_id']),
      ],
      linkedGroupCount: pickInt(json, ['linkedGroupCount']),
    );
  }
}

/// Nhân viên kho để phân công (`GET /order-groups/staff/search`).
class StaffOption {
  const StaffOption({required this.id, required this.name, this.workload = 0, this.onLeave = false});
  final String id;
  final String name;
  final int workload;
  final bool onLeave;
}

class OtherBin {
  const OtherBin({required this.binCode, required this.quantityOnHand, this.binLocationId});
  final String binCode;
  final int quantityOnHand;
  /// AOFP-327 — id ô phụ: quét khớp ô này thì gửi id này để BE trừ tồn đúng ô.
  final String? binLocationId;
}

/// Một dòng hàng chia cho đơn nào trong nhóm.
class OrderAllocation {
  const OrderAllocation({required this.orderId, required this.quantity, this.orderCode = '', this.recipientName = ''});
  final String orderId;
  final String orderCode;
  final String recipientName;
  final int quantity;

  String get label {
    final code = orderCode.isNotEmpty
        ? orderCode
        : (orderId.length > 6 ? orderId.substring(orderId.length - 6) : orderId);
    final who = recipientName.isEmpty ? '' : ' · $recipientName';
    return 'Đơn $code$who × $quantity';
  }
}

class PickLine {
  const PickLine({
    required this.sku,
    required this.quantity,
    required this.pickedQuantity,
    required this.binCode,
    required this.zoneCode,
    this.binLocationId,
    this.masterSku,
    this.otherBins = const [],
    this.oldestLotCode,
    this.allocations = const [],
    this.isFragile = false,
    this.lengthCm = 0,
    this.widthCm = 0,
    this.heightCm = 0,
    this.weightKg = 0,
  });

  final String sku;

  /// Số đặt.
  final int quantity;

  /// Số BE đã ghi nhận (chưa tính thao tác đang chờ gửi).
  final int pickedQuantity;
  final String binCode;
  final String zoneCode;
  final String? binLocationId;
  final String? masterSku;
  final List<OtherBin> otherBins;
  final String? oldestLotCode;
  final List<OrderAllocation> allocations;
  final bool isFragile;
  final double lengthCm;
  final double widthCm;
  final double heightCm;
  final double weightKg;

  /// SKU chưa gán ô: không quét được, phải báo Admin.
  bool get hasBin => binLocationId != null && isBinAssigned(binCode);

  PickLine copyWith({int? pickedQuantity}) => PickLine(
        sku: sku,
        quantity: quantity,
        pickedQuantity: pickedQuantity ?? this.pickedQuantity,
        binCode: binCode,
        zoneCode: zoneCode,
        binLocationId: binLocationId,
        masterSku: masterSku,
        otherBins: otherBins,
        oldestLotCode: oldestLotCode,
        allocations: allocations,
        isFragile: isFragile,
        lengthCm: lengthCm,
        widthCm: widthCm,
        heightCm: heightCm,
        weightKg: weightKg,
      );

  factory PickLine.fromJson(Map<String, dynamic> json) {
    final bins = json['other_bins'];
    final lot = asMap(json['oldest_lot']);
    final allocations = json['order_allocations'];
    return PickLine(
      sku: pickString(json, ['sku']),
      quantity: pickInt(json, ['quantity']),
      pickedQuantity: pickInt(json, ['picked_quantity', 'pickedQuantity']),
      binCode: pickString(json, ['bin_code', 'binCode']),
      zoneCode: pickString(json, ['zone_code', 'zoneCode']),
      binLocationId: pickStringOrNull(json, ['bin_location_id', 'binLocationId']),
      masterSku: pickStringOrNull(json, ['master_sku', 'masterSku']),
      otherBins: bins is List
          ? [
              for (final b in bins)
                if (asMap(b) case final m?)
                  OtherBin(
                    binCode: pickString(m, ['bin_code']),
                    quantityOnHand: pickInt(m, ['quantity_on_hand']),
                    binLocationId: pickStringOrNull(m, ['bin_location_id']),
                  ),
            ]
          : const [],
      oldestLotCode: pickStringOrNull(lot, ['lot_code']),
      allocations: [
        if (allocations is List)
          for (final row in allocations)
            if (asMap(row) case final m?)
              OrderAllocation(
                orderId: pickString(m, ['order_id']),
                orderCode: pickString(m, ['platform_order_id']),
                recipientName: pickString(m, ['recipient_name']),
                quantity: pickInt(m, ['quantity']),
              ),
      ],
      isFragile: pickBool(json, ['is_fragile']),
      lengthCm: pickDouble(json, ['length_cm']),
      widthCm: pickDouble(json, ['width_cm']),
      heightCm: pickDouble(json, ['height_cm']),
      weightKg: pickDouble(json, ['weight_kg']),
    );
  }
}

const unassignedBin = 'CHƯA GÁN VỊ TRÍ';

/// Ô kệ thật (không rỗng, không phải chữ "CHƯA GÁN VỊ TRÍ").
bool isBinAssigned(String binCode) {
  final code = binCode.trim();
  if (code.isEmpty) return false;
  final lower = code.toLowerCase();
  return !(lower.contains('chưa gán') || lower.contains('chua gan'));
}
