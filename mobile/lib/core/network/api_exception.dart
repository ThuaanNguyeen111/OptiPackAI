import 'package:dio/dio.dart';

/// Lỗi BE luôn có dạng `{ error_code, message, details }` (xem GUIDE_DOC/API_LIST.md).
/// Lỗi không có phản hồi (mất mạng, timeout) có [statusCode] = null.
class ApiException implements Exception {
  const ApiException({
    required this.message,
    this.statusCode,
    this.errorCode,
    this.details,
    this.isNetwork = false,
  });

  final String message;
  final int? statusCode;
  final String? errorCode;
  final Object? details;

  /// true khi không nhận được phản hồi (mất mạng, timeout, DNS…).
  final bool isNetwork;

  /// Chỉ các lỗi này mới được thử lại (docs/MOBILE_UPDATE_CHECKLIST mục 3).
  /// Lỗi nghiệp vụ (400, 404, 409, 422…) thì dừng và giữ lại cho người dùng xem.
  bool get isRetryable {
    if (isNetwork) return true;
    final code = statusCode;
    if (code == null) return true;
    return code == 408 || code == 429 || code >= 500;
  }

  bool get isUnauthorized => statusCode == 401;
  bool get isForbidden => statusCode == 403;
  bool get isConflict => statusCode == 409;

  /// 409 `*_CONFLICT`: dữ liệu vừa bị người khác đổi — tải lại, không tự gửi lại.
  bool get isStateConflict =>
      isConflict && (errorCode?.endsWith('_CONFLICT') ?? false);

  factory ApiException.fromDio(DioException error) {
    final response = error.response;
    if (response == null) {
      final timeout = error.type == DioExceptionType.connectionTimeout ||
          error.type == DioExceptionType.sendTimeout ||
          error.type == DioExceptionType.receiveTimeout;
      return ApiException(
        message: timeout
            ? 'Máy chủ phản hồi quá chậm. Kiểm tra mạng rồi thử lại.'
            : 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
        isNetwork: true,
      );
    }
    final data = response.data;
    String? code;
    String? message;
    Object? details;
    if (data is Map) {
      code = data['error_code'] is String ? data['error_code'] as String : null;
      final m = data['message'];
      if (m is String) {
        message = m;
      } else if (m is List && m.isNotEmpty) {
        message = m.map((e) => e.toString()).join('\n');
      }
      details = data['details'];
    }
    return ApiException(
      message: message ?? _fallbackMessage(response.statusCode),
      statusCode: response.statusCode,
      errorCode: code,
      details: details,
    );
  }

  static String _fallbackMessage(int? status) {
    switch (status) {
      case 401:
        return 'Phiên đăng nhập đã hết hạn.';
      case 403:
        return 'Bạn không có quyền thực hiện thao tác này.';
      case 404:
        return 'Không tìm thấy dữ liệu.';
      case 409:
        return 'Dữ liệu vừa được người khác cập nhật. Hãy tải lại.';
      case 429:
        return 'Gửi quá nhiều yêu cầu. Thử lại sau ít phút.';
    }
    if (status != null && status >= 500) {
      return 'Máy chủ đang gặp sự cố. Thử lại sau.';
    }
    return 'Đã có lỗi xảy ra.';
  }

  @override
  String toString() => 'ApiException($statusCode $errorCode: $message)';
}
