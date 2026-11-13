import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/core/push/push_service.dart';

void main() {
  group('Bấm push mở màn nào', () {
    test('giao lấy hàng + nhân viên kho: mở màn lấy hàng của nhóm', () {
      final data = {
        'type': 'picking_assigned',
        'related_entity_type': 'order_group',
        'related_entity_id': 'abc123',
      };
      expect(routeForPush(data, canPick: true), '/pick/abc123');
    });

    test('thiếu hàng của nhóm cũng mở màn lấy hàng', () {
      final data = {
        'type': 'stock_shortage',
        'related_entity_type': 'order_group',
        'related_entity_id': 'g9',
      };
      expect(routeForPush(data, canPick: true), '/pick/g9');
    });

    test('người không lấy hàng (đóng gói, giao hàng) về màn chính', () {
      final data = {
        'type': 'picking_assigned',
        'related_entity_type': 'order_group',
        'related_entity_id': 'abc123',
      };
      expect(routeForPush(data, canPick: false), '/');
    });

    test('loại khác hoặc thiếu mã nhóm về màn chính', () {
      expect(
        routeForPush({'type': 'low_box_stock', 'related_entity_type': 'packaging_box', 'related_entity_id': 'x'}, canPick: true),
        '/',
      );
      expect(routeForPush({'type': 'picking_assigned', 'related_entity_type': 'order_group'}, canPick: true), '/');
      expect(routeForPush(const {}, canPick: true), '/');
    });
  });
}
