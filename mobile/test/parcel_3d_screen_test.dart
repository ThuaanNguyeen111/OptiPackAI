import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/features/packing/parcel_3d_screen.dart';

void main() {
  group('embedPackingUri', () {
    final uri = embedPackingUri(
      webBaseUrl: 'http://10.0.2.2:5173/',
      groupId: 'g/1',
      parcelNo: 2,
      accessToken: 'abc.def',
      role: 2,
    );

    test('đường dẫn và kiện nằm trên URL, token chỉ nằm ở fragment', () {
      expect(uri.path, '/embed/packing/g%2F1');
      expect(uri.queryParameters['parcel'], '2');
      expect(uri.query.contains('abc.def'), isFalse);
      expect(uri.fragment.contains('abc.def'), isTrue);
    });

    test('fragment mang token, vai trò và địa chỉ API cùng origin với web', () {
      final params = Uri.splitQueryString(uri.fragment);
      expect(params['t'], 'abc.def');
      expect(params['r'], '2');
      expect(params['a'], 'http://10.0.2.2:5173/api');
    });

    test('trang hướng dẫn nằm ở đường /guide, khung 3D không có', () {
      final guide = embedPackingUri(
        webBaseUrl: 'http://10.0.2.2:5173',
        groupId: 'g1',
        parcelNo: 1,
        accessToken: 't',
        role: 2,
        view: EmbedView.guide,
      );
      expect(guide.path, '/embed/packing/g1/guide');
      expect(uri.path.endsWith('/guide'), isFalse);
    });

    test('bỏ dấu / thừa cuối địa chỉ web', () {
      expect(uri.toString().startsWith('http://10.0.2.2:5173/embed/'), isTrue);
    });
  });
}
