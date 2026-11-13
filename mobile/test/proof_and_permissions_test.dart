import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/core/config/env.dart';
import 'package:optipack_mobile/features/auth/auth_models.dart';
import 'package:optipack_mobile/features/auth/role_permissions.dart';
import 'package:optipack_mobile/features/home/app_shell.dart';
import 'package:optipack_mobile/features/proof/proof_photo_repository.dart';
import 'package:optipack_mobile/features/shipping/shipping_repository.dart';

void main() {
  test('địa chỉ BE mặc định có tiền tố /api', () {
    expect(Env.apiBaseUrl, endsWith('/api'));
  });

  group('quyền trang theo vai trò', () {
    test('đọc đúng danh sách trang của GET /role-permissions/me', () {
      expect(parseFeatures({'role': 1, 'features': ['picking', 'inventory', 7]}), {'picking', 'inventory'});
      expect(parseFeatures({'role': 1}), isNull);
    });

    test('mặc định giữ đúng các tab cũ', () {
      expect(tabLabelsFor(UserRole.warehouseStaff, defaultFeaturesFor(UserRole.warehouseStaff)),
          ['Việc của tôi', 'Kho', 'Hoàn hàng', 'Thông báo']);
      expect(tabLabelsFor(UserRole.packagingStaff, defaultFeaturesFor(UserRole.packagingStaff)),
          ['Đóng gói', 'Thông báo']);
      expect(tabLabelsFor(UserRole.shippingCoordinator, defaultFeaturesFor(UserRole.shippingCoordinator)),
          ['Giao hàng', 'Thông báo']);
      expect(tabLabelsFor(UserRole.storeOwner, defaultFeaturesFor(UserRole.storeOwner)),
          ['Tổng quan', 'Duyệt hoàn', 'Thông báo']);
      expect(tabLabelsFor(UserRole.admin, allFeatures),
          ['Tổng quan', 'Việc của tôi', 'Đóng gói', 'Giao hàng', 'Thông báo']);
    });

    test('Admin tắt trang thì tab biến mất, bật thêm thì tab hiện', () {
      expect(tabLabelsFor(UserRole.warehouseStaff, {'inventory'}), ['Kho', 'Hoàn hàng', 'Thông báo']);
      expect(tabLabelsFor(UserRole.packagingStaff, {'packing', 'shipping'}), ['Đóng gói', 'Giao hàng', 'Thông báo']);
      expect(tabLabelsFor(UserRole.shippingCoordinator, const {}), ['Thông báo']);
    });
  });

  test('đọc link ảnh của POST /proof-photos', () {
    expect(
      parseProofPhotoUrls({
        'photos': [
          {'url': 'https://res.cloudinary.com/x/image/upload/optipack/proof/a.jpg'},
          {'url': ''},
        ],
      }),
      ['https://res.cloudinary.com/x/image/upload/optipack/proof/a.jpg'],
    );
    expect(parseProofPhotoUrls(null), isEmpty);
  });

  group('giao thành công vận đơn shop tự giao', () {
    test('thiếu ảnh thì bị chặn', () async {
      final repo = MockShippingRepository();
      final self = (await repo.shipments()).firstWhere((s) => s.selfDelivery);
      await expectLater(
        repo.deliver(self.id),
        throwsA(isA<ShippingException>().having((e) => e.code, 'code', 'SHP_PROOF_PHOTO_REQUIRED')),
      );
      final done = await repo.deliver(self.id, photoUrls: const ['https://res.cloudinary.com/x/a.jpg']);
      expect(done.status, ShipmentStatus.delivered);
    });

    test('vận đơn qua hãng không bắt ảnh', () async {
      final repo = MockShippingRepository();
      final carrier = (await repo.shipments())
          .firstWhere((s) => !s.selfDelivery && s.status == ShipmentStatus.outForDelivery);
      expect((await repo.deliver(carrier.id)).status, ShipmentStatus.delivered);
    });
  });
}
