import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/core/network/api_exception.dart';
import 'package:optipack_mobile/features/notifications/api_notifications_repository.dart';
import 'package:optipack_mobile/features/notifications/notifications_repository.dart';
import 'package:optipack_mobile/features/overview/api_overview_repository.dart';
import 'package:optipack_mobile/features/overview/overview_repository.dart';
import 'package:optipack_mobile/features/returns/api_returns_repository.dart';
import 'package:optipack_mobile/features/returns/returns_repository.dart';
import 'package:optipack_mobile/features/shipping/api_shipping_repository.dart';
import 'package:optipack_mobile/features/shipping/shipping_repository.dart';
import 'package:optipack_mobile/features/shipping/shipping_screen.dart' show recipientLine;
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

  test('tổng quan: BE bọc trong "summary" và có đủ khối mới', () {
    final s = parseOverview({
      'summary': {
        'actionQueue': {'expressOverdue': 2, 'deliveryFailed': 1, 'awaitingPick': 0},
        'sales': {
          'current': {'ordersReceived': 5, 'revenuePlacedVnd': 900000, 'revenueDeliveredVnd': 400000},
          'change': {'ordersReceived': 0.25, 'revenuePlacedVnd': null, 'revenueDeliveredVnd': -0.1},
          'daily': [
            {'date': '2026-11-14', 'ordersReceived': 2, 'revenuePlacedVnd': 300000},
            {'date': '2026-11-15', 'ordersReceived': 3, 'revenuePlacedVnd': 600000},
          ],
          'byPlatform': [
            {'platform': 'aurelle', 'ordersReceived': 5, 'revenuePlacedVnd': 900000},
          ],
        },
        'delivery': {'firstAttemptSuccessRate': 0.8, 'avgDeliveryHours': 12.5},
        'costs': {'shippingCostPerOrderVnd': 24000, 'fulfillmentCostRate': 0.1},
        'returns': {'returnRate': 0.05},
        'express': {'onTimeRate': 0.9},
        'warehouse': {
          'shortageSkuCount': 1,
          'shortageSkus': [
            {'sku': 'A-1', 'shortage': 2, 'groups': 1},
          ],
          'outOfStockSkuCount': 3,
          'materialsBelowReorder': [
            {'code': 'BOX-S', 'name': 'Thùng S', 'usable': 4, 'reorderLevel': 10},
          ],
        },
      },
    }, const []);
    expect(s.ordersToday, 5);
    expect(s.revenueDeliveredVnd, 400000);
    expect(s.ordersChange, 0.25);
    expect(s.revenueChange, isNull);
    expect(s.actions.map((a) => a.label), ['Hỏa Tốc quá hạn', 'Giao thất bại']);
    expect(s.actions.first.severity, ActionSeverity.danger);
    expect(s.daily.length, 2);
    expect(s.byPlatform.single.platform, 'aurelle');
    expect(s.firstAttemptRate, 0.8);
    expect(s.shippingCostPerOrderVnd, 24000);
    expect(s.expressOnTimeRate, 0.9);
    expect(s.shortageSkus.single.sku, 'A-1');
    expect(s.outOfStockSkuCount, 3);
    expect(s.materialsLow.single.name, 'Thùng S');
  });

  test('màn lỗi: câu dễ hiểu theo loại lỗi', () {
    expect(ErrorState.describe(const ApiException(message: 'x', isNetwork: true)).icon, Icons.cloud_off_outlined);
    expect(ErrorState.describe(const ApiException(message: 'x', statusCode: 403)).title,
        'Bạn không có quyền xem mục này');
  });

  test('AOFP-336: vận đơn có người nhận, SĐT, địa chỉ, tiền thu hộ, giờ được giao lại', () {
    final v = parseShipment({
      'id': 's1',
      'status': 'delivery_failed',
      'shipmentCode': 'SHP-1',
      'orderGroupId': '6a00000000000000000000e7a',
      'carrierCode': null,
      'shipperName': 'Shipper B',
      'recipientName': 'Nguyễn A',
      'recipientPhone': '0909123456',
      'recipientAddress': '12 Lê Lợi, Q1',
      'recipientCodVnd': 350000,
      'nextAttemptNotBefore': '2026-11-19T08:30:00.000Z',
      'version': 3,
    })!;
    expect(v.recipientName, 'Nguyễn A');
    expect(recipientLine(v), 'Nguyễn A · 0909123456 · 12 Lê Lợi, Q1 · Thu 350.000 đ');
    expect(v.retryTooEarly(DateTime.utc(2026, 11, 19, 8)), isTrue);
    expect(v.retryTooEarly(DateTime.utc(2026, 11, 19, 9)), isFalse);
  });
}
