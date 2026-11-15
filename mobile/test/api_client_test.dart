import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:optipack_mobile/core/network/api_client.dart';
import 'package:optipack_mobile/core/network/api_exception.dart';
import 'package:optipack_mobile/core/storage/token_store.dart';

import 'helpers/fake_adapter.dart';

void main() {
  late InMemoryTokenStore store;

  setUp(() {
    store = InMemoryTokenStore()
      ..access = 'old-access'
      ..refresh = 'old-refresh';
  });

  ApiClient clientWith(
    FakeAdapter adapter, {
    FakeAdapter? refreshAdapter,
    void Function()? onExpired,
  }) {
    final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;
    final refreshDio = Dio(BaseOptions(baseUrl: 'http://test'))
      ..httpClientAdapter = refreshAdapter ?? adapter;
    return ApiClient(
      tokenStore: store,
      dio: dio,
      refreshDio: refreshDio,
      onSessionExpired: onExpired,
    );
  }

  test('401 → refresh một lần rồi gửi lại request với token mới', () async {
    final adapter = FakeAdapter((o) async {
      if (o.path == '/auth/refresh') {
        return FakeReply(200, {'access_token': 'new-access', 'refresh_token': 'new-refresh'});
      }
      return o.headers['Authorization'] == 'Bearer new-access'
          ? FakeReply(200, {'ok': true})
          : FakeReply(401, {'message': 'hết hạn'});
    });

    final result = await clientWith(adapter).get('/users/me');

    expect(result, {'ok': true});
    expect(store.access, 'new-access');
    expect(store.refresh, 'new-refresh', reason: 'phải lưu refresh token mới (có xoay vòng)');
    expect(adapter.count('/auth/refresh'), 1);
  });

  test('nhiều request 401 cùng lúc chỉ refresh MỘT lần (tránh BE thu hồi phiên)', () async {
    final adapter = FakeAdapter((o) async {
      if (o.path == '/auth/refresh') {
        await Future<void>.delayed(const Duration(milliseconds: 30));
        return FakeReply(200, {'access_token': 'new-access', 'refresh_token': 'new-refresh'});
      }
      return o.headers['Authorization'] == 'Bearer new-access'
          ? FakeReply(200, {'path': o.path})
          : FakeReply(401);
    });
    final client = clientWith(adapter);

    final results = await Future.wait([
      client.get('/a'),
      client.get('/b'),
      client.get('/c'),
    ]);

    expect(results.length, 3);
    expect(adapter.count('/auth/refresh'), 1);
  });

  test('refresh bị BE từ chối: báo hết phiên và xoá token, không treo', () async {
    var expired = 0;
    final adapter = FakeAdapter((o) async {
      if (o.path == '/auth/refresh') return FakeReply(401, {'message': 'refresh hết hạn'});
      return FakeReply(401);
    });

    await expectLater(
      clientWith(adapter, onExpired: () => expired++).get('/users/me'),
      throwsA(isA<ApiException>().having((e) => e.isUnauthorized, 'isUnauthorized', true)),
    );

    expect(expired, 1);
    expect(store.access, isNull);
    expect(store.refresh, isNull);
  });

  test('mất mạng lúc refresh: KHÔNG đăng xuất, giữ token để lần sau thử lại', () async {
    var expired = 0;
    final adapter = FakeAdapter((o) async {
      if (o.path == '/auth/refresh') throw networkError(o);
      return FakeReply(401);
    });

    await expectLater(
      clientWith(adapter, onExpired: () => expired++).get('/users/me'),
      throwsA(isA<ApiException>().having((e) => e.isNetwork, 'isNetwork', true)),
    );

    expect(expired, 0);
    expect(store.refresh, 'old-refresh');
  });

  test('request công khai (đăng nhập) không gắn token và không refresh', () async {
    final adapter = FakeAdapter((o) async => FakeReply(401, {'message': 'Sai mật khẩu'}));

    await expectLater(
      clientWith(adapter).post('/auth/login', public: true, body: {'email': 'a'}),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'Sai mật khẩu')),
    );

    expect(adapter.requests.single.headers.containsKey('Authorization'), isFalse);
    expect(adapter.count('/auth/refresh'), 0);
  });

  test('đọc error_code, message và details từ lỗi BE', () async {
    final adapter = FakeAdapter((o) async => FakeReply(409, {
          'success': false,
          'error_code': 'ORD_GROUP_PICK_INCOMPLETE',
          'message': 'Còn món chưa lấy đủ',
          'details': {'items': []},
        }));

    try {
      await clientWith(adapter).post('/x', body: {});
      fail('phải ném lỗi');
    } on ApiException catch (e) {
      expect(e.statusCode, 409);
      expect(e.errorCode, 'ORD_GROUP_PICK_INCOMPLETE');
      expect(e.message, 'Còn món chưa lấy đủ');
      expect(e.isRetryable, isFalse);
    }
  });

  test('mất mạng được phân loại là lỗi tạm thời', () async {
    final adapter = FakeAdapter((o) async => throw networkError(o));
    try {
      await clientWith(adapter).get('/x');
      fail('phải ném lỗi');
    } on ApiException catch (e) {
      expect(e.isNetwork, isTrue);
      expect(e.isRetryable, isTrue);
    }
  });
}
