import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Nơi giữ token. Bản thật dùng Keystore (Android) / Keychain (iOS), không lưu file thường.
abstract class TokenStore {
  Future<String?> readAccessToken();
  Future<String?> readRefreshToken();
  Future<String?> readDeviceToken();
  Future<void> saveTokens({required String access, required String refresh});
  Future<void> saveDeviceToken(String token);

  /// Hồ sơ người dùng (JSON) để app mở được cả khi mất mạng.
  Future<String?> readProfile();
  Future<void> saveProfile(String json);

  /// Email đã "Ghi nhớ" ở màn đăng nhập. Không bị xoá khi đăng xuất.
  Future<String?> readRememberedEmail();
  Future<void> saveRememberedEmail(String? email);

  /// Xoá phiên đăng nhập. Giữ lại device token (thiết bị tin cậy 30 ngày) và email đã ghi nhớ.
  Future<void> clearSession();
}

class SecureTokenStore implements TokenStore {
  SecureTokenStore([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  static const _access = 'access_token';
  static const _refresh = 'refresh_token';
  static const _device = 'device_token';
  static const _profile = 'profile';
  static const _remembered = 'remembered_email';

  final FlutterSecureStorage _storage;

  @override
  Future<String?> readAccessToken() => _storage.read(key: _access);

  @override
  Future<String?> readRefreshToken() => _storage.read(key: _refresh);

  @override
  Future<String?> readDeviceToken() => _storage.read(key: _device);

  @override
  Future<void> saveTokens({required String access, required String refresh}) async {
    await _storage.write(key: _access, value: access);
    await _storage.write(key: _refresh, value: refresh);
  }

  @override
  Future<void> saveDeviceToken(String token) =>
      _storage.write(key: _device, value: token);

  @override
  Future<String?> readProfile() => _storage.read(key: _profile);

  @override
  Future<void> saveProfile(String json) =>
      _storage.write(key: _profile, value: json);

  @override
  Future<String?> readRememberedEmail() => _storage.read(key: _remembered);

  @override
  Future<void> saveRememberedEmail(String? email) => (email == null || email.isEmpty)
      ? _storage.delete(key: _remembered)
      : _storage.write(key: _remembered, value: email);

  @override
  Future<void> clearSession() async {
    await _storage.delete(key: _access);
    await _storage.delete(key: _refresh);
    await _storage.delete(key: _profile);
  }
}

/// Dùng cho test.
class InMemoryTokenStore implements TokenStore {
  String? access;
  String? refresh;
  String? device;
  String? profile;
  String? rememberedEmail;

  @override
  Future<String?> readAccessToken() async => access;

  @override
  Future<String?> readRefreshToken() async => refresh;

  @override
  Future<String?> readDeviceToken() async => device;

  @override
  Future<void> saveTokens({required String access, required String refresh}) async {
    this.access = access;
    this.refresh = refresh;
  }

  @override
  Future<void> saveDeviceToken(String token) async => device = token;

  @override
  Future<String?> readProfile() async => profile;

  @override
  Future<void> saveProfile(String json) async => profile = json;

  @override
  Future<String?> readRememberedEmail() async => rememberedEmail;

  @override
  Future<void> saveRememberedEmail(String? email) async =>
      rememberedEmail = (email == null || email.isEmpty) ? null : email;

  @override
  Future<void> clearSession() async {
    access = null;
    refresh = null;
    profile = null;
  }
}
