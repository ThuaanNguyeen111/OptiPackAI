import 'dart:async';

import 'package:dio/dio.dart';

import '../config/env.dart';
import '../storage/token_store.dart';
import 'api_exception.dart';

enum _RefreshResult { ok, rejected, network }

/// Gọi API BE: tự gắn token, tự refresh khi 401 và chỉ cho **một** lần refresh chạy cùng lúc.
///
/// Refresh token có xoay vòng: dùng lại token cũ sẽ bị BE thu hồi cả phiên, nên nhiều request
/// 401 cùng lúc phải chờ chung một lần refresh (xem MOBILE_UPDATE_CHECKLIST mục 1).
class ApiClient {
  ApiClient({
    required this.tokenStore,
    Dio? dio,
    Dio? refreshDio,
    String? baseUrl,
    this.onSessionExpired,
  })  : _dio = dio ?? _newDio(baseUrl ?? Env.apiBaseUrl),
        _refreshDio = refreshDio ?? _newDio(baseUrl ?? Env.apiBaseUrl) {
    _dio.interceptors.add(
      InterceptorsWrapper(onRequest: _onRequest, onError: _onError),
    );
  }

  final TokenStore tokenStore;

  /// Gọi khi refresh bị BE từ chối (phải đăng nhập lại). Hàng đợi ngoại tuyến **không** bị xoá.
  void Function()? onSessionExpired;

  final Dio _dio;
  final Dio _refreshDio;
  Future<_RefreshResult>? _refreshing;

  static const _retriedKey = 'retried_after_refresh';
  static const _publicKey = 'public';

  static Dio _newDio(String baseUrl) => Dio(
        BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 12),
          sendTimeout: const Duration(seconds: 20),
          receiveTimeout: const Duration(seconds: 20),
          headers: {'Accept': 'application/json'},
        ),
      );

  Future<void> _onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (options.extra[_publicKey] != true) {
      final token = await tokenStore.readAccessToken();
      if (token != null && token.isNotEmpty) {
        options.headers['Authorization'] = 'Bearer $token';
      }
    }
    handler.next(options);
  }

  Future<void> _onError(
    DioException error,
    ErrorInterceptorHandler handler,
  ) async {
    final request = error.requestOptions;
    final canRefresh = error.response?.statusCode == 401 &&
        request.extra[_publicKey] != true &&
        request.extra[_retriedKey] != true;
    if (!canRefresh) {
      handler.next(error);
      return;
    }

    final result = await _refreshOnce();
    switch (result) {
      case _RefreshResult.ok:
        try {
          request.extra[_retriedKey] = true;
          final token = await tokenStore.readAccessToken();
          if (token != null) request.headers['Authorization'] = 'Bearer $token';
          handler.resolve(await _dio.fetch<dynamic>(request));
        } on DioException catch (retryError) {
          handler.next(retryError);
        }
      case _RefreshResult.rejected:
        await tokenStore.clearSession();
        onSessionExpired?.call();
        handler.next(error);
      case _RefreshResult.network:
        // Mất mạng lúc refresh: KHÔNG đăng xuất, để lần sau thử lại.
        handler.next(
          DioException(
            requestOptions: request,
            type: DioExceptionType.connectionError,
          ),
        );
    }
  }

  Future<_RefreshResult> _refreshOnce() {
    final running = _refreshing;
    if (running != null) return running;
    final next = _doRefresh().whenComplete(() => _refreshing = null);
    _refreshing = next;
    return next;
  }

  Future<_RefreshResult> _doRefresh() async {
    final refresh = await tokenStore.readRefreshToken();
    if (refresh == null || refresh.isEmpty) return _RefreshResult.rejected;
    try {
      final res = await _refreshDio.post<dynamic>(
        '/auth/refresh',
        data: {'refresh_token': refresh},
      );
      final data = res.data;
      if (data is Map &&
          data['access_token'] is String &&
          data['refresh_token'] is String) {
        await tokenStore.saveTokens(
          access: data['access_token'] as String,
          refresh: data['refresh_token'] as String,
        );
        return _RefreshResult.ok;
      }
      return _RefreshResult.rejected;
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == null || status == 408 || status == 429 || status >= 500) {
        return _RefreshResult.network;
      }
      return _RefreshResult.rejected;
    }
  }

  Future<Object?> get(
    String path, {
    Map<String, dynamic>? query,
    bool public = false,
  }) =>
      _send(() => _dio.get<dynamic>(
            path,
            queryParameters: _clean(query),
            options: Options(extra: {_publicKey: public}),
          ));

  Future<Object?> post(
    String path, {
    Object? body,
    bool public = false,
  }) =>
      _send(() => _dio.post<dynamic>(
            path,
            data: body,
            options: Options(extra: {_publicKey: public}),
          ));

  Future<Object?> patch(String path, {Object? body}) =>
      _send(() => _dio.patch<dynamic>(path, data: body));

  Future<Object?> delete(String path) => _send(() => _dio.delete<dynamic>(path));

  Future<Object?> _send(Future<Response<dynamic>> Function() call) async {
    try {
      final res = await call();
      return res.data;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  static Map<String, dynamic>? _clean(Map<String, dynamic>? query) {
    if (query == null) return null;
    return {
      for (final e in query.entries)
        if (e.value != null && e.value.toString().isNotEmpty) e.key: e.value,
    };
  }
}
