import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/core/network/api_exception.dart';
import 'package:optipack_mobile/features/notifications/api_notifications_repository.dart';
import 'package:optipack_mobile/features/notifications/notifications_repository.dart';
import 'package:optipack_mobile/features/overview/api_overview_repository.dart';
import 'package:optipack_mobile/features/packing/api_packing_repository.dart';
import 'package:optipack_mobile/features/packing/packing_repository.dart';
import 'package:optipack_mobile/features/returns/api_returns_repository.dart';
import 'package:optipack_mobile/features/returns/returns_repository.dart';
import 'package:optipack_mobile/features/shipping/api_shipping_repository.dart';
import 'package:optipack_mobile/features/shipping/shipping_repository.dart';
import 'package:optipack_mobile/features/stock/api_stock_repository.dart';
import 'package:optipack_mobile/shared/widgets.dart';

/// Đọc đúng response thật của BE (mẫu chép từ `toXxxResponse` trong `be/src`).
void main() {
  test('thông báo: snake_case của NotificationView', () {
    final n = parseNotification({
      'id': '6a1',
      'type': 'picking_assigned',
      'severity': 'warning',
      'title': 'Bạn được giao nhóm đơn',
      'message': 'Nhóm …e7a',
      'related_entity_type': 'order_group',
      'related_entity_id': '6ae7',
      'is_read': true,
      'created_at': '2026-11-13T02:00:00.000Z',
    })!;
    expect(n.severity, NotificationSeverity.warning);
    expect(n.isRead, isTrue);
    expect(n.relatedEntityId, '6ae7');
    expect(parseNotification({'title': 'thiếu id'}), isNull);
  });

  test('tồn kho: ô theo mã quét', () {
    final bin = parseBinStock({
      'bin': {'id': 'b1', 'binCode': 'KA-D1-P01-T01-1', 'capacity': 40, 'isActive': true},
      'zoneCode': 'KA',
      'assignments': [
        {'id': 'a1', 'sellerSku': 'AOPOLO-030-BE-L', 'quantityOnHand': 6, 'masterSku': 'ATHUN-005-BE-L'},
      ],
    })!;
    expect(bin.binId, 'b1');
    expect(bin.zoneCode, 'KA');
    expect(bin.items.single.capacity, 40);
    expect(bin.items.single.masterSku, 'ATHUN-005-BE-L');
  });

  test('hoàn hàng: phiếu giao thất bại, version, trạng thái', () {
    final r = parseReturn({
      'id': 'r1',
      'rmaCode': 'RMA-261109-0003',
      'orderGroupId': '6ae76ee49b1f1227a7eeeca4',
      'type': 'failed_delivery',
      'source': 'failed_delivery',
      'status': 'awaiting_receipt',
      'items': [
        {'sellerSku': 'AOPOLO-030-BE-L', 'quantity': 2, 'reasonLabel': 'Giao thất bại'},
      ],
      'version': 3,
      'createdAt': '2026-11-13T02:00:00.000Z',
    })!;
    expect(r.status, ReturnStatus.awaitingReceipt);
    expect(r.version, 3);
    expect(r.isFailedDelivery, isTrue);
    expect(r.items.single.quantity, 2);
    expect(r.orderCode, '1227a7eeeca4'.substring(2));
  });

  test('đóng gói: mm → cm, đếm món đã quét, bỏ kiện đã huỷ', () {
    final g = parsePackingGroup({
      'orderGroupId': 'g1',
      'status': 'packing',
      'version': 7,
      'parcels': [
        {
          'parcelNo': 1,
          'status': 'pending',
          'box': {
            'code': 'BOX-M',
            'name': 'Thùng M',
            'innerMm': {'lengthMm': 350, 'widthMm': 250, 'heightMm': 150},
            'cutFromInnerHeightMm': 200,
          },
          'placements': [
            {'itemKey': 'A#1', 'sku': 'A', 'x': 0, 'y': 0, 'z': 0, 'dx': 300, 'dy': 200, 'dz': 50},
            {'itemKey': 'A#2', 'sku': 'A', 'x': 0, 'y': 0, 'z': 50, 'dx': 300, 'dy': 200, 'dz': 50},
          ],
          'estimatedWeightG': 1180,
          'scans': [
            {'itemKey': 'A#1', 'sku': 'A'},
          ],
          'actualWeightKg': null,
        },
        {'parcelNo': 2, 'status': 'voided', 'box': {}, 'placements': []},
      ],
    }, {
      'platform': 'aurelle',
      'orderPriority': 'express',
    });
    expect(g.stage, PackingStage.packing);
    expect(g.isExpress, isTrue);
    expect(g.parcels, hasLength(1));
    final p = g.parcels.single;
    expect(p.innerL, 35);
    expect(p.cutFromH, 20);
    expect(p.expectedWeightKg, closeTo(1.18, 1e-9));
    expect(p.scanned, {'A': 1});
    expect(p.allScanned, isFalse);
  });

  test('giao hàng: vận đơn shop tự giao / hãng GHN, báo giá', () {
    final self = parseShipment({
      'id': 's1',
      'shipmentCode': 'SHP-261113-000001',
      'orderGroupId': 'g1',
      'status': 'out_for_delivery',
      'attemptCount': 1,
      'carrierCode': null,
      'shipperName': 'Minh',
      'version': 2,
      'carrierManaged': false,
    })!;
    expect(self.selfDelivery, isTrue);
    expect(self.version, 2);

    final ghn = parseShipment({
      'id': 's2',
      'shipmentCode': 'SHP-261113-000002',
      'orderGroupId': 'g2',
      'status': 'awaiting_pickup',
      'carrierCode': 'GHN',
      'carrierName': 'GHN',
      'carrierManaged': true,
    })!;
    expect(ghn.status, ShipmentStatus.awaitingPickup);
    expect(ghn.managedByCarrier, isTrue);
    expect(ghn.selfDelivery, isFalse);

    final q = parseQuote({
      'carrierCode': 'GHN',
      'carrierName': 'GHN',
      'serviceCode': 'LIGHT',
      'serviceName': 'Hàng nhẹ',
      'etaMinDays': 1,
      'etaMaxDays': 2,
      'totalCostVnd': 20900,
      'isSample': false,
      'unavailableReason': 'Sai địa chỉ',
    })!;
    expect(q.code, 'GHN|LIGHT');
    expect(q.eta, '1–2 ngày');
    expect(q.unavailableReason, 'Sai địa chỉ');
  });

  test('tổng quan: cộng việc chờ, hỏa tốc sắp theo hạn', () {
    final s = parseOverview({
      'actionQueue': {
        'awaitingPick': 2,
        'picking': 1,
        'plansAwaitingApproval': 3,
        'readyToShip': 4,
        'expressOverdue': 1,
        'returnsToReview': 1,
        'returnsToInspect': 2,
      },
      'sales': {
        'current': {'ordersReceived': 9, 'revenuePlacedVnd': 1250000},
      },
    }, [
      {'id': 'g2', 'fulfillmentStatus': 'packed', 'deliveryDeadline': '2026-11-13T10:00:00.000Z'},
      {'id': 'g1', 'fulfillmentStatus': 'picking', 'packagingDeadline': '2026-11-13T08:00:00.000Z'},
      {'id': 'g3', 'fulfillmentStatus': 'delivered', 'deliveryDeadline': '2026-11-13T07:00:00.000Z'},
    ]);
    expect(s.pending, 10);
    expect(s.returnsOpen, 3);
    expect(s.ordersToday, 9);
    expect(s.express.map((e) => e.stage), ['lấy hàng', 'giao khách']);
  });

  test('màn lỗi: câu dễ hiểu theo loại lỗi', () {
    expect(ErrorState.describe(const ApiException(message: 'x', isNetwork: true)).icon, Icons.cloud_off_outlined);
    expect(ErrorState.describe(const ApiException(message: 'x', statusCode: 403)).title,
        'Bạn không có quyền xem mục này');
  });
}
