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

    test('người đóng gói mở màn đóng gói của nhóm', () {
      for (final type in ['packing_assigned', 'pending_approval', 'packaging_rejected', 'unpack_required']) {
        final data = {'type': type, 'related_entity_type': 'order_group', 'related_entity_id': 'g1'};
        expect(routeForPush(data, canPick: false, canPack: true), '/packing/g1', reason: type);
        expect(routeForPush(data, canPick: true), '/', reason: 'nhân viên kho không mở màn đóng gói');
      }
      final picking = {'type': 'picking_assigned', 'related_entity_type': 'order_group', 'related_entity_id': 'g1'};
      expect(routeForPush(picking, canPick: false, canPack: true), '/');
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
