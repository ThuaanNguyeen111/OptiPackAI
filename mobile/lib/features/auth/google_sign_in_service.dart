import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../core/config/env.dart';

/// Người dùng đóng hộp chọn tài khoản Google (không phải lỗi, không hiện thông báo).
class GoogleSignInCanceled implements Exception {
  const GoogleSignInCanceled();
}

/// Không lấy được `id_token` (thiếu cấu hình, máy không có Google Play Services…).
class GoogleSignInFailed implements Exception {
  const GoogleSignInFailed(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Lấy `id_token` Google cho `POST /auth/google/mobile`. Tách thành interface để test không cần Google.
abstract class GoogleIdTokenProvider {
  Future<String> idToken();

  /// Quên tài khoản Google đã chọn, lần sau hiện lại hộp chọn tài khoản.
  Future<void> signOut();
}

class PlatformGoogleIdTokenProvider implements GoogleIdTokenProvider {
  bool _ready = false;

  Future<void> _init() async {
    if (_ready) return;
    // `serverClientId` = client **Web** của BE (GOOGLE_CLIENT_ID): BE kiểm `aud` đúng giá trị này.
    await GoogleSignIn.instance.initialize(
      serverClientId: Env.googleServerClientId.isEmpty ? null : Env.googleServerClientId,
    );
    _ready = true;
  }

  @override
  Future<String> idToken() async {
    if (Env.googleServerClientId.isEmpty) {
      throw const GoogleSignInFailed(
        'App chưa cấu hình Google. Chạy với --dart-define=GOOGLE_SERVER_CLIENT_ID=<client Web của BE>.',
      );
    }
    try {
      await _init();
      final account = await GoogleSignIn.instance.authenticate();
      final token = account.authentication.idToken;
      if (token == null || token.isEmpty) {
        throw const GoogleSignInFailed('Google không trả về mã đăng nhập. Thử lại.');
      }
      return token;
    } on GoogleSignInException catch (e) {
      switch (e.code) {
        case GoogleSignInExceptionCode.canceled:
        case GoogleSignInExceptionCode.interrupted:
          throw const GoogleSignInCanceled();
        case GoogleSignInExceptionCode.clientConfigurationError:
        case GoogleSignInExceptionCode.providerConfigurationError:
          debugPrint('Google Sign-In: cấu hình sai (${e.code}): ${e.description}');
          throw const GoogleSignInFailed(
            'Cấu hình Google của app chưa đúng (cần OAuth client Android với đúng package và SHA-1).',
          );
        default:
          debugPrint('Google Sign-In: ${e.code}: ${e.description}');
          throw const GoogleSignInFailed('Không đăng nhập được bằng Google. Thử lại.');
      }
    }
  }

  @override
  Future<void> signOut() async {
    if (!_ready) return;
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {
      // Không quan trọng: chỉ để lần sau hiện lại hộp chọn tài khoản.
    }
  }
}
