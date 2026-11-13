import '../../core/json.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/storage/token_store.dart';
import 'auth_models.dart';

class AuthRepository {
  AuthRepository({required this.api, required this.tokens});

  final ApiClient api;
  final TokenStore tokens;

  /// `POST /auth/login`. Trả [LoginMfaRequired] khi tài khoản bật MFA: gọi lại với [mfaToken].
  Future<LoginOutcome> login({
    required String email,
    required String password,
    String? mfaToken,
    String? backupCode,
  }) async {
    final device = await tokens.readDeviceToken();
    final res = await api.post(
      '/auth/login',
      public: true,
      body: {
        'email': email.trim(),
        'password': password,
        if (device != null && device.isNotEmpty) 'device_token': device,
        if (mfaToken != null && mfaToken.isNotEmpty) 'mfa_token': mfaToken,
        if (backupCode != null && backupCode.isNotEmpty) 'backup_code': backupCode,
      },
    );
    return _finishLogin(res);
  }

  /// `POST /auth/google/mobile` với `id_token` Google. Cùng dạng phản hồi như [login]
  /// (BE áp đúng luật của web: chỉ tài khoản đã có, chặn tài khoản khoá / vô hiệu hoá).
  Future<LoginOutcome> loginWithGoogle(String idToken) async {
    final res = await api.post('/auth/google/mobile', public: true, body: {'id_token': idToken});
    return _finishLogin(res);
  }

  Future<LoginOutcome> _finishLogin(Object? res) async {
    final data = asMap(res);
    if (data == null) {
      throw const ApiException(message: 'Phản hồi đăng nhập không hợp lệ.');
    }
    if (data['mfa_required'] == true) return const LoginMfaRequired();

    final access = data['access_token'];
    final refresh = data['refresh_token'];
    if (access is! String || refresh is! String) {
      throw const ApiException(message: 'Phản hồi đăng nhập thiếu token.');
    }
    await tokens.saveTokens(access: access, refresh: refresh);
    final trusted = data['trusted_device_token'];
    if (trusted is String && trusted.isNotEmpty) {
      await tokens.saveDeviceToken(trusted);
    }
    return LoginSuccess(mustChangePassword: data['must_change_password'] == true);
  }

  /// `POST /auth/forgot-password`. BE luôn trả như nhau dù email có tồn tại hay không.
  /// Trả `message` của BE (nếu có) để hiện nguyên văn.
  Future<String?> forgotPassword(String email) async {
    final res = await api.post('/auth/forgot-password', public: true, body: {'email': email.trim()});
    return pickStringOrNull(asMap(res), ['message']);
  }

  Future<String?> rememberedEmail() => tokens.readRememberedEmail();

  Future<void> setRememberedEmail(String? email) => tokens.saveRememberedEmail(email);

  /// `GET /users/me`, lưu lại để mở app được khi mất mạng.
  Future<CurrentUser> fetchMe() async {
    final data = asMap(await api.get('/users/me'));
    if (data == null) {
      throw const ApiException(message: 'Không đọc được hồ sơ người dùng.');
    }
    final user = CurrentUser.fromJson(data);
    await tokens.saveProfile(user.encode());
    return user;
  }

  Future<CurrentUser?> cachedUser() async =>
      CurrentUser.tryDecode(await tokens.readProfile());

  Future<bool> hasSession() async {
    final refresh = await tokens.readRefreshToken();
    return refresh != null && refresh.isNotEmpty;
  }

  /// Đăng xuất: báo BE (không bắt buộc thành công) rồi xoá phiên trên máy.
  Future<void> logout() async {
    final refresh = await tokens.readRefreshToken();
    if (refresh != null && refresh.isNotEmpty) {
      try {
        await api.post('/auth/logout', body: {'refresh_token': refresh});
      } on ApiException {
        // Mất mạng hay token hết hạn: vẫn đăng xuất trên máy.
      }
    }
    await tokens.clearSession();
  }
}
